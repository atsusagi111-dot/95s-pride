// 運営向けの管理API(admins に登録されたメールアドレスでログインしている人だけ)
// 権限は2段階: owner(全操作)/ editor(停止と設問の公開設定はできない)
import { getAdmin, logAdminAction } from '../lib/db.js';
import { syncResponses } from '../lib/sync.js';
import { currentMember, json } from './http.js';

const VISIBILITIES = ['public', 'members', 'hidden'];
const STATUSES = ['active', 'suspended'];
const VISIBILITY_LABELS = { public: '公開', members: '会員限定', hidden: '非表示' };

// 管理者でなければ 401/403 を返す。管理者なら { admin }
async function requireAdmin(request, env) {
  const member = await currentMember(request, env);
  if (!member) return { denied: json({ error: 'unauthorized' }, 401) };
  const admin = await getAdmin(env.DB, member.email);
  if (!admin) return { denied: json({ error: 'forbidden' }, 403) };
  return { admin };
}

// 外のサイトから送られた操作を拒否する(ブラウザは必ず Origin を付けるので、違えば他サイトからの送信)
function isCrossSite(request) {
  const origin = request.headers.get('origin');
  return Boolean(origin) && origin !== new URL(request.url).origin;
}

const ownerOnly = () => json({ error: 'owner_only' }, 403);

// 会員とプロフィールの一覧(管理画面の表)
async function overview(env, admin) {
  const { results: profiles } = await env.DB.prepare(`
    SELECT p.id, p.slug, p.display_name, p.responded_at, p.visibility, p.is_current, p.photo_path,
           m.id AS member_id, m.email, m.status, m.note, (m.password_hash IS NOT NULL) AS has_password,
           (SELECT 1 FROM admins a WHERE a.email = m.email) AS is_admin
    FROM profiles p LEFT JOIN members m ON m.id = p.member_id
    ORDER BY p.is_current DESC, p.sort_order, p.id`).all();
  const { results: cards } = await env.DB.prepare('SELECT id, name, title, bio, image_url, instagram_url, sort_order FROM member_cards ORDER BY sort_order, id').all();
  const { results: questions } = await env.DB.prepare('SELECT key, label, is_public FROM questions ORDER BY sort_order').all();
  const { results: admins } = await env.DB.prepare('SELECT email, role FROM admins ORDER BY created_at, email').all();
  const { results: log } = await env.DB.prepare('SELECT at, admin_email, action, target, detail FROM admin_log ORDER BY id DESC LIMIT 30').all();
  return json({ me: { email: admin.email, role: admin.role }, admins, profiles, cards, questions, log });
}

// プロフィールの公開範囲・写真を変える
async function updateProfile(env, admin, id, body) {
  const current = await env.DB.prepare('SELECT display_name, visibility, photo_path FROM profiles WHERE id = ?').bind(id).first();
  if (!current) return json({ error: 'not_found' }, 404);
  const sets = [];
  const values = [];
  const details = [];
  if (body.visibility !== undefined) {
    if (!VISIBILITIES.includes(body.visibility)) return json({ error: 'invalid_visibility' }, 400);
    sets.push('visibility = ?');
    values.push(body.visibility);
    details.push(`公開範囲: ${VISIBILITY_LABELS[current.visibility]} → ${VISIBILITY_LABELS[body.visibility]}`);
  }
  if (body.photo_path !== undefined) {
    const photo = String(body.photo_path || '').trim();
    // 写真はサイト内の assets/members/ にあるファイルだけ
    if (photo && !/^assets\/members\/[\w.-]+$/.test(photo)) return json({ error: 'invalid_photo' }, 400);
    sets.push('photo_path = ?');
    values.push(photo || null);
    details.push(`写真: ${current.photo_path || '(なし)'} → ${photo || '(なし)'}`);
  }
  if (body.is_current !== undefined) {
    sets.push('is_current = ?');
    values.push(body.is_current ? 1 : 0);
    details.push(`最新の回答: ${body.is_current ? 'する' : 'しない'}`);
  }
  if (!sets.length) return json({ error: 'nothing_to_update' }, 400);
  await env.DB.prepare(`UPDATE profiles SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...values, id).run();
  await logAdminAction(env.DB, admin.email, 'profile.update', current.display_name, details.join(' / '));
  return json({ ok: true });
}

// 会員の停止・再開(オーナーのみ)とメモ(編集者もできる)
async function updateMember(env, admin, id, body) {
  const member = await env.DB.prepare('SELECT email, status FROM members WHERE id = ?').bind(id).first();
  if (!member) return json({ error: 'not_found' }, 404);
  const sets = [];
  const values = [];
  const details = [];
  let action = 'member.note';
  if (body.status !== undefined) {
    if (admin.role !== 'owner') return ownerOnly();
    if (!STATUSES.includes(body.status)) return json({ error: 'invalid_status' }, 400);
    // 運営の人を画面から止めて、自分たちを締め出さないようにする
    if (body.status === 'suspended' && (await getAdmin(env.DB, member.email))) return json({ error: 'cannot_suspend_admin' }, 400);
    sets.push('status = ?');
    values.push(body.status);
    action = body.status === 'suspended' ? 'member.suspend' : 'member.resume';
  }
  if (body.note !== undefined) {
    sets.push('note = ?');
    values.push(String(body.note || '').slice(0, 500) || null);
    details.push('メモを変更');
  }
  if (!sets.length) return json({ error: 'nothing_to_update' }, 400);
  await env.DB.prepare(`UPDATE members SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).bind(...values, id).run();
  await logAdminAction(env.DB, admin.email, action, member.email, details.join(' / ') || null);
  return json({ ok: true });
}

