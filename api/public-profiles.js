const { createHandler } = require('./_lib/handler');
const { callGas } = require('./_lib/gas');

// ログインなしで見られるプロフィールを返す(公開する行・列はApps Script側で決める)
module.exports = createHandler('GET', async (req, res) => {
  const { profiles } = await callGas('publicProfiles', {});
  // Apps Scriptへの負荷を抑えるため、Vercel側だけで5分間保存する(ブラウザには保存させない)
  res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
  return res.status(200).json({ profiles: profiles || [] });
});
