// アンケートの「メール確認済み」の通行証(署名つきの文字列)
// 確認コードを入力できた人にだけ渡し、回答の送信のときに見せてもらう。1時間で切れる
import { createHmac, timingSafeEqual } from 'node:crypto';

export const TICKET_TTL_SECONDS = 3600;

function sign(payload, secret) {
  // ログインの Cookie と署名が混ざらないよう、鍵に用途を付ける
  return createHmac('sha256', `survey-ticket:${secret}`).update(payload).digest('base64url');
}

export function createTicket(email, secret) {
  const payload = Buffer.from(JSON.stringify({ email, expiresAt: Date.now() + TICKET_TTL_SECONDS * 1000 })).toString('base64url');
  return `${payload}.${sign(payload, secret)}`;
}

// 正しく、期限内なら、確認済みのメールアドレスを返す。違えば null
export function readTicket(ticket, secret) {
  const [payload, signature] = String(ticket || '').split('.');
  if (!payload || !signature) return null;
  const expected = Buffer.from(sign(payload, secret));
  const actual = Buffer.from(signature);
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) return null;
  try {
    const data = JSON.parse(Buffer.from(payload, 'base64url').toString());
    return data.expiresAt > Date.now() ? data.email : null;
  } catch {
    return null;
  }
}
