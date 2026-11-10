const { createHandler } = require('../_lib/handler');
const { clearSession } = require('../_lib/session');

// ログアウトする
module.exports = createHandler('POST', async (req, res) => {
  clearSession(res);
  return res.status(200).json({ ok: true });
});
