// スプレッドシートの回答行を読むための共通処理(取り込みスクリプトと Worker の両方で使う)

// 見出しにこれらの語を含む設問は、初期状態で非公開にする(連絡先・内部向けの項目)
export const EXCLUDE_KEYWORDS = ['email', 'mail', 'メール', '電話', 'tel', '住所', '郵便', 'line', 'q19', '特典', '本名'];
// カードの見出しにする設問(見出しがこの文字で始まる列)
export const TITLE_PREFIX = 'Q1 ';
export const EMAIL_HEADERS = ['email address', 'メールアドレス'];
// 写真をアップロードする設問(見出しがこの文字で始まる)。回答は Google ドライブのURLで届くため、プロフィールの項目としては扱わない
export const PHOTO_LABEL_PREFIX = 'プロフィール写真';

// 「https://drive.google.com/open?id=ファイルID」や「.../file/d/ファイルID/view」から、ファイルIDを取り出す(複数あれば最初の1つ)
export function extractDriveFileId(text) {
  const value = String(text || '');
  const byQuery = value.match(new RegExp('[?&]id=([A-Za-z0-9_-]{10,})'));
  if (byQuery) return byQuery[1];
  const byPath = value.match(new RegExp('/d/([A-Za-z0-9_-]{10,})'));
  return byPath ? byPath[1] : null;
}

// 見出しの行から、メールアドレスの列番号(0始まり)を返す。無ければ -1
export function findEmailColumn(headers) {
  return headers.findIndex((h) => EMAIL_HEADERS.includes(String(h).trim().toLowerCase()));
}

// 見出しの「Q19 」のような番号を取り除く
const stripNumber = (label) => label.replace(/^Q\d+[\s.．:：]*/, '').trim();
const isPhotoLabel = (label) => stripNumber(label).startsWith(PHOTO_LABEL_PREFIX);

// 見出しの行から設問の一覧を作る(Q番号付きの見出しと、写真の設問。写真の設問は、番号がなくてもよい)
// 写真の設問を途中に足しても、ほかの設問の番号が変わらないよう、写真には番号を付けない運用ができる
export function parseQuestions(headers) {
  return headers
    .map((label, column) => ({ label: String(label), column }))
    .filter(({ label }) => /^Q\d+/.test(label.trim()) || isPhotoLabel(label))
    .map(({ label, column }) => {
      const text = label.trim().toLowerCase();
      const numbered = label.trim().match(/^Q(\d+)/);
      return {
        key: numbered ? `q${numbered[1]}` : 'photo',
        label: stripNumber(label),
        column,
        isPublic: EXCLUDE_KEYWORDS.some((k) => text.includes(k)) ? 0 : 1,
        isTitle: label.startsWith(TITLE_PREFIX) ? 1 : 0,
        isPhoto: isPhotoLabel(label),
      };
    })
    // 並び順は、写真を除いた順番にする(写真はプロフィールの項目に入らないため)
    .map((question, index, all) => ({ ...question, sortOrder: all.slice(0, index + 1).filter((q) => !q.isPhoto).length }));
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
  // 写真の列が複数あっても(設問を作り直したときの古い列など)、ファイルが入っている最初の列を使う
  const photoFileId = questions.filter((item) => item.isPhoto).map((item) => extractDriveFileId(cell(item.column))).find(Boolean) || null;
  const answers = {};
  for (const item of questions) {
    const value = cell(item.column);
    // 写真の設問は、プロフィールの項目に入れない(ドライブのURLは見せない)
    if (value && !item.isPhoto) answers[item.key] = value;
  }
  return {
    photoFileId,
    email: emailColumn >= 0 ? cell(emailColumn).toLowerCase() : '',
    respondedAt: toIso(cell(0)),
    name: (nameQuestion ? cell(nameQuestion.column) : '') || '(名前なし)',
    birthDate: birthQuestion ? toIso(cell(birthQuestion.column)) : null,
    answers,
    isEmpty: !row.some((value) => String(value ?? '').trim()),
  };
}
