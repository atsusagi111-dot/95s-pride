// ログイン状態を署名付き Cookie で持つ(Vercel 版と同じ形式)
import { createHmac, timingSafeEqual } from 'node:crypto';

const COOKIE_NAME = 'member_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // ログイン状態を保つ期間(30日)

function sign(payload, secret) {
  return createHmac('sha256', secret).update(payload).digest('base64url');
}

// ブラウザの JavaScript から読めない Cookie 文字列を作る
function buildCookie(value, maxAge) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

export function createSessionCookie(email, secret) {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ email, expiresAt })).toString('base64url');
  return buildCookie(`${payload}.${sign(payload, secret)}`, MAX_AGE_SECONDS);
}

export function clearSessionCookie() {
  return buildCookie('', 0);
}

// Cookie の署名と期限を確認し、ログイン中のメールアドレスを返す。無効なら null
export function readSession(request, secret) {
  const cookie = (request.headers.get('cookie') || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;

  const [payload, signature] = cookie.slice(COOKIE_NAME.length + 1).split('.');
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;

  try {
    const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return session.expiresAt > Date.now() ? session.email : null;
  } catch {
    return null;
  }
}
