const { createHandler } = require('../_lib/handler');
const { callGas } = require('../_lib/gas');
const { normalizeEmail, isValidPassword, hashPassword } = require('../_lib/credentials');
const { setSession } = require('../_lib/session');

// 確認コードを照合し、正しければ新しいパスワードを保存してログイン状態にする
module.exports = createHandler('POST', async (req, res, body) => {
  const email = normalizeEmail(body.email);
  const code = String(body.code || '').trim();
  if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'invalid_code' });
  if (!isValidPassword(body.password)) return res.status(400).json({ error: 'invalid_password' });

  const passwordHash = await hashPassword(body.password);
  const { valid } = await callGas('verifyCode', { email, code, passwordHash });
  if (!valid) return res.status(401).json({ error: 'invalid_code' });

  setSession(res, email);
  return res.status(200).json({ ok: true });
});
