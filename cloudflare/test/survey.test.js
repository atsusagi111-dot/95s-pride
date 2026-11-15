import { describe, expect, it } from 'vitest';
import { env, SELF } from 'cloudflare:test';
import { get, post, seedMember } from './helpers.js';
import { saveCode } from '../src/lib/db.js';
import { createTicket, readTicket } from '../src/lib/survey-ticket.js';
import { prepareSurveyPhoto, validateAnswers } from '../src/lib/survey.js';
import { normalizeSnsLink } from '../src/lib/sns-links.js';
import { getProfile } from '../src/lib/profiles.js';
import { retryThanksMails } from '../src/lib/thanks-retry.js';

const ACCEPT = 'プロフィール回答特典（なんでもお悩み相談15分～30分）を受け取る';

// アンケートの設問(本番は migrations 0005 で入る。テストでは表を空にするので、ここで入れ直す)
const QUESTIONS = [
  ['q1', 'オプチャの表示名', 'text', 1, '01 基本情報', null],
  ['q2', '名前 (呼ばれたいニックネーム)', 'text', 1, '01 基本情報', null],
  ['q3', '生年月日', 'text', 1, '01 基本情報', null],
  ['q5', '趣味・活動', 'textarea', 0, '01 基本情報', null],
  ['sns_x', 'X(旧Twitter)', 'text', 0, '01 基本情報', null],
  ['sns_other', 'その他(HP・ブログなど)', 'text', 0, '01 基本情報', null],
  ['q19', 'プロフィール回答特典について', 'choice', 1, '05 興味関心', JSON.stringify([ACCEPT, '受け取らない'])],
];

async function seedQuestions() {
  await env.DB.batch(QUESTIONS.map(([key, label, type, required, section, options], index) => env.DB
    .prepare('INSERT INTO questions (key, label, is_public, is_title, sort_order, input_type, required, help, options, section) VALUES (?, ?, 1, 0, ?, ?, ?, ?, ?, ?)')
    .bind(key, label, index + 1, type, required, '例)あいう', options, section)));
}

const validAnswers = { q1: '表示名', q2: 'たろう', q3: '1995年5月8日', q19: '受け取らない' };

function submit(fields, { cookie } = {}) {
  const form = new FormData();
  for (const [key, value] of Object.entries(fields)) form.append(key, value);
  return SELF.fetch('https://example.com/api/survey/submit', { method: 'POST', body: form, headers: cookie ? { Cookie: cookie } : {} });
}

const ticketFor = (email) => createTicket(email, env.SESSION_SECRET);

describe('アンケートの設問', () => {
  it('設問の一覧を、並び順・必須・選択肢つきで返す(ログイン不要)', async () => {
    await seedQuestions();
    const res = await get('/api/survey/questions');
    expect(res.status).toBe(200);
    const { questions } = await res.json();
    expect(questions.map((q) => q.key)).toEqual(['q1', 'q2', 'q3', 'q5', 'sns_x', 'sns_other', 'q19']);
    expect(questions[0]).toMatchObject({ type: 'text', required: true, section: '01 基本情報' });
    expect(questions[3].required).toBe(false);
    expect(questions[6].options).toEqual([ACCEPT, '受け取らない']);
  });
});

describe('回答の検証', () => {
  const questions = QUESTIONS.map(([key, label, type, required, section, options]) => ({ key, label, type, required: Boolean(required), options: options ? JSON.parse(options) : null }));

  it('必須が空・選択肢にない値・長すぎる回答は断る', () => {
    expect(validateAnswers(questions, { ...validAnswers, q1: '  ' })).toEqual({ error: 'required', field: 'q1' });
    expect(validateAnswers(questions, { ...validAnswers, q19: 'ほか' })).toEqual({ error: 'invalid_choice', field: 'q19' });
    expect(validateAnswers(questions, { ...validAnswers, q5: 'あ'.repeat(2001) })).toEqual({ error: 'too_long', field: 'q5' });
  });

  it('任意が空でもよく、前後の空白は取り除く。設問にない項目は無視する', () => {
    const { answers } = validateAnswers(questions, { ...validAnswers, q2: ' たろう ', evil: 'x' });
    expect(answers).toEqual({ q1: '表示名', q2: 'たろう', q3: '1995年5月8日', q19: '受け取らない' });
  });
});

