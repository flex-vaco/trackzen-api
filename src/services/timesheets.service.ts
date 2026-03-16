import { prisma } from '../utils/db.js';
import { AppError } from '../types/errors.js';
import { ERROR_CODES, TIMESHEET_STATUS, PAGINATION } from '../utils/constants.js';
import { getWeekStart, getWeekEnd, isInPast } from '../utils/dateHelpers.js';
import { logger } from '../utils/logger.js';
import type { TimeEntryInput } from '../types/index.js';
import type { UserRole } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const DAY_HOUR_FIELDS = [
  'monHours', 'tueHours', 'wedHours', 'thuHours',
  'friHours', 'satHours', 'sunHours',
] as const;

const DAY_DESC_FIELDS = [
  'monDesc', 'tueDesc', 'wedDesc', 'thuDesc',
  'friDesc', 'satDesc', 'sunDesc',
] as const;

function sumEntryHours(entry: Record<string, unknown>): number {
  return DAY_HOUR_FIELDS.reduce(
    (sum, f) => sum + ((entry[f] as number) ?? 0),
    0,
  );
}

function computeTotals(entries: TimeEntryInput[]) {
  let totalHours = 0;
  let billableHours = 0;
  for (const e of entries) {
    const h = sumEntryHours(e as unknown as Record<string, unknown>);
    totalHours += h;
    if (e.billable !== false) billableHours += h;
  }
  return { totalHours, billableHours };
}

/** Per-day totals across all entries (for maxHoursPerDay check). */
function dailyTotals(entries: TimeEntryInput[]): Record<string, number> {
  const totals: Record<string, number> = {};
  for (const dayField of DAY_HOUR_FIELDS) {
    totals[dayField] = 0;
    for (const e of entries) {
      totals[dayField] += ((e as unknown as Record<string, unknown>)[dayField] as number) ?? 0;
    }
  }
  return totals;
}

async function getOrgSettings(orgId: number) {
  const settings = await prisma.orgSettings.findUnique({
    where: { organisationId: orgId },
  });
  if (!settings) {
    throw AppError.internal('Organisation settings not found');
  }
  return settings;
}

async function assertEditableStatus(timesheetId: number, orgId: number) {
  const ts = await prisma.timesheet.findFirst({
    where: { id: timesheetId, organisationId: orgId },
  });
  if (!ts) throw AppError.notFound('Timesheet not found');
  if (ts.status !== TIMESHEET_STATUS.DRAFT && ts.status !== TIMESHEET_STATUS.REJECTED) {
    throw AppError.forbidden(
      'Only DRAFT or REJECTED timesheets can be edited or deleted',
      ERROR_CODES.IMMUTABLE_TIMESHEET,
    );
  }
  return ts;
}

async function assertDraftStatus(timesheetId: number, orgId: number) {
  const ts = await prisma.timesheet.findFirst({
    where: { id: timesheetId, organisationId: orgId },
  });
  if (!ts) throw AppError.notFound('Timesheet not found');
  if (ts.status !== TIMESHEET_STATUS.DRAFT) {
    throw AppError.forbidden(
      'Only DRAFT timesheets can be deleted',
      ERROR_CODES.IMMUTABLE_TIMESHEET,
    );
  }
  return ts;
}

