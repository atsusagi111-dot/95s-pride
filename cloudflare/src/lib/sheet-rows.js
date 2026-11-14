// スプレッドシートの回答行を読むための共通処理(取り込みスクリプトと Worker の両方で使う)

// 見出しにこれらの語を含む設問は、初期状態で非公開にする(連絡先・内部向けの項目)
export const EXCLUDE_KEYWORDS = ['email', 'mail', 'メール', '電話', 'tel', '住所', '郵便', 'line', 'q19', '特典', '本名'];
// カードの見出しにする設問(見出しがこの文字で始まる列)
export const TITLE_PREFIX = 'Q1 ';
export const EMAIL_HEADERS = ['email address', 'メールアドレス'];

// 見出しの行から、メールアドレスの列番号(0始まり)を返す。無ければ -1
export function findEmailColumn(headers) {
  return headers.findIndex((h) => EMAIL_HEADERS.includes(String(h).trim().toLowerCase()));
}

// 見出しの行から設問の一覧を作る(Q番号付きの見出しだけ)
export function parseQuestions(headers) {
  return headers
    .map((label, column) => ({ label: String(label), column }))
    .filter(({ label }) => /^Q\d+/.test(label.trim()))
    .map(({ label, column }, index) => {
      const text = label.trim().toLowerCase();
      return {
        key: `q${label.trim().match(/^Q(\d+)/)[1]}`,
        label: label.replace(/^Q\d+[\s.．:：]*/, '').trim(),
        column,
        isPublic: EXCLUDE_KEYWORDS.some((k) => text.includes(k)) ? 0 : 1,
        isTitle: label.startsWith(TITLE_PREFIX) ? 1 : 0,
        sortOrder: index + 1,
      };
    });
}

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

// 1行の回答を { email, respondedAt, name, birthDate, answers: {q1: '...'} } に整える
export function parseResponseRow(row, questions, emailColumn) {
  const cell = (column) => String(row[column] ?? '').trim();
  const nameQuestion = questions.find((item) => item.label.startsWith('名前'));
  const birthQuestion = questions.find((item) => item.label.startsWith('生年月日'));
  const answers = {};
  for (const item of questions) {
    const value = cell(item.column);
    if (value) answers[item.key] = value;
  }
  return {
    email: emailColumn >= 0 ? cell(emailColumn).toLowerCase() : '',
    respondedAt: toIso(cell(0)),
    name: (nameQuestion ? cell(nameQuestion.column) : '') || '(名前なし)',
    birthDate: birthQuestion ? toIso(cell(birthQuestion.column)) : null,
    answers,
    isEmpty: !row.some((value) => String(value ?? '').trim()),
  };
}
