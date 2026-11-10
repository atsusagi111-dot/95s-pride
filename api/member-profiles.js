const { createHandler, fetchForMember } = require('./_lib/handler');

// ログイン中の人にだけ、公開していないメンバーのプロフィールを返す
module.exports = createHandler('GET', async (req, res) => {
  const result = await fetchForMember(req, res, 'memberProfiles');
  if (!result) return res.status(401).json({ error: 'unauthorized' });
  return res.status(200).json({ profiles: result.profiles || [] });
});
