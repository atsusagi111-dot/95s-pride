// Apps Script(Webアプリ)を呼び出す共通処理
async function callGas(action, params) {
  const res = await fetch(process.env.GAS_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: process.env.GAS_SHARED_SECRET, action, ...params }),
  });
  if (!res.ok) {
    throw new Error(`Apps Scriptの呼び出しに失敗しました: ${res.status}`);
  }
  const data = await res.json();
  if (data.error) {
    throw new Error(`Apps Scriptがエラーを返しました: ${data.error}`);
  }
  return data;
}

// メールアドレスを照合用に揃える(不正な形式は空文字を返す)
function normalizeEmail(value) {
  const email = typeof value === 'string' ? value.trim().toLowerCase() : '';
  return email.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) ? email : '';
}

module.exports = { callGas, normalizeEmail };
