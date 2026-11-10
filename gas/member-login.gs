// メンバーページの会員情報(確認コード・パスワードのハッシュ)の管理とメンバー情報の配信を行う
// 回答一覧スプレッドシートの Apps Script に追加して使う(このファイルだけで動く)

// true にすると、フォーム回答者も「ログイン管理」シートで「許可」にした人だけログインできる
const REQUIRE_APPROVAL = false;

const LOGIN_SENDER_NAME = '95s PRIDE';
const LOGIN_REPLY_TO = '95spride.official@gmail.com'; // 返信の受け取り先
// 認証メール(確認コード・パスワード再設定)の差出人
// 実行アカウントのGmailで「他のメールアドレスを追加(Send mail as)」に登録済みである必要がある
const LOGIN_FROM = '95spride.official@gmail.com';
const ACCESS_SHEET_NAME = 'ログイン管理';
const MEMBER_SHEET_NAME = 'メンバー掲載';
const EMAIL_HEADERS = ['email address', 'メールアドレス'];

// ログインなしで公開するプロフィール(回答シートの行番号と、B〜S列の範囲)
const PUBLIC_ROWS = [2, 7, 9, 17, 18, 19, 22];
const PUBLIC_FIRST_COLUMN = 2; // B列
const PUBLIC_LAST_COLUMN = 19; // S列
const PUBLIC_TITLE_PREFIX = 'Q1 '; // カードの見出しにする列(見出しがこの文字で始まる列)
// 見出しにこれらの語を含む列は公開しない(連絡先・内部向けの項目)
const PUBLIC_EXCLUDE_KEYWORDS = ['email', 'mail', 'メール', '電話', 'tel', '住所', '郵便', 'line', 'q19', '特典', '本名'];

const CODE_TTL_SECONDS = 600; // コードの有効期間(10分)
const MAX_ATTEMPTS = 5; // 1つのコードで試せる回数
const RESEND_INTERVAL_SECONDS = 60; // 再送までの待ち時間
const RESEND_WINDOW_SECONDS = 21600; // 送信回数を数える期間(6時間)
const MAX_SENDS_PER_WINDOW = 5; // 上の期間に1人へ送れる回数
const LOGIN_ATTEMPT_LIMIT = 10; // 続けて試せるログイン回数
const LOGIN_LOCK_SECONDS = 900; // 上の回数を超えたときに待つ時間(15分)

// 最初に1回実行して、管理用シートとスプレッドシートIDを準備する(再実行しても内容は消えない)
function setupMemberLogin() {
  const spreadsheet = SpreadsheetApp.getActive();
  PropertiesService.getScriptProperties().setProperty('MEMBER_SPREADSHEET_ID', spreadsheet.getId());

  if (!spreadsheet.getSheetByName(ACCESS_SHEET_NAME)) {
    const sheet = spreadsheet.insertSheet(ACCESS_SHEET_NAME);
    sheet.appendRow(['メールアドレス', '状態(許可/停止)', 'メモ']);
  }
  // 状態の打ち間違いを防ぐため、選択式にする
  const statusRule = SpreadsheetApp.newDataValidation().requireValueInList(['許可', '停止'], true).build();
  spreadsheet.getSheetByName(ACCESS_SHEET_NAME).getRange('B2:B').setDataValidation(statusRule);

  if (!spreadsheet.getSheetByName(MEMBER_SHEET_NAME)) {
    const sheet = spreadsheet.insertSheet(MEMBER_SHEET_NAME);
    sheet.appendRow(['名前', '肩書き', '紹介文', '画像URL', 'Instagram URL']);
  }
}

function getSpreadsheet() {
  return SpreadsheetApp.openById(PropertiesService.getScriptProperties().getProperty('MEMBER_SPREADSHEET_ID'));
}

