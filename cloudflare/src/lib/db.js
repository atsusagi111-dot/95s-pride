// D1 へのアクセスをまとめる(会員、回数制限、確認コード)
import { createHash } from 'node:crypto';

const now = () => Math.floor(Date.now() / 1000);

export async function getMember(db, email) {
  return db.prepare('SELECT id, email, password_hash, status FROM members WHERE email = ?').bind(email).first();
}

// ログインしてよい会員か(停止されていない)
export function isAllowed(member) {
  return Boolean(member) && member.status === 'active';
}

// 運営として登録されていれば { email, role } を返す。いなければ null
export async function getAdmin(db, email) {
  if (!email) return null;
  return db.prepare('SELECT email, role FROM admins WHERE email = ?').bind(email).first();
}

// 運営の操作を記録する(記録に失敗しても、操作そのものは止めない)
export async function logAdminAction(db, adminEmail, action, target = null, detail = null) {
  try {
    await db.prepare('INSERT INTO admin_log (admin_email, action, target, detail) VALUES (?, ?, ?, ?)')
      .bind(adminEmail, action, target, detail).run();
  } catch (error) {
    console.error('操作の記録に失敗しました:', error);
  }
}

/* ---------- 回数制限(GAS の CacheService の置き換え) ---------- */

// 回数を1増やして、増やしたあとの回数を返す。期限切れなら 1 から数え直す。ttlSeconds は最初の1回からの期限
// 1回の命令で数えるので、同時に何件来ても数え漏れない
export async function bumpCount(db, key, ttlSeconds) {
  const row = await db.prepare(`
    INSERT INTO rate_limits (key, count, expires_at) VALUES (?1, 1, ?2 + ?3)
    ON CONFLICT(key) DO UPDATE SET
      count = CASE WHEN expires_at <= ?2 THEN 1 ELSE count + 1 END,
      expires_at = CASE WHEN expires_at <= ?2 THEN ?2 + ?3 ELSE expires_at END
    RETURNING count`).bind(key, now(), ttlSeconds).first();
  return row.count;
}

export async function clearCount(db, key) {
  await db.prepare('DELETE FROM rate_limits WHERE key = ?').bind(key).run();
}

/* ---------- 確認コード ---------- */

function hashCode(email, code) {
  return createHash('sha256').update(`${email}:${code}`).digest('hex');
}

export async function saveCode(db, email, code, ttlSeconds) {
  await db.prepare('INSERT OR REPLACE INTO auth_codes (email, code_hash, attempts, expires_at, created_at) VALUES (?, ?, 0, ?, ?)')
    .bind(email, hashCode(email, code), now() + ttlSeconds, now()).run();
}

// コードを照合する。正しければ消して true。間違いは回数を数え、上限で消す
// 先に試行回数を1増やしてから照合する。同時に大量の推測が来ても、上限(maxAttempts 回)を超えて試せない
export async function consumeCode(db, email, code, maxAttempts) {
  const row = await db.prepare(
    'UPDATE auth_codes SET attempts = attempts + 1 WHERE email = ? AND expires_at > ? AND attempts < ? RETURNING code_hash, attempts',
  ).bind(email, now(), maxAttempts).first();
  if (!row) return false;
  const matched = row.code_hash === hashCode(email, code);
  if (matched || row.attempts >= maxAttempts) {
    await db.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email).run();
  }
  return matched;
}

// 期限切れの行を掃除する(定期実行から呼ぶ)
export async function cleanupExpired(db) {
  await db.batch([
    db.prepare('DELETE FROM rate_limits WHERE expires_at <= ?').bind(now()),
    db.prepare('DELETE FROM auth_codes WHERE expires_at <= ?').bind(now()),
  ]);
}
