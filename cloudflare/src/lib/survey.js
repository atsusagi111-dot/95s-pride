// アンケートの回答を検証して保存する(Googleフォームの置き換え)
import { randomBytes } from 'node:crypto';
import { MAX_PHOTO_BYTES, MAX_SOURCE_BYTES, isJpeg, resizeToJpeg, saveMemberPhoto } from './photos.js';
import { toIso } from './sheet-rows.js';
import { isSnsKey, normalizeSnsLink } from './sns-links.js';
import { buildThanksMail, sendMail } from './mail.js';

export const MAX_ANSWER_LENGTH = 2000;

const makeSlug = () => randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8);

// 画面に出す設問の一覧(並び順どおり)
export async function loadSurveyQuestions(db) {
  const { results } = await db.prepare(`
    SELECT key, label, input_type, required, help, options, section
    FROM questions WHERE section != '' ORDER BY sort_order`).all();
  return results.map((q) => ({
    key: q.key,
    label: q.label,
    type: q.input_type,
    required: Boolean(q.required),
    help: q.help,
    options: q.options ? JSON.parse(q.options) : null,
    section: q.section,
  }));
}

// 回答を設問の定義と照らす。問題なければ { answers }、あれば { error, field }
export function validateAnswers(questions, input) {
  const answers = {};
  for (const q of questions) {
    const value = typeof input?.[q.key] === 'string' ? input[q.key].trim() : '';
    if (!value) {
      if (q.required) return { error: 'required', field: q.key };
      continue;
    }
    if (value.length > MAX_ANSWER_LENGTH) return { error: 'too_long', field: q.key };
    if (q.type === 'choice' && !q.options.includes(value)) return { error: 'invalid_choice', field: q.key };
    // SNS・リンクは、@ID でもURLでも受け取り、安全なURLにそろえて保存する
    if (isSnsKey(q.key)) {
      const url = normalizeSnsLink(q.key, value);
      if (!url) return { error: 'invalid_link', field: q.key };
      answers[q.key] = url;
      continue;
    }
    answers[q.key] = value;
  }
  return { answers };
}

// 写真を検証して、正方形の小さな JPEG に縮める。写真なしなら null、読めない・大きすぎるなら例外
// tools はテストで差し替えられるようにしてある(通常は Cloudflare の画像変換を使う)
export async function prepareSurveyPhoto(env, file, tools = { resize: resizeToJpeg }) {
  if (!file || typeof file === 'string' || file.size === 0) return null;
  if (file.size > MAX_SOURCE_BYTES) throw new Error('photo_too_large');
  let jpeg;
  try {
    jpeg = await tools.resize(env, new Uint8Array(await file.arrayBuffer()));
  } catch {
    throw new Error('invalid_photo');
  }
  if (!isJpeg(jpeg) || jpeg.length > MAX_PHOTO_BYTES) throw new Error('invalid_photo');
  return jpeg;
}

// 日本時間の「2026-11-15T22:31:33+09:00」形式
function nowJst() {
  const jst = new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 19);
  return `${jst}+09:00`;
}

// 回答を保存し、お礼メールを送る。同じ会員の古いプロフィールは is_current = 0 にする(最新だけ表示)
export async function saveSurvey(env, { email, questions, answers, photo }) {
  const db = env.DB;
  const nameQuestion = questions.find((q) => q.label.startsWith('名前'));
  const birthQuestion = questions.find((q) => q.label.startsWith('生年月日'));
  const name = (nameQuestion && answers[nameQuestion.key]) || '(名前なし)';
  const birthDate = birthQuestion && answers[birthQuestion.key] ? toIso(answers[birthQuestion.key]) : null;
  const respondedAt = nowJst();

  await db.prepare('INSERT OR IGNORE INTO members (email, created_at) VALUES (?, ?)').bind(email, respondedAt).run();
  const member = await db.prepare('SELECT id FROM members WHERE email = ?').bind(email).first();
  const slug = makeSlug();
  const maxOrder = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max FROM profiles').first();
  const responseKey = `web|${slug}`;

  const statements = [
    db.prepare("UPDATE profiles SET is_current = 0, updated_at = datetime('now') WHERE member_id = ?").bind(member.id),
    db.prepare(`INSERT INTO profiles (slug, member_id, responded_at, display_name, birth_date, visibility, is_current, sort_order)
                VALUES (?, ?, ?, ?, ?, 'members', 1, ?)`).bind(slug, member.id, respondedAt, name, birthDate, maxOrder.max + 1),
  ];
  for (const [key, answer] of Object.entries(answers)) {
    statements.push(db.prepare('INSERT INTO profile_answers (profile_id, question_key, answer) VALUES ((SELECT id FROM profiles WHERE slug = ?), ?, ?)').bind(slug, key, answer));
  }
  // お礼メールの送信状況を記録しておく(失敗したら、あとで再送できる)
  statements.push(db.prepare('INSERT INTO form_imports (response_key, profile_id) VALUES (?, (SELECT id FROM profiles WHERE slug = ?))').bind(responseKey, slug));
  await db.batch(statements);
  // 写真が無ければ、前の写真がそのまま引き継がれる
  if (photo) await saveMemberPhoto(db, member.id, photo);

  const mailed = await sendSurveyThanks(env, email, answers, name, responseKey);
  return { slug, mailed };
}

// お礼メール。失敗しても回答の保存は成功として扱う
async function sendSurveyThanks(env, email, answers, name, responseKey) {
  const mail = buildThanksMail(env, answers.q19 || '', name);
  if (!mail) return false;
  try {
    await sendMail(env, { to: email, ...mail });
    await env.DB.prepare("UPDATE form_imports SET thanks_mail_sent_at = datetime('now') WHERE response_key = ?").bind(responseKey).run();
    return true;
  } catch (error) {
    console.error(`お礼メールの送信に失敗しました(${email}):`, error);
    return false;
  }
}
