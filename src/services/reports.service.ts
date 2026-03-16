import { prisma } from '../utils/db.js';
import { formatDateRange } from '../utils/dateHelpers.js';

interface ReportFilters {
  orgId: number;
  dateFrom?: string;
  dateTo?: string;
  userId?: number;
  status?: string;
  projectId?: number;
}

export async function getReportData(filters: ReportFilters) {
  const where: Record<string, unknown> = {
    organisationId: filters.orgId,
  };

  if (filters.dateFrom) {
    where.weekStartDate = { ...(where.weekStartDate as object ?? {}), gte: new Date(filters.dateFrom) };
  }
  if (filters.dateTo) {
    where.weekEndDate = { ...(where.weekEndDate as object ?? {}), lte: new Date(filters.dateTo) };
  }
  if (filters.userId) {
    where.userId = filters.userId;
  }
  if (filters.status) {
    where.status = filters.status;
  }

  const timesheets = await prisma.timesheet.findMany({
    where,
    include: {
      user: { select: { name: true, email: true } },
      timeEntries: {
        include: { project: { select: { name: true, code: true } } },
      },
    },
    orderBy: { weekStartDate: 'desc' },
  });

  // Filter by projectId if specified
  let filtered = timesheets;
  if (filters.projectId) {
    filtered = timesheets.filter((ts) =>
      ts.timeEntries.some((e) => e.projectId === filters.projectId)
    );
  }

  const rows = filtered.map((ts) => ({
    employeeName: ts.user.name,
    employeeEmail: ts.user.email,
    weekRange: formatDateRange(ts.weekStartDate, ts.weekEndDate),
    weekStartDate: ts.weekStartDate,
    weekEndDate: ts.weekEndDate,
    status: ts.status,
    totalHours: ts.totalHours,
    billableHours: ts.billableHours,
    projectBreakdown: ts.timeEntries.map((e) => ({
      projectName: e.project.name,
      projectCode: e.project.code,
      hours: e.totalHours,
      billable: e.billable,
    })),
  }));

  const totalHours = rows.reduce((sum, r) => sum + r.totalHours, 0);
  const billableHours = rows.reduce((sum, r) => sum + r.billableHours, 0);

  return {
    rows,
    summary: {
      totalHours,
      billableHours,
      billablePercentage: totalHours > 0 ? Math.round((billableHours / totalHours) * 100) : 0,
      totalEntries: rows.length,
    },
  };
}

export async function getMonthlyTimesheetData(userId: number, orgId: number, year: number, month: number) {
  const startDate = new Date(Date.UTC(year, month - 1, 1));
  const endDate = new Date(Date.UTC(year, month, 0, 23, 59, 59));

  const user = await prisma.user.findFirst({
    where: { id: userId, organisationId: orgId },
    select: { name: true },
  });

  const timesheets = await prisma.timesheet.findMany({
    where: {
      userId,
      organisationId: orgId,
      weekStartDate: { lte: endDate },
      weekEndDate: { gte: startDate },
    },
    include: {
      timeEntries: {
        include: { project: { select: { name: true } } },
      },
    },
  });

  const holidays = await prisma.holiday.findMany({
    where: { organisationId: orgId },
  });

  const holidayDates = new Set(
    holidays.map((h) => {
      const d = new Date(h.date);
      d.setUTCHours(0, 0, 0, 0);
      return d.getTime();
    })
  );

  const dayNames = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const dayKeys = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;

  const entries: {
    date: string;
    day: string;
    projectName: string;
    hours: number;
    overtime: number;
    timeOff: number;
    isHoliday: boolean;
  }[] = [];

  const current = new Date(startDate);
  while (current <= endDate) {
    const dateStr = current.toISOString().split('T')[0];
    const dayOfWeek = current.getUTCDay();
    const dayKey = dayKeys[dayOfWeek];
    const isHoliday = holidayDates.has(new Date(current).setUTCHours(0, 0, 0, 0));

    for (const ts of timesheets) {
      if (current >= ts.weekStartDate && current <= ts.weekEndDate) {
        for (const entry of ts.timeEntries) {
          const hours = (entry as Record<string, unknown>)[`${dayKey}Hours`] as number ?? 0;
          const timeOff = (entry as Record<string, unknown>)[`${dayKey}TimeOff`] as number ?? 0;

          if (hours > 0 || timeOff > 0) {
            entries.push({
              date: dateStr,
              day: dayNames[dayOfWeek],
              projectName: entry.project.name,
              hours,
              overtime: Math.max(0, hours - 8),
              timeOff,
              isHoliday,
            });
          }
        }
      }
    }

    if (!entries.some((e) => e.date === dateStr)) {
      entries.push({
        date: dateStr,
        day: dayNames[dayOfWeek],
        projectName: '-',
        hours: 0,
        overtime: 0,
        timeOff: 0,
        isHoliday,
      });
    }

    current.setUTCDate(current.getUTCDate() + 1);
  }

  return {
    userName: user?.name ?? 'Unknown',
    year,
    month,
    entries,
  };
}
