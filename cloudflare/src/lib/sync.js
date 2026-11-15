// フォームの新しい回答をシートから D1 に取り込み、お礼メールを送る(定期実行と管理画面の「今すぐ取り込み」から呼ぶ)
import { randomBytes } from 'node:crypto';
import { fetchDriveFile, fetchSheetRows } from './google-sheets.js';
import { MAX_PHOTO_BYTES, MAX_SOURCE_BYTES, isJpeg, resizeToJpeg, saveMemberPhoto } from './photos.js';
import { findEmailColumn, parseQuestions, parseResponseRow } from './sheet-rows.js';
import { buildThanksMail, sendMail } from './mail.js';

function makeSlug() {
  return randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8);
}

// 写真の取り込みを、1回の実行でいくつまで行うか(実行時間を使いすぎないため。残りは次の実行で行う)
const MAX_PHOTOS_PER_RUN = 3;
// 写真の取り込みに失敗したとき、あきらめるまでの回数(10分おきに試すので、30回は約5時間)
// フォルダの共有が間に合わなかったときなど、あとで読めるようになる場合が多いため、長めに粘る
const MAX_PHOTO_ATTEMPTS = 30;

// 新しい設問があれば「非公開」で登録する(勝手に公開しない)。写真の設問は、プロフィールの項目にしない
async function upsertQuestions(db, questions) {
  const statements = questions.filter((q) => !q.isPhoto).map((q) => db
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
  // 写真がアップロードされていれば、あとで取り込む(photo_state = 'pending')
  statements.push(db.prepare('INSERT INTO form_imports (response_key, profile_id, photo_file_id, photo_state) VALUES (?, (SELECT id FROM profiles WHERE slug = ?), ?, ?)')
    .bind(responseKey, slug, response.photoFileId, response.photoFileId ? 'pending' : null));
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

// アンケートでアップロードされた写真を、ドライブから読み、正方形に縮めて保存する
// 失敗しても回答の取り込みは止めない。次の実行でやり直し、30回失敗したらあきらめる(写真が無い扱い)。失敗した回数が少ない写真から順に試す(読めない写真が、ほかの写真を止めないため)
async function syncPendingPhotos(env, tools) {
  const { results } = await env.DB.prepare(`
    SELECT fi.response_key, fi.photo_file_id, fi.photo_attempts, p.member_id
    FROM form_imports fi JOIN profiles p ON p.id = fi.profile_id
    WHERE fi.photo_state = 'pending' AND p.member_id IS NOT NULL
    ORDER BY fi.photo_attempts, fi.imported_at, fi.response_key LIMIT ?`).bind(MAX_PHOTOS_PER_RUN).all();
  let saved = 0;
  for (const row of results) {
    try {
      const source = await tools.fetchFile(env, row.photo_file_id, MAX_SOURCE_BYTES);
      const jpeg = await tools.resize(env, source);
      if (!isJpeg(jpeg) || jpeg.length > MAX_PHOTO_BYTES) throw new Error('写真を縮められませんでした');
      await saveMemberPhoto(env.DB, row.member_id, jpeg);
      await env.DB.prepare("UPDATE form_imports SET photo_state = 'done' WHERE response_key = ?").bind(row.response_key).run();
      saved += 1;
    } catch (error) {
      const attempts = row.photo_attempts + 1;
      console.error(`写真の取り込みに失敗しました(${attempts}回目、ファイル ${row.photo_file_id}):`, error);
      await env.DB.prepare('UPDATE form_imports SET photo_attempts = ?, photo_state = ? WHERE response_key = ?')
        .bind(attempts, attempts >= MAX_PHOTO_ATTEMPTS ? 'failed' : 'pending', row.response_key).run();
    }
  }
  return saved;
}

// fetchRows と photoTools はテストで差し替えられるようにしてある(通常は Google のシート・ドライブと、Cloudflare の画像変換を使う)
export async function syncResponses(env, fetchRows = fetchSheetRows, photoTools = { fetchFile: fetchDriveFile, resize: resizeToJpeg }) {
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
  // 取り込んだあとに写真を処理する(新しい回答の写真と、前回失敗した写真)
  const finish = async () => {
    const photos = await syncPendingPhotos(env, photoTools);
    if (photos) console.log(`写真を ${photos} 件取り込みました`);
    return summary;
  };
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
  return finish();
}
