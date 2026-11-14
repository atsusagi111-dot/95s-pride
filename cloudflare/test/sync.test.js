import { describe, expect, it } from 'vitest';
import { env } from 'cloudflare:test';
import { parseQuestions, parseResponseRow, toIso } from '../src/lib/sheet-rows.js';
import { syncResponses } from '../src/lib/sync.js';

// シートの読み取りを差し替えて、取り込みの流れだけを確かめる
let sheetRows = [];
const fetchRows = async () => sheetRows;

const HEADERS = ['Timestamp', 'Q1 オプチャの表示名', 'Q2 名前 (呼ばれたいニックネーム)', 'Q3 生年月日', 'Email Address', 'Q19 プロフィール回答特典について'];

describe('日付の読み取り', () => {
  it('3つの書き方を ISO に揃える', () => {
    expect(toIso('10/5/2026 22:31:33')).toBe('2026-10-05T22:31:33+09:00');
    expect(toIso('6/11/1995')).toBe('1995-06-11');
    expect(toIso('1995年6月29日')).toBe('1995-06-29');
    expect(toIso('')).toBeNull();
  });
});

describe('設問の読み取り', () => {
  it('Q番号付きの見出しだけを設問にし、メールや特典は非公開にする', () => {
    const questions = parseQuestions(HEADERS);
    expect(questions.map((q) => q.key)).toEqual(['q1', 'q2', 'q3', 'q19']);
    expect(questions.find((q) => q.key === 'q1').isTitle).toBe(1);
    expect(questions.find((q) => q.key === 'q19').isPublic).toBe(0);
    const row = parseResponseRow(['10/5/2026 22:31:33', '表示名', '太郎', '9/6/1995', 'Taro@Example.com', '受け取らない'], questions, 4);
    expect(row.email).toBe('taro@example.com');
    expect(row.birthDate).toBe('1995-09-06');
    expect(row.answers.q19).toBe('受け取らない');
  });
});

describe('フォーム回答の取り込み', () => {
  it('新しい回答だけ取り込み、同じ人の2回目は最新だけ表示し、お礼メールは1回だけ', async () => {
    sheetRows = ([
      HEADERS,
      ['10/5/2026 22:31:33', '表示名', '太郎', '9/6/1995', 'taro@example.com', '受け取らない'],
      ['', '', '', '', '', ''],
      ['10/6/2026 10:00:00', '表示名2', '花子', '1995年1月2日', 'hanako@example.com', ''],
    ]);
    const first = await syncResponses(env, fetchRows);
    expect(first).toEqual({ imported: 2, mailed: 1, skipped: 0 });

    // 2回目: 変化なし
    expect(await syncResponses(env, fetchRows)).toEqual({ imported: 0, mailed: 0, skipped: 0 });

    // 太郎が再回答、新しい設問 Q20 が増えた
    sheetRows = ([
      [...HEADERS, 'Q20 新しい設問'],
      ['10/5/2026 22:31:33', '表示名', '太郎', '9/6/1995', 'taro@example.com', '受け取らない', ''],
      ['10/6/2026 10:00:00', '表示名2', '花子', '1995年1月2日', 'hanako@example.com', '', ''],
      ['10/7/2026 12:00:00', '表示名3', '太郎2', '9/6/1995', 'taro@example.com', '受け取らない', '秘密'],
    ]);
    expect(await syncResponses(env, fetchRows)).toEqual({ imported: 1, mailed: 1, skipped: 0 });

    const members = await env.DB.prepare('SELECT count(*) AS n FROM members').first();
    expect(members.n).toBe(2);
    const current = await env.DB.prepare('SELECT display_name, visibility FROM profiles WHERE member_id = (SELECT id FROM members WHERE email = ?) AND is_current = 1').bind('taro@example.com').all();
    expect(current.results).toEqual([{ display_name: '太郎2', visibility: 'members' }]);
    // 新しい設問は非公開で登録される
    const q20 = await env.DB.prepare('SELECT is_public FROM questions WHERE key = ?').bind('q20').first();
    expect(q20.is_public).toBe(0);
  });

  it('THANKS_MAIL_SINCE より前の回答にはお礼メールを送らない', async () => {
    sheetRows = [
      HEADERS,
      ['10/5/2026 22:31:33', '表示名', '太郎', '9/6/1995', 'taro@example.com', '受け取らない'],
      ['12/1/2026 10:00:00', '表示名2', '花子', '1/2/1995', 'hanako@example.com', '受け取らない'],
    ];
    const result = await syncResponses({ ...env, THANKS_MAIL_SINCE: '2026-11-14T12:00:00+09:00' }, fetchRows);
    expect(result).toEqual({ imported: 2, mailed: 1, skipped: 0 });
    const rows = await env.DB.prepare('SELECT response_key, thanks_mail_sent_at FROM form_imports ORDER BY response_key').all();
    expect(rows.results[0].thanks_mail_sent_at).toBe('skipped');
    expect(rows.results[1].thanks_mail_sent_at).not.toBe('skipped');
  });

  it('日時の鍵が違っても、同じ人の同じ行があれば二重に取り込まない', async () => {
    sheetRows = [HEADERS, ['10/5/2026 22:31:33', '表示名', '太郎', '9/6/1995', 'taro@example.com', '']];
    expect(await syncResponses(env, fetchRows)).toEqual({ imported: 1, mailed: 0, skipped: 0 });
    // 日時の表記が変わった(鍵が一致しない)
    sheetRows = [HEADERS, ['10/5/2026 22:31:34', '表示名', '太郎', '9/6/1995', 'taro@example.com', '']];
    expect(await syncResponses(env, fetchRows)).toEqual({ imported: 0, mailed: 0, skipped: 1 });
    const n = await env.DB.prepare('SELECT count(*) AS n FROM profiles').first();
    expect(n.n).toBe(1);
  });
});
