// プロフィールアンケートの回答者へ、Q19の選択に応じたお礼メールを自動送信する
// 回答一覧スプレッドシートの Apps Script に貼り付けて使う

const SENDER_NAME = '95s PRIDE';
// 回答者からの返信の受け取り先
const REPLY_TO = '95spride.official@gmail.com';
const CHOICE_ACCEPT = 'プロフィール回答特典（なんでもお悩み相談15分～30分）を受け取る';
const CHOICE_DECLINE = '受け取らない';

// Q19の選択肢ごとのメール文面を作る
function buildMail(choice, name) {
  const greeting = name ? `${name}さん` : 'こんにちは';

  if (choice === CHOICE_ACCEPT) {
    return {
      subject: '【95s PRIDE】プロフィール回答ありがとうございました（お悩み相談のご案内）',
      body: [
        greeting,
        '',
        'プロフィールアンケートへのご回答、ありがとうございました！',
        '',
        'さっそくですが、回答特典の「なんでもお悩み相談（15分～30分）」の日程を調整できればと思います！',
        'ご希望の日時を3日ほど、このメールへの返信でお知らせください。',
        '',
        '【記入例】',
        '・第1希望：◯月◯日（火）20:00〜21:00',
        '・第2希望：◯月◯日（木）21:00〜22:00',
        '・第3希望：◯月◯日（土）10:00〜12:00',
        '',
        'ご連絡をお待ちしています。',
        '',
        SENDER_NAME,
      ].join('\n'),
    };
  }

  if (choice === CHOICE_DECLINE) {
    return {
      subject: '【95s PRIDE】プロフィール回答ありがとうございました',
      body: [
        greeting,
        '',
        'プロフィール回答ありがとうございました！',
        '今後ともよろしくお願いします。',
        '',
        SENDER_NAME,
      ].join('\n'),
    };
  }

  return null;
}

// フォーム送信時に実行される処理
function onProfileFormSubmit(e) {
  const sheet = e.range.getSheet();
  const headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getDisplayValues()[0];
  const row = sheet.getRange(e.range.getRow(), 1, 1, headers.length).getDisplayValues()[0];

  // 列の並びが変わっても動くよう、見出しの先頭文字で値を探す
  const pick = (prefix) => {
    const index = headers.findIndex((header) => header.startsWith(prefix));
    return index < 0 ? '' : row[index].trim();
  };

  const email = pick('Email Address');
  const choice = pick('Q19');
  const mail = buildMail(choice, pick('Q2 '));

  if (!email || !mail) {
    console.warn(`送信をスキップしました（行: ${e.range.getRow()}）`);
    return;
  }

  // 回答の編集でも発火するため、同じ人・同じ選択への二重送信を防ぐ
  const lock = LockService.getScriptLock();
  lock.waitLock(30000);
  try {
    const properties = PropertiesService.getScriptProperties();
    const sentKey = `sent:${email.toLowerCase()}:${choice}`;
    if (properties.getProperty(sentKey)) {
      return;
    }
    MailApp.sendEmail({ to: email, subject: mail.subject, body: mail.body, name: SENDER_NAME, replyTo: REPLY_TO });
    properties.setProperty(sentKey, new Date().toISOString());
  } finally {
    lock.releaseLock();
  }
}

// 最初に1回だけ実行して、フォーム送信トリガーを登録する
function setupTrigger() {
  const exists = ScriptApp.getProjectTriggers()
    .some((trigger) => trigger.getHandlerFunction() === 'onProfileFormSubmit');
  if (exists) {
    return;
  }
  ScriptApp.newTrigger('onProfileFormSubmit')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onFormSubmit()
    .create();
}

// 2種類のメールを指定の宛先へ送って文面を確認する
function sendTestTo(to) {
  [CHOICE_ACCEPT, CHOICE_DECLINE].forEach((choice) => {
    const mail = buildMail(choice, 'テスト');
    MailApp.sendEmail({ to: to, subject: `【テスト】${mail.subject}`, body: mail.body, name: SENDER_NAME, replyTo: REPLY_TO });
  });
}

// 実行している自分宛てにテスト送信する
function sendTestToMe() {
  sendTestTo(Session.getEffectiveUser().getEmail());
}

// 返信先の窓口アドレス宛てにテスト送信する
function sendTestToReplyAddress() {
  sendTestTo(REPLY_TO);
}
