import {
  registerSchema,
  loginSchema,
  createTimesheetSchema,
  copyPreviousWeekSchema,
  timeEntrySchema,
  updateTimesheetSchema,
  createProjectSchema,
  updateProjectSchema,
  createUserSchema,
  updateUserSchema,
  createLeaveRequestSchema,
  updateLeaveRequestSchema,
  cancelLeaveSchema,
  createLeaveTypeSchema,
  updateLeaveTypeSchema,
  createHolidaySchema,
  updateSettingsSchema,
  rejectTimesheetSchema,
  rejectLeaveSchema,
  approveLeaveSchema,
  assignManagersSchema,
} from '../../types/schemas.js';

// ──────────────────────────────────────────────────────────────────
//  Auth schemas
// ──────────────────────────────────────────────────────────────────

describe('registerSchema', () => {
  it('accepts valid input', () => {
    const result = registerSchema.safeParse({
      orgName: 'Acme Corp',
      name: 'Alice',
      email: 'alice@acme.com',
      password: 'Password123!',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing orgName', () => {
    const result = registerSchema.safeParse({
      name: 'Alice',
      email: 'alice@acme.com',
      password: 'Password123!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid email', () => {
    const result = registerSchema.safeParse({
      orgName: 'Acme',
      name: 'Alice',
      email: 'not-an-email',
      password: 'Password123!',
    });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = registerSchema.safeParse({
      orgName: 'Acme',
      name: 'Alice',
      email: 'alice@acme.com',
      password: '123',
    });
    expect(result.success).toBe(false);
  });
});

describe('loginSchema', () => {
  it('accepts valid input', () => {
    const result = loginSchema.safeParse({ email: 'alice@acme.com', password: 'pass' });
    expect(result.success).toBe(true);
  });

  it('rejects missing email', () => {
    const result = loginSchema.safeParse({ password: 'pass' });
    expect(result.success).toBe(false);
  });

  it('rejects empty password', () => {
    const result = loginSchema.safeParse({ email: 'a@b.com', password: '' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
//  Timesheet schemas
// ──────────────────────────────────────────────────────────────────

describe('createTimesheetSchema', () => {
  it('accepts valid date string', () => {
    const result = createTimesheetSchema.safeParse({ weekStartDate: '2026-03-09' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid date', () => {
    const result = createTimesheetSchema.safeParse({ weekStartDate: 'not-a-date' });
    expect(result.success).toBe(false);
  });

  it('rejects missing field', () => {
    const result = createTimesheetSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('copyPreviousWeekSchema', () => {
  it('accepts valid date', () => {
    const result = copyPreviousWeekSchema.safeParse({ targetWeekStartDate: '2026-03-16' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid date', () => {
    const result = copyPreviousWeekSchema.safeParse({ targetWeekStartDate: 'xyz' });
    expect(result.success).toBe(false);
  });
});

describe('timeEntrySchema', () => {
  it('accepts minimal valid entry', () => {
    const result = timeEntrySchema.safeParse({ projectId: 1 });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.monHours).toBe(0);
      expect(result.data.billable).toBe(true);
    }
  });

  it('accepts full entry', () => {
    const result = timeEntrySchema.safeParse({
      projectId: 5,
      billable: false,
      monHours: 8,
      monDesc: 'Work',
      tueHours: 7.5,
      wedHours: 8,
      thuHours: 8,
      friHours: 4,
      satHours: 0,
      sunHours: 0,
    });
    expect(result.success).toBe(true);
  });

  it('rejects negative hours', () => {
    const result = timeEntrySchema.safeParse({ projectId: 1, monHours: -5 });
    expect(result.success).toBe(false);
  });

  it('rejects missing projectId', () => {
    const result = timeEntrySchema.safeParse({ monHours: 8 });
    expect(result.success).toBe(false);
  });

  it('rejects non-positive projectId', () => {
    const result = timeEntrySchema.safeParse({ projectId: 0 });
    expect(result.success).toBe(false);
  });

  it('allows nullable descriptions', () => {
    const result = timeEntrySchema.safeParse({ projectId: 1, monDesc: null });
    expect(result.success).toBe(true);
  });
});

describe('updateTimesheetSchema', () => {
  it('accepts entries array', () => {
    const result = updateTimesheetSchema.safeParse({
      entries: [{ projectId: 1, monHours: 8 }],
    });
    expect(result.success).toBe(true);
  });

  it('accepts empty entries', () => {
    const result = updateTimesheetSchema.safeParse({ entries: [] });
    expect(result.success).toBe(true);
  });

  it('accepts empty object', () => {
    const result = updateTimesheetSchema.safeParse({});
    expect(result.success).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
//  Project schemas
// ──────────────────────────────────────────────────────────────────

describe('createProjectSchema', () => {
  it('accepts valid project', () => {
    const result = createProjectSchema.safeParse({
      code: 'PRJ-001',
      name: 'New Project',
      client: 'Client Inc',
    });
    expect(result.success).toBe(true);
  });

  it('accepts with optional fields', () => {
    const result = createProjectSchema.safeParse({
      code: 'PRJ-002',
      name: 'Project',
      client: 'Client',
      budgetHours: 100,
      managerIds: [1, 2],
      employeeIds: [3, 4],
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing code', () => {
    const result = createProjectSchema.safeParse({ name: 'X', client: 'Y' });
    expect(result.success).toBe(false);
  });

  it('rejects empty name', () => {
    const result = createProjectSchema.safeParse({ code: 'X', name: '', client: 'Y' });
    expect(result.success).toBe(false);
  });
});

describe('updateProjectSchema', () => {
  it('accepts partial update', () => {
    const result = updateProjectSchema.safeParse({ name: 'Updated' });
    expect(result.success).toBe(true);
  });

  it('accepts status change', () => {
    const result = updateProjectSchema.safeParse({ status: 'inactive' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = updateProjectSchema.safeParse({ status: 'deleted' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
//  User schemas
// ──────────────────────────────────────────────────────────────────

describe('createUserSchema', () => {
  it('accepts valid user', () => {
    const result = createUserSchema.safeParse({
      name: 'Bob',
      email: 'bob@test.com',
      password: 'Password123!',
    });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.role).toBe('EMPLOYEE');
  });

  it('accepts all roles', () => {
    for (const role of ['EMPLOYEE', 'MANAGER', 'ADMIN']) {
      const result = createUserSchema.safeParse({
        name: 'X', email: 'x@x.com', password: '12345678', role,
      });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid role', () => {
    const result = createUserSchema.safeParse({
      name: 'X', email: 'x@x.com', password: '12345678', role: 'SUPERADMIN',
    });
    expect(result.success).toBe(false);
  });

  it('rejects short password', () => {
    const result = createUserSchema.safeParse({
      name: 'X', email: 'x@x.com', password: '1234',
    });
    expect(result.success).toBe(false);
  });
});

describe('updateUserSchema', () => {
  it('accepts partial update', () => {
    const result = updateUserSchema.safeParse({ name: 'Updated Name' });
    expect(result.success).toBe(true);
  });

  it('accepts status update', () => {
    const result = updateUserSchema.safeParse({ status: 'inactive' });
    expect(result.success).toBe(true);
  });

  it('rejects invalid status', () => {
    const result = updateUserSchema.safeParse({ status: 'deleted' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
//  Leave schemas
// ──────────────────────────────────────────────────────────────────

describe('createLeaveRequestSchema', () => {
  it('accepts valid request', () => {
    const result = createLeaveRequestSchema.safeParse({
      leaveTypeId: 1,
      startDate: '2026-07-20',
      endDate: '2026-07-24',
    });
    expect(result.success).toBe(true);
  });

  it('accepts with reason', () => {
    const result = createLeaveRequestSchema.safeParse({
      leaveTypeId: 1,
      startDate: '2026-07-20',
      endDate: '2026-07-24',
      reason: 'Family trip',
    });
    expect(result.success).toBe(true);
  });

  it('rejects missing leaveTypeId', () => {
    const result = createLeaveRequestSchema.safeParse({
      startDate: '2026-07-20',
      endDate: '2026-07-24',
    });
    expect(result.success).toBe(false);
  });

  it('rejects invalid dates', () => {
    const result = createLeaveRequestSchema.safeParse({
      leaveTypeId: 1,
      startDate: 'bad',
      endDate: '2026-07-24',
    });
    expect(result.success).toBe(false);
  });
});

describe('cancelLeaveSchema', () => {
  it('accepts with reason', () => {
    const result = cancelLeaveSchema.safeParse({ cancelReason: 'Plans changed' });
    expect(result.success).toBe(true);
  });

  it('accepts without reason', () => {
    const result = cancelLeaveSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts null reason', () => {
    const result = cancelLeaveSchema.safeParse({ cancelReason: null });
    expect(result.success).toBe(true);
  });
});

// ──────────────────────────────────────────────────────────────────
//  Leave type schemas
// ──────────────────────────────────────────────────────────────────

describe('createLeaveTypeSchema', () => {
  it('accepts valid input', () => {
    const result = createLeaveTypeSchema.safeParse({ name: 'Annual' });
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.annualQuota).toBe(20);
      expect(result.data.paid).toBe(true);
    }
  });

  it('rejects empty name', () => {
    const result = createLeaveTypeSchema.safeParse({ name: '' });
    expect(result.success).toBe(false);
  });

  it('rejects negative quota', () => {
    const result = createLeaveTypeSchema.safeParse({ name: 'X', annualQuota: -5 });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
//  Holiday schema
// ──────────────────────────────────────────────────────────────────

describe('createHolidaySchema', () => {
  it('accepts valid holiday', () => {
    const result = createHolidaySchema.safeParse({ name: 'Christmas', date: '2026-12-25' });
    expect(result.success).toBe(true);
  });

  it('accepts recurring flag', () => {
    const result = createHolidaySchema.safeParse({
      name: 'New Year', date: '2026-01-01', recurring: true,
    });
    expect(result.success).toBe(true);
  });

  it('rejects invalid date', () => {
    const result = createHolidaySchema.safeParse({ name: 'X', date: 'not-valid' });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
//  Settings schema
// ──────────────────────────────────────────────────────────────────

describe('updateSettingsSchema', () => {
  it('accepts empty object', () => {
    const result = updateSettingsSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts valid settings', () => {
    const result = updateSettingsSchema.safeParse({
      maxHoursPerDay: 12,
      maxHoursPerWeek: 60,
      mandatoryDesc: true,
      allowBackdated: false,
    });
    expect(result.success).toBe(true);
  });

  it('rejects maxHoursPerDay > 24', () => {
    const result = updateSettingsSchema.safeParse({ maxHoursPerDay: 30 });
    expect(result.success).toBe(false);
  });

  it('rejects maxHoursPerWeek > 168', () => {
    const result = updateSettingsSchema.safeParse({ maxHoursPerWeek: 200 });
    expect(result.success).toBe(false);
  });

  it('rejects invalid timeIncrement', () => {
    const result = updateSettingsSchema.safeParse({ timeIncrement: 45 });
    expect(result.success).toBe(false);
  });

  it('accepts valid timeIncrement values', () => {
    for (const val of [15, 30, 60]) {
      const result = updateSettingsSchema.safeParse({ timeIncrement: val });
      expect(result.success).toBe(true);
    }
  });

  it('rejects invalid workWeekStart', () => {
    const result = updateSettingsSchema.safeParse({ workWeekStart: 'tuesday' });
    expect(result.success).toBe(false);
  });

  it('rejects invalid leaveApprovalLevels', () => {
    const result = updateSettingsSchema.safeParse({ leaveApprovalLevels: 3 });
    expect(result.success).toBe(false);
  });
});

// ──────────────────────────────────────────────────────────────────
//  Approval schemas
// ──────────────────────────────────────────────────────────────────

describe('rejectTimesheetSchema', () => {
  it('accepts with reason', () => {
    const result = rejectTimesheetSchema.safeParse({ reason: 'Please add details' });
    expect(result.success).toBe(true);
  });

  it('rejects empty reason', () => {
    const result = rejectTimesheetSchema.safeParse({ reason: '' });
    expect(result.success).toBe(false);
  });

  it('rejects missing reason', () => {
    const result = rejectTimesheetSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});

describe('rejectLeaveSchema', () => {
  it('accepts with comment', () => {
    const result = rejectLeaveSchema.safeParse({ comment: 'Busy period' });
    expect(result.success).toBe(true);
  });

  it('rejects empty comment', () => {
    const result = rejectLeaveSchema.safeParse({ comment: '' });
    expect(result.success).toBe(false);
  });
});

describe('approveLeaveSchema', () => {
  it('accepts with comment', () => {
    const result = approveLeaveSchema.safeParse({ comment: 'Enjoy!' });
    expect(result.success).toBe(true);
  });

  it('accepts without comment', () => {
    const result = approveLeaveSchema.safeParse({});
    expect(result.success).toBe(true);
  });

  it('accepts null comment', () => {
    const result = approveLeaveSchema.safeParse({ comment: null });
    expect(result.success).toBe(true);
  });
});

describe('assignManagersSchema', () => {
  it('accepts valid manager IDs', () => {
    const result = assignManagersSchema.safeParse({ managerIds: [1, 2, 3] });
    expect(result.success).toBe(true);
  });

  it('accepts empty array', () => {
    const result = assignManagersSchema.safeParse({ managerIds: [] });
    expect(result.success).toBe(true);
  });

  it('rejects non-positive IDs', () => {
    const result = assignManagersSchema.safeParse({ managerIds: [0] });
    expect(result.success).toBe(false);
  });

  it('rejects missing field', () => {
    const result = assignManagersSchema.safeParse({});
    expect(result.success).toBe(false);
  });
});
