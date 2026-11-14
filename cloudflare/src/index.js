// 95s PRIDE の Worker 本体: サイト配信(静的ファイル)と /api/* の振り分け、定期実行
import { login, logout, passwordReset, verifyCode } from './routes/auth.js';
import { memberProfiles, members, profileById, publicProfiles } from './routes/profiles.js';
import { handleAdmin } from './routes/admin.js';
import { json, readJson } from './routes/http.js';
import { syncResponses } from './lib/sync.js';
import { cleanupExpired } from './lib/db.js';

const POST_ROUTES = {
  '/api/auth/login': login,
  '/api/auth/logout': logout,
  '/api/auth/password-reset': passwordReset,
  '/api/auth/verify-code': verifyCode,
};
const GET_ROUTES = {
  '/api/public-profiles': publicProfiles,
  '/api/member-profiles': memberProfiles,
  '/api/members': members,
};

async function handleApi(request, env) {
  const url = new URL(request.url);
  const { pathname } = url;
  const { method } = request;

  if (pathname.startsWith('/api/admin/')) {
    const body = method === 'POST' ? await readJson(request) : {};
    return handleAdmin(request, env, pathname.slice('/api/admin/'.length), body);
  }
  const byId = pathname.match(/^\/api\/profile\/([A-Za-z0-9]{4,32})$/);
  if (byId && method === 'GET') return profileById(request, env, byId[1]);

  const handler = method === 'POST' ? POST_ROUTES[pathname] : method === 'GET' ? GET_ROUTES[pathname] : null;
  if (!handler) {
    const known = POST_ROUTES[pathname] || GET_ROUTES[pathname];
    return json({ error: known ? 'method_not_allowed' : 'not_found' }, known ? 405 : 404);
  }
  const body = method === 'POST' ? await readJson(request) : {};
  return handler(request, env, body);
}

// 画像は1年間ブラウザに保存させる(差し替えは新しいファイル名で行う)
async function handleAsset(request, env) {
  const response = await env.ASSETS.fetch(request);
  if (!response.ok) return response;
  const headers = new Headers(response.headers);
  headers.set('Cache-Control', 'public, max-age=31536000, immutable');
  return new Response(response.body, { status: response.status, headers });
}

export default {
  async fetch(request, env) {
    const { pathname } = new URL(request.url);
    try {
      if (pathname.startsWith('/api/')) return await handleApi(request, env);
      if (pathname.startsWith('/assets/')) return await handleAsset(request, env);
      return await env.ASSETS.fetch(request);
    } catch (error) {
      console.error(error);
      return json({ error: 'unavailable' }, 503);
    }
  },

  // 定期実行: フォームの新しい回答を取り込み、期限切れのコードなどを掃除する
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      await cleanupExpired(env.DB);
      // サービスアカウントが未登録のうちは取り込みを行わない(設定前にエラーを出し続けないため)
      if (!env.GOOGLE_SERVICE_ACCOUNT) {
        console.warn('GOOGLE_SERVICE_ACCOUNT が未登録のため、フォーム回答の取り込みを飛ばしました');
        return;
      }
      const summary = await syncResponses(env);
      console.log('フォーム回答の取り込み:', JSON.stringify(summary));
    })());
  },
};