// 「ログイン管理」シートの状態を { メールアドレス: 状態 } の形で返す
function readAccessRules(spreadsheet) {
  const rules = {};
  spreadsheet.getSheetByName(ACCESS_SHEET_NAME).getDataRange().getDisplayValues().slice(1).forEach((row) => {
    const email = row[0].trim().toLowerCase();
    if (email) rules[email] = row[1].trim();
  });
  return rules;
}

// フォームの回答シート(管理用以外で、見出しにメールアドレスの列があるシート)なら、表示値と列番号を返す
function readResponseSheet(sheet) {
  if ([ACCESS_SHEET_NAME, MEMBER_SHEET_NAME].includes(sheet.getName())) return null;
  const rows = sheet.getDataRange().getDisplayValues();
  const emailColumn = rows[0].findIndex((header) => EMAIL_HEADERS.includes(header.trim().toLowerCase()));
  return emailColumn >= 0 ? { sheet, rows, emailColumn } : null;
}

// 最初に見つかった回答シートを返す(シートの読み込みは見つかった時点で止める)
function findResponseSheet(spreadsheet) {
  for (const sheet of spreadsheet.getSheets()) {
    const response = readResponseSheet(sheet);
    if (response) return response;
  }
  return null;
}

// フォームの回答シートに、そのメールアドレスがあるかを調べる
function isFormRespondent(spreadsheet, email) {
  return spreadsheet.getSheets().some((sheet) => {
    const response = readResponseSheet(sheet);
    return Boolean(response) && response.rows.slice(1)
      .some((row) => row[response.emailColumn].trim().toLowerCase() === email);
  });
}

function isAllowed(email) {
  const spreadsheet = getSpreadsheet();
  const status = readAccessRules(spreadsheet)[email];
  if (status === '停止') return false;
  if (status === '許可') return true;
  return !REQUIRE_APPROVAL && isFormRespondent(spreadsheet, email);
}

// 6桁の確認コードを作る
function generateCode() {
  const digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, Utilities.getUuid());
  const number = digest.slice(0, 4).reduce((total, byte) => total * 256 + (byte & 255), 0);
  return String(number % 1000000).padStart(6, '0');
}

// 認証メールを LOGIN_FROM から送る(全ての認証メールはここを通す)
// MailApp は差出人を変えられないため、エイリアスを指定できる GmailApp を使う
function sendAuthMail(to, subject, body) {
  if (!GmailApp.getAliases().includes(LOGIN_FROM)) {
    // エイリアス未登録のまま送ると実行アカウントのアドレスが表に出るため、送らずに止める
    throw new Error(`${LOGIN_FROM} が送信元エイリアスに登録されていません`);
  }
  GmailApp.sendEmail(to, subject, body, { from: LOGIN_FROM, name: LOGIN_SENDER_NAME, replyTo: LOGIN_REPLY_TO });
}

// エディタから実行して、差出人の設定を確認する(自分宛てにテストメールが届く)
function testAuthMailSender() {
  console.log(`登録済みのエイリアス: ${GmailApp.getAliases().join(', ') || '(なし)'}`);
  sendAuthMail(Session.getEffectiveUser().getEmail(), '【テスト】95s PRIDE 認証メールの差出人確認', `このメールの差出人が ${LOGIN_FROM} になっていれば設定完了です。`);
}

// 確認コードを送る(新しいパスワードはコードの照合時に受け取る)
function sendCode(email) {
  const cache = CacheService.getScriptCache();
  const cooldownKey = `login-cooldown:${email}`;
  const countKey = `login-count:${email}`;
  const sendCount = Number(cache.get(countKey) || 0);
  if (cache.get(cooldownKey) || sendCount >= MAX_SENDS_PER_WINDOW) return { ok: true };

  const code = generateCode();
  sendAuthMail(email, '【95s PRIDE】メンバーページの確認コード', [
    `確認コード: ${code}`,
    '',
    `${CODE_TTL_SECONDS / 60}分以内に、メンバーページで入力してください。`,
    'このメールに心当たりがない場合は、何もせず破棄してください。',
    '',
    LOGIN_SENDER_NAME,
  ].join('\n'));

  cache.put(`login-code:${email}`, JSON.stringify({ code, attempts: 0 }), CODE_TTL_SECONDS);
  cache.put(cooldownKey, '1', RESEND_INTERVAL_SECONDS);
  cache.put(countKey, String(sendCount + 1), RESEND_WINDOW_SECONDS);
  return { ok: true };
}

