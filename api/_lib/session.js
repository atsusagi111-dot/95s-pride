const crypto = require('crypto');

const COOKIE_NAME = 'member_session';
const MAX_AGE_SECONDS = 60 * 60 * 24 * 30; // ログイン状態を保つ期間(30日)

function sign(payload) {
  return crypto.createHmac('sha256', process.env.SESSION_SECRET).update(payload).digest('base64url');
}

// ブラウザのJavaScriptから読めない署名付きCookieを作る
function buildCookie(value, maxAge) {
  return `${COOKIE_NAME}=${value}; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=${maxAge}`;
}

function setSession(res, email) {
  const expiresAt = Date.now() + MAX_AGE_SECONDS * 1000;
  const payload = Buffer.from(JSON.stringify({ email, expiresAt })).toString('base64url');
  res.setHeader('Set-Cookie', buildCookie(`${payload}.${sign(payload)}`, MAX_AGE_SECONDS));
}

function clearSession(res) {
  res.setHeader('Set-Cookie', buildCookie('', 0));
}

// Cookieの署名と期限を確認し、ログイン中のメールアドレスを返す
function readSession(req) {
  const cookie = (req.headers.cookie || '')
    .split(';')
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${COOKIE_NAME}=`));
  if (!cookie) return null;

  const [payload, signature] = cookie.slice(COOKIE_NAME.length + 1).split('.');
  if (!payload || !signature) return null;

  const expected = Buffer.from(sign(payload));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !crypto.timingSafeEqual(expected, actual)) return null;

  const session = JSON.parse(Buffer.from(payload, 'base64url').toString());
  return session.expiresAt > Date.now() ? session.email : null;
}

module.exports = { setSession, clearSession, readSession };
