import { prisma } from '../utils/db.js';
import { formatDateRange } from '../utils/dateHelpers.js';
import type { UserRole } from '@prisma/client';
import { AppError } from '../types/errors.js';
import type { MonthlyTimesheetData, MonthlyDayRow } from '../utils/exportHelpers.js';

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

const DAY_KEYS_MONTHLY = ['monHours', 'tueHours', 'wedHours', 'thuHours', 'friHours', 'satHours', 'sunHours'] as const;
const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const MONTH_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const MONTH_FULL = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];

function getDayKeyForDate(date: Date, weekStart: Date): typeof DAY_KEYS_MONTHLY[number] | null {
  const diff = Math.round((date.getTime() - weekStart.getTime()) / (1000 * 60 * 60 * 24));
  if (diff < 0 || diff > 6) return null;
  return DAY_KEYS_MONTHLY[diff];
}

export async function getMonthlyTimesheetData(
  userId: number,
  orgId: number,
  year: number,
  month: number,
  requestingUserId: number,
  requestingUserRole: UserRole,
): Promise<MonthlyTimesheetData> {
  // Permission check
  if (requestingUserRole === 'EMPLOYEE') {
    if (userId !== requestingUserId) {
      throw AppError.forbidden('Insufficient permissions');
    }
  } else if (requestingUserRole === 'MANAGER') {
    if (userId !== requestingUserId) {
      const reports = await prisma.managerEmployee.findMany({
        where: { managerId: requestingUserId },
        select: { employeeId: true },
      });
      const reportIds = reports.map((r) => r.employeeId);
      if (!reportIds.includes(userId)) {
        throw AppError.forbidden('You can only view reports for your direct reports');
      }
    }
  }

  const targetUser = await prisma.user.findFirst({
    where: { id: userId, organisationId: orgId },
    select: { id: true, name: true, department: true },
  });
  if (!targetUser) throw AppError.notFound('User not found');

  // Month boundaries — widen range to catch week boundaries
  const searchStart = new Date(year, month - 1, -6);
  const searchEnd = new Date(year, month, 6);

  const timesheets = await prisma.timesheet.findMany({
    where: {
      userId,
      organisationId: orgId,
      weekStartDate: { gte: searchStart, lte: searchEnd },
    },
    include: {
      timeEntries: {
        include: { project: { select: { id: true, code: true, name: true } } },
      },
    },
  });

  const holidays = await prisma.holiday.findMany({ where: { organisationId: orgId } });

  const holidayMap = new Map<string, string>();
  for (const h of holidays) {
    const hDate = new Date(h.date);
    const hKey = `${hDate.getFullYear()}-${String(hDate.getMonth() + 1).padStart(2, '0')}-${String(hDate.getDate()).padStart(2, '0')}`;
    if (h.recurring) {
      const recKey = `${year}-${String(hDate.getMonth() + 1).padStart(2, '0')}-${String(hDate.getDate()).padStart(2, '0')}`;
      holidayMap.set(recKey, h.name);
    }
    holidayMap.set(hKey, h.name);
  }

  const daysInMonth = new Date(year, month, 0).getDate();
  const days: MonthlyDayRow[] = [];
  let totalHours = 0;
  let totalOvertime = 0;
  let holidayCount = 0;
  let leaveCount = 0;

  for (let d = 1; d <= daysInMonth; d++) {
    const date = new Date(year, month - 1, d);
    const dayOfWeek = date.getDay();
    const isWeekend = dayOfWeek === 0 || dayOfWeek === 6;
    const dateKey = `${year}-${String(month).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    const isHoliday = holidayMap.has(dateKey);
    const holidayName = holidayMap.get(dateKey);

    let dayHours = 0;
    let dayTimeOff = 0;
    const projectNames: string[] = [];
    const taskDescs: string[] = [];
    let isLeave = false;

    for (const ts of timesheets) {
      const wsDate = new Date(ts.weekStartDate);
      const dayKey = getDayKeyForDate(date, wsDate);
      if (!dayKey) continue;

      const dayDescKey = dayKey.replace('Hours', 'Desc') as keyof typeof ts.timeEntries[0];
      const dayTimeOffKey = dayKey.replace('Hours', 'TimeOff') as keyof typeof ts.timeEntries[0];

      for (const entry of ts.timeEntries) {
        const hours = entry[dayKey] as number;
        const timeOff = (entry[dayTimeOffKey] as number | undefined) ?? 0;

        if (hours > 0) {
          dayHours += hours;
          const pName = entry.project?.name ?? '';
          if (pName && !projectNames.includes(pName)) projectNames.push(pName);
          const desc = entry[dayDescKey] as string | null | undefined;
          if (desc && !taskDescs.includes(desc)) taskDescs.push(desc);
          const pLower = pName.toLowerCase();
          const codeLower = (entry.project?.code ?? '').toLowerCase();
          if (pLower.includes('leave') || codeLower.includes('leave')) isLeave = true;
        }
        if (timeOff > 0) {
          dayTimeOff += timeOff;
          isLeave = true;
        }
      }
    }

    if (isHoliday) holidayCount++;
    if (isLeave) leaveCount++;

    const regularHours = Math.min(dayHours, 8);
    const overtime = dayHours > 8 ? dayHours - 8 : 0;

    if (!isHoliday && !isLeave && !isWeekend) {
      totalHours += regularHours;
      totalOvertime += overtime;
    }

    days.push({
      date: `${String(d).padStart(2, '0')}-${MONTH_SHORT[month - 1]}`,
      day: DAY_NAMES[dayOfWeek],
      project: projectNames.join(', '),
      task: taskDescs.join(', '),
      time: isHoliday || isLeave ? 0 : regularHours,
      overtime,
      totalTime: isHoliday || isLeave ? 0 : dayHours,
      timeOffHours: dayTimeOff,
      isHoliday,
      holidayName,
      isLeave,
      isWeekend,
    });
  }

  const shortYear = String(year).slice(2);
  return {
    employeeName: targetUser.name,
    employeeId: targetUser.id,
    department: targetUser.department ?? '',
    month: `${MONTH_SHORT[month - 1]}'${shortYear}`,
    monthFull: `${MONTH_FULL[month - 1]} ${year}`,
    days,
    totalHours,
    totalOvertime,
    holidayCount,
    leaveCount,
  };
}
