import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { get, loginAs, post, seedMember } from './helpers.js';

describe('公開プロフィール', () => {
  it('公開の人だけ返し、非公開の設問とメールアドレスは含めない', async () => {
    await seedMember({ email: 'pub@example.com', visibility: 'public', name: '公開さん', slug: 'pubpub01' });
    await seedMember({ email: 'mem@example.com', visibility: 'members', name: '会員さん', slug: 'memmem01' });
    await seedMember({ email: 'hid@example.com', visibility: 'hidden', name: '非表示さん', slug: 'hidhid01' });

    const res = await get('/api/public-profiles');
    expect(res.status).toBe(200);
    const { profiles } = await res.json();
    expect(profiles.map((p) => p.id)).toEqual(['pubpub01']);
    expect(profiles[0].title).toBe('公開さんの表示名');
    const labels = profiles[0].items.map((i) => i.label);
    expect(labels).toContain('名前 (呼ばれたいニックネーム)');
    expect(labels).not.toContain('プロフィール回答特典について');
    expect(JSON.stringify(profiles)).not.toContain('@example.com');
    // 生年月日は「1995年9月6日」の形
    expect(profiles[0].items.find((i) => i.label === '生年月日').value).toBe('1995年9月6日');
  });

  it('設問を非公開にすると一覧から消える', async () => {
    await seedMember({ email: 'pub@example.com', visibility: 'public' });
    await env.DB.prepare('UPDATE questions SET is_public = 0 WHERE key = ?').bind('q4').run();
    await env.DB.prepare('UPDATE questions SET is_public = 0 WHERE key = ?').bind('q3').run();
    const { profiles } = await (await get('/api/public-profiles')).json();
    expect(profiles[0].items.map((i) => i.label)).not.toContain('生年月日');
  });

  it('同じ会員の古い回答(is_current = 0)は出さない', async () => {
    const { memberId } = await seedMember({ email: 'pub@example.com', visibility: 'public', slug: 'newer001' });
    await env.DB.prepare('INSERT INTO profiles (slug, member_id, display_name, visibility, is_current, sort_order) VALUES (?, ?, ?, ?, 0, 0)')
      .bind('older001', memberId, '古い回答', 'public').run();
    const { profiles } = await (await get('/api/public-profiles')).json();
    expect(profiles.map((p) => p.id)).toEqual(['newer001']);
  });
});

describe('固定IDでの1件取得', () => {
  it('公開は誰でも、会員限定はログインが必要、非表示は 404', async () => {
    await seedMember({ email: 'pub@example.com', password: 'password123', visibility: 'public', slug: 'pubpub01' });
    await seedMember({ email: 'mem@example.com', visibility: 'members', slug: 'memmem01' });
    await seedMember({ email: 'hid@example.com', visibility: 'hidden', slug: 'hidhid01' });

    expect((await get('/api/profile/pubpub01')).status).toBe(200);
    expect((await get('/api/profile/memmem01')).status).toBe(401);
    expect((await get('/api/profile/hidhid01')).status).toBe(404);
    expect((await get('/api/profile/nothere1')).status).toBe(404);

    const cookie = await loginAs('pub@example.com', 'password123');
    const res = await get('/api/profile/memmem01', cookie);
    expect(res.status).toBe(200);
    expect((await res.json()).profile.id).toBe('memmem01');
  });
});

