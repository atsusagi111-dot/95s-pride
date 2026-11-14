// 各テストの前に D1 へ migrations を当て、テストごとに表を空にする
import { beforeEach } from 'vitest';
import { applyD1Migrations, env } from 'cloudflare:test';

await applyD1Migrations(env.DB, env.TEST_MIGRATIONS);

const TABLES = ['form_imports', 'rate_limits', 'auth_codes', 'admins', 'member_cards', 'profile_answers', 'profiles', 'questions', 'members'];

beforeEach(async () => {
  await env.DB.batch(TABLES.map((table) => env.DB.prepare(`DELETE FROM ${table}`)));
});
