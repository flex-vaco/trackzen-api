import { prisma } from '../utils/db.js';
import { logger } from '../utils/logger.js';

/**
 * Leave Entitlement Calculator
 *
 * Implements the following leave policies:
 *
 * 1. Casual Leave (CL) — 7/year, BIANNUAL credit (3.5 in Jan, 3.5 in Jul)
 *    - All employee types eligible
 *    - Prorated for new joiners (joining after 15th → prorate from next month)
 *
 * 2. Earned Leave (EL) — 15/year, MONTHLY credit (1.25/month)
 *    - Only FULL_TIME employees
 *    - Prorated for joiners/separations
 *    - Carry forward max 5, encash max 15
 *
 * 3. Sick/Medical Leave (SL) — 7/year, BIANNUAL credit (3.5 Jan-Jun, 3.5 Jul-Dec)
 *    - Prorated for new joiners
 *    - Requires medical docs for >2 consecutive days
 */

// ---------------------------------------------------------------------------
// TYPES
// ---------------------------------------------------------------------------

export interface LeaveTypeConfig {
  id: number;
  name: string;
  annualQuota: number;
  accrualRate: number;
  creditSchedule: string; // 'ANNUAL' | 'BIANNUAL' | 'MONTHLY'
  eligibleTypes: string;
  maxCarryForward: number;
  maxEncashment: number;
}

interface UserInfo {
  id: number;
  joiningDate: Date | null;
  employeeType: string;
  organisationId: number;
}

// ---------------------------------------------------------------------------
// PRORATION HELPERS
// ---------------------------------------------------------------------------

/**
 * Determine the effective start month for proration.
 * If joining after the 15th, prorate from the NEXT month.
 */
function getEffectiveStartMonth(joiningDate: Date): number {
  const day = joiningDate.getDate();
  const month = joiningDate.getMonth(); // 0-based
  if (day > 15) {
    return month + 1; // next month (can be 12 = January of next year, handled by caller)
  }
  return month;
}

/**
 * Calculate prorated BIANNUAL credit for a half-year period.
 *
 * Biannual credits: 3.5 in Jan (covers Jan-Jun), 3.5 in Jul (covers Jul-Dec)
 * Each half has 6 months. Prorate = (halfCredit / 6) * remainingMonths
 *
 * @param halfCredit - credit for the half (e.g., 3.5)
 * @param halfStartMonth - 0 for Jan-Jun, 6 for Jul-Dec
 * @param effectiveStartMonth - month from which employee is entitled (0-based)
 * @param joiningYear - year of joining
 * @param targetYear - year we're calculating for
 */
function proratedBiannualCredit(
  halfCredit: number,
  halfStartMonth: number,
  effectiveStartMonth: number,
  joiningYear: number,
  targetYear: number,
): number {
  const halfEndMonth = halfStartMonth + 5; // inclusive, 0-based

  // If joining year is before target year, full credit
  if (joiningYear < targetYear) return halfCredit;

  // If joining year is after target year, no credit
  if (joiningYear > targetYear) return 0;

  // Same year — prorate
  // If effective start month is beyond this half, no credit
  if (effectiveStartMonth > halfEndMonth) return 0;

  // If effective start month is at or before half start, full credit
  if (effectiveStartMonth <= halfStartMonth) return halfCredit;

  // Prorate: remaining months in this half
  const monthsInHalf = 6;
  const remainingMonths = halfEndMonth - effectiveStartMonth + 1;
  return Math.round((halfCredit / monthsInHalf) * remainingMonths * 100) / 100;
}

/**
 * Calculate prorated MONTHLY credit.
 * Returns total for the year based on joining date.
 */
function proratedMonthlyCredit(
  monthlyRate: number,
  effectiveStartMonth: number,
  joiningYear: number,
  targetYear: number,
): number {
  if (joiningYear < targetYear) return monthlyRate * 12;
  if (joiningYear > targetYear) return 0;
  // Same year
  if (effectiveStartMonth >= 12) return 0; // joined after Dec 15th effectively
  const months = 12 - effectiveStartMonth;
  return Math.round(monthlyRate * months * 100) / 100;
}

// ---------------------------------------------------------------------------
// MAIN CALCULATION
// ---------------------------------------------------------------------------

/**
 * Calculate leave entitlement for a user for a given year and leave type.
 */
