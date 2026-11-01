const { callGas } = require('./_lib/gas');
const { clearSession, readSession } = require('./_lib/session');

// ログイン中の人にだけメンバー情報を返す
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });
  res.setHeader('Cache-Control', 'no-store');

  const email = readSession(req);
  if (!email) return res.status(401).json({ error: 'unauthorized' });

  try {
    // 停止された人がCookieの期限まで閲覧し続けないよう、毎回許可を確認する
    const { allowed, members } = await callGas('listMembers', { email });
    if (!allowed) {
      clearSession(res);
      return res.status(401).json({ error: 'unauthorized' });
    }
    return res.status(200).json({ members });
  } catch (error) {
    console.error(error);
    return res.status(503).json({ error: 'unavailable' });
  }
};