async function validateEntries(
  entries: TimeEntryInput[],
  orgId: number,
  userId: number,
  role: UserRole,
  settings: Awaited<ReturnType<typeof getOrgSettings>>,
) {
  // --- mandatory descriptions ---
  if (settings.mandatoryDesc) {
    const dayPairs = DAY_HOUR_FIELDS.map((hf, i) => ({ hourField: hf, descField: DAY_DESC_FIELDS[i] }));
    for (const entry of entries) {
      const e = entry as unknown as Record<string, unknown>;
      for (const { hourField, descField } of dayPairs) {
        const hours = (e[hourField] as number) ?? 0;
        const desc = e[descField] as string | null | undefined;
        if (hours > 0 && (!desc || desc.trim() === '')) {
          throw AppError.badRequest(
            `Description is required for ${hourField.replace('Hours', '')} when hours are logged`,
            ERROR_CODES.DESCRIPTION_REQUIRED,
          );
        }
      }
    }
  }

  // --- max hours per day ---
  const perDay = dailyTotals(entries);
  for (const [day, hrs] of Object.entries(perDay)) {
    if (hrs > settings.maxHoursPerDay) {
      throw AppError.badRequest(
        `Hours for ${day.replace('Hours', '')} exceed the maximum ${settings.maxHoursPerDay}h per day`,
        ERROR_CODES.MAX_HOURS_EXCEEDED,
      );
    }
  }

  // --- max hours per week ---
  const { totalHours } = computeTotals(entries);
  if (totalHours > settings.maxHoursPerWeek) {
    throw AppError.badRequest(
      `Total hours (${totalHours}) exceed the maximum ${settings.maxHoursPerWeek}h per week`,
      ERROR_CODES.MAX_HOURS_EXCEEDED,
    );
  }

  // --- project scoping for EMPLOYEEs ---
  if (role === 'EMPLOYEE') {
    const projectIds = [...new Set(entries.map((e) => e.projectId))];
    const assignments = await prisma.projectEmployee.findMany({
      where: {
        employeeId: userId,
        projectId: { in: projectIds },
        project: { organisationId: orgId },
      },
      select: { projectId: true },
    });
    const assignedIds = new Set(assignments.map((a) => a.projectId));
    for (const pid of projectIds) {
      if (!assignedIds.has(pid)) {
        throw AppError.forbidden(
          `You are not assigned to project ${pid}`,
          ERROR_CODES.EMPLOYEE_NOT_ASSIGNED,
        );
      }
    }
  }
}

/** Recalculates and persists totalHours + billableHours from entries. */
async function recalculateTimesheetTotals(timesheetId: number): Promise<void> {
  const entries = await prisma.timeEntry.findMany({ where: { timesheetId } });
  const totalHours = entries.reduce((sum, e) => sum + e.totalHours, 0);
  const billableHours = entries
    .filter((e) => e.billable)
    .reduce((sum, e) => sum + e.totalHours, 0);

  await prisma.timesheet.update({
    where: { id: timesheetId },
    data: { totalHours, billableHours },
  });
}

function buildEntryData(e: TimeEntryInput) {
  return {
    projectId: e.projectId,
    billable: e.billable ?? true,
    monHours: e.monHours ?? 0,
    monDesc: e.monDesc ?? null,
    monTimeOff: e.monTimeOff ?? 0,
    tueHours: e.tueHours ?? 0,
    tueDesc: e.tueDesc ?? null,
    tueTimeOff: e.tueTimeOff ?? 0,
    wedHours: e.wedHours ?? 0,
    wedDesc: e.wedDesc ?? null,
    wedTimeOff: e.wedTimeOff ?? 0,
    thuHours: e.thuHours ?? 0,
    thuDesc: e.thuDesc ?? null,
    thuTimeOff: e.thuTimeOff ?? 0,
    friHours: e.friHours ?? 0,
    friDesc: e.friDesc ?? null,
    friTimeOff: e.friTimeOff ?? 0,
    satHours: e.satHours ?? 0,
    satDesc: e.satDesc ?? null,
    satTimeOff: e.satTimeOff ?? 0,
    sunHours: e.sunHours ?? 0,
    sunDesc: e.sunDesc ?? null,
    sunTimeOff: e.sunTimeOff ?? 0,
    totalHours: sumEntryHours(e as unknown as Record<string, unknown>),
  };
}

// ---------------------------------------------------------------------------
// CREATE timesheet
// ---------------------------------------------------------------------------

export async function createTimesheet(
  userId: number,
  orgId: number,
  role: UserRole,
  weekStartDateStr: string,
  entries: TimeEntryInput[] = [],
) {
  const settings = await getOrgSettings(orgId);
  const weekStartDate = getWeekStart(new Date(weekStartDateStr));
  const weekEndDate = getWeekEnd(weekStartDate);

  if (!settings.allowBackdated && isInPast(weekStartDate)) {
    throw AppError.badRequest(
      'Back-dated timesheets are not allowed',
      ERROR_CODES.BACKDATING_NOT_ALLOWED,
    );
  }

  const dayAfterStart = new Date(weekStartDate);
  dayAfterStart.setDate(dayAfterStart.getDate() + 1);

  const existing = await prisma.timesheet.findFirst({
    where: {
      userId,
      organisationId: orgId,
      weekStartDate: { gte: weekStartDate, lt: dayAfterStart },
    },
  });

  if (existing) {
    throw AppError.conflict('A timesheet already exists for this week');
  }

  if (entries.length > 0) {
    await validateEntries(entries, orgId, userId, role, settings);
  }

  const { totalHours, billableHours } = computeTotals(entries);

  const timesheet = await prisma.timesheet.create({
    data: {
      organisationId: orgId,
      userId,
      weekStartDate,
      weekEndDate,
      totalHours,
      billableHours,
      timeEntries: {
        create: entries.map((e) => buildEntryData(e)),
      },
    },
    include: { timeEntries: true },
  });

  logger.info({ timesheetId: timesheet.id, userId }, 'Timesheet created');
  return timesheet;
}