export function calculateEntitlement(
  leaveType: LeaveTypeConfig,
  user: UserInfo,
  targetYear: number,
): { h1Credit: number; h2Credit: number; totalCredit: number } {
  const joiningDate = user.joiningDate ?? new Date(targetYear, 0, 1); // default: Jan 1
  const joiningYear = joiningDate.getFullYear();
  const effectiveStartMonth = joiningYear === targetYear ? getEffectiveStartMonth(joiningDate) : 0;

  switch (leaveType.creditSchedule) {
    case 'BIANNUAL': {
      const halfCredit = leaveType.annualQuota / 2;
      const h1 = proratedBiannualCredit(halfCredit, 0, effectiveStartMonth, joiningYear, targetYear);
      const h2 = proratedBiannualCredit(halfCredit, 6, effectiveStartMonth, joiningYear, targetYear);
      return { h1Credit: h1, h2Credit: h2, totalCredit: h1 + h2 };
    }
    case 'MONTHLY': {
      const monthlyRate = leaveType.accrualRate || leaveType.annualQuota / 12;
      const total = proratedMonthlyCredit(monthlyRate, effectiveStartMonth, joiningYear, targetYear);
      return { h1Credit: total / 2, h2Credit: total / 2, totalCredit: total };
    }
    case 'ANNUAL':
    default: {
      if (joiningYear < targetYear) {
        return { h1Credit: leaveType.annualQuota, h2Credit: 0, totalCredit: leaveType.annualQuota };
      }
      if (joiningYear > targetYear) {
        return { h1Credit: 0, h2Credit: 0, totalCredit: 0 };
      }
      // Prorate for same year — remaining months / 12
      const monthsRemaining = Math.max(0, 12 - effectiveStartMonth);
      const total = Math.round((leaveType.annualQuota / 12) * monthsRemaining * 100) / 100;
      return { h1Credit: total, h2Credit: 0, totalCredit: total };
    }
  }
}

/**
 * Check if a user is eligible for a leave type based on employee type.
 */
export function isEligible(leaveType: LeaveTypeConfig, employeeType: string): boolean {
  if (leaveType.eligibleTypes === 'ALL') return true;
  const eligible = leaveType.eligibleTypes.split(',').map((s) => s.trim().toUpperCase());
  return eligible.includes(employeeType.toUpperCase());
}

// ---------------------------------------------------------------------------
// BIANNUAL CREDIT SERVICE (called by cron in Jan and Jul)
// ---------------------------------------------------------------------------

/**
 * Credit biannual leave allocations.
 * Call in January (half=1) and July (half=2).
 *
 * For each active user + biannual leave type:
 *   - Calculate prorated credit for this half
 *   - Upsert balance record, incrementing allocatedDays
 */
export async function creditBiannualLeaves(orgId?: number, half?: 1 | 2) {
  const now = new Date();
  const currentYear = now.getFullYear();
  const currentMonth = now.getMonth(); // 0-based
  const creditHalf = half ?? (currentMonth < 6 ? 1 : 2);

  const orgFilter = orgId ? { organisationId: orgId } : {};

  const leaveTypes = await prisma.leaveType.findMany({
    where: {
      ...orgFilter,
      active: true,
      creditSchedule: 'BIANNUAL',
    },
  });

  if (leaveTypes.length === 0) return { processed: 0 };

  let totalProcessed = 0;

  for (const lt of leaveTypes) {
    const activeUsers = await prisma.user.findMany({
      where: {
        organisationId: lt.organisationId,
        status: 'active',
      },
      select: { id: true, joiningDate: true, employeeType: true, organisationId: true },
    });

    for (const user of activeUsers) {
      if (!isEligible(lt as LeaveTypeConfig, user.employeeType)) continue;

      const entitlement = calculateEntitlement(lt as LeaveTypeConfig, user, currentYear);
      const creditAmount = creditHalf === 1 ? entitlement.h1Credit : entitlement.h2Credit;

      if (creditAmount <= 0) continue;

      await prisma.leaveBalance.upsert({
        where: {
          userId_leaveTypeId_year: {
            userId: user.id,
            leaveTypeId: lt.id,
            year: currentYear,
          },
        },
        create: {
          userId: user.id,
          leaveTypeId: lt.id,
          year: currentYear,
          allocatedDays: creditAmount,
        },
        update: {
          allocatedDays: { increment: creditAmount },
        },
      });

      totalProcessed++;
    }

    logger.info({
      leaveTypeId: lt.id,
      leaveTypeName: lt.name,
      half: creditHalf,
      usersProcessed: totalProcessed,
    }, 'Biannual leave credit applied');
  }

  return { processed: totalProcessed };
}

// ---------------------------------------------------------------------------
// INITIALIZE BALANCES FOR NEW JOINER
// ---------------------------------------------------------------------------

/**
 * Initialize leave balances for a newly joined user based on their joining date.
 * Calculates prorated entitlements for each active leave type.
 */