// 許可された人にだけパスワード設定用のコードを送る(初回・再設定とも)
// 未登録の人には registered: false を返し、画面でエラーを出す
function requestPasswordReset(email) {
  return isAllowed(email) ? sendCode(email) : { ok: false, registered: false };
}

// ログインの回数を数え、保存済みのハッシュを返す(許可されていない人には返さない)
function beginLogin(email) {
  const cache = CacheService.getScriptCache();
  const key = `login-attempts:${email}`;
  const attempts = Number(cache.get(key) || 0);
  if (attempts >= LOGIN_ATTEMPT_LIMIT) return { locked: true };
  cache.put(key, String(attempts + 1), LOGIN_LOCK_SECONDS);

  if (!isAllowed(email)) return { passwordHash: '' };
  return { passwordHash: PropertiesService.getScriptProperties().getProperty(`password:${email}`) || '' };
}

function clearLoginAttempts(email) {
  CacheService.getScriptCache().remove(`login-attempts:${email}`);
  return { ok: true };
}

// コードを照合し、正しければ新しいパスワードのハッシュを保存する
// 成功したコードと、試行回数を超えたコードは使えなくする
function verifyCode(email, code, passwordHash) {
  if (!passwordHash) return { valid: false };
  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const cache = CacheService.getScriptCache();
    const key = `login-code:${email}`;
    const saved = cache.get(key);
    if (!saved) return { valid: false };

    const entry = JSON.parse(saved);
    if (entry.code === code) {
      cache.remove(key);
      if (!isAllowed(email)) return { valid: false };

      PropertiesService.getScriptProperties().setProperty(`password:${email}`, passwordHash);
      clearLoginAttempts(email);
      return { valid: true };
    }

    entry.attempts += 1;
    if (entry.attempts >= MAX_ATTEMPTS) {
      cache.remove(key);
    } else {
      cache.put(key, JSON.stringify(entry), CODE_TTL_SECONDS);
    }
    return { valid: false };
  } finally {
    lock.releaseLock();
  }
}

// 「メンバー掲載」シートの内容だけを返す(フォームの回答そのものは渡さない)
function listMembers(email) {
  if (!isAllowed(email)) return { allowed: false };

  const rows = getSpreadsheet().getSheetByName(MEMBER_SHEET_NAME).getDataRange().getDisplayValues().slice(1);
  const members = rows
    // 最初に入れていた「サンプル」の行は出さない
    .filter((row) => row[0].trim() && row[0].trim() !== 'サンプル')
    .map((row) => ({ name: row[0], title: row[1], bio: row[2], image: row[3], instagram: row[4] }));
  return { allowed: true, members };
}

function isPublicColumn(header) {
  const text = header.trim().toLowerCase();
  return Boolean(text) && !PUBLIC_EXCLUDE_KEYWORDS.some((keyword) => text.includes(keyword));
}

// PUBLIC_FIRST_COLUMN〜PUBLIC_LAST_COLUMN の列番号(0始まり)を返す
function getColumnsInRange(headers) {
  const columns = [];
  for (let column = PUBLIC_FIRST_COLUMN - 1; column < Math.min(PUBLIC_LAST_COLUMN, headers.length); column += 1) {
    columns.push(column);
  }
  return columns;
}

// 公開する列の番号(0始まり)を返す
function getPublicColumns(headers) {
  return getColumnsInRange(headers).filter((column) => isPublicColumn(headers[column]));
}

// 日付の回答はシートの表示形式(地域設定で変わる)に頼らず「1995年9月6日」の形にそろえる
function formatCell(value, display, timeZone) {
  if (!(value instanceof Date)) return display;
  const date = Utilities.formatDate(value, timeZone, 'yyyy年M月d日');
  const time = Utilities.formatDate(value, timeZone, 'H:mm');
  return time === '0:00' ? date : `${date} ${time}`;
}

