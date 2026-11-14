// 運営向けの管理API(admins に登録されたメールアドレスでログインしている人だけ)
import { isAdmin } from '../lib/db.js';
import { syncResponses } from '../lib/sync.js';
import { currentMember, json } from './http.js';

const VISIBILITIES = ['public', 'members', 'hidden'];
const STATUSES = ['active', 'suspended'];

// 管理者でなければ 401/403 を返す。管理者なら null
async function requireAdmin(request, env) {
  const member = await currentMember(request, env);
  if (!member) return json({ error: 'unauthorized' }, 401);
  if (!(await isAdmin(env.DB, member.email))) return json({ error: 'forbidden' }, 403);
  return null;
}

// 会員とプロフィールの一覧(管理画面の表)
async function overview(env) {
  const { results: profiles } = await env.DB.prepare(`
    SELECT p.id, p.slug, p.display_name, p.responded_at, p.visibility, p.is_current, p.photo_path,
           m.id AS member_id, m.email, m.status, m.note, (m.password_hash IS NOT NULL) AS has_password
    FROM profiles p LEFT JOIN members m ON m.id = p.member_id
    ORDER BY p.is_current DESC, p.sort_order, p.id`).all();
  const { results: cards } = await env.DB.prepare('SELECT id, name, title, bio, image_url, instagram_url, sort_order FROM member_cards ORDER BY sort_order, id').all();
  const { results: questions } = await env.DB.prepare('SELECT key, label, is_public FROM questions ORDER BY sort_order').all();
  return json({ profiles, cards, questions });
}

// プロフィールの公開範囲・写真を変える
async function updateProfile(env, id, body) {
  const sets = [];
  const values = [];
  if (body.visibility !== undefined) {
    if (!VISIBILITIES.includes(body.visibility)) return json({ error: 'invalid_visibility' }, 400);
    sets.push('visibility = ?');
    values.push(body.visibility);
  }
  if (body.photo_path !== undefined) {
    const photo = String(body.photo_path || '').trim();
    // 写真はサイト内の assets/members/ にあるファイルだけ
    if (photo && !/^assets\/members\/[\w.-]+$/.test(photo)) return json({ error: 'invalid_photo' }, 400);
    sets.push('photo_path = ?');
    values.push(photo || null);
  }
  if (body.is_current !== undefined) {
    sets.push('is_current = ?');
    values.push(body.is_current ? 1 : 0);
  }
  if (!sets.length) return json({ error: 'nothing_to_update' }, 400);
  await env.DB.prepare(`UPDATE profiles SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...values, id).run();
  return json({ ok: true });
}

// 会員の停止・再開とメモ
async function updateMember(env, id, body) {
  const sets = [];
  const values = [];
  if (body.status !== undefined) {
    if (!STATUSES.includes(body.status)) return json({ error: 'invalid_status' }, 400);
    sets.push('status = ?');
    values.push(body.status);
  }
  if (body.note !== undefined) {
    sets.push('note = ?');
    values.push(String(body.note || '').slice(0, 500) || null);
  }
  if (!sets.length) return json({ error: 'nothing_to_update' }, 400);
  await env.DB.prepare(`UPDATE members SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...values, id).run();
  return json({ ok: true });
}

// 設問の公開・非公開
async function updateQuestion(env, key, body) {
  await env.DB.prepare('UPDATE questions SET is_public = ? WHERE key = ?').bind(body.is_public ? 1 : 0, key).run();
  return json({ ok: true });
}

function isHttpsOrEmpty(url) {
  return !url || /^https:\/\//i.test(url);
}

// 紹介カードの追加・更新・削除
async function saveCard(env, id, body) {
  const name = String(body.name || '').trim();
  if (!name) return json({ error: 'name_required' }, 400);
  const image = String(body.image_url || '').trim();
  const instagram = String(body.instagram_url || '').trim();
  if (!isHttpsOrEmpty(image) || !isHttpsOrEmpty(instagram)) return json({ error: 'https_only' }, 400);
  const values = [name, String(body.title || '').trim(), String(body.bio || '').trim(), image || null, instagram || null, Number(body.sort_order) || 0];
  if (id) {
    await env.DB.prepare('UPDATE member_cards SET name = ?, title = ?, bio = ?, image_url = ?, instagram_url = ?, sort_order = ?, updated_at = datetime(\'now\') WHERE id = ?').bind(...values, id).run();
  } else {
    await env.DB.prepare('INSERT INTO member_cards (name, title, bio, image_url, instagram_url, sort_order) VALUES (?, ?, ?, ?, ?, ?)').bind(...values).run();
  }
  return json({ ok: true });
}

async function deleteCard(env, id) {
  await env.DB.prepare('DELETE FROM member_cards WHERE id = ?').bind(id).run();
  return json({ ok: true });
}

// 管理APIの振り分け。path は /api/admin/ より後ろ
export async function handleAdmin(request, env, path, body) {
  const denied = await requireAdmin(request, env);
  if (denied) return denied;
  const { method } = request;
  let m;

  if (method === 'GET' && path === 'overview') return overview(env);
  if (method === 'POST' && path === 'sync') return json(await syncResponses(env));
  if (method === 'POST' && (m = path.match(/^profiles\/(\d+)$/))) return updateProfile(env, Number(m[1]), body);
  if (method === 'POST' && (m = path.match(/^members\/(\d+)$/))) return updateMember(env, Number(m[1]), body);
  if (method === 'POST' && (m = path.match(/^questions\/(q\d+)$/))) return updateQuestion(env, m[1], body);
  if (method === 'POST' && path === 'cards') return saveCard(env, null, body);
  if (method === 'POST' && (m = path.match(/^cards\/(\d+)$/))) return saveCard(env, Number(m[1]), body);
  if (method === 'DELETE' && (m = path.match(/^cards\/(\d+)$/))) return deleteCard(env, Number(m[1]));
  return json({ error: 'not_found' }, 404);
}
