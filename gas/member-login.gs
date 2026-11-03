// メンバーページの会員情報(確認コード・パスワードのハッシュ)の管理とメンバー情報の配信を行う
// 回答一覧スプレッドシートの Apps Script に追加して使う(このファイルだけで動く)

// true にすると、フォーム回答者も「ログイン管理」シートで「許可」にした人だけログインできる
const REQUIRE_APPROVAL = false;

const LOGIN_SENDER_NAME = '95s PRIDE';
const LOGIN_REPLY_TO = '95spride.official@gmail.com'; // 返信の受け取り先
const ACCESS_SHEET_NAME = 'ログイン管理';
const MEMBER_SHEET_NAME = 'メンバー掲載';
const EMAIL_HEADERS = ['email address', 'メールアドレス'];

// ログインなしで公開するプロフィール(回答シートの行番号と、B〜S列の範囲)
const PUBLIC_ROWS = [2, 7, 9, 17, 18, 19];
const PUBLIC_FIRST_COLUMN = 2; // B列
const PUBLIC_LAST_COLUMN = 19; // S列
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
    sheet.appendRow(['サンプル', '会社員', 'ここに紹介文が入ります。', '', '']);
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

// フォームの回答シートに、そのメールアドレスがあるかを調べる
function isFormRespondent(spreadsheet, email) {
  return spreadsheet.getSheets()
    .filter((sheet) => ![ACCESS_SHEET_NAME, MEMBER_SHEET_NAME].includes(sheet.getName()))
    .some((sheet) => {
      const rows = sheet.getDataRange().getDisplayValues();
      const column = rows[0].findIndex((header) => EMAIL_HEADERS.includes(header.trim().toLowerCase()));
      return column >= 0 && rows.slice(1).some((row) => row[column].trim().toLowerCase() === email);
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

// 確認コードを送る(照合が済むとパスワードを保存する)
function sendCode(email, passwordHash) {
  const cache = CacheService.getScriptCache();
  const cooldownKey = `login-cooldown:${email}`;
  const countKey = `login-count:${email}`;
  const sendCount = Number(cache.get(countKey) || 0);
  if (cache.get(cooldownKey) || sendCount >= MAX_SENDS_PER_WINDOW) return { ok: true };

  const code = generateCode();
  MailApp.sendEmail({
    to: email,
    subject: '【95s PRIDE】メンバーページの確認コード',
    body: [
      `確認コード: ${code}`,
      '',
      `${CODE_TTL_SECONDS / 60}分以内に、メンバーページで入力してください。`,
      'このメールに心当たりがない場合は、何もせず破棄してください。',
      '',
      LOGIN_SENDER_NAME,
    ].join('\n'),
    name: LOGIN_SENDER_NAME,
    replyTo: LOGIN_REPLY_TO,
  });

  cache.put(`login-code:${email}`, JSON.stringify({ code, passwordHash, attempts: 0 }), CODE_TTL_SECONDS);
  cache.put(cooldownKey, '1', RESEND_INTERVAL_SECONDS);
  cache.put(countKey, String(sendCount + 1), RESEND_WINDOW_SECONDS);
  return { ok: true };
}

// 許可された人にだけパスワード設定用のコードを送る(初回・再設定とも。未登録の人にも同じ結果を返す)
function requestPasswordReset(email, passwordHash) {
  return isAllowed(email) ? sendCode(email, passwordHash) : { ok: true };
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

// コードを照合する(成功したコードと、試行回数を超えたコードは使えなくする)
function verifyCode(email, code) {
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

      PropertiesService.getScriptProperties().setProperty(`password:${email}`, entry.passwordHash);
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
    .filter((row) => row[0].trim())
    .map((row) => ({ name: row[0], title: row[1], bio: row[2], image: row[3], instagram: row[4] }));
  return { allowed: true, members };
}

// フォームの回答シート(メールアドレスの列があるシート)を探す
function getResponseSheet(spreadsheet) {
  return spreadsheet.getSheets()
    .filter((sheet) => ![ACCESS_SHEET_NAME, MEMBER_SHEET_NAME].includes(sheet.getName()))
    .find((sheet) => sheet.getDataRange().getDisplayValues()[0]
      .some((header) => EMAIL_HEADERS.includes(header.trim().toLowerCase())));
}

function isPublicColumn(header) {
  const text = header.trim().toLowerCase();
  return Boolean(text) && !PUBLIC_EXCLUDE_KEYWORDS.some((keyword) => text.includes(keyword));
}

// 公開する列の番号(0始まり)を返す
function getPublicColumns(headers) {
  const columns = [];
  for (let column = PUBLIC_FIRST_COLUMN - 1; column < Math.min(PUBLIC_LAST_COLUMN, headers.length); column += 1) {
    if (isPublicColumn(headers[column])) columns.push(column);
  }
  return columns;
}

// 指定行の公開してよい列だけを返す(見出しの「Q2 」で始まる列を名前として使う)
function listPublicProfiles() {
  const sheet = getResponseSheet(getSpreadsheet());
  if (!sheet) return { profiles: [] };

  const rows = sheet.getDataRange().getDisplayValues();
  const headers = rows[0];
  const columns = getPublicColumns(headers);
  const profiles = PUBLIC_ROWS
    .filter((rowNumber) => rowNumber >= 2 && rowNumber <= rows.length)
    .map((rowNumber) => {
      const row = rows[rowNumber - 1];
      const titleColumn = columns.find((column) => headers[column].startsWith('Q2 '));
      const items = columns
        .filter((column) => column !== titleColumn && row[column].trim())
        .map((column) => ({ label: headers[column].replace(/^Q\d+[\s.．:：]*/, ''), value: row[column] }));
      return { title: titleColumn === undefined ? '' : row[titleColumn], items };
    })
    .filter((profile) => profile.title || profile.items.length);
  return { profiles };
}

// エディタから実行して、公開される列と除外される列を実行ログで確認する
function previewPublicProfiles() {
  const sheet = getResponseSheet(getSpreadsheet());
  if (!sheet) {
    console.log('メールアドレスの列がある回答シートが見つかりません');
    return;
  }
  const headers = sheet.getDataRange().getDisplayValues()[0];
  for (let column = PUBLIC_FIRST_COLUMN - 1; column < Math.min(PUBLIC_LAST_COLUMN, headers.length); column += 1) {
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
    const passwordHash = String(request.passwordHash || '');
    if (request.action === 'beginLogin') return jsonResponse(beginLogin(email));
    if (request.action === 'clearLoginAttempts') return jsonResponse(clearLoginAttempts(email));
    if (request.action === 'requestPasswordReset') return jsonResponse(requestPasswordReset(email, passwordHash));
    if (request.action === 'verifyCode') return jsonResponse(verifyCode(email, String(request.code || '')));
    if (request.action === 'listMembers') return jsonResponse(listMembers(email));
    if (request.action === 'publicProfiles') return jsonResponse(listPublicProfiles());
    return jsonResponse({ error: 'unknown_action' });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: 'server_error' });
  }
}
