import { prisma } from '../utils/db.js';
import { AppError } from '../types/errors.js';
import { ERROR_CODES, TIMESHEET_STATUS } from '../utils/constants.js';
import { getWeekStart, getWeekEnd, formatDateRange } from '../utils/dateHelpers.js';
import { logger } from '../utils/logger.js';
import { createNotification } from '../services/notifications.service.js';
import type { UserRole } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Return IDs of employees that report directly to this manager. */
async function getDirectReportIds(managerId: number): Promise<number[]> {
  const rows = await prisma.managerEmployee.findMany({
    where: { managerId },
    select: { employeeId: true },
  });
  return rows.map((r) => r.employeeId);
}

// ---------------------------------------------------------------------------
// LIST pending timesheets (for approval)
// ---------------------------------------------------------------------------

export async function listPendingTimesheets(
  userId: number,
  orgId: number,
  role: UserRole,
  page = 1,
  limit = 20,
) {
  const take = Math.min(limit, 100);
  const skip = (page - 1) * take;

  let userFilter: { userId?: { in: number[] } } = {};

  if (role === 'MANAGER') {
    const reportIds = await getDirectReportIds(userId);
    userFilter = { userId: { in: reportIds } };
  }
  // ADMIN sees all in the org — no extra user filter needed

  const where = {
    organisationId: orgId,
    status: 'SUBMITTED' as const,
    ...userFilter,
  };

  const [data, total] = await Promise.all([
    prisma.timesheet.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, department: true } },
        timeEntries: { include: { project: true } },
      },
      orderBy: { weekStartDate: 'desc' },
      skip,
      take,
    }),
    prisma.timesheet.count({ where }),
  ]);

  return { data, meta: { total, page, limit: take } };
}

// ---------------------------------------------------------------------------
// APPROVAL STATS
// ---------------------------------------------------------------------------

export async function getApprovalStats(userId: number, orgId: number, role: UserRole) {
  let userFilter: { userId?: { in: number[] } } = {};
  let teamMemberIds: number[] = [];

  if (role === 'MANAGER') {
    teamMemberIds = await getDirectReportIds(userId);
    userFilter = { userId: { in: teamMemberIds } };
  } else {
    // ADMIN: all users in org
    const orgUsers = await prisma.user.findMany({
      where: { organisationId: orgId },
      select: { id: true },
    });
    teamMemberIds = orgUsers.map((u) => u.id);
  }

  const now = new Date();
  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);

  const [pendingCount, approvedThisWeek, teamHoursAgg] = await Promise.all([
    prisma.timesheet.count({
      where: {
        organisationId: orgId,
        status: "SUBMITTED",
        ...userFilter,
      },
    }),
    prisma.timesheet.count({
      where: {
        organisationId: orgId,
        status: "APPROVED",
        approvedAt: { gte: weekStart, lte: weekEnd },
        ...userFilter,
      },
    }),
    prisma.timesheet.aggregate({
      where: {
        organisationId: orgId,
        weekStartDate: { gte: weekStart, lte: weekEnd },
        ...userFilter,
      },
      _sum: { totalHours: true },
    }),
  ]);

  return {
    pendingCount,
    approvedThisWeek,
    teamHours: teamHoursAgg._sum.totalHours ?? 0,
    teamMembers: teamMemberIds.length,
  };
}

// ---------------------------------------------------------------------------
// APPROVE timesheet
// ---------------------------------------------------------------------------

export async function approveTimesheet(
  timesheetId: number,
  approverId: number,
  orgId: number,
  role: UserRole,
) {
  const ts = await prisma.timesheet.findFirst({
    where: { id: timesheetId, organisationId: orgId },
    include: {
      timeEntries: true,
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!ts) throw AppError.notFound('Timesheet not found');

  // Self-approval forbidden
  if (ts.userId === approverId) {
    throw AppError.forbidden(
      'You cannot approve your own timesheet',
      ERROR_CODES.SELF_APPROVAL_FORBIDDEN,
    );
  }

  // Manager can only approve direct reports
  if (role === 'MANAGER') {
    const reportIds = await getDirectReportIds(approverId);
    if (!reportIds.includes(ts.userId)) {
      throw AppError.forbidden(
        'You can only approve timesheets of your direct reports',
        ERROR_CODES.NOT_DIRECT_REPORT,
      );
    }
  }

  if (ts.status !== TIMESHEET_STATUS.SUBMITTED) {
    throw AppError.badRequest(
      'Only SUBMITTED timesheets can be approved',
      ERROR_CODES.INVALID_TRANSITION,
    );
  }

  // Update project usedHours for billable entries
  const billableByProject = new Map<number, number>();
  for (const entry of ts.timeEntries) {
    if (entry.billable) {
      const prev = billableByProject.get(entry.projectId) ?? 0;
      billableByProject.set(entry.projectId, prev + entry.totalHours);
    }
  }

  const approved = await prisma.$transaction(async (tx) => {
    // Increment usedHours per project
    for (const [projectId, hours] of billableByProject) {
      await tx.project.update({
        where: { id: projectId },
        data: { usedHours: { increment: hours } },
      });
    }

    return tx.timesheet.update({
      where: { id: timesheetId },
      data: {
        status: 'APPROVED',
        approvedById: approverId,
        approvedAt: new Date(),
      },
      include: { timeEntries: true },
    });
  });

  // Notify the employee
  const weekRange = formatDateRange(ts.weekStartDate, ts.weekEndDate);
  createNotification(
    ts.userId,
    'ts_approved',
    `Your timesheet for ${weekRange} has been approved`,
  ).catch((err) => logger.error({ err }, 'Notification dispatch error'));

  logger.info({ timesheetId, approverId }, 'Timesheet approved');
  return approved;
}

// ---------------------------------------------------------------------------
// REJECT timesheet
// ---------------------------------------------------------------------------

export async function rejectTimesheet(
  timesheetId: number,
  approverId: number,
  orgId: number,
  role: UserRole,
  reason: string,
) {
  const ts = await prisma.timesheet.findFirst({
    where: { id: timesheetId, organisationId: orgId },
    include: {
      user: { select: { id: true, name: true, email: true } },
    },
  });

  if (!ts) throw AppError.notFound('Timesheet not found');

  // Self-approval forbidden
  if (ts.userId === approverId) {
    throw AppError.forbidden(
      'You cannot reject your own timesheet',
      ERROR_CODES.SELF_APPROVAL_FORBIDDEN,
    );
  }

  // Manager can only reject direct reports
  if (role === 'MANAGER') {
    const reportIds = await getDirectReportIds(approverId);
    if (!reportIds.includes(ts.userId)) {
      throw AppError.forbidden(
        'You can only reject timesheets of your direct reports',
        ERROR_CODES.NOT_DIRECT_REPORT,
      );
    }
  }

  if (ts.status !== TIMESHEET_STATUS.SUBMITTED) {
    throw AppError.badRequest(
      'Only SUBMITTED timesheets can be rejected',
      ERROR_CODES.INVALID_TRANSITION,
    );
  }

  const rejected = await prisma.timesheet.update({
    where: { id: timesheetId },
    data: {
      status: 'REJECTED',
      rejectedReason: reason,
    },
    include: { timeEntries: true },
  });

  // Notify the employee
  const weekRange = formatDateRange(ts.weekStartDate, ts.weekEndDate);
  createNotification(
    ts.userId,
    'ts_rejected',
    `Your timesheet for ${weekRange} was rejected: ${reason}`,
  ).catch((err) => logger.error({ err }, 'Notification dispatch error'));

  logger.info({ timesheetId, approverId, reason }, 'Timesheet rejected');
  return rejected;
}