describe('管理API', () => {
  it('運営でない会員は 403、未ログインは 401', async () => {
    await seedMember({ email: 'a@example.com', password: 'password123' });
    expect((await get('/api/admin/overview')).status).toBe(401);
    const cookie = await loginAs('a@example.com', 'password123');
    expect((await get('/api/admin/overview', cookie)).status).toBe(403);
  });

  it('オーナーは公開範囲と停止を変えられ、運営の人は止められない', async () => {
    const { profileId, memberId } = await seedMember({ email: 'a@example.com', password: 'password123', visibility: 'members', slug: 'target01' });
    const { memberId: adminMemberId } = await seedMember({ email: 'admin@example.com', password: 'password123', slug: 'admin001', admin: true });
    const cookie = await loginAs('admin@example.com', 'password123');

    const overview = await (await get('/api/admin/overview', cookie)).json();
    expect(overview.profiles.length).toBe(2);
    expect(overview.me).toEqual({ email: 'admin@example.com', role: 'owner' });
    expect(overview.admins).toEqual([{ email: 'admin@example.com', role: 'owner' }]);

    expect((await post(`/api/admin/profiles/${profileId}`, { visibility: 'public' }, cookie)).status).toBe(200);
    const { profiles } = await (await get('/api/public-profiles')).json();
    expect(profiles.map((p) => p.id)).toContain('target01');
    expect((await post(`/api/admin/profiles/${profileId}`, { visibility: 'secret' }, cookie)).status).toBe(400);

    // 運営の人(自分を含む)は画面から停止できない
    const self = await post(`/api/admin/members/${adminMemberId}`, { status: 'suspended' }, cookie);
    expect(self.status).toBe(400);
    expect((await self.json()).error).toBe('cannot_suspend_admin');

    // ふつうの会員は停止でき、停止するとログインできない
    expect((await post(`/api/admin/members/${memberId}`, { status: 'suspended' }, cookie)).status).toBe(200);
    expect((await post('/api/auth/login', { email: 'a@example.com', password: 'password123' })).status).toBe(401);
  });

  it('編集者は停止・再開と設問の公開設定ができない', async () => {
    const { memberId } = await seedMember({ email: 'a@example.com', password: 'password123', slug: 'target01' });
    const { profileId } = await seedMember({ email: 'editor@example.com', password: 'password123', slug: 'editor01', admin: true, role: 'editor' });
    const cookie = await loginAs('editor@example.com', 'password123');

    expect((await post(`/api/admin/members/${memberId}`, { status: 'suspended' }, cookie)).status).toBe(403);
    expect((await post('/api/admin/questions/q4', { is_public: false }, cookie)).status).toBe(403);
    // 公開範囲・メモ・紹介カードはできる
    expect((await post(`/api/admin/profiles/${profileId}`, { visibility: 'hidden' }, cookie)).status).toBe(200);
    expect((await post(`/api/admin/members/${memberId}`, { note: '連絡済み' }, cookie)).status).toBe(200);
    expect((await post('/api/admin/cards', { name: '花子' }, cookie)).status).toBe(200);
    const overview = await (await get('/api/admin/overview', cookie)).json();
    expect(overview.me.role).toBe('editor');
  });

  it('別のサイトから送られた操作は拒否する', async () => {
    await seedMember({ email: 'admin@example.com', password: 'password123', admin: true });
    const cookie = await loginAs('admin@example.com', 'password123');
    const evil = await post('/api/admin/cards', { name: '偽物' }, cookie, { Origin: 'https://evil.example.net' });
    expect(evil.status).toBe(403);
    expect((await evil.json()).error).toBe('cross_site');
    const same = await post('/api/admin/cards', { name: '本物' }, cookie, { Origin: 'https://example.com' });
    expect(same.status).toBe(200);
  });

  it('運営の操作が記録に残る', async () => {
    const { profileId } = await seedMember({ email: 'a@example.com', visibility: 'members', slug: 'target01', name: '対象さん' });
    await seedMember({ email: 'admin@example.com', password: 'password123', slug: 'admin001', admin: true });
    const cookie = await loginAs('admin@example.com', 'password123');
    await post(`/api/admin/profiles/${profileId}`, { visibility: 'public' }, cookie);
    const { log } = await (await get('/api/admin/overview', cookie)).json();
    expect(log.length).toBe(1);
    expect(log[0]).toMatchObject({ admin_email: 'admin@example.com', action: 'profile.update', target: '対象さん' });
    expect(log[0].detail).toContain('会員限定 → 公開');
  });

  it('紹介カードを追加・更新・削除できる', async () => {
    await seedMember({ email: 'admin@example.com', password: 'password123', admin: true });
    const cookie = await loginAs('admin@example.com', 'password123');
    expect((await post('/api/admin/cards', { name: '太郎', title: '会社員', image_url: 'http://insecure' }, cookie)).status).toBe(400);
    expect((await post('/api/admin/cards', { name: '太郎', title: '会社員', instagram_url: 'https://instagram.com/taro' }, cookie)).status).toBe(200);
    const { members } = await (await get('/api/members', cookie)).json();
    expect(members).toEqual([{ name: '太郎', title: '会社員', bio: '', image: '', instagram: 'https://instagram.com/taro' }]);
  });
});
