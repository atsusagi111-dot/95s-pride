// メール送信(Gmail の SMTP を Workers から使う)と文面
// GMAIL_USER / GMAIL_APP_PASSWORD は wrangler secret で入れる。MAIL_DRY_RUN=1 のときは送らずログに出す(開発・テスト用)

export const CHOICE_ACCEPT = 'プロフィール回答特典（なんでもお悩み相談15分～30分）を受け取る';
export const CHOICE_DECLINE = '受け取らない';

function senderName(env) {
  return env.MAIL_SENDER_NAME || '95s PRIDE';
}

export async function sendMail(env, { to, subject, text }) {
  if (env.MAIL_DRY_RUN === '1') {
    console.log(`[MAIL_DRY_RUN] to=${to} subject=${subject}\n${text}`);
    return { dryRun: true };
  }
  if (!env.GMAIL_USER || !env.GMAIL_APP_PASSWORD) {
    throw new Error('GMAIL_USER / GMAIL_APP_PASSWORD が設定されていません');
  }
  const { WorkerMailer } = await import('worker-mailer');
  const mailer = await WorkerMailer.connect({
    host: 'smtp.gmail.com',
    port: 465,
    secure: true,
    credentials: { username: env.GMAIL_USER, password: env.GMAIL_APP_PASSWORD },
    authType: 'plain',
  });
  try {
    await mailer.send({
      from: { name: senderName(env), email: env.MAIL_FROM || env.GMAIL_USER },
      to,
      reply: env.MAIL_REPLY_TO || undefined,
      subject,
      text,
    });
  } finally {
    await mailer.close?.();
  }
  return { sent: true };
}

// 確認コードのメール
export function buildCodeMail(env, code, ttlMinutes) {
  return {
    subject: '【95s PRIDE】メンバーページの確認コード',
    text: [
      `確認コード: ${code}`,
      '',
      `${ttlMinutes}分以内に、メンバーページで入力してください。`,
      'このメールに心当たりがない場合は、何もせず破棄してください。',
      '',
      senderName(env),
    ].join('\n'),
  };
}

// アンケート回答後のお礼メール(Q19 の選択で文面を変える)。対象外なら null
export function buildThanksMail(env, choice, name) {
  const greeting = name ? `${name}さん` : 'こんにちは';
  const sender = senderName(env);

  if (choice === CHOICE_ACCEPT) {
    return {
      subject: '【95s PRIDE】プロフィール回答ありがとうございました（お悩み相談のご案内）',
      text: [
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
        sender,
      ].join('\n'),
    };
  }

  if (choice === CHOICE_DECLINE) {
    return {
      subject: '【95s PRIDE】プロフィール回答ありがとうございました',
      text: [
        greeting,
        '',
        'プロフィール回答ありがとうございました！',
        '今後ともよろしくお願いします。',
        '',
        sender,
      ].join('\n'),
    };
  }

  return null;
}
