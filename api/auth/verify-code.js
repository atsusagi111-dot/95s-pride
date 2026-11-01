const { callGas, normalizeEmail } = require('../_lib/gas');
const { setSession } = require('../_lib/session');

// 確認コードを照合し、正しければログイン状態にする
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const email = normalizeEmail(req.body && req.body.email);
  const code = String((req.body && req.body.code) || '').trim();
  if (!email || !/^\d{6}$/.test(code)) return res.status(400).json({ error: 'invalid_code' });

  try {
    const { valid } = await callGas('verifyCode', { email, code });
    if (!valid) return res.status(401).json({ error: 'invalid_code' });

    setSession(res, email);
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(503).json({ error: 'unavailable' });
  }
};
