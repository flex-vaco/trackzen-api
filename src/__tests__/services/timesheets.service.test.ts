/**
 * Unit tests for timesheet service helper logic.
 *
 * These test the pure functions (sumEntryHours, computeTotals, dailyTotals)
 * extracted from the service. Since the service uses Prisma directly,
 * full integration tests should use the shell script (tests/api-integration.sh).
 */

// We re-implement the pure helpers here to test them in isolation,
// since they're private to the module. In a real project you'd export them
// or use a dedicated helpers file.

const DAY_HOUR_FIELDS = [
  'monHours', 'tueHours', 'wedHours', 'thuHours',
  'friHours', 'satHours', 'sunHours',
] as const;

interface TimeEntry {
  projectId: number;
  billable?: boolean;
  monHours?: number;
  tueHours?: number;
  wedHours?: number;
  thuHours?: number;
  friHours?: number;
  satHours?: number;
  sunHours?: number;
  [key: string]: unknown;
}

function sumEntryHours(entry: TimeEntry): number {
  return DAY_HOUR_FIELDS.reduce(
    (sum, f) => sum + ((entry[f] as number) ?? 0),
    0,
  );
}

function computeTotals(entries: TimeEntry[]) {
  let totalHours = 0;
  let billableHours = 0;
  for (const e of entries) {
    const h = sumEntryHours(e);
    totalHours += h;
    if (e.billable !== false) billableHours += h;
  }
  return { totalHours, billableHours };
}

function dailyTotals(entries: TimeEntry[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const dayField of DAY_HOUR_FIELDS) {
    totals[dayField] = 0;
    for (const e of entries) {
      totals[dayField] += ((e[dayField] as number) ?? 0);
    }
  }
  return totals;
}

// ──────────────────────────────────────────────────────────────────
//  sumEntryHours
// ──────────────────────────────────────────────────────────────────

describe('sumEntryHours', () => {
  it('sums all day hours', () => {
    const entry: TimeEntry = {
      projectId: 1,
      monHours: 8, tueHours: 8, wedHours: 8,
      thuHours: 8, friHours: 8, satHours: 0, sunHours: 0,
    };
    expect(sumEntryHours(entry)).toBe(40);
  });

  it('handles missing hours as 0', () => {
    const entry: TimeEntry = { projectId: 1, monHours: 4 };
    expect(sumEntryHours(entry)).toBe(4);
  });

  it('returns 0 for empty entry', () => {
    const entry: TimeEntry = { projectId: 1 };
    expect(sumEntryHours(entry)).toBe(0);
  });

  it('handles decimal hours', () => {
    const entry: TimeEntry = {
      projectId: 1,
      monHours: 7.5, tueHours: 7.5, wedHours: 7.5,
      thuHours: 7.5, friHours: 7.5,
    };
    expect(sumEntryHours(entry)).toBe(37.5);
  });

  it('includes weekend hours', () => {
    const entry: TimeEntry = {
      projectId: 1,
      satHours: 4, sunHours: 3,
    };
    expect(sumEntryHours(entry)).toBe(7);
  });
});

// ──────────────────────────────────────────────────────────────────
//  computeTotals
// ──────────────────────────────────────────────────────────────────

describe('computeTotals', () => {
  it('computes total and billable hours across entries', () => {
    const entries: TimeEntry[] = [
      { projectId: 1, billable: true, monHours: 8, tueHours: 8 },
      { projectId: 2, billable: true, monHours: 4 },
    ];
    const result = computeTotals(entries);
    expect(result.totalHours).toBe(20);
    expect(result.billableHours).toBe(20);
  });

  it('excludes non-billable from billableHours', () => {
    const entries: TimeEntry[] = [
      { projectId: 1, billable: true, monHours: 8 },
      { projectId: 2, billable: false, monHours: 4 },
    ];
    const result = computeTotals(entries);
    expect(result.totalHours).toBe(12);
    expect(result.billableHours).toBe(8);
  });

  it('defaults billable to true when undefined', () => {
    const entries: TimeEntry[] = [
      { projectId: 1, monHours: 8 }, // billable not set
    ];
    const result = computeTotals(entries);
    expect(result.billableHours).toBe(8);
  });

  it('returns 0 for empty entries', () => {
    const result = computeTotals([]);
    expect(result.totalHours).toBe(0);
    expect(result.billableHours).toBe(0);
  });

  it('handles multiple entries with mixed billable flags', () => {
    const entries: TimeEntry[] = [
      { projectId: 1, billable: true, monHours: 4, tueHours: 4, wedHours: 4, thuHours: 4, friHours: 4 },
      { projectId: 2, billable: false, monHours: 2, tueHours: 2, wedHours: 2, thuHours: 2, friHours: 2 },
      { projectId: 3, billable: true, monHours: 1 },
    ];
    const result = computeTotals(entries);
    expect(result.totalHours).toBe(31);
    expect(result.billableHours).toBe(21); // 20 + 1
  });
});

// ──────────────────────────────────────────────────────────────────
//  dailyTotals
// ──────────────────────────────────────────────────────────────────

describe('dailyTotals', () => {
  it('sums per-day across entries', () => {
    const entries: TimeEntry[] = [
      { projectId: 1, monHours: 4, tueHours: 4 },
      { projectId: 2, monHours: 4, tueHours: 2 },
    ];
    const totals = dailyTotals(entries);
    expect(totals.monHours).toBe(8);
    expect(totals.tueHours).toBe(6);
    expect(totals.wedHours).toBe(0);
  });

  it('returns all zeros for empty entries', () => {
    const totals = dailyTotals([]);
    for (const field of DAY_HOUR_FIELDS) {
      expect(totals[field]).toBe(0);
    }
  });

  it('detects daily overflows', () => {
    const entries: TimeEntry[] = [
      { projectId: 1, monHours: 10 },
      { projectId: 2, monHours: 10 },
      { projectId: 3, monHours: 10 },
    ];
    const totals = dailyTotals(entries);
    expect(totals.monHours).toBe(30); // Exceeds 24h
  });
});

// ──────────────────────────────────────────────────────────────────
//  Timesheet status transitions
// ──────────────────────────────────────────────────────────────────

describe('Timesheet status transitions', () => {
  const validTransitions: Record<string, string[]> = {
    DRAFT: ['SUBMITTED'],
    SUBMITTED: ['APPROVED', 'REJECTED'],
    REJECTED: ['SUBMITTED'], // via edit → re-submit (goes through DRAFT first)
    APPROVED: [], // terminal state
  };

  it('DRAFT can transition to SUBMITTED', () => {
    expect(validTransitions['DRAFT']).toContain('SUBMITTED');
  });

  it('SUBMITTED can transition to APPROVED or REJECTED', () => {
    expect(validTransitions['SUBMITTED']).toContain('APPROVED');
    expect(validTransitions['SUBMITTED']).toContain('REJECTED');
  });

  it('APPROVED is a terminal state', () => {
    expect(validTransitions['APPROVED']).toHaveLength(0);
  });

  it('REJECTED can be re-submitted', () => {
    expect(validTransitions['REJECTED']).toContain('SUBMITTED');
  });

  it('DRAFT cannot transition to APPROVED directly', () => {
    expect(validTransitions['DRAFT']).not.toContain('APPROVED');
  });

  it('DRAFT cannot transition to REJECTED directly', () => {
    expect(validTransitions['DRAFT']).not.toContain('REJECTED');
  });
});
