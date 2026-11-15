// SNS・リンクの入力(@ID またはURL)を、安全なURLにそろえる
// 公開ページにリンクとして出すので、http / https 以外(javascript: など)と、別のサイトのURLは受け付けない

// 種類ごとの設定。key は questions.key、hosts はそのSNSのドメイン、handle は @ID の書式、build は @ID から作るURL
export const SNS_KINDS = {
  sns_x: { hosts: ['x.com', 'twitter.com'], handle: /^[A-Za-z0-9_]{1,15}$/, build: (id) => `https://x.com/${id}` },
  sns_instagram: { hosts: ['instagram.com'], handle: /^[A-Za-z0-9._]{1,30}$/, build: (id) => `https://www.instagram.com/${id}/` },
  sns_youtube: { hosts: ['youtube.com', 'youtu.be'], handle: /^[A-Za-z0-9._-]{1,50}$/, build: (id) => `https://www.youtube.com/@${id}` },
  sns_tiktok: { hosts: ['tiktok.com'], handle: /^[A-Za-z0-9._]{1,24}$/, build: (id) => `https://www.tiktok.com/@${id}` },
  sns_other: { hosts: null }, // HP・ブログなど。どのサイトでもよい
};

export const isSnsKey = (key) => Object.hasOwn(SNS_KINDS, key);

const MAX_URL_LENGTH = 500;

const hostMatches = (host, domain) => host === domain || host.endsWith(`.${domain}`);

// 入力を正規のURLにして返す。使えない入力は null
export function normalizeSnsLink(key, input) {
  const kind = SNS_KINDS[key];
  const text = String(input || '').trim();
  if (!kind || !text || text.length > MAX_URL_LENGTH) return null;

  // @ID だけの入力(「@」なしも許す)。「/」や「.」を含むURLらしいものは、下でURLとして調べる
  const idOnly = text.replace(/^@/, '');
  if (kind.handle && kind.handle.test(idOnly) && !/^https?:/i.test(text)) return kind.build(idOnly);

  // URL(「https://」が無ければ補う)
  let url;
  try {
    url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(text) ? text : `https://${text}`);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  if (url.username || url.password) return null;
  const host = url.hostname.toLowerCase();
  if (!host.includes('.')) return null;
  if (kind.hosts && !kind.hosts.some((domain) => hostMatches(host, domain))) return null;
  // http は https に直す
  url.protocol = 'https:';
  return url.href;
}
