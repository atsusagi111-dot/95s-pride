// 自前アンケートの回答で、お礼メールが送れなかったものを再送する(定期実行から呼ぶ)
// 回答の直後に送るのが基本で、そのときに失敗した分(メールサーバーの一時的な不調など)だけを、10分おきに拾う
import { buildThanksMail, sendMail } from './mail.js';

// 回答から2分たったものだけ拾う(回答の送信中のメールと二重にならないように)。1日たったらあきらめる
const MIN_AGE = '-2 minutes';
const MAX_AGE = '-1 day';
const MAX_PER_RUN = 10;

export async function retryThanksMails(env) {
  const { results } = await env.DB.prepare(`
    SELECT fi.response_key, p.display_name, m.email,
           (SELECT answer FROM profile_answers WHERE profile_id = p.id AND question_key = 'q19') AS choice
    FROM form_imports fi
    JOIN profiles p ON p.id = fi.profile_id
    JOIN members m ON m.id = p.member_id
    WHERE fi.response_key LIKE 'web|%' AND fi.thanks_mail_sent_at IS NULL
      AND fi.imported_at <= datetime('now', ?) AND fi.imported_at > datetime('now', ?)
    ORDER BY fi.imported_at LIMIT ?`).bind(MIN_AGE, MAX_AGE, MAX_PER_RUN).all();

  let sent = 0;
  for (const row of results) {
    const mail = buildThanksMail(env, row.choice || '', row.display_name);
    try {
      // 送る必要が無い回答(Q19が未回答など)は、対象外として記録する
      if (mail) await sendMail(env, { to: row.email, ...mail });
      await env.DB.prepare('UPDATE form_imports SET thanks_mail_sent_at = ? WHERE response_key = ?')
        .bind(mail ? new Date().toISOString() : 'skipped', row.response_key).run();
      if (mail) sent += 1;
    } catch (error) {
      console.error(`お礼メールの再送に失敗しました(${row.email}):`, error);
    }
  }
  return sent;
}
