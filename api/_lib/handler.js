const { callGas } = require('./gas');
const { clearSession, readSession } = require('./session');

// 各APIの共通処理: メソッドを確認し、Apps Scriptの障害などの例外は 503 で返す
function createHandler(method, handle) {
  return async (req, res) => {
    if (req.method !== method) return res.status(405).json({ error: 'method_not_allowed' });
    try {
      return await handle(req, res, req.body || {});
    } catch (error) {
      console.error(error);
      res.setHeader('Cache-Control', 'no-store');
      return res.status(503).json({ error: 'unavailable' });
    }
  };
}

// 会員限定のデータを Apps Script から取得する。ログインしていない・許可されていない場合は null
// 停止された人がCookieの期限まで閲覧し続けないよう、毎回許可を確認する
async function fetchForMember(req, res, action) {
  // 会員限定の内容なので、ブラウザにもVercelにも保存させない
  res.setHeader('Cache-Control', 'no-store');
  const email = readSession(req);
  if (!email) return null;

  const result = await callGas(action, { email });
  if (!result.allowed) {
    clearSession(res);
    return null;
  }
  return result;
}

module.exports = { createHandler, fetchForMember };
