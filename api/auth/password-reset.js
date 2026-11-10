const { createHandler } = require('../_lib/handler');
const { callGas } = require('../_lib/gas');
const { normalizeEmail } = require('../_lib/credentials');

// パスワード設定用の確認コードを送る(初回・再設定とも。新しいパスワードはコード入力画面で受け取る)
module.exports = createHandler('POST', async (req, res, body) => {
  const email = normalizeEmail(body.email);
  if (!email) return res.status(400).json({ error: 'invalid_email' });

  const { registered } = await callGas('requestPasswordReset', { email });
  // フォームに回答していない(登録できない)メールアドレス
  if (registered === false) return res.status(404).json({ error: 'not_registered' });
  return res.status(200).json({ ok: true });
});
