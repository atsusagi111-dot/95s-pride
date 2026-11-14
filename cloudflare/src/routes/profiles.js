// プロフィールの配信(公開・会員限定・1件)
import { getProfile, listMemberCards, listProfiles } from '../lib/profiles.js';
import { clearSessionCookie } from '../lib/session.js';
import { currentMember, json } from './http.js';

// ログインなしで見られるプロフィール。5分間は Cloudflare 側で保存する(ブラウザには保存させない)
export async function publicProfiles(request, env) {
  const profiles = await listProfiles(env.DB, 'public');
  return json({ profiles }, 200, { 'Cache-Control': 'public, max-age=0, s-maxage=300' });
}

// ログイン中の人にだけ、会員限定のプロフィールを返す
export async function memberProfiles(request, env) {
  const member = await currentMember(request, env);
  if (!member) return json({ error: 'unauthorized' }, 401, { 'Set-Cookie': clearSessionCookie() });
  const profiles = await listProfiles(env.DB, 'members');
  return json({ profiles });
}

// 固定IDで1件返す。会員限定ならログインが必要。非表示・不明なら 404
export async function profileById(request, env, slug) {
  const found = await getProfile(env.DB, slug);
  if (!found || found.visibility === 'hidden') return json({ error: 'not_found' }, 404);
  if (found.visibility === 'members') {
    const member = await currentMember(request, env);
    if (!member) return json({ error: 'unauthorized' }, 401);
  }
  return json({ profile: found.profile });
}

// ログイン中の人にだけ「メンバー掲載」の紹介カードを返す
export async function members(request, env) {
  const member = await currentMember(request, env);
  if (!member) return json({ error: 'unauthorized' }, 401, { 'Set-Cookie': clearSessionCookie() });
  return json({ members: await listMemberCards(env.DB) });
}