describe('メール確認の通行証', () => {
  it('正しければメールを返し、改ざん・別の鍵・期限切れは受け付けない', () => {
    const ticket = createTicket('a@example.com', 'secret');
    expect(readTicket(ticket, 'secret')).toBe('a@example.com');
    expect(readTicket(ticket, 'other')).toBeNull();
    expect(readTicket(`${ticket}x`, 'secret')).toBeNull();
    expect(readTicket('', 'secret')).toBeNull();
    const realNow = Date.now;
    Date.now = () => realNow() + 3601 * 1000;
    try {
      expect(readTicket(ticket, 'secret')).toBeNull();
    } finally {
      Date.now = realNow;
    }
  });
});

describe('確認コード', () => {
  it('正しいコードで通行証を受け取れ、同じコードは2度使えない', async () => {
    await saveCode(env.DB, 'survey:a@example.com', '123456', 600);
    const res = await post('/api/survey/verify', { email: 'A@example.com', code: '123456' });
    expect(res.status).toBe(200);
    expect(readTicket((await res.json()).ticket, env.SESSION_SECRET)).toBe('a@example.com');
    expect((await post('/api/survey/verify', { email: 'a@example.com', code: '123456' })).status).toBe(401);
  });

  it('間違ったコードは断り、5回間違えると正しいコードも使えなくなる', async () => {
    await saveCode(env.DB, 'survey:a@example.com', '123456', 600);
    for (let i = 0; i < 5; i += 1) expect((await post('/api/survey/verify', { email: 'a@example.com', code: '000000' })).status).toBe(401);
    expect((await post('/api/survey/verify', { email: 'a@example.com', code: '123456' })).status).toBe(401);
  });

  it('会員のパスワード設定用のコードとは別物(ログイン用のコードでは通らない)', async () => {
    await saveCode(env.DB, 'a@example.com', '123456', 600);
    expect((await post('/api/survey/verify', { email: 'a@example.com', code: '123456' })).status).toBe(401);
  });

  it('コードの送信は、不正なメールは400、同じメールへの連続送信は1通に抑える', async () => {
    expect((await post('/api/survey/send-code', { email: 'bad' })).status).toBe(400);
    expect((await post('/api/survey/send-code', { email: 'a@example.com' })).status).toBe(200);
    await env.DB.prepare('DELETE FROM auth_codes').run();
    expect((await post('/api/survey/send-code', { email: 'a@example.com' })).status).toBe(200);
    // 2回目は間隔の制限で送られない(コードが保存されない)
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM auth_codes').first()).n).toBe(0);
  });

  it('ログイン停止中の会員にはコードを送らない', async () => {
    await seedMember({ email: 'stop@example.com', password: 'password123', status: 'suspended' });
    expect((await post('/api/survey/send-code', { email: 'stop@example.com' })).status).toBe(403);
  });
});

describe('回答の送信', () => {
  it('確認済みの人の回答を保存し、新しい会員として登録する(会員限定で、最新の1件)', async () => {
    await seedQuestions();
    const res = await submit({ ticket: ticketFor('new@example.com'), ...validAnswers, q19: ACCEPT, q5: '' });
    expect(res.status).toBe(200);
    expect((await res.json()).mailed).toBe(true);
    const profile = await env.DB.prepare(`SELECT p.display_name, p.birth_date, p.visibility, p.is_current, m.email
      FROM profiles p JOIN members m ON m.id = p.member_id`).first();
    expect(profile).toMatchObject({ display_name: 'たろう', birth_date: '1995-05-08', visibility: 'members', is_current: 1, email: 'new@example.com' });
    const { results } = await env.DB.prepare('SELECT question_key FROM profile_answers ORDER BY question_key').all();
    expect(results.map((r) => r.question_key)).toEqual(['q1', 'q19', 'q2', 'q3']);
    // お礼メールの送信が記録される
    expect((await env.DB.prepare('SELECT thanks_mail_sent_at FROM form_imports').first()).thanks_mail_sent_at).not.toBeNull();
  });

  it('同じ人が送り直すと、新しい回答が最新になり、古いものは出さない', async () => {
    await seedQuestions();
    await submit({ ticket: ticketFor('a@example.com'), ...validAnswers });
    await submit({ ticket: ticketFor('a@example.com'), ...validAnswers, q2: 'じろう' });
    const { results } = await env.DB.prepare('SELECT display_name, is_current FROM profiles ORDER BY id').all();
    expect(results).toEqual([{ display_name: 'たろう', is_current: 0 }, { display_name: 'じろう', is_current: 1 }]);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM members').first()).n).toBe(1);
  });

  it('通行証が無い・偽物・期限切れは401で、何も保存しない', async () => {
    await seedQuestions();
    expect((await submit({ ...validAnswers })).status).toBe(401);
    expect((await submit({ ticket: 'forged.value', ...validAnswers })).status).toBe(401);
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM profiles').first()).n).toBe(0);
  });

  it('必須が空なら400で、どの設問かを返す。何も保存しない', async () => {
    await seedQuestions();
    const res = await submit({ ticket: ticketFor('a@example.com'), ...validAnswers, q3: '' });
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: 'required', field: 'q3' });
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM members').first()).n).toBe(0);
  });

  it('ログイン停止中の会員は送れない', async () => {
    await seedQuestions();
    await seedMember({ email: 'stop@example.com', password: 'password123', status: 'suspended' });
    expect((await submit({ ticket: ticketFor('stop@example.com'), ...validAnswers })).status).toBe(403);
  });

  it('他のサイトからの送信は断る', async () => {
    await seedQuestions();
    const form = new FormData();
    form.append('ticket', ticketFor('a@example.com'));
    const res = await SELF.fetch('https://example.com/api/survey/submit', { method: 'POST', body: form, headers: { Origin: 'https://evil.example' } });
    expect(res.status).toBe(403);
  });

  it('1時間に11回目の送信は断る', async () => {
    await seedQuestions();
    for (let i = 0; i < 10; i += 1) expect((await submit({ ticket: ticketFor('a@example.com'), ...validAnswers })).status).toBe(200);
    expect((await submit({ ticket: ticketFor('a@example.com'), ...validAnswers })).status).toBe(429);
  });
});

