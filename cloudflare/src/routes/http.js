// レスポンスを作る小さな共通処理
import { readSession } from '../lib/session.js';
import { getMember, isAllowed } from '../lib/db.js';

export function json(data, status = 200, headers = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', ...headers },
  });
}

// ログイン中で、停止されていない会員を返す。違えば null
// 停止された人が Cookie の期限まで閲覧し続けないよう、毎回 D1 を確認する
export async function currentMember(request, env) {
  const email = readSession(request, env.SESSION_SECRET);
  if (!email) return null;
  const member = await getMember(env.DB, email);
  return isAllowed(member) ? member : null;
}

export async function readJson(request) {
  try {
    return (await request.json()) || {};
  } catch {
    return {};
  }
}
