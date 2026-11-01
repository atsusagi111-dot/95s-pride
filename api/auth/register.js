const { callGas, normalizeEmail } = require('../_lib/gas');
const { hashPassword, isValidPassword } = require('../_lib/password');

// 新規会員登録の確認コード送信を依頼する(登録済みかどうかが分からないよう、結果は常に同じ)
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const email = normalizeEmail(req.body && req.body.email);
  if (!email) return res.status(400).json({ error: 'invalid_email' });

  const name = String((req.body && req.body.name) || '').replace(/[\x00-\x1f\x7f]/g, '').trim();
  if (!name || name.length > 50) return res.status(400).json({ error: 'invalid_name' });

  const password = req.body && req.body.password;
  if (!isValidPassword(password)) return res.status(400).json({ error: 'invalid_password' });

  try {
    const ip = req.headers['x-real-ip'] || req.socket.remoteAddress;
    const passwordHash = await hashPassword(password);
    await callGas('registerMember', { email, name, ip, passwordHash });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(503).json({ error: 'unavailable' });
  }
};