describe('回答の写真', () => {
  const file = (bytes) => new File([new Uint8Array(bytes)], 'p.png', { type: 'image/png' });
  const jpeg = () => new Uint8Array(1000).fill(0x41).map((v, i) => (i < 4 ? [0xff, 0xd8, 0xff, 0xe0][i] : v));

  it('写真なしは null。縮められたら JPEG を返す', async () => {
    expect(await prepareSurveyPhoto(env, null)).toBeNull();
    expect(await prepareSurveyPhoto(env, 'text')).toBeNull();
    expect(await prepareSurveyPhoto(env, file([]))).toBeNull();
    expect(await prepareSurveyPhoto(env, file([1, 2, 3]), { resize: async () => jpeg() })).toHaveLength(1000);
  });

  it('画像でない・縮められない写真は invalid_photo、15MB超は photo_too_large', async () => {
    await expect(prepareSurveyPhoto(env, file([1, 2, 3]), { resize: async () => { throw new Error('x'); } })).rejects.toThrow('invalid_photo');
    await expect(prepareSurveyPhoto(env, file([1, 2, 3]), { resize: async () => new Uint8Array([9, 9, 9, 9]) })).rejects.toThrow('invalid_photo');
    const big = { size: 16 * 1024 * 1024, arrayBuffer: async () => new ArrayBuffer(0) };
    await expect(prepareSurveyPhoto(env, big)).rejects.toThrow('photo_too_large');
  });

  it('写真が縮められないときは、回答を保存せずに400を返す', async () => {
    await seedQuestions();
    const res = await submit({ ticket: ticketFor('a@example.com'), ...validAnswers, photo: new File([new Uint8Array([1, 2, 3])], 'p.txt') });
    expect(res.status).toBe(400);
    expect((await res.json()).error).toBe('invalid_photo');
    expect((await env.DB.prepare('SELECT COUNT(*) AS n FROM profiles').first()).n).toBe(0);
  });
});

