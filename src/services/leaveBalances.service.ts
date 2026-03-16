import { prisma } from '../utils/db.js';
import { AppError } from '../types/errors.js';
import { ERROR_CODES } from '../utils/constants.js';
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

// ---------------------------------------------------------------------------
// GET own balances
// ---------------------------------------------------------------------------

export async function getOwnBalances(userId: number, year?: number) {
  const targetYear = year ?? new Date().getFullYear();

  const balances = await prisma.leaveBalance.findMany({
    where: { userId, year: targetYear },
    include: {
      leaveType: {
        select: {
          id: true,
          name: true,
          annualQuota: true,
          carryForward: true,
          active: true,
          paid: true,
        },
      },
    },
    orderBy: { leaveType: { name: 'asc' } },
  });

  return balances.map((b) => ({
    id: b.id,
    leaveTypeId: b.leaveTypeId,
    leaveTypeName: b.leaveType.name,
    year: b.year,
    allocatedDays: b.allocatedDays,
    usedDays: b.usedDays,
    pendingDays: b.pendingDays,
    carriedOver: b.carriedOver,
    availableDays: b.allocatedDays + b.carriedOver - b.usedDays - b.pendingDays,
    leaveType: b.leaveType,
  }));
}

// ---------------------------------------------------------------------------
// GET user balances (manager/admin view)
// ---------------------------------------------------------------------------

export async function getUserBalances(
  targetUserId: number,
  requesterId: number,
  orgId: number,
  role: UserRole,
  year?: number,
) {
  // Verify target user belongs to the org
  const targetUser = await prisma.user.findFirst({
    where: { id: targetUserId, organisationId: orgId },
    select: { id: true, name: true },
  });

  if (!targetUser) {
    throw AppError.notFound('User not found in this organisation');
  }

  // Manager can only view direct reports
  if (role === 'MANAGER') {
    const reportIds = await getDirectReportIds(requesterId);
    if (!reportIds.includes(targetUserId)) {
      throw AppError.forbidden(
        'You can only view leave balances of your direct reports',
        ERROR_CODES.NOT_DIRECT_REPORT,
      );
    }
  }
  // ADMIN can see all users in the org — no extra check needed

  return getOwnBalances(targetUserId, year);
}

// ---------------------------------------------------------------------------
// INITIALIZE balances for a user (all active leave types)
// ---------------------------------------------------------------------------

export async function initializeBalances(userId: number, orgId: number, year?: number) {
  const targetYear = year ?? new Date().getFullYear();

  // Verify user belongs to the org
  const user = await prisma.user.findFirst({
    where: { id: userId, organisationId: orgId },
    select: { id: true },
  });

  if (!user) {
    throw AppError.notFound('User not found in this organisation');
  }

  const activeLeaveTypes = await prisma.leaveType.findMany({
    where: { organisationId: orgId, active: true },
    select: { id: true, annualQuota: true },
  });

  if (activeLeaveTypes.length === 0) {
    logger.info({ userId, orgId, year: targetYear }, 'No active leave types to initialize');
    return [];
  }

  await prisma.leaveBalance.createMany({
    data: activeLeaveTypes.map((lt) => ({
      userId,
      leaveTypeId: lt.id,
      year: targetYear,
      allocatedDays: lt.annualQuota,
    })),
    skipDuplicates: true,
  });

  logger.info(
    { userId, orgId, year: targetYear, count: activeLeaveTypes.length },
    'Leave balances initialized',
  );

  return getOwnBalances(userId, targetYear);
}
