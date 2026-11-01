const { callGas, normalizeEmail } = require('../_lib/gas');
const { isValidPassword, verifyPassword } = require('../_lib/password');
const { setSession } = require('../_lib/session');

// メールアドレスとパスワードでログインする
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const email = normalizeEmail(req.body && req.body.email);
  const password = req.body && req.body.password;
  if (!email || !isValidPassword(password)) return res.status(401).json({ error: 'invalid_credentials' });

  try {
    const { locked, passwordHash } = await callGas('beginLogin', { email });
    if (locked) return res.status(429).json({ error: 'too_many_attempts' });

    const matched = await verifyPassword(password, passwordHash);
    if (!matched) return res.status(401).json({ error: 'invalid_credentials' });

    await callGas('clearLoginAttempts', { email });
    setSession(res, email);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(503).json({ error: 'unavailable' });
  }
};