describe('SNS・リンク', () => {
  it('@ID・URL・ドメイン入りの書き方を、同じ形のURLにそろえる', () => {
    expect(normalizeSnsLink('sns_x', '@taro_95')).toBe('https://x.com/taro_95');
    expect(normalizeSnsLink('sns_x', 'taro_95')).toBe('https://x.com/taro_95');
    expect(normalizeSnsLink('sns_x', 'https://twitter.com/taro_95')).toBe('https://twitter.com/taro_95');
    expect(normalizeSnsLink('sns_instagram', '@taro.95')).toBe('https://www.instagram.com/taro.95/');
    expect(normalizeSnsLink('sns_instagram', 'instagram.com/taro.95')).toBe('https://instagram.com/taro.95');
    expect(normalizeSnsLink('sns_tiktok', '@taro')).toBe('https://www.tiktok.com/@taro');
    expect(normalizeSnsLink('sns_youtube', '@taro')).toBe('https://www.youtube.com/@taro');
    expect(normalizeSnsLink('sns_youtube', 'https://www.youtube.com/channel/UCabc')).toBe('https://www.youtube.com/channel/UCabc');
    expect(normalizeSnsLink('sns_other', 'example.com/blog')).toBe('https://example.com/blog');
    expect(normalizeSnsLink('sns_other', 'http://example.com')).toBe('https://example.com/');
  });

  it('別のサイトのURL・危険な書き方・おかしな入力は受け付けない', () => {
    expect(normalizeSnsLink('sns_x', 'https://evil.example/taro')).toBeNull();
    expect(normalizeSnsLink('sns_x', 'https://notx.com/taro')).toBeNull();
    expect(normalizeSnsLink('sns_x', 'https://x.com.evil.example/taro')).toBeNull();
    expect(normalizeSnsLink('sns_other', 'javascript:alert(1)')).toBeNull();
    expect(normalizeSnsLink('sns_other', 'data:text/html,hi')).toBeNull();
    expect(normalizeSnsLink('sns_other', 'https://user:pass@example.com')).toBeNull();
    expect(normalizeSnsLink('sns_other', 'localhost')).toBeNull();
    expect(normalizeSnsLink('sns_other', 'あいうえお')).toBeNull();
    expect(normalizeSnsLink('sns_x', '@あいう')).toBeNull();
    expect(normalizeSnsLink('sns_other', `https://example.com/${'a'.repeat(500)}`)).toBeNull();
    expect(normalizeSnsLink('q1', 'https://example.com')).toBeNull();
  });

  it('回答の送信でURLにそろえて保存し、おかしなリンクは400で断る', async () => {
    await seedQuestions();
    const bad = await submit({ ticket: ticketFor('a@example.com'), ...validAnswers, sns_x: 'https://evil.example/a' });
    expect(bad.status).toBe(400);
    expect(await bad.json()).toEqual({ error: 'invalid_link', field: 'sns_x' });
    expect((await submit({ ticket: ticketFor('a@example.com'), ...validAnswers, sns_x: '@taro_95', sns_other: 'example.com' })).status).toBe(200);
    const { results } = await env.DB.prepare("SELECT question_key, answer FROM profile_answers WHERE question_key LIKE 'sns_%' ORDER BY question_key").all();
    expect(results).toEqual([{ question_key: 'sns_other', answer: 'https://example.com/' }, { question_key: 'sns_x', answer: 'https://x.com/taro_95' }]);
  });

  it('プロフィールでは、項目の一覧に混ぜず、アイコン用の links として返す。http(s)以外は出さない', async () => {
    await seedQuestions();
    await submit({ ticket: ticketFor('a@example.com'), ...validAnswers, sns_x: '@taro_95' });
    const profile = await env.DB.prepare('SELECT id, slug FROM profiles').first();
    await env.DB.prepare("INSERT INTO profile_answers (profile_id, question_key, answer) VALUES (?, 'sns_other', 'javascript:alert(1)')").bind(profile.id).run();
    const { profile: shown } = await getProfile(env.DB, profile.slug);
    expect(shown.links).toEqual([{ kind: 'x', label: 'X(旧Twitter)', url: 'https://x.com/taro_95' }]);
    expect(shown.items.map((i) => i.label)).not.toContain('X(旧Twitter)');
  });
});

describe('お礼メールの再送', () => {
  // 回答を1件保存し、お礼メールが未送信で、指定の時間(SQLite の修飾子)前に取り込まれた状態にする
  async function seedUnsent(age, choice = '受け取らない') {
    await seedQuestions();
    await submit({ ticket: ticketFor('a@example.com'), ...validAnswers, q19: choice });
    await env.DB.prepare("UPDATE form_imports SET thanks_mail_sent_at = NULL, imported_at = datetime('now', ?)").bind(age).run();
  }
  const sentAt = async () => (await env.DB.prepare('SELECT thanks_mail_sent_at AS t FROM form_imports').first()).t;

  it('送れなかった回答のお礼メールを送り、送信済みとして記録する', async () => {
    await seedUnsent('-5 minutes');
    expect(await retryThanksMails(env)).toBe(1);
    expect(await sentAt()).not.toBeNull();
    // 送信済みなので、2回目は何もしない
    expect(await retryThanksMails(env)).toBe(0);
  });

  it('回答の直後(2分以内)のものと、1日以上たったものは送らない', async () => {
    await seedUnsent('-30 seconds');
    expect(await retryThanksMails(env)).toBe(0);
    expect(await sentAt()).toBeNull();
    await env.DB.prepare("UPDATE form_imports SET imported_at = datetime('now', '-2 days')").run();
    expect(await retryThanksMails(env)).toBe(0);
    expect(await sentAt()).toBeNull();
  });

  it('お礼メールの対象外の回答は、送らずに「対象外」と記録して、次回以降は見ない', async () => {
    await seedUnsent('-5 minutes');
    await env.DB.prepare("DELETE FROM profile_answers WHERE question_key = 'q19'").run();
    expect(await retryThanksMails(env)).toBe(0);
    expect(await sentAt()).toBe('skipped');
  });
});
