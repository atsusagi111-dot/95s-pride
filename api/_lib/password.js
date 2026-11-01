const crypto = require('crypto');
const { promisify } = require('util');

const scrypt = promisify(crypto.scrypt);
const KEY_LENGTH = 32;
const MIN_LENGTH = 8;
const MAX_LENGTH = 128;
// 未登録のメールアドレスでも同じ計算を行い、応答時間で登録の有無が分からないようにする
const DUMMY_HASH = `scrypt$${'0'.repeat(32)}$${'0'.repeat(KEY_LENGTH * 2)}`;

function isValidPassword(password) {
  return typeof password === 'string' && password.length >= MIN_LENGTH && password.length <= MAX_LENGTH;
}

// パスワードは元に戻せない形に変換してから保存する
async function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString('hex');
  const key = await scrypt(password, salt, KEY_LENGTH);
  return `scrypt$${salt}$${key.toString('hex')}`;
}

async function verifyPassword(password, storedHash) {
  const [, salt, key] = (storedHash || DUMMY_HASH).split('$');
  const actual = await scrypt(password, salt, KEY_LENGTH);
  const matched = crypto.timingSafeEqual(actual, Buffer.from(key, 'hex'));
  return matched && Boolean(storedHash);
}

module.exports = { isValidPassword, hashPassword, verifyPassword };
