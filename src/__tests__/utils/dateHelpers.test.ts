import { getWeekStart, getWeekEnd, isInPast, countBusinessDays, formatDateRange } from '../../utils/dateHelpers.js';

describe('dateHelpers', () => {
  // ──────────────────────────────────────────────────────────────────
  //  getWeekStart
  // ──────────────────────────────────────────────────────────────────

  describe('getWeekStart', () => {
    it('returns Monday for a Monday input', () => {
      const date = new Date('2026-03-09'); // Monday
      const result = getWeekStart(date);
      expect(result.getUTCDay()).toBe(1); // Monday
      expect(result.toISOString().slice(0, 10)).toBe('2026-03-09');
    });

    it('returns Monday for a Wednesday input', () => {
      const date = new Date('2026-03-11'); // Wednesday
      const result = getWeekStart(date);
      expect(result.getUTCDay()).toBe(1);
      expect(result.toISOString().slice(0, 10)).toBe('2026-03-09');
    });

    it('returns previous Monday for a Sunday input', () => {
      const date = new Date('2026-03-15'); // Sunday
      const result = getWeekStart(date);
      expect(result.getUTCDay()).toBe(1);
      expect(result.toISOString().slice(0, 10)).toBe('2026-03-09');
    });

    it('returns Monday for a Saturday input', () => {
      const date = new Date('2026-03-14'); // Saturday
      const result = getWeekStart(date);
      expect(result.toISOString().slice(0, 10)).toBe('2026-03-09');
    });

    it('returns Monday for a Friday input', () => {
      const date = new Date('2026-03-13'); // Friday
      const result = getWeekStart(date);
      expect(result.toISOString().slice(0, 10)).toBe('2026-03-09');
    });

    it('zeroes out time components (UTC)', () => {
      const date = new Date('2026-03-11T15:30:45.123Z');
      const result = getWeekStart(date);
      expect(result.getUTCHours()).toBe(0);
      expect(result.getUTCMinutes()).toBe(0);
      expect(result.getUTCSeconds()).toBe(0);
      expect(result.getUTCMilliseconds()).toBe(0);
    });

    it('handles year boundary (Jan 1 2026 is Thursday)', () => {
      const date = new Date('2026-01-01');
      const result = getWeekStart(date);
      expect(result.toISOString().slice(0, 10)).toBe('2025-12-29'); // Previous Monday
    });

    it('does not mutate the input date', () => {
      const date = new Date('2026-03-11T12:00:00Z');
      const original = date.getTime();
      getWeekStart(date);
      expect(date.getTime()).toBe(original);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  //  getWeekEnd
  // ──────────────────────────────────────────────────────────────────

  describe('getWeekEnd', () => {
    it('returns Sunday 23:59:59.999 for a Monday input', () => {
      const date = new Date('2026-03-09'); // Monday
      const result = getWeekEnd(date);
      expect(result.getUTCDay()).toBe(0); // Sunday
      expect(result.toISOString().slice(0, 10)).toBe('2026-03-15');
      expect(result.getUTCHours()).toBe(23);
      expect(result.getUTCMinutes()).toBe(59);
      expect(result.getUTCSeconds()).toBe(59);
    });

    it('returns same-week Sunday for a Wednesday input', () => {
      const date = new Date('2026-03-11');
      const result = getWeekEnd(date);
      expect(result.toISOString().slice(0, 10)).toBe('2026-03-15');
    });

    it('returns same-week Sunday for a Sunday input', () => {
      const date = new Date('2026-03-15');
      const result = getWeekEnd(date);
      expect(result.toISOString().slice(0, 10)).toBe('2026-03-15');
    });
  });

  // ──────────────────────────────────────────────────────────────────
  //  isInPast
  // ──────────────────────────────────────────────────────────────────

  describe('isInPast', () => {
    it('returns true for a date clearly in the past', () => {
      const date = new Date('2020-01-01');
      expect(isInPast(date)).toBe(true);
    });

    it('returns false for a date in the future', () => {
      const date = new Date('2099-12-31');
      expect(isInPast(date)).toBe(false);
    });

    it('returns false for today', () => {
      const today = new Date();
      today.setUTCHours(0, 0, 0, 0);
      expect(isInPast(today)).toBe(false);
    });

    it('returns true for yesterday', () => {
      const yesterday = new Date();
      yesterday.setUTCDate(yesterday.getUTCDate() - 1);
      yesterday.setUTCHours(0, 0, 0, 0);
      expect(isInPast(yesterday)).toBe(true);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  //  countBusinessDays
  // ──────────────────────────────────────────────────────────────────

  describe('countBusinessDays', () => {
    it('counts 5 business days for Mon-Fri', () => {
      const start = new Date('2026-03-09'); // Monday
      const end = new Date('2026-03-13');   // Friday
      expect(countBusinessDays(start, end)).toBe(5);
    });

    it('counts 5 business days for Mon-Sun (skips weekends)', () => {
      const start = new Date('2026-03-09'); // Monday
      const end = new Date('2026-03-15');   // Sunday
      expect(countBusinessDays(start, end)).toBe(5);
    });

    it('counts 0 for weekend-only range', () => {
      const start = new Date('2026-03-14'); // Saturday
      const end = new Date('2026-03-15');   // Sunday
      expect(countBusinessDays(start, end)).toBe(0);
    });

    it('counts 1 for a single business day', () => {
      const start = new Date('2026-03-09');
      const end = new Date('2026-03-09');
      expect(countBusinessDays(start, end)).toBe(1);
    });

    it('excludes holidays', () => {
      const start = new Date('2026-03-09'); // Monday
      const end = new Date('2026-03-13');   // Friday
      const holidays = [new Date('2026-03-11')]; // Wednesday holiday
      expect(countBusinessDays(start, end, holidays)).toBe(4);
    });

    it('excludes multiple holidays', () => {
      const start = new Date('2026-03-09');
      const end = new Date('2026-03-13');
      const holidays = [new Date('2026-03-10'), new Date('2026-03-12')];
      expect(countBusinessDays(start, end, holidays)).toBe(3);
    });

    it('ignores holidays on weekends', () => {
      const start = new Date('2026-03-09');
      const end = new Date('2026-03-15');
      const holidays = [new Date('2026-03-14')]; // Saturday holiday
      expect(countBusinessDays(start, end, holidays)).toBe(5); // No change
    });

    it('counts 10 business days across two weeks', () => {
      const start = new Date('2026-03-09');
      const end = new Date('2026-03-20'); // Friday of next week
      expect(countBusinessDays(start, end)).toBe(10);
    });
  });

  // ──────────────────────────────────────────────────────────────────
  //  formatDateRange
  // ──────────────────────────────────────────────────────────────────

  describe('formatDateRange', () => {
    it('formats a date range string', () => {
      const start = new Date('2026-03-09');
      const end = new Date('2026-03-15');
      const result = formatDateRange(start, end);
      expect(result).toContain('Mar');
      expect(result).toContain('2026');
      expect(result).toContain('–');
    });

    it('handles same month range', () => {
      const start = new Date('2026-06-01');
      const end = new Date('2026-06-30');
      const result = formatDateRange(start, end);
      expect(result).toContain('Jun');
    });

    it('handles cross-month range', () => {
      const start = new Date('2026-03-30');
      const end = new Date('2026-04-05');
      const result = formatDateRange(start, end);
      expect(result).toContain('Mar');
      expect(result).toContain('Apr');
    });
  });
});
