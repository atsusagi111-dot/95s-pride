// Workers の実行環境(workerd)上でテストを動かす設定。D1 はテストごとに空の状態から migrations を当てる
import path from 'node:path';
import { defineConfig } from 'vitest/config';
import { cloudflareTest, readD1Migrations } from '@cloudflare/vitest-plugin';

export default defineConfig(async () => {
  const migrations = await readD1Migrations(path.join(import.meta.dirname, 'migrations'));
  return {
    plugins: [
      cloudflareTest({
        wrangler: { configPath: './wrangler.jsonc' },
        miniflare: {
          bindings: {
            TEST_MIGRATIONS: migrations,
            SESSION_SECRET: 'test-session-secret',
            MAIL_DRY_RUN: '1',
            THANKS_MAIL_SINCE: '', // テストでは日時の足切りをしない(足切り自体は個別のテストで確かめる)
          },
        },
      }),
    ],
    test: {
      setupFiles: ['./test/setup.js'],
    },
  };
});
