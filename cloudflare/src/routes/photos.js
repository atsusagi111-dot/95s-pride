// プロフィール写真の配信(写真は、アンケートで送られたものを取り込んで保存してある)
import { fromBase64 } from '../lib/photos.js';
import { currentMember, json } from './http.js';

// GET /api/photo/:slug: 写真を返す。公開のプロフィールはだれでも、会員限定はログインした人だけ、非表示は出さない
export async function servePhoto(request, env, slug) {
  const row = await env.DB.prepare(`
    SELECT p.visibility, mp.data_base64
    FROM profiles p JOIN member_photos mp ON mp.member_id = p.member_id
    WHERE p.slug = ? AND p.is_current = 1`).bind(slug).first();
  if (!row || row.visibility === 'hidden') return json({ error: 'not_found' }, 404);
  if (row.visibility === 'members' && !(await currentMember(request, env))) return json({ error: 'unauthorized' }, 401);

  return new Response(fromBase64(row.data_base64), {
    headers: {
      'Content-Type': 'image/jpeg',
      // 画像以外として解釈されないようにする
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'; sandbox",
      'Cache-Control': row.visibility === 'public' ? 'public, max-age=86400' : 'private, max-age=3600',
    },
  });
}
