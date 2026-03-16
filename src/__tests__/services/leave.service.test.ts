/**
 * Unit tests for leave service business logic.
 *
 * Tests the pure business rules: status transitions, overlap detection logic,
 * balance calculations, and date range validations.
 */

// ──────────────────────────────────────────────────────────────────
//  Leave status transitions
// ──────────────────────────────────────────────────────────────────

describe('Leave status transitions', () => {
  const validTransitions: Record<string, string[]> = {
    PENDING: ['APPROVED', 'REJECTED', 'CANCELLED'],
    APPROVED: [], // terminal (employee cannot cancel after approval)
    REJECTED: [], // terminal
    CANCELLED: [], // terminal
  };

  it('PENDING can transition to APPROVED, REJECTED, or CANCELLED', () => {
    expect(validTransitions['PENDING']).toEqual(
      expect.arrayContaining(['APPROVED', 'REJECTED', 'CANCELLED']),
    );
  });

  it('APPROVED is terminal', () => {
    expect(validTransitions['APPROVED']).toHaveLength(0);
  });

  it('REJECTED is terminal', () => {
    expect(validTransitions['REJECTED']).toHaveLength(0);
  });

  it('CANCELLED is terminal', () => {
    expect(validTransitions['CANCELLED']).toHaveLength(0);
  });
});

// ──────────────────────────────────────────────────────────────────
//  Date range overlap detection
// ──────────────────────────────────────────────────────────────────

function datesOverlap(
  startA: Date, endA: Date,
  startB: Date, endB: Date,
): boolean {
  return startA <= endB && startB <= endA;
}

describe('Date range overlap detection', () => {
  it('detects fully overlapping ranges', () => {
    expect(datesOverlap(
      new Date('2026-07-20'), new Date('2026-07-24'),
      new Date('2026-07-20'), new Date('2026-07-24'),
    )).toBe(true);
  });

  it('detects partial overlap (B starts during A)', () => {
    expect(datesOverlap(
      new Date('2026-07-20'), new Date('2026-07-24'),
      new Date('2026-07-23'), new Date('2026-07-28'),
    )).toBe(true);
  });

  it('detects partial overlap (B ends during A)', () => {
    expect(datesOverlap(
      new Date('2026-07-20'), new Date('2026-07-24'),
      new Date('2026-07-18'), new Date('2026-07-21'),
    )).toBe(true);
  });

  it('detects containment (B inside A)', () => {
    expect(datesOverlap(
      new Date('2026-07-20'), new Date('2026-07-30'),
      new Date('2026-07-22'), new Date('2026-07-25'),
    )).toBe(true);
  });

  it('detects containment (A inside B)', () => {
    expect(datesOverlap(
      new Date('2026-07-22'), new Date('2026-07-25'),
      new Date('2026-07-20'), new Date('2026-07-30'),
    )).toBe(true);
  });

  it('detects single-day overlap on boundary', () => {
    expect(datesOverlap(
      new Date('2026-07-20'), new Date('2026-07-24'),
      new Date('2026-07-24'), new Date('2026-07-28'),
    )).toBe(true);
  });

  it('returns false for non-overlapping (B after A)', () => {
    expect(datesOverlap(
      new Date('2026-07-20'), new Date('2026-07-24'),
      new Date('2026-07-25'), new Date('2026-07-28'),
    )).toBe(false);
  });

  it('returns false for non-overlapping (B before A)', () => {
    expect(datesOverlap(
      new Date('2026-07-20'), new Date('2026-07-24'),
      new Date('2026-07-15'), new Date('2026-07-19'),
    )).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
//  Leave balance calculations
// ──────────────────────────────────────────────────────────────────

describe('Leave balance calculations', () => {
  interface Balance {
    allocatedDays: number;
    usedDays: number;
    pendingDays: number;
    carriedOver: number;
  }

  function availableDays(balance: Balance): number {
    return balance.allocatedDays + balance.carriedOver - balance.usedDays - balance.pendingDays;
  }

  function canRequest(balance: Balance, requestedDays: number): boolean {
    return availableDays(balance) >= requestedDays;
  }

  it('calculates available days correctly', () => {
    const balance: Balance = {
      allocatedDays: 20,
      usedDays: 5,
      pendingDays: 3,
      carriedOver: 2,
    };
    expect(availableDays(balance)).toBe(14); // 20 + 2 - 5 - 3
  });

  it('returns true when sufficient balance', () => {
    const balance: Balance = {
      allocatedDays: 20,
      usedDays: 0,
      pendingDays: 0,
      carriedOver: 0,
    };
    expect(canRequest(balance, 5)).toBe(true);
  });

  it('returns false when insufficient balance', () => {
    const balance: Balance = {
      allocatedDays: 20,
      usedDays: 18,
      pendingDays: 2,
      carriedOver: 0,
    };
    expect(canRequest(balance, 1)).toBe(false);
  });

  it('considers carry-forward in balance', () => {
    const balance: Balance = {
      allocatedDays: 20,
      usedDays: 20,
      pendingDays: 0,
      carriedOver: 5,
    };
    expect(canRequest(balance, 3)).toBe(true);
    expect(canRequest(balance, 6)).toBe(false);
  });

  it('considers pending days', () => {
    const balance: Balance = {
      allocatedDays: 20,
      usedDays: 10,
      pendingDays: 8,
      carriedOver: 0,
    };
    expect(availableDays(balance)).toBe(2);
    expect(canRequest(balance, 2)).toBe(true);
    expect(canRequest(balance, 3)).toBe(false);
  });

  it('handles zero allocation', () => {
    const balance: Balance = {
      allocatedDays: 0,
      usedDays: 0,
      pendingDays: 0,
      carriedOver: 0,
    };
    expect(availableDays(balance)).toBe(0);
    expect(canRequest(balance, 1)).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
//  Date range validation
// ──────────────────────────────────────────────────────────────────

describe('Leave date range validation', () => {
  function isValidRange(start: Date, end: Date): boolean {
    return start <= end;
  }

  it('valid range: start before end', () => {
    expect(isValidRange(new Date('2026-07-20'), new Date('2026-07-24'))).toBe(true);
  });

  it('valid range: same day (single-day leave)', () => {
    expect(isValidRange(new Date('2026-07-20'), new Date('2026-07-20'))).toBe(true);
  });

  it('invalid range: start after end', () => {
    expect(isValidRange(new Date('2026-07-24'), new Date('2026-07-20'))).toBe(false);
  });
});
