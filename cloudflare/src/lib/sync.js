// フォームの新しい回答をシートから D1 に取り込み、お礼メールを送る(定期実行と管理画面の「今すぐ取り込み」から呼ぶ)
import { randomBytes } from 'node:crypto';
import { fetchSheetRows } from './google-sheets.js';
import { findEmailColumn, parseQuestions, parseResponseRow } from './sheet-rows.js';
import { buildThanksMail, sendMail } from './mail.js';

function makeSlug() {
  return randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8);
}

// 新しい設問があれば「非公開」で登録する(勝手に公開しない)
async function upsertQuestions(db, questions) {
  const statements = questions.map((q) => db
    .prepare('INSERT OR IGNORE INTO questions (key, label, is_public, is_title, sort_order) VALUES (?, ?, 0, ?, ?)')
    .bind(q.key, q.label, q.isTitle, q.sortOrder));
  if (statements.length) await db.batch(statements);
}

// 1件の回答を D1 に入れる。会員が無ければ作り、同じ会員の古い回答は is_current = 0 にする
async function importResponse(db, response, responseKey, sheetRow) {
  await db.prepare('INSERT OR IGNORE INTO members (email, created_at) VALUES (?, ?)').bind(response.email, response.respondedAt).run();
  const member = await db.prepare('SELECT id FROM members WHERE email = ?').bind(response.email).first();
  const slug = makeSlug();
  const maxOrder = await db.prepare('SELECT COALESCE(MAX(sort_order), 0) AS max FROM profiles').first();

  const statements = [
    db.prepare('UPDATE profiles SET is_current = 0, updated_at = datetime(\'now\') WHERE member_id = ?').bind(member.id),
    db.prepare(`INSERT INTO profiles (slug, member_id, responded_at, sheet_row, display_name, birth_date, visibility, is_current, sort_order)
                VALUES (?, ?, ?, ?, ?, ?, 'members', 1, ?)`)
      .bind(slug, member.id, response.respondedAt, sheetRow, response.name, response.birthDate, maxOrder.max + 1),
  ];
  for (const [key, answer] of Object.entries(response.answers)) {
    statements.push(db.prepare('INSERT INTO profile_answers (profile_id, question_key, answer) VALUES ((SELECT id FROM profiles WHERE slug = ?), ?, ?)').bind(slug, key, answer));
  }
  statements.push(db.prepare('INSERT INTO form_imports (response_key, profile_id) VALUES (?, (SELECT id FROM profiles WHERE slug = ?))').bind(responseKey, slug));
  await db.batch(statements);
  return slug;
}

// 移行前の回答(THANKS_MAIL_SINCE より前)には、GAS 時代に送信済みなのでお礼メールを送らない
function isBeforeMailStart(env, respondedAt) {
  return Boolean(env.THANKS_MAIL_SINCE) && String(respondedAt) < String(env.THANKS_MAIL_SINCE);
}

// お礼メールを送って記録する。失敗しても取り込み自体は成功として扱い、次回に再送する
async function sendThanks(env, response, responseKey) {
  const mail = buildThanksMail(env, response.answers.q19 || '', response.answers.q2 || '');
  if (!mail || isBeforeMailStart(env, response.respondedAt)) {
    // 送る必要が無い回答は「対象外」として記録し、次回以降は見ない
    await env.DB.prepare('UPDATE form_imports SET thanks_mail_sent_at = ? WHERE response_key = ? AND thanks_mail_sent_at IS NULL').bind('skipped', responseKey).run();
    return false;
  }
  try {
    await sendMail(env, { to: response.email, ...mail });
    await env.DB.prepare('UPDATE form_imports SET thanks_mail_sent_at = datetime(\'now\') WHERE response_key = ?').bind(responseKey).run();
    return true;
  } catch (error) {
    console.error(`お礼メールの送信に失敗しました(${response.email}):`, error);
    return false;
  }
}

// fetchRows はテストで差し替えられるようにしてある(通常は Google シートを読む)
export async function syncResponses(env, fetchRows = fetchSheetRows) {
  const rows = await fetchRows(env);
  if (rows.length < 2) return { imported: 0, mailed: 0, skipped: 0 };
  const headers = rows[0];
  const questions = parseQuestions(headers);
  const emailColumn = findEmailColumn(headers);
  if (emailColumn < 0) throw new Error('回答シートにメールアドレスの列がありません');
  await upsertQuestions(env.DB, questions);

  const { results } = await env.DB.prepare('SELECT response_key, thanks_mail_sent_at FROM form_imports').all();
  const imported = new Map(results.map((r) => [r.response_key, r.thanks_mail_sent_at]));

  const summary = { imported: 0, mailed: 0, skipped: 0 };
  for (let index = 1; index < rows.length; index += 1) {
    const response = parseResponseRow(rows[index], questions, emailColumn);
    // メールアドレスの無い回答は会員と結び付けられないので取り込まない
    if (response.isEmpty || !response.email || !response.respondedAt) {
      if (!response.isEmpty) summary.skipped += 1;
      continue;
    }
    const responseKey = `${response.respondedAt}|${response.email}`;
    if (!imported.has(responseKey)) {
      // 日時の表記ゆれで鍵が一致しなくても、同じ人の同じ行がすでにあれば二重に取り込まない
      const existing = await env.DB.prepare(
        'SELECT p.id FROM profiles p JOIN members m ON m.id = p.member_id WHERE m.email = ? AND p.sheet_row = ?',
      ).bind(response.email, index + 1).first();
      if (existing) {
        await env.DB.prepare('INSERT OR IGNORE INTO form_imports (response_key, profile_id, thanks_mail_sent_at) VALUES (?, ?, ?)').bind(responseKey, existing.id, 'skipped').run();
        imported.set(responseKey, 'skipped');
        summary.skipped += 1;
        continue;
      }
      await importResponse(env.DB, response, responseKey, index + 1);
      imported.set(responseKey, null);
      summary.imported += 1;
    }
    // お礼メールが未送信なら送る(前回失敗した分もここで再送される)
    if (!imported.get(responseKey) && (await sendThanks(env, response, responseKey))) {
      imported.set(responseKey, 'sent');
      summary.mailed += 1;
    }
  }
  return summary;
}
