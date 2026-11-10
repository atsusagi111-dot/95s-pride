const { createHandler } = require('../_lib/handler');
const { callGas } = require('../_lib/gas');
const { normalizeEmail, isValidPassword, verifyPassword } = require('../_lib/credentials');
const { setSession } = require('../_lib/session');

// メールアドレスとパスワードでログインする
module.exports = createHandler('POST', async (req, res, body) => {
  const email = normalizeEmail(body.email);
  const { password } = body;
  if (!email || !isValidPassword(password)) return res.status(401).json({ error: 'invalid_credentials' });

  const { locked, passwordHash } = await callGas('beginLogin', { email });
  if (locked) return res.status(429).json({ error: 'too_many_attempts' });

  const matched = await verifyPassword(password, passwordHash);
  if (!matched) return res.status(401).json({ error: 'invalid_credentials' });

  await callGas('clearLoginAttempts', { email });
  setSession(res, email);
  return res.status(200).json({ ok: true });
});
