// プロフィールを画面用の形 { id, title, photo, items: [{ label, value }] } に組み立てる
// 公開してよい設問(questions.is_public = 1)しか含めない
import { photoUrl } from './photos.js';
import { formatBirthDate } from './sheet-rows.js';
import { isSnsKey } from './sns-links.js';

const SELECT_PROFILES = `
  SELECT p.id, p.slug, p.display_name, p.birth_date, p.photo_path, p.visibility, mp.updated_at AS photo_version
  FROM profiles p
  LEFT JOIN member_photos mp ON mp.member_id = p.member_id
  WHERE p.is_current = 1`;

// 条件に合うプロフィールの回答を、プロフィールごとにまとめて返す
// condition は、この中の固定の文字列だけを渡す(利用者の入力は binds で渡す)
// 会員の数だけ「?」を並べると、D1 の上限(1回に渡せる値は100個)を超えるため、結合で絞る
async function loadAnswers(db, condition, binds) {
  const { results } = await db.prepare(`
    SELECT a.profile_id, a.question_key, q.label, q.is_title, a.answer
    FROM profile_answers a
    JOIN profiles p ON p.id = a.profile_id
    JOIN questions q ON q.key = a.question_key
    WHERE q.is_public = 1 AND p.is_current = 1 AND ${condition}
    ORDER BY a.profile_id, q.sort_order`).bind(...binds).all();
  const byProfile = new Map();
  for (const row of results) {
    if (!byProfile.has(row.profile_id)) byProfile.set(row.profile_id, []);
    byProfile.get(row.profile_id).push(row);
  }
  return byProfile;
}

function buildProfile(row, answers = []) {
  const titleRow = answers.find((a) => a.is_title);
  // SNS・リンクは、項目の一覧ではなく、アイコンのリンクとして別に渡す(念のため、http(s) 以外は出さない)
  const links = answers
    .filter((a) => isSnsKey(a.question_key) && /^https:\/\//.test(a.answer))
    .map((a) => ({ kind: a.question_key.slice('sns_'.length), label: a.label, url: a.answer }));
  const items = answers
    .filter((a) => !a.is_title && !isSnsKey(a.question_key))
    .map((a) => ({
      label: a.label,
      // 生年月日は「1995年9月6日」の形にそろえる
      value: a.label.startsWith('生年月日') && row.birth_date ? formatBirthDate(row.birth_date) : a.answer,
    }));
  return {
    id: row.slug,
    title: titleRow ? titleRow.answer : '',
    // 会員がアップロードした写真があれば優先し、なければ運営が設定した写真、どちらも無ければ null(画面側が共通のアイコンを出す)
    photo: row.photo_version ? photoUrl(row.slug, row.photo_version) : row.photo_path || null,
    items,
    links,
  };
}

// visibility('public' / 'members')のプロフィール一覧
export async function listProfiles(db, visibility) {
  const { results } = await db.prepare(`${SELECT_PROFILES} AND p.visibility = ? ORDER BY p.sort_order, p.id`).bind(visibility).all();
  const answers = await loadAnswers(db, 'p.visibility = ?', [visibility]);
  return results.map((row) => buildProfile(row, answers.get(row.id)));
}

// slug で1件取る。見つからなければ null。{ profile, visibility } を返す
export async function getProfile(db, slug) {
  const row = await db.prepare(`${SELECT_PROFILES} AND p.slug = ?`).bind(slug).first();
  if (!row) return null;
  const answers = await loadAnswers(db, 'p.slug = ?', [slug]);
  return { profile: buildProfile(row, answers.get(row.id)), visibility: row.visibility };
}

// 「メンバー掲載」(ログイン後の紹介カード)
export async function listMemberCards(db) {
  const { results } = await db.prepare('SELECT name, title, bio, image_url, instagram_url FROM member_cards ORDER BY sort_order, id').all();
  return results.map((r) => ({ name: r.name, title: r.title || '', bio: r.bio || '', image: r.image_url || '', instagram: r.instagram_url || '' }));
}
