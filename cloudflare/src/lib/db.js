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

export async function isAdmin(db, email) {
  if (!email) return false;
  const row = await db.prepare('SELECT 1 AS ok FROM admins WHERE email = ?').bind(email).first();
  return Boolean(row);
}

/* ---------- 回数制限(GAS の CacheService の置き換え) ---------- */

// 期限内の回数を返す(期限切れは 0)
export async function getCount(db, key) {
  const row = await db.prepare('SELECT count, expires_at FROM rate_limits WHERE key = ?').bind(key).first();
  return row && row.expires_at > now() ? row.count : 0;
}

// 回数を1増やして返す。期限切れなら 1 から数え直す。ttlSeconds は最初の1回からの期限
export async function bumpCount(db, key, ttlSeconds) {
  const current = await getCount(db, key);
  const count = current + 1;
  const expiresAt = current === 0 ? now() + ttlSeconds : undefined;
  if (expiresAt) {
    await db.prepare('INSERT OR REPLACE INTO rate_limits (key, count, expires_at) VALUES (?, ?, ?)').bind(key, count, expiresAt).run();
  } else {
    await db.prepare('UPDATE rate_limits SET count = ? WHERE key = ?').bind(count, key).run();
  }
  return count;
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
export async function consumeCode(db, email, code, maxAttempts) {
  const row = await db.prepare('SELECT code_hash, attempts, expires_at FROM auth_codes WHERE email = ?').bind(email).first();
  if (!row || row.expires_at <= now()) return false;
  if (row.code_hash === hashCode(email, code)) {
    await db.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email).run();
    return true;
  }
  if (row.attempts + 1 >= maxAttempts) {
    await db.prepare('DELETE FROM auth_codes WHERE email = ?').bind(email).run();
  } else {
    await db.prepare('UPDATE auth_codes SET attempts = attempts + 1 WHERE email = ?').bind(email).run();
  }
  return false;
}

// 期限切れの行を掃除する(定期実行から呼ぶ)
export async function cleanupExpired(db) {
  await db.batch([
    db.prepare('DELETE FROM rate_limits WHERE expires_at <= ?').bind(now()),
    db.prepare('DELETE FROM auth_codes WHERE expires_at <= ?').bind(now()),
  ]);
}
