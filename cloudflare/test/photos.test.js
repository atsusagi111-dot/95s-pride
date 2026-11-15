import { describe, expect, it } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { get, loginAs, seedMember } from './helpers.js';
import { extractDriveFileId, parseQuestions, parseResponseRow } from '../src/lib/sheet-rows.js';
import { saveMemberPhoto } from '../src/lib/photos.js';
import { syncResponses } from '../src/lib/sync.js';

// 本物の写真の代わりに、JPEG の先頭の印(FF D8 FF)から始まる小さなデータを使う
function fakeJpeg(size = 2000) {
  const bytes = new Uint8Array(size).fill(0x41);
  bytes.set([0xff, 0xd8, 0xff, 0xe0]);
  return bytes;
}

const HEADERS = ['Timestamp', 'Q1 オプチャの表示名', 'Q2 名前 (呼ばれたいニックネーム)', 'Q3 生年月日', 'Email Address', 'Q19 プロフィール回答特典について', 'Q20 プロフィール写真(任意)'];
const PHOTO_URL = 'https://drive.google.com/open?id=1AbCdEfGhIjKlMnOpQrStUvWxYz';
const row = (time, email, photo = '') => [time, '表示名', '太郎', '9/6/1995', email, '', photo];

// 写真の取り込みの道具を、テスト用に差し替える(本物のドライブと画像変換は使わない)
function makeTools({ fail = false, notJpeg = false } = {}) {
  const calls = { fetched: [] };
  return {
    calls,
    tools: {
      fetchFile: async (envArg, fileId) => {
        calls.fetched.push(fileId);
        if (fail) throw new Error('ドライブから読めません');
        return new Uint8Array([1, 2, 3]);
      },
      resize: async () => (notJpeg ? new Uint8Array([9, 9, 9, 9]) : fakeJpeg(1000)),
    },
  };
}

describe('アンケートの写真の項目の読み取り', () => {
  it('ドライブのURLから、ファイルIDを取り出す', () => {
    expect(extractDriveFileId(PHOTO_URL)).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz');
    expect(extractDriveFileId('https://drive.google.com/file/d/1AbCdEfGhIjKlMnOpQrStUvWxYz/view')).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz');
    // 複数のとき(カンマ区切り)は、最初の1つ
    expect(extractDriveFileId(`${PHOTO_URL}, https://drive.google.com/open?id=ZZZZZZZZZZZZZZZZZZZZ`)).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz');
    expect(extractDriveFileId('')).toBeNull();
    expect(extractDriveFileId('写真はありません')).toBeNull();
  });

  it('写真の設問は、プロフィールの項目に入れず、ファイルIDだけを取り出す', () => {
    const questions = parseQuestions(HEADERS);
    expect(questions.find((q) => q.key === 'q20').isPhoto).toBe(true);
    expect(questions.find((q) => q.key === 'q2').isPhoto).toBe(false);
    const parsed = parseResponseRow(row('10/5/2026 22:31:33', 'a@example.com', PHOTO_URL), questions, 4);
    expect(parsed.photoFileId).toBe('1AbCdEfGhIjKlMnOpQrStUvWxYz');
    expect(parsed.answers.q20).toBeUndefined();
    expect(parseResponseRow(row('10/5/2026 22:31:33', 'a@example.com'), questions, 4).photoFileId).toBeNull();
  });
});