// ---------------------------------------------------------------------------
// GET single timesheet
// ---------------------------------------------------------------------------

export async function getTimesheet(timesheetId: number, userId: number, orgId: number) {
  const ts = await prisma.timesheet.findFirst({
    where: { id: timesheetId, organisationId: orgId },
    include: {
      timeEntries: { include: { project: true }, orderBy: { createdAt: 'asc' } },
      user: { select: { id: true, name: true, email: true } },
    },
  });
  if (!ts) throw AppError.notFound('Timesheet not found');
  return ts;
}

// ---------------------------------------------------------------------------
// LIST timesheets (user's own)
// ---------------------------------------------------------------------------

export async function listTimesheets(
  userId: number,
  orgId: number,
  page: number = PAGINATION.DEFAULT_PAGE,
  limit: number = PAGINATION.DEFAULT_LIMIT,
  status?: string,
) {
  const take = Math.min(limit, PAGINATION.MAX_LIMIT);
  const skip = (page - 1) * take;

  const where: Record<string, unknown> = { userId, organisationId: orgId };
  if (status) where.status = status;

  const [data, total] = await Promise.all([
    prisma.timesheet.findMany({
      where,
      include: { timeEntries: { include: { project: true }, orderBy: { createdAt: 'asc' } } },
      orderBy: { weekStartDate: 'desc' },
      skip,
      take,
    }),
    prisma.timesheet.count({ where }),
  ]);

  return { data, meta: { total, page, limit: take } };
}

// ---------------------------------------------------------------------------
// UPDATE timesheet (replace entries — bulk)
// ---------------------------------------------------------------------------

export async function updateTimesheet(
  timesheetId: number,
  userId: number,
  orgId: number,
  role: UserRole,
  entries: TimeEntryInput[],
) {
  const ts = await assertEditableStatus(timesheetId, orgId);

  if (ts.userId !== userId) {
    throw AppError.forbidden('You can only edit your own timesheet');
  }

  const settings = await getOrgSettings(orgId);
  await validateEntries(entries, orgId, userId, role, settings);
  const { totalHours, billableHours } = computeTotals(entries);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.timeEntry.deleteMany({ where: { timesheetId } });

    return tx.timesheet.update({
      where: { id: timesheetId },
      data: {
        totalHours,
        billableHours,
        status: 'DRAFT',
        rejectedReason: null,
        timeEntries: {
          create: entries.map((e) => buildEntryData(e)),
        },
      },
      include: { timeEntries: true },
    });
  });

  logger.info({ timesheetId, userId }, 'Timesheet updated');
  return updated;
}

// ---------------------------------------------------------------------------
// DELETE timesheet
// ---------------------------------------------------------------------------

export async function deleteTimesheet(timesheetId: number, userId: number, orgId: number) {
  const ts = await assertDraftStatus(timesheetId, orgId);

  if (ts.userId !== userId) {
    throw AppError.forbidden('You can only delete your own timesheet');
  }

  await prisma.timesheet.delete({ where: { id: timesheetId } });
  logger.info({ timesheetId, userId }, 'Timesheet deleted');
}

// ---------------------------------------------------------------------------
// SUBMIT timesheet
// ---------------------------------------------------------------------------

export async function submitTimesheet(timesheetId: number, userId: number, orgId: number) {
  const ts = await prisma.timesheet.findFirst({
    where: { id: timesheetId, organisationId: orgId, userId },
    include: { timeEntries: true },
  });

  if (!ts) throw AppError.notFound('Timesheet not found');

  if (ts.status !== TIMESHEET_STATUS.DRAFT && ts.status !== TIMESHEET_STATUS.REJECTED) {
    throw AppError.badRequest(
      'Only DRAFT or REJECTED timesheets can be submitted',
      ERROR_CODES.INVALID_TRANSITION,
    );
  }

  const updated = await prisma.timesheet.update({
    where: { id: timesheetId },
    data: { status: 'SUBMITTED', rejectedReason: null },
    include: { timeEntries: true },
  });

  logger.info({ timesheetId, userId }, 'Timesheet submitted');
  return updated;
}

