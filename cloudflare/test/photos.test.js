import { describe, expect, it } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { get, loginAs, seedMember } from './helpers.js';
import { saveMemberPhoto } from '../src/lib/photos.js';

// 本物の写真の代わりに、JPEG の先頭の印(FF D8 FF)から始まる小さなデータを使う
function fakeJpeg(size = 2000) {
  const bytes = new Uint8Array(size).fill(0x41);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}

describe('写真を見られる人', () => {
  async function withPhoto(email, visibility, slug) {
    const { memberId } = await seedMember({ email, password: 'password123', visibility, slug });
    await saveMemberPhoto(env.DB, memberId, fakeJpeg());
    return memberId;
  }

  it('公開はだれでも、会員限定はログインした人だけ、非表示はだれにも見せない', async () => {
    await withPhoto('pub@example.com', 'public', 'pub00001');
    await withPhoto('mem@example.com', 'members', 'mem00001');
    await withPhoto('hid@example.com', 'hidden', 'hid00001');

    const image = await get('/api/photo/pub00001');
    expect(image.status).toBe(200);
    expect(image.headers.get('content-type')).toBe('image/jpeg');
    expect(image.headers.get('x-content-type-options')).toBe('nosniff');
    expect(new Uint8Array(await image.arrayBuffer())).toEqual(fakeJpeg());

    expect((await get('/api/photo/mem00001')).status).toBe(401);
    expect((await get('/api/photo/hid00001')).status).toBe(404);
    expect((await get('/api/photo/nothere1')).status).toBe(404);

    const viewer = await loginAs('pub@example.com', 'password123');
    const member = await get('/api/photo/mem00001', viewer);
    expect(member.status).toBe(200);
    expect(member.headers.get('cache-control')).toContain('private');
    expect((await get('/api/photo/hid00001', viewer)).status).toBe(404);
  });

  it('アップロードされた写真は、運営が設定した写真より優先される', async () => {
    const memberId = await withPhoto('a@example.com', 'public', 'pub00001');
    await env.DB.prepare('UPDATE profiles SET photo_path = ? WHERE member_id = ?').bind('assets/members/acchan.png', memberId).run();
    expect((await (await get('/api/public-profiles')).json()).profiles[0].photo).toMatch(/^\/api\/photo\//);
    await env.DB.prepare('DELETE FROM member_photos').run();
    expect((await (await get('/api/public-profiles')).json()).profiles[0].photo).toBe('assets/members/acchan.png');
  });

  it('会員がログイン画面から写真を変えるための入口は、存在しない', async () => {
    await seedMember({ email: 'a@example.com', password: 'password123' });
    const cookie = await loginAs('a@example.com', 'password123');
    const post = await SELF.fetch('https://example.com/api/me/photo', { method: 'POST', headers: { Cookie: cookie, 'Content-Type': 'image/jpeg' }, body: fakeJpeg() });
    expect(post.status).toBe(404);
    expect((await SELF.fetch('https://example.com/api/me/photo', { method: 'DELETE', headers: { Cookie: cookie } })).status).toBe(404);
  });
});

describe('運営による写真の削除', () => {
  it('運営は、アンケートで送られた写真を消せる。記録も残る', async () => {
    const { memberId } = await seedMember({ email: 'a@example.com', password: 'password123', visibility: 'public', slug: 'pub00001' });
    await saveMemberPhoto(env.DB, memberId, fakeJpeg());
    await seedMember({ email: 'admin@example.com', password: 'password123', slug: 'adm00001', admin: true });
    const adminCookie = await loginAs('admin@example.com', 'password123');

    const overview = await (await get('/api/admin/overview', adminCookie)).json();
    expect(overview.profiles.find((p) => p.member_id === memberId).has_upload).toBe(1);

    const del = await SELF.fetch(`https://example.com/api/admin/photos/${memberId}`, { method: 'DELETE', headers: { Cookie: adminCookie } });
    expect(del.status).toBe(200);
    expect((await get('/api/photo/pub00001')).status).toBe(404);
    const after = await (await get('/api/admin/overview', adminCookie)).json();
    expect(after.log.some((l) => l.action === 'photo.remove' && l.target === 'a@example.com')).toBe(true);
  });

  it('運営でない人は、他の人の写真を消せない', async () => {
    const { memberId } = await seedMember({ email: 'a@example.com', password: 'password123', slug: 'pub00001' });
    await seedMember({ email: 'b@example.com', password: 'password123', slug: 'other001' });
    const cookie = await loginAs('b@example.com', 'password123');
    const del = await SELF.fetch(`https://example.com/api/admin/photos/${memberId}`, { method: 'DELETE', headers: { Cookie: cookie } });
    expect(del.status).toBe(403);
  });
});

describe('運営による写真の差し替え', () => {
  const upload = (memberId, cookie, fields = {}, headers = {}) => {
    const form = new FormData();
    for (const [key, value] of Object.entries(fields)) form.append(key, value);
    return SELF.fetch(`https://example.com/api/admin/photos/${memberId}`, { method: 'POST', body: form, headers: { ...(cookie ? { Cookie: cookie } : {}), ...headers } });
  };

  async function setup() {
    const { memberId } = await seedMember({ email: 'a@example.com', password: 'password123', visibility: 'public', slug: 'pub00001' });
    await seedMember({ email: 'admin@example.com', password: 'password123', slug: 'adm00001', admin: true });
    return { memberId, adminCookie: await loginAs('admin@example.com', 'password123') };
  }

  it('運営でない人・ログインしていない人は、写真を差し替えられない', async () => {
    const { memberId } = await setup();
    await seedMember({ email: 'b@example.com', password: 'password123', slug: 'other001' });
    expect((await upload(memberId, null)).status).toBe(401);
    expect((await upload(memberId, await loginAs('b@example.com', 'password123'))).status).toBe(403);
  });

  it('写真が選ばれていない・画像として読めない・知らない会員のときは、写真を変えずに断る', async () => {
    const { memberId, adminCookie } = await setup();
    expect(await (await upload(memberId, adminCookie)).json()).toEqual({ error: 'no_photo' });
    const bad = await upload(memberId, adminCookie, { photo: new File([new Uint8Array([1, 2, 3])], 'x.txt') });
    expect(bad.status).toBe(400);
    expect((await bad.json()).error).toBe('invalid_photo');
    expect((await upload(99999, adminCookie, { photo: new File([new Uint8Array([1])], 'x.png') })).status).toBe(404);
    expect((await get('/api/photo/pub00001')).status).toBe(404);
  });

  it('他のサイトからの送信は断る', async () => {
    const { memberId, adminCookie } = await setup();
    expect((await upload(memberId, adminCookie, {}, { Origin: 'https://evil.example' })).status).toBe(403);
  });
});
