// アンケート(Googleフォームの置き換え): 設問の取得、メール確認コードの送信・照合、回答の送信
import { randomInt } from 'node:crypto';
import { normalizeEmail } from '../lib/credentials.js';
import { bumpCount, consumeCode, getMember, isAllowed, saveCode } from '../lib/db.js';
import { buildCodeMail, sendMail } from '../lib/mail.js';
import { createTicket, readTicket } from '../lib/survey-ticket.js';
import { loadSurveyQuestions, prepareSurveyPhoto, saveSurvey, validateAnswers } from '../lib/survey.js';
import { isCrossSite, json } from './http.js';

const CODE_TTL_SECONDS = 600; // コードの有効期間(10分)
const MAX_ATTEMPTS = 5; // 1つのコードで試せる回数
const RESEND_INTERVAL_SECONDS = 60; // 再送までの待ち時間
const SEND_WINDOW_SECONDS = 21600; // 送信回数を数える期間(6時間)
const MAX_SENDS_PER_WINDOW = 5; // 上の期間に1つのメールへ送れる回数
const IP_WINDOW_SECONDS = 3600;
const MAX_SENDS_PER_IP = 20; // 1時間に、1つの接続元から送れるコードの回数(他人宛てのメール連発を防ぐ)
const SUBMIT_WINDOW_SECONDS = 3600;
const MAX_SUBMITS_PER_WINDOW = 10; // 1時間に、1人が送れる回答の回数

// 確認コードは、会員のパスワード設定用とは別の鍵で保存する(お互いを上書きしない)
const codeKey = (email) => `survey:${email}`;

// GET /api/survey/questions
export async function surveyQuestions(request, env) {
  return json({ questions: await loadSurveyQuestions(env.DB) });
}

// POST /api/survey/send-code { email }: メールアドレスに確認コードを送る(登録済みかどうかに関わらず送る)
export async function surveySendCode(request, env, body) {
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: 'invalid_email' }, 400);
  const member = await getMember(env.DB, email);
  if (member && !isAllowed(member)) return json({ error: 'not_allowed' }, 403);

  const ip = request.headers.get('cf-connecting-ip') || 'unknown';
  // 先に回数を数えてから送る。上限を超えていても画面の動きは変えない
  const overIp = (await bumpCount(env.DB, `survey-ip:${ip}`, IP_WINDOW_SECONDS)) > MAX_SENDS_PER_IP;
  const inCooldown = (await bumpCount(env.DB, `survey-cooldown:${email}`, RESEND_INTERVAL_SECONDS)) > 1;
  const overCount = (await bumpCount(env.DB, `survey-count:${email}`, SEND_WINDOW_SECONDS)) > MAX_SENDS_PER_WINDOW;
  if (overIp || inCooldown || overCount) return json({ ok: true });

  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  await sendMail(env, { to: email, ...buildCodeMail(env, code, CODE_TTL_SECONDS / 60, 'アンケート') });
  await saveCode(env.DB, codeKey(email), code, CODE_TTL_SECONDS);
  return json({ ok: true });
}

// POST /api/survey/verify { email, code }: コードが合っていれば、回答用の通行証を返す
export async function surveyVerify(request, env, body) {
  const email = normalizeEmail(body.email);
  const code = String(body.code || '').trim();
  if (!email || !/^\d{6}$/.test(code)) return json({ error: 'invalid_code' }, 400);
  if (!(await consumeCode(env.DB, codeKey(email), code, MAX_ATTEMPTS))) return json({ error: 'invalid_code' }, 401);
  return json({ ok: true, ticket: createTicket(email, env.SESSION_SECRET) });
}

// POST /api/survey/submit(multipart/form-data): ticket、設問ごとの回答(キーは q1〜)、photo(任意)
export async function surveySubmit(request, env) {
  if (isCrossSite(request)) return json({ error: 'forbidden' }, 403);
  let form;
  try {
    form = await request.formData();
  } catch {
    return json({ error: 'invalid_request' }, 400);
  }
  const email = readTicket(form.get('ticket'), env.SESSION_SECRET);
  if (!email) return json({ error: 'ticket_expired' }, 401);
  const member = await getMember(env.DB, email);
  if (member && !isAllowed(member)) return json({ error: 'not_allowed' }, 403);
  if ((await bumpCount(env.DB, `survey-submit:${email}`, SUBMIT_WINDOW_SECONDS)) > MAX_SUBMITS_PER_WINDOW) return json({ error: 'too_many_attempts' }, 429);

  const questions = await loadSurveyQuestions(env.DB);
  const input = Object.fromEntries(questions.map((q) => [q.key, form.get(q.key)]));
  const checked = validateAnswers(questions, input);
  if (checked.error) return json({ error: checked.error, field: checked.field }, 400);

  let photo = null;
  try {
    photo = await prepareSurveyPhoto(env, form.get('photo'));
  } catch (error) {
    // 写真が使えないときは、回答を保存せずに知らせる(写真を替えてやり直してもらう)
    return json({ error: error.message === 'photo_too_large' ? 'photo_too_large' : 'invalid_photo' }, 400);
  }

  const { mailed } = await saveSurvey(env, { email, questions, answers: checked.answers, photo });
  return json({ ok: true, mailed });
}