// ---------------------------------------------------------------------------
// COPY PREVIOUS WEEK (matches TMS: copies hours, finds recent approved/submitted)
// ---------------------------------------------------------------------------

export async function copyPreviousWeek(
  userId: number,
  orgId: number,
  role: UserRole,
  targetWeekStartStr: string,
  force = false,
) {
  const settings = await getOrgSettings(orgId);

  if (!settings.allowCopyWeek) {
    throw AppError.badRequest('Copy week feature is disabled', ERROR_CODES.COPY_WEEK_DISABLED);
  }

  const targetStart = getWeekStart(new Date(targetWeekStartStr));
  const targetEnd = getWeekEnd(targetStart);

  if (!settings.allowBackdated && isInPast(targetStart)) {
    throw AppError.badRequest(
      'Back-dated timesheets are not allowed',
      ERROR_CODES.BACKDATING_NOT_ALLOWED,
    );
  }

  // Check target week
  const dayAfterTarget = new Date(targetStart);
  dayAfterTarget.setDate(dayAfterTarget.getDate() + 1);

  const existing = await prisma.timesheet.findFirst({
    where: {
      userId,
      organisationId: orgId,
      weekStartDate: { gte: targetStart, lt: dayAfterTarget },
    },
  });

  if (existing && !force) {
    throw AppError.conflict('A timesheet already exists for the target week');
  }

  // Only DRAFT timesheets may be overwritten
  if (existing && force && existing.status !== TIMESHEET_STATUS.DRAFT) {
    throw AppError.forbidden(
      `Cannot overwrite a ${existing.status.toLowerCase()} timesheet`,
      ERROR_CODES.IMMUTABLE_TIMESHEET,
    );
  }

  // Find the most recent approved or submitted timesheet (not strictly previous week)
  const previous = await prisma.timesheet.findFirst({
    where: {
      userId,
      organisationId: orgId,
      status: { in: ['APPROVED', 'SUBMITTED'] },
    },
    orderBy: { weekStartDate: 'desc' },
    include: { timeEntries: true },
  });

  if (!previous) {
    throw AppError.notFound('No previous submitted or approved timesheet found');
  }

  // For EMPLOYEE, filter out entries for projects no longer assigned
  let entriesToCopy = previous.timeEntries;
  if (role === 'EMPLOYEE') {
    const assignments = await prisma.projectEmployee.findMany({
      where: { employeeId: userId, project: { organisationId: orgId } },
      select: { projectId: true },
    });
    const assignedSet = new Set(assignments.map((a) => a.projectId));
    entriesToCopy = entriesToCopy.filter((e) => assignedSet.has(e.projectId));
  }

  // Build entry data — copies hours + descriptions (matching TMS behavior)
  const entryData = entriesToCopy.map((e) => ({
    projectId: e.projectId,
    billable: e.billable,
    monHours: e.monHours,
    monDesc: e.monDesc,
    monTimeOff: e.monTimeOff,
    tueHours: e.tueHours,
    tueDesc: e.tueDesc,
    tueTimeOff: e.tueTimeOff,
    wedHours: e.wedHours,
    wedDesc: e.wedDesc,
    wedTimeOff: e.wedTimeOff,
    thuHours: e.thuHours,
    thuDesc: e.thuDesc,
    thuTimeOff: e.thuTimeOff,
    friHours: e.friHours,
    friDesc: e.friDesc,
    friTimeOff: e.friTimeOff,
    satHours: e.satHours,
    satDesc: e.satDesc,
    satTimeOff: e.satTimeOff,
    sunHours: e.sunHours,
    sunDesc: e.sunDesc,
    sunTimeOff: e.sunTimeOff,
    totalHours: e.totalHours,
  }));

  const copiedTotalHours = entryData.reduce((sum, e) => sum + e.totalHours, 0);
  const copiedBillableHours = entryData
    .filter((e) => e.billable)
    .reduce((sum, e) => sum + e.totalHours, 0);

  if (existing && force) {
    // Overwrite: replace all entries in the existing DRAFT timesheet
    const updated = await prisma.$transaction(async (tx) => {
      await tx.timeEntry.deleteMany({ where: { timesheetId: existing.id } });
      if (entryData.length > 0) {
        await tx.timeEntry.createMany({
          data: entryData.map((e) => ({ ...e, timesheetId: existing.id })),
        });
      }
      return tx.timesheet.update({
        where: { id: existing.id },
        data: { totalHours: copiedTotalHours, billableHours: copiedBillableHours },
        include: { timeEntries: { include: { project: true }, orderBy: { createdAt: 'asc' } } },
      });
    });
    logger.info({ timesheetId: updated.id, userId }, 'Timesheet overwritten via copy');
    return updated;
  }

  // Create new draft + copy entry rows with hours
  const newTimesheet = await prisma.$transaction(async (tx) => {
    const ts = await tx.timesheet.create({
      data: {
        userId,
        organisationId: orgId,
        weekStartDate: targetStart,
        weekEndDate: targetEnd,
        status: 'DRAFT',
        totalHours: copiedTotalHours,
        billableHours: copiedBillableHours,
      },
    });
    if (entryData.length > 0) {
      await tx.timeEntry.createMany({
        data: entryData.map((e) => ({ ...e, timesheetId: ts.id })),
      });
    }
    return tx.timesheet.findFirst({
      where: { id: ts.id },
      include: { timeEntries: { include: { project: true }, orderBy: { createdAt: 'asc' } } },
    });
  });

  logger.info({ timesheetId: newTimesheet?.id, userId }, 'Timesheet created via copy');
  return newTimesheet;
}

