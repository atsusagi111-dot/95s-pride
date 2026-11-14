// サイトの静的ファイル(リポジトリ直下)と管理画面(site-extra/)を public/ に集める
// Workers Static Assets はこの public/ を配信する。public/ は生成物なので git には入れない
import { cpSync, mkdirSync, rmSync, existsSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = join(here, '..', '..');
const out = join(here, '..', 'public');

const SITE_FILES = ['index.html', 'members.html', 'profile.html', 'css', 'js', 'assets'];

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });
for (const name of SITE_FILES) {
  const from = join(root, name);
  if (!existsSync(from)) throw new Error(`見つかりません: ${from}`);
  cpSync(from, join(out, name), { recursive: true });
}
cpSync(join(here, '..', 'site-extra'), out, { recursive: true });
console.log(`public/ を作りました: ${SITE_FILES.join(', ')} + site-extra`);
