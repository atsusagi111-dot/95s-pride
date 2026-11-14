// メールアドレスの正規化とパスワードのハッシュ(Vercel 版と同じ scrypt$salt$key 形式。既存のパスワードをそのまま引き継ぐ)
import { scrypt as scryptCallback, randomBytes, timingSafeEqual } from 'node:crypto';

const KEY_LENGTH = 32;
const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
// 未登録のメールアドレスでも同じ計算を行い、応答時間で登録の有無が分からないようにする
const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(KEY_LENGTH * 2)}`;

function scrypt(password, salt) {
  return new Promise((resolve, reject) => {
    scryptCallback(password, salt, KEY_LENGTH, (error, key) => (error ? reject(error) : resolve(key)));
  });
}

// メールアドレスを照合用に揃える(不正な形式は空文字を返す)
export function normalizeEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

export function isValidPassword(password) {
  return typeof password === 'string' && password.length >= MIN_LENGTH && password.length <= MAX_LENGTH;
}

// パスワードは元に戻せない形に変換してから保存する
export async function hashPassword(password) {
  const salt = randomBytes(16).toString('hex');
  const key = await scrypt(password, salt);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

export async function verifyPassword(password, storedHash) {
  const [, salt, key] = (storedHash || DUMMY_HASH).split('$');
  const actual = await scrypt(password, salt);
  const matched = timingSafeEqual(actual, Buffer.from(key, 'hex'));
  return matched && Boolean(storedHash);
}