export async function initializeNewJoinerBalances(userId: number, orgId: number) {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, joiningDate: true, employeeType: true, organisationId: true },
  });

  if (!user) return;

  const joiningDate = user.joiningDate ?? new Date();
  const targetYear = joiningDate.getFullYear();
  const currentMonth = joiningDate.getMonth();

  const leaveTypes = await prisma.leaveType.findMany({
    where: { organisationId: orgId, active: true },
  });

  for (const lt of leaveTypes) {
    if (!isEligible(lt as LeaveTypeConfig, user.employeeType)) continue;

    const entitlement = calculateEntitlement(lt as LeaveTypeConfig, user, targetYear);

    // For BIANNUAL: only credit the relevant half (or both if joining in H1)
    let allocatedDays = 0;
    if (lt.creditSchedule === 'BIANNUAL') {
      // Credit H1 if joining in H1, credit H2 always (if applicable)
      if (currentMonth < 6) {
        allocatedDays = entitlement.h1Credit; // H1 credited now, H2 will be credited in Jul
      } else {
        allocatedDays = entitlement.h2Credit; // H1 already passed, only H2
      }
    } else if (lt.creditSchedule === 'MONTHLY') {
      // For monthly accrual, credit the joining month's portion
      const monthlyRate = lt.accrualRate || lt.annualQuota / 12;
      const effectiveMonth = getEffectiveStartMonth(joiningDate);
      // Credit from effective month to current month
      if (effectiveMonth <= currentMonth) {
        allocatedDays = Math.round(monthlyRate * (currentMonth - effectiveMonth + 1) * 100) / 100;
      }
    } else {
      allocatedDays = entitlement.totalCredit;
    }

    if (allocatedDays <= 0) continue;

    await prisma.leaveBalance.upsert({
      where: {
        userId_leaveTypeId_year: {
          userId: user.id,
          leaveTypeId: lt.id,
          year: targetYear,
        },
      },
      create: {
        userId: user.id,
        leaveTypeId: lt.id,
        year: targetYear,
        allocatedDays,
      },
      update: {
        allocatedDays,
      },
    });
  }

  logger.info({ userId, orgId, year: targetYear }, 'New joiner leave balances initialized');
}

// ---------------------------------------------------------------------------
// YEAR-END EARNED LEAVE PROCESSING
// ---------------------------------------------------------------------------

/**
 * Process year-end earned leave options: carry forward and/or encashment.
 *
 * @param userId - the employee
 * @param leaveTypeId - the earned leave type
 * @param year - the year ending
 * @param action - 'CARRY_FORWARD' | 'ENCASH' | 'PARTIAL' (carry max, encash rest)
 * @param carryDays - days to carry forward (for PARTIAL action)
 */
export async function processYearEndEarnedLeave(
  userId: number,
  leaveTypeId: number,
  year: number,
  action: 'CARRY_FORWARD' | 'ENCASH' | 'PARTIAL',
  carryDays?: number,
) {
  const balance = await prisma.leaveBalance.findUnique({
    where: {
      userId_leaveTypeId_year: { userId, leaveTypeId, year },
    },
    include: { leaveType: true },
  });

  if (!balance) throw new Error('Balance not found');

  const unusedDays = balance.allocatedDays + balance.carriedOver - balance.usedDays - balance.pendingDays;
  if (unusedDays <= 0) return { carried: 0, encashed: 0 };

  const maxCarry = balance.leaveType.maxCarryForward || 5; // default 5 for EL
  const maxEncash = balance.leaveType.maxEncashment || 15; // default 15 for EL
  const newYear = year + 1;

  let carried = 0;
  let encashed = 0;

  switch (action) {
    case 'CARRY_FORWARD':
      carried = Math.min(unusedDays, maxCarry);
      break;
    case 'ENCASH':
      encashed = Math.min(unusedDays, maxEncash);
      break;
    case 'PARTIAL':
      carried = Math.min(carryDays ?? maxCarry, maxCarry, unusedDays);
      encashed = Math.min(unusedDays - carried, maxEncash);
      break;
  }

  // Create/update next year balance with carry forward
  if (carried > 0) {
    await prisma.leaveBalance.upsert({
      where: {
        userId_leaveTypeId_year: { userId, leaveTypeId, year: newYear },
      },
      create: {
        userId,
        leaveTypeId,
        year: newYear,
        allocatedDays: 0, // will be set by accrual
        carriedOver: carried,
      },
      update: {
        carriedOver: carried,
      },
    });
  }

  logger.info({ userId, leaveTypeId, year, action, carried, encashed }, 'Year-end EL processed');

  return { carried, encashed, unusedDays };
}
