const { callGas } = require('./_lib/gas');

// ログインなしで見られるプロフィールを返す(公開する行・列はApps Script側で決める)
module.exports = async (req, res) => {
  if (req.method !== 'GET') return res.status(405).json({ error: 'method_not_allowed' });

  try {
    const { profiles } = await callGas('publicProfiles', {});
    // Apps Scriptへの負荷を抑えるため、Vercel側だけで5分間保存する(ブラウザには保存させない)
    res.setHeader('Cache-Control', 'public, max-age=0, s-maxage=300');
    return res.status(200).json({ profiles: profiles || [] });
  } catch (error) {
    console.error(error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ error: 'unavailable' });
  }
};
