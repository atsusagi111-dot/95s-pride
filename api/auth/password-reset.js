const { callGas, normalizeEmail } = require('../_lib/gas');
const { hashPassword, isValidPassword } = require('../_lib/password');

// パスワード再設定の確認コード送信を依頼する(コードの照合が済むまで今のパスワードは変わらない)
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const email = normalizeEmail(req.body && req.body.email);
  if (!email) return res.status(400).json({ error: 'invalid_email' });

  const password = req.body && req.body.password;
  if (!isValidPassword(password)) return res.status(400).json({ error: 'invalid_password' });

  try {
    const passwordHash = await hashPassword(password);
    await callGas('requestPasswordReset', { email, passwordHash });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(503).json({ error: 'unavailable' });
  }
};
