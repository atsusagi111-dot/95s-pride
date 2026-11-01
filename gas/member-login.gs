// メンバーページの会員情報(確認コード・パスワードのハッシュ)の管理とメンバー情報の配信を行う
// 回答一覧スプレッドシートの Apps Script に追加して使う(このファイルだけで動く)

// true にすると新規会員登録を止め、「ログイン管理」シートで「許可」にした人だけログインできる
const REQUIRE_APPROVAL = false;

const LOGIN_SENDER_NAME = '95s PRIDE';
const LOGIN_REPLY_TO = '95spride.official@gmail.com'; // 返信の受け取り先
const ACCESS_SHEET_NAME = 'ログイン管理';
const MEMBER_SHEET_NAME = 'メンバー掲載';
const EMAIL_HEADERS = ['email address', 'メールアドレス'];

const CODE_TTL_SECONDS = 600; // コードの有効期間(10分)
const MAX_ATTEMPTS = 5; // 1つのコードで試せる回数
const RESEND_INTERVAL_SECONDS = 60; // 再送までの待ち時間
const RESEND_WINDOW_SECONDS = 21600; // 送信回数を数える期間(6時間)
const MAX_SENDS_PER_WINDOW = 5; // 上の期間に1人へ送れる回数
const LOGIN_ATTEMPT_LIMIT = 10; // 続けて試せるログイン回数
const LOGIN_LOCK_SECONDS = 900; // 上の回数を超えたときに待つ時間(15分)
const REGISTER_LIMIT_PER_IP = 5; // 1時間に同じ接続元から申し込める回数
const REGISTER_MAIL_RESERVE = 30; // 既存メンバーのログイン用に残す1日の送信数

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

// 確認コードを送る(照合が済むとパスワードを保存し、name があれば新規会員として登録する)
function sendCode(email, name, passwordHash) {
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

  cache.put(`login-code:${email}`, JSON.stringify({ code, name, passwordHash, attempts: 0 }), CODE_TTL_SECONDS);
  cache.put(cooldownKey, '1', RESEND_INTERVAL_SECONDS);
  cache.put(countKey, String(sendCount + 1), RESEND_WINDOW_SECONDS);
  return { ok: true };
}

// 許可された人にだけ再設定用のコードを送る(未登録の人にも同じ結果を返す)
function requestPasswordReset(email, passwordHash) {
  return isAllowed(email) ? sendCode(email, '', passwordHash) : { ok: true };
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

// 同じ接続元からの申し込みが多すぎないか数える
function isRegisterLimited(ip) {
  const cache = CacheService.getScriptCache();
  const key = `register-ip:${ip}`;
  const count = Number(cache.get(key) || 0);
  if (count >= REGISTER_LIMIT_PER_IP) return true;
  cache.put(key, String(count + 1), 3600);
  return false;
}

// 新規会員登録を受け付ける(登録済みかどうかが分からないよう、結果は常に同じ)
function registerMember(email, name, ip, passwordHash) {
  if (isAllowed(email)) return sendCode(email, '', passwordHash);
  if (REQUIRE_APPROVAL) return { ok: true };

  const stopped = readAccessRules(getSpreadsheet())[email] === '停止';
  const quotaLow = MailApp.getRemainingDailyQuota() <= REGISTER_MAIL_RESERVE;
  if (stopped || quotaLow || isRegisterLimited(ip)) return { ok: true };
  return sendCode(email, name, passwordHash);
}

// メール確認が済んだ新規会員を「ログイン管理」シートに追加する
function addRegisteredMember(email, name) {
  const spreadsheet = getSpreadsheet();
  if (readAccessRules(spreadsheet)[email]) return;
  spreadsheet.getSheetByName(ACCESS_SHEET_NAME).appendRow([email, '許可', `新規登録: ${name}`]);
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
      if (entry.name) addRegisteredMember(email, entry.name);
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
    if (request.action === 'registerMember') return jsonResponse(registerMember(email, String(request.name || ''), String(request.ip || ''), passwordHash));
    if (request.action === 'verifyCode') return jsonResponse(verifyCode(email, String(request.code || '')));
    if (request.action === 'listMembers') return jsonResponse(listMembers(email));
    return jsonResponse({ error: 'unknown_action' });
  } catch (error) {
    console.error(error);
    return jsonResponse({ error: 'server_error' });
  }
}
