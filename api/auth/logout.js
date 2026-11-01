const { clearSession } = require('../_lib/session');

// ログアウトする
module.exports = (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'method_not_allowed' });

  clearSession(res);
  return res.status(200).json({ ok: true });
};
