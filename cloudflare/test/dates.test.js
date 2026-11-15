import { describe, expect, it } from 'vitest';
import { formatBirthDate, toIso } from '../src/lib/dates.js';

describe('日付の読み取り', () => {
  it('3つの書き方を ISO に揃える', () => {
    expect(toIso('10/5/2026 22:31:33')).toBe('2026-10-05T22:31:33+09:00');
    expect(toIso('6/11/1995')).toBe('1995-06-11');
    expect(toIso('1995年6月29日')).toBe('1995-06-29');
    expect(toIso('')).toBeNull();
  });

  it('生年月日を「1995年9月6日」の形で表示する', () => {
    expect(formatBirthDate('1995-09-06')).toBe('1995年9月6日');
  });
});
