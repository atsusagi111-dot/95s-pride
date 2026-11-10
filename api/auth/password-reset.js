const { callGas, normalizeEmail } = require('../_lib/gas');

// パスワード設定用の確認コードを送る(新しいパスワードはコード入力画面で受け取る)
module.exports = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  const email = normalizeEmail(req.body && req.body.email);
  if (!email) return res.status(400).json({ error: 'invalid_email' });

  try {
    await callGas('requestPasswordReset', { email });
    return res.status(200).json({ ok: true });
  } catch (error) {
    console.error(error);
    return res.status(503).json({ error: 'unavailable' });
  }
};
