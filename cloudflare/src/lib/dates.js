// 日付の読み取りと表示(アンケートの生年月日で使う)

// "10/5/2026 22:31:33" → "2026-10-05T22:31:33+09:00"、"6/11/1995" → "1995-06-11"、"1995年6月29日" → "1995-06-29"
export function toIso(text) {
  const value = String(text || '').trim();
  const pad = (n) => String(n).padStart(2, '0');
  const jp = value.match(/^(\d{4})年(\d{1,2})月(\d{1,2})日$/);
  if (jp) return `${jp[1]}-${pad(jp[2])}-${pad(jp[3])}`;
  const iso = value.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return value.includes('T') ? value : iso[0];
  const m = value.match(/^(\d+)\/(\d+)\/(\d+)(?:\s+(\d+):(\d+):(\d+))?$/);
  if (!m) return null;
  const [, mo, d, y, h = '0', mi = '0', se = '0'] = m;
  const date = `${y}-${pad(mo)}-${pad(d)}`;
  return value.includes(':') ? `${date}T${pad(h)}:${pad(mi)}:${pad(se)}+09:00` : date;
}

// "1995-09-06" → "1995年9月6日"
export function formatBirthDate(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  return m ? `${m[1]}年${Number(m[2])}月${Number(m[3])}日` : iso || '';
}
