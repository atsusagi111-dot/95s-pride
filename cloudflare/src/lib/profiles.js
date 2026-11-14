// プロフィールを画面用の形 { id, title, photo, items: [{ label, value }] } に組み立てる
// 公開してよい設問(questions.is_public = 1)しか含めない
import { formatBirthDate } from './sheet-rows.js';

const SELECT_PROFILES = `
  SELECT p.id, p.slug, p.display_name, p.birth_date, p.photo_path, p.visibility, p.sort_order
  FROM profiles p
  WHERE p.is_current = 1`;

async function loadAnswers(db, profileIds) {
  if (!profileIds.length) return new Map();
  const placeholders = profileIds.map(() => '?').join(',');
  const { results } = await db.prepare(`
    SELECT a.profile_id, q.key, q.label, q.is_title, a.answer
    FROM profile_answers a JOIN questions q ON q.key = a.question_key
    WHERE q.is_public = 1 AND a.profile_id IN (${placeholders})
    ORDER BY a.profile_id, q.sort_order`).bind(...profileIds).all();
  const byProfile = new Map();
  for (const row of results) {
    if (!byProfile.has(row.profile_id)) byProfile.set(row.profile_id, []);
    byProfile.get(row.profile_id).push(row);
  }
  return byProfile;
}

function buildProfile(row, answers) {
  const titleRow = answers.find((a) => a.is_title);
  const items = answers
    .filter((a) => !a.is_title)
    .map((a) => ({
      label: a.label,
      // 生年月日は「1995年9月6日」の形にそろえる
      value: a.label.startsWith('生年月日') && row.birth_date ? formatBirthDate(row.birth_date) : a.answer,
    }));
  return {
    id: row.slug,
    title: titleRow ? titleRow.answer : '',
    photo: row.photo_path || null,
    items,
  };
}

// visibility('public' / 'members')のプロフィール一覧
export async function listProfiles(db, visibility) {
  const { results } = await db.prepare(`${SELECT_PROFILES} AND p.visibility = ? ORDER BY p.sort_order, p.id`).bind(visibility).all();
  const answers = await loadAnswers(db, results.map((r) => r.id));
  return results.map((row) => buildProfile(row, answers.get(row.id) || []));
}

// slug で1件取る。見つからなければ null。{ profile, visibility } を返す
export async function getProfile(db, slug) {
  const row = await db.prepare(`${SELECT_PROFILES} AND p.slug = ?`).bind(slug).first();
  if (!row) return null;
  const answers = await loadAnswers(db, [row.id]);
  return { profile: buildProfile(row, answers.get(row.id) || []), visibility: row.visibility };
}

// 「メンバー掲載」(ログイン後の紹介カード)
export async function listMemberCards(db) {
  const { results } = await db.prepare('SELECT name, title, bio, image_url, instagram_url FROM member_cards ORDER BY sort_order, id').all();
  return results.map((r) => ({ name: r.name, title: r.title || '', bio: r.bio || '', image: r.image_url || '', instagram: r.instagram_url || '' }));
}
