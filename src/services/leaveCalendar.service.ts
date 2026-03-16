import { prisma } from '../utils/db.js';
import { LEAVE_STATUS } from '../utils/constants.js';
import { logger } from '../utils/logger.js';
import type { UserRole } from '@prisma/client';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getDirectReportIds(managerId: number): Promise<number[]> {
  const rows = await prisma.managerEmployee.findMany({
    where: { managerId },
    select: { employeeId: true },
  });
  return rows.map((r) => r.employeeId);
}

/**
 * Expand a date range into individual dates (inclusive), skipping weekends.
 */
function expandBusinessDates(start: Date, end: Date): Date[] {
  const dates: Date[] = [];
  const current = new Date(start);
  current.setUTCHours(0, 0, 0, 0);
  const endDate = new Date(end);
  endDate.setUTCHours(0, 0, 0, 0);

  while (current <= endDate) {
    const day = current.getUTCDay();
    if (day !== 0 && day !== 6) {
      dates.push(new Date(current));
    }
    current.setUTCDate(current.getUTCDate() + 1);
  }

  return dates;
}

// ---------------------------------------------------------------------------
// GET team calendar
// ---------------------------------------------------------------------------

export async function getTeamCalendar(
  userId: number,
  orgId: number,
  role: UserRole,
  from: string,
  to: string,
) {
  const fromDate = new Date(from);
  const toDate = new Date(to);
  fromDate.setUTCHours(0, 0, 0, 0);
  toDate.setUTCHours(23, 59, 59, 999);

  // Determine which users to include
  let userFilter: { userId?: { in: number[] } } = {};

  if (role === 'MANAGER') {
    const reportIds = await getDirectReportIds(userId);
    // Include the manager themselves as well
    userFilter = { userId: { in: [...reportIds, userId] } };
  }
  // ADMIN sees all in the org — no user filter

  // Fetch approved leave requests overlapping with the date range
  const leaveRequests = await prisma.leaveRequest.findMany({
    where: {
      organisationId: orgId,
      status: "APPROVED",
      startDate: { lte: toDate },
      endDate: { gte: fromDate },
      ...userFilter,
    },
    include: {
      user: { select: { id: true, name: true } },
      leaveType: { select: { name: true } },
    },
    orderBy: { startDate: 'asc' },
  });

  // Expand each leave request into individual day entries
  const calendarEntries: Array<{
    userId: number;
    userName: string;
    leaveTypeName: string;
    date: string;
  }> = [];

  for (const request of leaveRequests) {
    // Clamp the expansion to the requested from/to range
    const rangeStart = request.startDate > fromDate ? request.startDate : fromDate;
    const rangeEnd = request.endDate < toDate ? request.endDate : toDate;

    const dates = expandBusinessDates(rangeStart, rangeEnd);

    for (const date of dates) {
      calendarEntries.push({
        userId: request.user.id,
        userName: request.user.name,
        leaveTypeName: request.leaveType.name,
        date: date.toISOString().split('T')[0],
      });
    }
  }

  logger.debug(
    { orgId, from, to, entries: calendarEntries.length },
    'Team calendar fetched',
  );

  return calendarEntries;
}