// 設問の公開・非公開(オーナーのみ)
async function updateQuestion(env, admin, key, body) {
  if (admin.role !== 'owner') return ownerOnly();
  const question = await env.DB.prepare('SELECT label FROM questions WHERE key = ?').bind(key).first();
  if (!question) return json({ error: 'not_found' }, 404);
  await env.DB.prepare('UPDATE questions SET is_public = ? WHERE key = ?').bind(body.is_public ? 1 : 0, key).run();
  await logAdminAction(env.DB, admin.email, 'question.public', question.label, body.is_public ? '公開にした' : '非公開にした');
  return json({ ok: true });
}

function isHttpsOrEmpty(url) {
  return !url || /^https:\/\//i.test(url);
}

// 紹介カードの追加・更新
async function saveCard(env, admin, id, body) {
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
  await logAdminAction(env.DB, admin.email, id ? 'card.update' : 'card.create', name);
  return json({ ok: true });
}

async function deleteCard(env, admin, id) {
  const card = await env.DB.prepare('SELECT name FROM member_cards WHERE id = ?').bind(id).first();
  await env.DB.prepare('DELETE FROM member_cards WHERE id = ?').bind(id).run();
  await logAdminAction(env.DB, admin.email, 'card.delete', card ? card.name : String(id));
  return json({ ok: true });
}

// 管理APIの振り分け。path は /api/admin/ より後ろ
export async function handleAdmin(request, env, path, body) {
  const { method } = request;
  if (method !== 'GET' && isCrossSite(request)) return json({ error: 'cross_site' }, 403);
  const { admin, denied } = await requireAdmin(request, env);
  if (denied) return denied;
  let m;

  if (method === 'GET' && path === 'overview') return overview(env, admin);
  if (method === 'POST' && path === 'sync') {
    const result = await syncResponses(env);
    await logAdminAction(env.DB, admin.email, 'sync', null, `新規 ${result.imported} 件 / お礼メール ${result.mailed} 件`);
    return json(result);
  }
  if (method === 'POST' && (m = path.match(/^profiles\/(\d+)$/))) return updateProfile(env, admin, Number(m[1]), body);
  if (method === 'POST' && (m = path.match(/^members\/(\d+)$/))) return updateMember(env, admin, Number(m[1]), body);
  if (method === 'POST' && (m = path.match(/^questions\/(q\d+)$/))) return updateQuestion(env, admin, m[1], body);
  if (method === 'POST' && path === 'cards') return saveCard(env, admin, null, body);
  if (method === 'POST' && (m = path.match(/^cards\/(\d+)$/))) return saveCard(env, admin, Number(m[1]), body);
  if (method === 'DELETE' && (m = path.match(/^cards\/(\d+)$/))) return deleteCard(env, admin, Number(m[1]));
  return json({ error: 'not_found' }, 404);
}
