import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { cookieOf, get, loginAs, post, seedMember } from './helpers.js';
import { hashPassword, verifyPassword } from '../src/lib/credentials.js';

describe('パスワード', () => {
  it('scrypt$salt$key 形式で保存し、同じパスワードだけ通る', async () => {
    const hash = await hashPassword('password123');
    expect(hash).toMatch(/^scrypt\$[0-9a-f]{32}\$[0-9a-f]{64}$/);
    expect(await verifyPassword('password123', hash)).toBe(true);
    expect(await verifyPassword('password124', hash)).toBe(false);
    expect(await verifyPassword('password123', '')).toBe(false);
  });
});

describe('ログイン', () => {
  it('正しいメールとパスワードで Cookie が付く', async () => {
    await seedMember({ email: 'a@example.com', password: 'password123' });
    const res = await post('/api/auth/login', { email: 'A@example.com ', password: 'password123' });
    expect(res.status).toBe(200);
    expect(cookieOf(res)).toMatch(/^member_session=.+/);
  });

  it('間違ったパスワード・未登録は 401', async () => {
    await seedMember({ email: 'a@example.com', password: 'password123' });
    expect((await post('/api/auth/login', { email: 'a@example.com', password: 'wrong-password' })).status).toBe(401);
    expect((await post('/api/auth/login', { email: 'nobody@example.com', password: 'password123' })).status).toBe(401);
  });

  it('停止中の会員はログインできない', async () => {
    await seedMember({ email: 'a@example.com', password: 'password123', status: 'suspended' });
    expect((await post('/api/auth/login', { email: 'a@example.com', password: 'password123' })).status).toBe(401);
  });

  it('10回失敗すると 15 分ロックされる', async () => {
    await seedMember({ email: 'a@example.com', password: 'password123' });
    for (let i = 0; i < 10; i += 1) await post('/api/auth/login', { email: 'a@example.com', password: 'wrong-password' });
    const res = await post('/api/auth/login', { email: 'a@example.com', password: 'password123' });
    expect(res.status).toBe(429);
  });

  it('ログアウトで Cookie が消える', async () => {
    const res = await post('/api/auth/logout', {});
    expect(res.headers.get('set-cookie')).toContain('Max-Age=0');
  });
});

describe('確認コードとパスワード設定', () => {
  it('未登録のメールには 404', async () => {
    expect((await post('/api/auth/password-reset', { email: 'nobody@example.com' })).status).toBe(404);
  });

  it('コードが正しければパスワードが保存されログインできる', async () => {
    await seedMember({ email: 'a@example.com', password: null });
    expect((await post('/api/auth/password-reset', { email: 'a@example.com' })).status).toBe(200);
    // テストではメールを送らないので、保存されたコードをハッシュから逆引きする代わりに総当たりせず、保存処理を直接使う
    const { saveCode } = await import('../src/lib/db.js');
    await saveCode(env.DB, 'a@example.com', '123456', 600);

    expect((await post('/api/auth/verify-code', { email: 'a@example.com', code: '000000', password: 'newpassword1' })).status).toBe(401);
    const ok = await post('/api/auth/verify-code', { email: 'a@example.com', code: '123456', password: 'newpassword1' });
    expect(ok.status).toBe(200);
    expect(cookieOf(ok)).toMatch(/^member_session=.+/);
    // 使ったコードは二度と使えない
    expect((await post('/api/auth/verify-code', { email: 'a@example.com', code: '123456', password: 'newpassword1' })).status).toBe(401);
    expect(await loginAs('a@example.com', 'newpassword1')).toMatch(/^member_session=/);
  });

  it('コードを5回間違えると無効になる', async () => {
    await seedMember({ email: 'a@example.com', password: null });
    const { saveCode } = await import('../src/lib/db.js');
    await saveCode(env.DB, 'a@example.com', '123456', 600);
    for (let i = 0; i < 5; i += 1) await post('/api/auth/verify-code', { email: 'a@example.com', code: '999999', password: 'newpassword1' });
    expect((await post('/api/auth/verify-code', { email: 'a@example.com', code: '123456', password: 'newpassword1' })).status).toBe(401);
  });
});

describe('会員限定の判定', () => {
  it('ログインしていないと会員限定の一覧は 401', async () => {
    expect((await get('/api/member-profiles')).status).toBe(401);
    expect((await get('/api/members')).status).toBe(401);
  });

  it('ログイン後に停止されると、Cookie があっても見られない', async () => {
    const { memberId } = await seedMember({ email: 'a@example.com', password: 'password123' });
    const cookie = await loginAs('a@example.com', 'password123');
    expect((await get('/api/member-profiles', cookie)).status).toBe(200);
    await env.DB.prepare('UPDATE members SET status = ? WHERE id = ?').bind('suspended', memberId).run();
    expect((await get('/api/member-profiles', cookie)).status).toBe(401);
  });
});
