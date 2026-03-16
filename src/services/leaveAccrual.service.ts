import { prisma } from '../utils/db.js';
import { logger } from '../utils/logger.js';
import { creditBiannualLeaves, calculateEntitlement, isEligible, type LeaveTypeConfig } from './leaveEntitlement.service.js';

// ---------------------------------------------------------------------------
// RUN MONTHLY ACCRUAL
// ---------------------------------------------------------------------------

/**
 * For every active user x every MONTHLY LeaveType with accrualRate > 0,
 * add accrualRate to the current-year LeaveBalance.allocatedDays.
 *
 * Also triggers biannual credits when called in Jan (half=1) or Jul (half=2).
 *
 * Designed to be called by a monthly cron job.
 */
export async function runMonthlyAccrual(orgId?: number) {
  const orgFilter = orgId ? { organisationId: orgId } : {};
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based

  // --- 1. MONTHLY accrual (e.g., Earned Leaves: 1.25/month) ---
  const monthlyLeaveTypes = await prisma.leaveType.findMany({
    where: {
      ...orgFilter,
      active: true,
      accrualRate: { gt: 0 },
      creditSchedule: 'MONTHLY',
    },
    select: {
      id: true,
      organisationId: true,
      accrualRate: true,
      name: true,
      annualQuota: true,
      creditSchedule: true,
      eligibleTypes: true,
      maxCarryForward: true,
      maxEncashment: true,
    },
  });

  let totalProcessed = 0;

  for (const leaveType of monthlyLeaveTypes) {
    const activeUsers = await prisma.user.findMany({
      where: {
        organisationId: leaveType.organisationId,
        status: 'active',
      },
      select: { id: true, joiningDate: true, employeeType: true },
    });

    if (activeUsers.length === 0) continue;

    for (const user of activeUsers) {
      // Check eligibility (e.g., EL only for FULL_TIME)
      if (!isEligible(leaveType, user.employeeType)) continue;

      // Proration: skip if employee hasn't started yet
      if (user.joiningDate) {
        const joinYear = user.joiningDate.getFullYear();
        const joinMonth = user.joiningDate.getMonth();
        const joinDay = user.joiningDate.getDate();

        // Not yet in current year
        if (joinYear > currentYear) continue;

        // Same year: check effective start month
        if (joinYear === currentYear) {
          const effectiveMonth = joinDay > 15 ? joinMonth + 1 : joinMonth;
          if (effectiveMonth > currentMonth) continue;
        }
      }

      await prisma.leaveBalance.upsert({
        where: {
          userId_leaveTypeId_year: {
            userId: user.id,
            leaveTypeId: leaveType.id,
            year: currentYear,
          },
        },
        create: {
          userId: user.id,
          leaveTypeId: leaveType.id,
          year: currentYear,
          allocatedDays: leaveType.accrualRate,
        },
        update: {
          allocatedDays: { increment: leaveType.accrualRate },
        },
      });
    }

    totalProcessed += activeUsers.length;

    logger.info(
      {
        leaveTypeId: leaveType.id,
        leaveTypeName: leaveType.name,
        orgId: leaveType.organisationId,
        usersAccrued: activeUsers.length,
        rate: leaveType.accrualRate,
      },
      'Monthly accrual applied',
    );
  }

  // --- 2. BIANNUAL credits (Jan = H1, Jul = H2) ---
  if (currentMonth === 0 || currentMonth === 6) {
    const half = currentMonth === 0 ? 1 : 2;
    const biannualResult = await creditBiannualLeaves(orgId, half as 1 | 2);
    totalProcessed += biannualResult.processed;
    logger.info({ half, processed: biannualResult.processed }, 'Biannual leave credit completed');
  }

  logger.info({ totalProcessed, orgId }, 'Monthly accrual run completed');
  return { processed: totalProcessed };
}

// ---------------------------------------------------------------------------
// RUN CARRY FORWARD (year rollover)
// ---------------------------------------------------------------------------

/**
 * On year rollover, create new-year balance records and carry forward
 * unused days up to the configured maximum.
 *
 * For Earned Leave: uses leaveType.maxCarryForward (default 5)
 * For other types: uses org-level carryForwardMaxDays
 *
 * Designed to be called once at the start of a new year (e.g., Jan 1 cron).
 */
export async function runCarryForward(orgId?: number) {
  const now = new Date();
  const newYear = now.getFullYear();
  const previousYear = newYear - 1;

  const orgFilter = orgId ? { organisationId: orgId } : {};

  const orgSettingsList = await prisma.orgSettings.findMany({
    where: orgId ? { organisationId: orgId } : {},
    select: {
      organisationId: true,
      carryForwardEnabled: true,
      carryForwardMaxDays: true,
    },
  });

  const settingsMap = new Map(
    orgSettingsList.map((s) => [s.organisationId, s]),
  );

  const leaveTypes = await prisma.leaveType.findMany({
    where: {
      ...orgFilter,
      active: true,
      carryForward: true,
    },
    select: {
      id: true,
      organisationId: true,
      annualQuota: true,
      name: true,
      maxCarryForward: true,
      creditSchedule: true,
    },
  });

  if (leaveTypes.length === 0) {
    logger.info({ orgId }, 'No leave types eligible for carry forward');
    return { processed: 0 };
  }

  let totalProcessed = 0;

  for (const leaveType of leaveTypes) {
    const orgSettings = settingsMap.get(leaveType.organisationId);

    if (!orgSettings?.carryForwardEnabled) continue;

    // Use type-specific limit if set, otherwise org-level limit
    const maxCarry = leaveType.maxCarryForward > 0
      ? leaveType.maxCarryForward
      : orgSettings.carryForwardMaxDays;

    const previousBalances = await prisma.leaveBalance.findMany({
      where: {
        leaveTypeId: leaveType.id,
        year: previousYear,
        user: {
          organisationId: leaveType.organisationId,
          status: 'active',
        },
      },
      select: {
        userId: true,
        allocatedDays: true,
        usedDays: true,
        pendingDays: true,
        carriedOver: true,
      },
    });

    for (const prevBalance of previousBalances) {
      const unusedDays =
        prevBalance.allocatedDays +
        prevBalance.carriedOver -
        prevBalance.usedDays -
        prevBalance.pendingDays;

      const carryAmount = Math.max(0, Math.min(unusedDays, maxCarry));

      await prisma.leaveBalance.upsert({
        where: {
          userId_leaveTypeId_year: {
            userId: prevBalance.userId,
            leaveTypeId: leaveType.id,
            year: newYear,
          },
        },
        create: {
          userId: prevBalance.userId,
          leaveTypeId: leaveType.id,
          year: newYear,
          allocatedDays: 0, // will be populated by accrual/biannual credit
          carriedOver: carryAmount,
        },
        update: {
          carriedOver: carryAmount,
        },
      });

      totalProcessed++;
    }

    logger.info(
      {
        leaveTypeId: leaveType.id,
        leaveTypeName: leaveType.name,
        orgId: leaveType.organisationId,
        usersProcessed: previousBalances.length,
        maxCarry,
      },
      'Carry forward applied',
    );
  }

  logger.info({ totalProcessed, orgId }, 'Carry forward run completed');
  return { processed: totalProcessed };
}
