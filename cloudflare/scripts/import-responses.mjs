// スプレッドシートの回答CSVを読み、D1 に入れる SQL を作る(移行用。本番には触らない)
// 使い方: node scripts/import-responses.mjs <回答CSV> <出力SQL>
import { readFileSync, writeFileSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { findEmailColumn, parseQuestions, toIso } from '../src/lib/sheet-rows.js';

// いまの GAS の設定を引き継ぐ
const PUBLIC_ROWS = [2, 7, 9, 17, 18, 19, 22]; // ログインなしで公開する行番号
// js/profiles.js の写真の対応表(名前 → パス)
const PHOTOS = {
  'あっちゃん': 'assets/members/acchan.png',
  'ゆーり': 'assets/members/yuuri.png',
  'ゆーほ': 'assets/members/yuuho.png',
  'ワケトン': 'assets/members/waketon.png',
  '沢村 亮 （亮榎、沢村、さわむー ）': 'assets/members/sawamura.png',
  'あすか、あすかちゃん': 'assets/members/asuka-3.png',
  'りーくん。': 'assets/members/riikun.png',
};

const [csvPath, outPath] = process.argv.slice(2);
if (!csvPath || !outPath) {
  console.error('使い方: node scripts/import-responses.mjs <回答CSV> <出力SQL>');
  process.exit(1);
}

// RFC4180 相当の CSV を読む(セル内の改行・引用符に対応)
function parseCsv(text) {
  const rows = [];
  let row = [];
  let cell = '';
  let quoted = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') {
        cell += '"';
        i += 1;
      } else if (ch === '"') {
        quoted = false;
      } else {
        cell += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      row.push(cell);
      cell = '';
    } else if (ch === '\n') {
      row.push(cell);
      rows.push(row);
      row = [];
      cell = '';
    } else if (ch !== '\r') {
      cell += ch;
    }
  }
  if (cell || row.length) {
    row.push(cell);
    rows.push(row);
  }
  return rows;
}

// SQL の文字列リテラルにする(NULL はそのまま)
function q(value) {
  if (value === null || value === undefined) return 'NULL';
  return `'${String(value).replace(/'/g, "''")}'`;
}

// 詳細URL用の固定ID(8文字)
function makeSlug() {
  return randomBytes(6).toString('base64url').replace(/[-_]/g, 'x').slice(0, 8);
}

const rows = parseCsv(readFileSync(csvPath, 'utf8').replace(/^﻿/, ''));
const headers = rows[0];
const emailColumn = findEmailColumn(headers);
// 設問の一覧。公開可否の初期値は GAS の除外キーワードと同じ基準(Worker と共通の処理)
const questions = parseQuestions(headers);
const nameQuestion = questions.find((item) => item.label.startsWith('名前'));
const birthQuestion = questions.find((item) => item.label.startsWith('生年月日'));

const sql = ['-- 自動生成: import-responses.mjs', 'PRAGMA foreign_keys = ON;'];
for (const item of questions) {
  sql.push(`INSERT OR REPLACE INTO questions (key, label, is_public, is_title, sort_order) VALUES (${q(item.key)}, ${q(item.label)}, ${item.isPublic}, ${item.isTitle}, ${item.sortOrder});`);
}

// 会員: メールアドレスごとに1人。最初の回答日時を created_at にする
const members = new Map();
const responses = [];
rows.slice(1).forEach((row, index) => {
  const sheetRow = index + 2;
  if (!row.some((c) => c.trim())) return; // 空行
  const email = (row[emailColumn] || '').trim().toLowerCase();
  const respondedAt = toIso(row[0]);
  if (email && !members.has(email)) members.set(email, respondedAt);
  responses.push({ sheetRow, email, respondedAt, row });
});
for (const [email, createdAt] of members) {
  sql.push(`INSERT INTO members (email, created_at) VALUES (${q(email)}, ${q(createdAt)});`);
}

// 同じ会員の最新回答だけ is_current = 1
const latestByEmail = new Map();
for (const r of responses) if (r.email) latestByEmail.set(r.email, r.sheetRow);

const summary = [];
responses.forEach((r, order) => {
  const name = (r.row[nameQuestion.column] || '').trim() || '(名前なし)';
  const birth = birthQuestion ? toIso(r.row[birthQuestion.column] || '') : null;
  const visibility = PUBLIC_ROWS.includes(r.sheetRow) ? 'public' : 'members';
  const isCurrent = !r.email || latestByEmail.get(r.email) === r.sheetRow ? 1 : 0;
  const slug = makeSlug();
  const memberRef = r.email ? `(SELECT id FROM members WHERE email = ${q(r.email)})` : 'NULL';
  sql.push(`INSERT INTO profiles (slug, member_id, responded_at, sheet_row, display_name, birth_date, photo_path, visibility, is_current, sort_order) VALUES (${q(slug)}, ${memberRef}, ${q(r.respondedAt)}, ${r.sheetRow}, ${q(name)}, ${q(birth)}, ${q(PHOTOS[name] || null)}, ${q(visibility)}, ${isCurrent}, ${order + 1});`);
  for (const item of questions) {
    const answer = (r.row[item.column] || '').trim();
    if (!answer) continue;
    sql.push(`INSERT INTO profile_answers (profile_id, question_key, answer) VALUES ((SELECT id FROM profiles WHERE slug = ${q(slug)}), ${q(item.key)}, ${q(answer)});`);
  }
  if (r.email) {
    const responseKey = `${r.respondedAt}|${r.email}`;
    sql.push(`INSERT INTO form_imports (response_key, profile_id, thanks_mail_sent_at) VALUES (${q(responseKey)}, (SELECT id FROM profiles WHERE slug = ${q(slug)}), ${q(r.respondedAt)});`);
  }
  summary.push({ 行: r.sheetRow, 名前: name, メール: r.email || '(なし)', 公開: visibility, 最新: isCurrent, 写真: PHOTOS[name] ? 'あり' : '' });
});

writeFileSync(outPath, `${sql.join('\n')}\n`);
console.log(`設問 ${questions.length} 件 / 会員 ${members.size} 人 / プロフィール ${responses.length} 件 → ${outPath}`);
console.table(summary);