// ---------------------------------------------------------------------------
// TIME ENTRY CRUD (individual entry operations — matches TMS)
// ---------------------------------------------------------------------------

export async function listEntries(timesheetId: number, userId: number, orgId: number) {
  const ts = await prisma.timesheet.findFirst({
    where: { id: timesheetId, userId, organisationId: orgId },
  });
  if (!ts) throw AppError.notFound('Timesheet not found');

  return prisma.timeEntry.findMany({
    where: { timesheetId },
    include: { project: true },
    orderBy: { createdAt: 'asc' },
  });
}

export async function createEntry(
  timesheetId: number,
  userId: number,
  orgId: number,
  dto: Record<string, unknown>,
  userRole: UserRole,
) {
  const ts = await assertEditableStatus(timesheetId, orgId);
  if (ts.userId !== userId) {
    throw AppError.forbidden('You can only edit your own timesheet');
  }

  const settings = await getOrgSettings(orgId);
  const projectId = dto.projectId as number;

  // Mandatory description check
  if (settings.mandatoryDesc) {
    const dayPairs = DAY_HOUR_FIELDS.map((hf, i) => ({ hourField: hf, descField: DAY_DESC_FIELDS[i] }));
    for (const { hourField, descField } of dayPairs) {
      const hours = (dto[hourField] as number) ?? 0;
      const desc = dto[descField] as string | null | undefined;
      if (hours > 0 && (!desc || desc.trim() === '')) {
        throw AppError.badRequest(
          `Description is required for ${hourField.replace('Hours', '')} when hours are logged`,
          ERROR_CODES.DESCRIPTION_REQUIRED,
        );
      }
    }
  }

  // Verify project belongs to org
  const project = await prisma.project.findFirst({ where: { id: projectId, organisationId: orgId } });
  if (!project) throw AppError.notFound('Project not found');

  // EMPLOYEE: verify project assignment
  if (userRole === 'EMPLOYEE') {
    const assignment = await prisma.projectEmployee.findFirst({
      where: { projectId, employeeId: userId },
    });
    if (!assignment) {
      throw AppError.forbidden('You are not assigned to this project', ERROR_CODES.EMPLOYEE_NOT_ASSIGNED);
    }
  }

  // Max hours per day validation
  const maxPerDay = settings.maxHoursPerDay;
  for (const dayField of DAY_HOUR_FIELDS) {
    const hours = (dto[dayField] as number) ?? 0;
    if (hours > maxPerDay) {
      throw AppError.badRequest(
        `Cannot log more than ${maxPerDay} hours per day`,
        ERROR_CODES.MAX_HOURS_EXCEEDED,
      );
    }
  }

  const totalHours = sumEntryHours(dto);

  const entry = await prisma.timeEntry.create({
    data: {
      timesheetId,
      projectId,
      billable: (dto.billable as boolean) ?? true,
      monHours: (dto.monHours as number) ?? 0,
      monDesc: (dto.monDesc as string) ?? null,
      monTimeOff: (dto.monTimeOff as number) ?? 0,
      tueHours: (dto.tueHours as number) ?? 0,
      tueDesc: (dto.tueDesc as string) ?? null,
      tueTimeOff: (dto.tueTimeOff as number) ?? 0,
      wedHours: (dto.wedHours as number) ?? 0,
      wedDesc: (dto.wedDesc as string) ?? null,
      wedTimeOff: (dto.wedTimeOff as number) ?? 0,
      thuHours: (dto.thuHours as number) ?? 0,
      thuDesc: (dto.thuDesc as string) ?? null,
      thuTimeOff: (dto.thuTimeOff as number) ?? 0,
      friHours: (dto.friHours as number) ?? 0,
      friDesc: (dto.friDesc as string) ?? null,
      friTimeOff: (dto.friTimeOff as number) ?? 0,
      satHours: (dto.satHours as number) ?? 0,
      satDesc: (dto.satDesc as string) ?? null,
      satTimeOff: (dto.satTimeOff as number) ?? 0,
      sunHours: (dto.sunHours as number) ?? 0,
      sunDesc: (dto.sunDesc as string) ?? null,
      sunTimeOff: (dto.sunTimeOff as number) ?? 0,
      totalHours,
    },
    include: { project: true },
  });

  await recalculateTimesheetTotals(timesheetId);
  return entry;
}