describe('アンケートの写真の取り込み', () => {
  it('写真付きの回答を取り込むと、写真が保存され、プロフィールに使われる(URLは見えない)', async () => {
    const { tools, calls } = makeTools();
    const result = await syncResponses(env, async () => [HEADERS, row('10/5/2026 22:31:33', 'a@example.com', PHOTO_URL)], tools);
    expect(result.imported).toBe(1);
    expect(calls.fetched).toEqual(['1AbCdEfGhIjKlMnOpQrStUvWxYz']);

    const photo = await env.DB.prepare('SELECT size FROM member_photos').first();
    expect(photo.size).toBe(1000);
    const imp = await env.DB.prepare('SELECT photo_state FROM form_imports').first();
    expect(imp.photo_state).toBe('done');
    // 写真の設問は、設問にも回答にも入らない(ドライブのURLが画面に出ない)
    expect((await env.DB.prepare("SELECT count(*) AS n FROM questions WHERE key = 'q20'").first()).n).toBe(0);
    expect((await env.DB.prepare("SELECT count(*) AS n FROM profile_answers WHERE question_key = 'q20'").first()).n).toBe(0);

    await env.DB.prepare("UPDATE profiles SET visibility = 'public'").run();
    const { profiles } = await (await get('/api/public-profiles')).json();
    expect(profiles[0].photo).toMatch(/^\/api\/photo\/[A-Za-z0-9]+\?v=\d+$/);
    expect(JSON.stringify(profiles)).not.toContain('drive.google.com');
  });

  it('写真がなければ、写真は保存されず、プロフィールの写真は空になる(画面が共通のアイコンを出す)', async () => {
    const { tools, calls } = makeTools();
    await syncResponses(env, async () => [HEADERS, row('10/5/2026 22:31:33', 'a@example.com')], tools);
    expect(calls.fetched).toEqual([]);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM member_photos').first()).n).toBe(0);
    await env.DB.prepare("UPDATE profiles SET visibility = 'public'").run();
    expect((await (await get('/api/public-profiles')).json()).profiles[0].photo).toBeNull();
  });

  it('読み込みに失敗しても回答は取り込まれ、次の実行でやり直し、5回失敗するとあきらめる', async () => {
    const rows = async () => [HEADERS, row('10/5/2026 22:31:33', 'a@example.com', PHOTO_URL)];
    const bad = makeTools({ fail: true });
    expect((await syncResponses(env, rows, bad.tools)).imported).toBe(1);
    let imp = await env.DB.prepare('SELECT photo_state, photo_attempts FROM form_imports').first();
    expect(imp).toEqual({ photo_state: 'pending', photo_attempts: 1 });

    // 次の実行で、うまくいけば保存される
    const good = makeTools();
    await syncResponses(env, rows, good.tools);
    expect((await env.DB.prepare('SELECT photo_state FROM form_imports').first()).photo_state).toBe('done');
    expect((await env.DB.prepare('SELECT count(*) AS n FROM member_photos').first()).n).toBe(1);

    // 失敗が続く別の回答は、5回であきらめる
    await env.DB.prepare('DELETE FROM member_photos').run();
    const second = async () => [HEADERS, row('10/6/2026 10:00:00', 'b@example.com', PHOTO_URL)];
    for (let i = 0; i < 5; i += 1) await syncResponses(env, second, bad.tools);
    imp = await env.DB.prepare("SELECT photo_state, photo_attempts FROM form_imports WHERE response_key LIKE '%b@example.com'").first();
    expect(imp).toEqual({ photo_state: 'failed', photo_attempts: 5 });
    expect(bad.calls.fetched.length).toBe(6);
  });

  it('縮めた結果が JPEG でなければ、保存しない', async () => {
    const { tools } = makeTools({ notJpeg: true });
    await syncResponses(env, async () => [HEADERS, row('10/5/2026 22:31:33', 'a@example.com', PHOTO_URL)], tools);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM member_photos').first()).n).toBe(0);
  });

  it('回答を送り直したとき、写真がなければ前の写真を引き継ぎ、写真があれば差し替える', async () => {
    const { tools } = makeTools();
    await syncResponses(env, async () => [HEADERS, row('10/5/2026 22:31:33', 'a@example.com', PHOTO_URL)], tools);
    const first = await env.DB.prepare('SELECT updated_at, size FROM member_photos').first();

    // 写真なしで送り直す → 前の写真が残る
    await syncResponses(env, async () => [
      HEADERS, row('10/5/2026 22:31:33', 'a@example.com', PHOTO_URL), row('10/6/2026 10:00:00', 'a@example.com'),
    ], tools);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM member_photos').first()).n).toBe(1);
    expect((await env.DB.prepare('SELECT size FROM member_photos').first()).size).toBe(first.size);
    const current = await env.DB.prepare('SELECT slug FROM profiles WHERE is_current = 1').first();
    await env.DB.prepare("UPDATE profiles SET visibility = 'public' WHERE is_current = 1").run();
    expect((await (await get('/api/public-profiles')).json()).profiles[0].photo).toContain(`/api/photo/${current.slug}`);
  });

  it('一度に取り込む写真は3件まで。残りは次の実行で取り込む', async () => {
    const { tools } = makeTools();
    const many = async () => [
      HEADERS,
      ...['a', 'b', 'c', 'd', 'e'].map((n, i) => row(`10/${i + 1}/2026 10:00:00`, `${n}@example.com`, PHOTO_URL)),
    ];
    await syncResponses(env, many, tools);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM member_photos').first()).n).toBe(3);
    await syncResponses(env, many, tools);
    expect((await env.DB.prepare('SELECT count(*) AS n FROM member_photos').first()).n).toBe(5);
  });
});

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
