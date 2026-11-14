// ログイン・ログアウト・確認コード・パスワード設定
import { randomInt } from 'node:crypto';
import { hashPassword, isValidPassword, normalizeEmail, verifyPassword } from '../lib/credentials.js';
import { clearSessionCookie, createSessionCookie } from '../lib/session.js';
import { bumpCount, clearCount, consumeCode, getCount, getMember, isAllowed, saveCode } from '../lib/db.js';
import { buildCodeMail, sendMail } from '../lib/mail.js';
import { json } from './http.js';

// GAS の設定値をそのまま引き継ぐ
const CODE_TTL_SECONDS = 600; // コードの有効期間(10分)
const MAX_ATTEMPTS = 5; // 1つのコードで試せる回数
const RESEND_INTERVAL_SECONDS = 60; // 再送までの待ち時間
const RESEND_WINDOW_SECONDS = 21600; // 送信回数を数える期間(6時間)
const MAX_SENDS_PER_WINDOW = 5; // 上の期間に1人へ送れる回数
const LOGIN_ATTEMPT_LIMIT = 10; // 続けて試せるログイン回数
const LOGIN_LOCK_SECONDS = 900; // 上の回数を超えたときに待つ時間(15分)

export async function login(request, env, body) {
  const email = normalizeEmail(body.email);
  const { password } = body;
  if (!email || !isValidPassword(password)) return json({ error: 'invalid_credentials' }, 401);

  const attemptsKey = `login-attempts:${email}`;
  if ((await getCount(env.DB, attemptsKey)) >= LOGIN_ATTEMPT_LIMIT) return json({ error: 'too_many_attempts' }, 429);
  await bumpCount(env.DB, attemptsKey, LOGIN_LOCK_SECONDS);

  const member = await getMember(env.DB, email);
  // 停止中・未登録でも同じ計算をして、応答時間で区別できないようにする
  const matched = await verifyPassword(password, isAllowed(member) ? member.password_hash : '');
  if (!matched) return json({ error: 'invalid_credentials' }, 401);

  await clearCount(env.DB, attemptsKey);
  return json({ ok: true }, 200, { 'Set-Cookie': createSessionCookie(email, env.SESSION_SECRET) });
}

export async function logout() {
  return json({ ok: true }, 200, { 'Set-Cookie': clearSessionCookie() });
}

// パスワード設定用の確認コードを送る(初回・再設定とも)。未登録なら 404
export async function passwordReset(request, env, body) {
  const email = normalizeEmail(body.email);
  if (!email) return json({ error: 'invalid_email' }, 400);

  const member = await getMember(env.DB, email);
  if (!isAllowed(member)) return json({ error: 'not_registered' }, 404);

  // 再送の間隔と回数の上限。超えていても画面の動きを変えない(GAS と同じ)
  const cooldownKey = `send-cooldown:${email}`;
  const countKey = `send-count:${email}`;
  if ((await getCount(env.DB, cooldownKey)) > 0 || (await getCount(env.DB, countKey)) >= MAX_SENDS_PER_WINDOW) {
    return json({ ok: true });
  }

  const code = String(randomInt(0, 1000000)).padStart(6, '0');
  await sendMail(env, { to: email, ...buildCodeMail(env, code, CODE_TTL_SECONDS / 60) });
  await saveCode(env.DB, email, code, CODE_TTL_SECONDS);
  await bumpCount(env.DB, cooldownKey, RESEND_INTERVAL_SECONDS);
  await bumpCount(env.DB, countKey, RESEND_WINDOW_SECONDS);
  return json({ ok: true });
}

// 確認コードを照合し、正しければ新しいパスワードを保存してログイン状態にする
export async function verifyCode(request, env, body) {
  const email = normalizeEmail(body.email);
  const code = String(body.code || '').trim();
  if (!email || !/^\d{6}$/.test(code)) return json({ error: 'invalid_code' }, 400);
  if (!isValidPassword(body.password)) return json({ error: 'invalid_password' }, 400);

  const member = await getMember(env.DB, email);
  if (!isAllowed(member)) return json({ error: 'invalid_code' }, 401);
  if (!(await consumeCode(env.DB, email, code, MAX_ATTEMPTS))) return json({ error: 'invalid_code' }, 401);

  const passwordHash = await hashPassword(body.password);
  await env.DB.prepare('UPDATE members SET password_hash = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(passwordHash, member.id).run();
  await clearCount(env.DB, `login-attempts:${email}`);
  return json({ ok: true }, 200, { 'Set-Cookie': createSessionCookie(email, env.SESSION_SECRET) });
}