export async function updateEntry(
  timesheetId: number,
  entryId: number,
  userId: number,
  orgId: number,
  dto: Record<string, unknown>,
  userRole: UserRole,
) {
  const ts = await assertEditableStatus(timesheetId, orgId);
  if (ts.userId !== userId) {
    throw AppError.forbidden('You can only edit your own timesheet');
  }

  const entry = await prisma.timeEntry.findFirst({ where: { id: entryId, timesheetId } });
  if (!entry) throw AppError.notFound('Time entry not found');

  // EMPLOYEE: if changing project, verify assignment
  if (dto.projectId !== undefined && userRole === 'EMPLOYEE') {
    const assignment = await prisma.projectEmployee.findFirst({
      where: { projectId: dto.projectId as number, employeeId: userId },
    });
    if (!assignment) {
      throw AppError.forbidden('You are not assigned to this project', ERROR_CODES.EMPLOYEE_NOT_ASSIGNED);
    }
  }

  // Merge with existing values
  const merged: Record<string, unknown> = {};
  for (const f of DAY_HOUR_FIELDS) {
    merged[f] = dto[f] ?? (entry as Record<string, unknown>)[f];
  }
  for (const f of DAY_DESC_FIELDS) {
    merged[f] = f in dto ? dto[f] : (entry as Record<string, unknown>)[f];
  }
  const DAY_TIMEOFF_FIELDS = [
    'monTimeOff', 'tueTimeOff', 'wedTimeOff', 'thuTimeOff',
    'friTimeOff', 'satTimeOff', 'sunTimeOff',
  ];
  for (const f of DAY_TIMEOFF_FIELDS) {
    merged[f] = dto[f] ?? (entry as Record<string, unknown>)[f];
  }

  const totalHours = sumEntryHours(merged);

  const updated = await prisma.timeEntry.update({
    where: { id: entryId },
    data: {
      ...dto,
      ...merged,
      totalHours,
      ...(dto.projectId !== undefined ? { projectId: dto.projectId as number } : {}),
      ...(dto.billable !== undefined ? { billable: dto.billable as boolean } : {}),
    },
    include: { project: true },
  });

  await recalculateTimesheetTotals(timesheetId);
  return updated;
}

export async function deleteEntry(
  timesheetId: number,
  entryId: number,
  userId: number,
  orgId: number,
) {
  const ts = await assertEditableStatus(timesheetId, orgId);
  if (ts.userId !== userId) {
    throw AppError.forbidden('You can only edit your own timesheet');
  }

  const entry = await prisma.timeEntry.findFirst({ where: { id: entryId, timesheetId } });
  if (!entry) throw AppError.notFound('Time entry not found');

  await prisma.timeEntry.delete({ where: { id: entryId } });
  await recalculateTimesheetTotals(timesheetId);
}
