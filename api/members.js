const { createHandler, fetchForMember } = require('./_lib/handler');

// ログイン中の人にだけ「メンバー掲載」シートの内容を返す
module.exports = createHandler('GET', async (req, res) => {
  const result = await fetchForMember(req, res, 'listMembers');
  if (!result) return res.status(401).json({ error: 'unauthorized' });
  return res.status(200).json({ members: result.members || [] });
});
