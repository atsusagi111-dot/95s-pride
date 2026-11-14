// いまの GAS に保存されているパスワードのハッシュを取り出し、D1 に入れる SQL を作る(移行用)
// GAS の beginLogin を呼ぶだけで GAS 側のデータは変えない(数えたログイン回数は clearLoginAttempts で戻す)
// 使い方: node scripts/export-password-hashes.mjs <.env.local のパス> <メール一覧(1行1件)> <出力SQL>
import { readFileSync, writeFileSync } from 'node:fs';

const [envPath, emailsPath, outPath] = process.argv.slice(2);
if (!envPath || !emailsPath || !outPath) {
  console.error('使い方: node scripts/export-password-hashes.mjs <.env.local> <メール一覧> <出力SQL>');
  process.exit(1);
}

// .env.local から GAS の URL と共有シークレットを読む
const env = {};
for (const line of readFileSync(envPath, 'utf8').split('\n')) {
  const m = line.match(/^([A-Z_]+)=(.*)$/);
  if (m) env[m[1]] = m[2].trim().replace(/^"(.*)"$/, '$1');
}
const emails = readFileSync(emailsPath, 'utf8').split('\n').map((l) => l.trim()).filter(Boolean);

async function callGas(action, email) {
  const res = await fetch(env.GAS_WEBAPP_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: env.GAS_SHARED_SECRET, action, email }),
  });
  if (!res.ok) throw new Error(`GAS ${res.status}`);
  return res.json();
}

function q(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

const sql = ['-- 自動生成: export-password-hashes.mjs'];
let withHash = 0;
for (const email of emails) {
  const { passwordHash, locked, error } = await callGas('beginLogin', email);
  await callGas('clearLoginAttempts', email);
  if (error || locked) {
    console.log(`${email}: 取得できず (${error || 'locked'})`);
    continue;
  }
  if (passwordHash) {
    withHash += 1;
    sql.push(`UPDATE members SET password_hash = ${q(passwordHash)} WHERE email = ${q(email)};`);
  }
  console.log(`${email}: ${passwordHash ? 'パスワード設定済み' : '未設定'}`);
}
writeFileSync(outPath, `${sql.join('\n')}\n`);
console.log(`パスワード設定済み ${withHash} / ${emails.length} 人 → ${outPath}`);
