// テスト用のデータ投入と HTTP 呼び出し
import { env, SELF } from 'cloudflare:test';
import { hashPassword } from '../src/lib/credentials.js';

export const QUESTIONS = [
  ['q1', 'オプチャの表示名', 1, 1, 1],
  ['q2', '名前 (呼ばれたいニックネーム)', 1, 0, 2],
  ['q3', '生年月日', 1, 0, 3],
  ['q4', '地域', 1, 0, 4],
  ['q19', 'プロフィール回答特典について', 0, 0, 19],
];

// 会員・プロフィール・回答を1件ずつ入れて、作った ID を返す
export async function seedMember({ email, password, status = 'active', visibility = 'public', name = 'テスト', slug = 'abcd1234', admin = false }) {
  const passwordHash = password ? await hashPassword(password) : null;
  await env.DB.batch(QUESTIONS.map((q) => env.DB.prepare('INSERT OR IGNORE INTO questions (key, label, is_public, is_title, sort_order) VALUES (?, ?, ?, ?, ?)').bind(...q)));
  await env.DB.prepare('INSERT INTO members (email, password_hash, status) VALUES (?, ?, ?)').bind(email, passwordHash, status).run();
  const member = await env.DB.prepare('SELECT id FROM members WHERE email = ?').bind(email).first();
  await env.DB.prepare('INSERT INTO profiles (slug, member_id, display_name, birth_date, visibility, is_current, sort_order) VALUES (?, ?, ?, ?, ?, 1, 1)')
    .bind(slug, member.id, name, '1995-09-06', visibility).run();
  const profile = await env.DB.prepare('SELECT id FROM profiles WHERE slug = ?').bind(slug).first();
  await env.DB.batch([
    env.DB.prepare('INSERT INTO profile_answers (profile_id, question_key, answer) VALUES (?, ?, ?)').bind(profile.id, 'q1', `${name}の表示名`),
    env.DB.prepare('INSERT INTO profile_answers (profile_id, question_key, answer) VALUES (?, ?, ?)').bind(profile.id, 'q2', name),
    env.DB.prepare('INSERT INTO profile_answers (profile_id, question_key, answer) VALUES (?, ?, ?)').bind(profile.id, 'q3', '9/6/1995'),
    env.DB.prepare('INSERT INTO profile_answers (profile_id, question_key, answer) VALUES (?, ?, ?)').bind(profile.id, 'q19', '受け取らない'),
  ]);
  if (admin) await env.DB.prepare('INSERT INTO admins (email) VALUES (?)').bind(email).run();
  return { memberId: member.id, profileId: profile.id, slug };
}

export function post(path, body, cookie) {
  return SELF.fetch(`https://example.com${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    body: JSON.stringify(body),
  });
}

export function get(path, cookie) {
  return SELF.fetch(`https://example.com${path}`, { headers: cookie ? { Cookie: cookie } : {} });
}

// Set-Cookie から Cookie ヘッダー用の値を取り出す
export function cookieOf(response) {
  const header = response.headers.get('set-cookie') || '';
  return header.split(';')[0];
}

export async function loginAs(email, password) {
  const res = await post('/api/auth/login', { email, password });
  if (res.status !== 200) throw new Error(`ログインに失敗: ${res.status}`);
  return cookieOf(res);
}