// isTargetRow(行番号) が true の行について、公開してよい列だけを返す
// PUBLIC_TITLE_PREFIX で始まる列はカードの見出しにする
function buildProfiles(isTargetRow) {
  const spreadsheet = getSpreadsheet();
  const response = findResponseSheet(spreadsheet);
  if (!response) return [];

  const { sheet, rows } = response;
  const values = sheet.getDataRange().getValues();
  const timeZone = spreadsheet.getSpreadsheetTimeZone();
  const headers = rows[0];
  const columns = getPublicColumns(headers);
  const titleColumn = columns.find((column) => headers[column].startsWith(PUBLIC_TITLE_PREFIX));
  const itemColumns = columns.filter((column) => column !== titleColumn);

  const profiles = [];
  // 1行目は見出しなので2行目から
  for (let index = 1; index < rows.length; index += 1) {
    if (!isTargetRow(index + 1)) continue;
    const row = rows[index];
    const items = itemColumns
      .filter((column) => row[column].trim())
      .map((column) => ({
        label: headers[column].replace(/^Q\d+[\s.．:：]*/, ''),
        value: formatCell(values[index][column], row[column], timeZone),
      }));
    const title = titleColumn === undefined ? '' : row[titleColumn];
    if (title || items.length) profiles.push({ title, items });
  }
  return profiles;
}

// ログインなしで見られるプロフィール(PUBLIC_ROWS の行)
function listPublicProfiles() {
  return { profiles: buildProfiles((rowNumber) => PUBLIC_ROWS.includes(rowNumber)) };
}

// ログインした人だけが見られるプロフィール(PUBLIC_ROWS 以外のすべての回答行)
function listMemberProfiles(email) {
  if (!isAllowed(email)) return { allowed: false };
  return { allowed: true, profiles: buildProfiles((rowNumber) => !PUBLIC_ROWS.includes(rowNumber)) };
}

// エディタから実行して、公開される列と除外される列を実行ログで確認する
function previewPublicProfiles() {
  const response = findResponseSheet(getSpreadsheet());
  if (!response) {
    console.log('メールアドレスの列がある回答シートが見つかりません');
    return;
  }
  const { sheet, rows } = response;
  const headers = rows[0];
  for (const column of getColumnsInRange(headers)) {
    const letter = String.fromCharCode(65 + column);
    console.log(`${letter}列 ${isPublicColumn(headers[column]) ? '公開' : '除外'}: ${headers[column]}`);
  }
  console.log(`公開する行: ${PUBLIC_ROWS.join(', ')}(シート「${sheet.getName()}」)`);
}

function jsonResponse(data) {
  return ContentService.createTextOutput(JSON.stringify(data)).setMimeType(ContentService.MimeType.JSON);
}

// HPのサーバーからの呼び出しを受ける
function doPost(e) {
  try {
    const request = JSON.parse(e.postData.contents);
    const secret = PropertiesService.getScriptProperties().getProperty('MEMBER_API_SECRET');
    if (!secret || request.secret !== secret) return jsonResponse({ error: 'unauthorized' });

    const email = String(request.email || '').trim().toLowerCase();
    const actions = {
      beginLogin: () => beginLogin(email),
      clearLoginAttempts: () => clearLoginAttempts(email),
      requestPasswordReset: () => requestPasswordReset(email),
      verifyCode: () => verifyCode(email, String(request.code || ''), String(request.passwordHash || '')),
      listMembers: () => listMembers(email),
      publicProfiles: () => listPublicProfiles(),
      memberProfiles: () => listMemberProfiles(email),
    };
    if (Object.prototype.hasOwnProperty.call(actions, request.action)) return jsonResponse(actions[request.action]());
    return jsonResponse({ error: 'unknown_action' });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: 'server_error' });
  }
}
