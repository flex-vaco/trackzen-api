import { prisma } from '../utils/db.js';
import { AppError } from '../types/errors.js';
import { ERROR_CODES } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// LIST leave types (active only by default)
// ---------------------------------------------------------------------------

export async function listLeaveTypes(orgId: number, includeInactive = false) {
  const where: Record<string, unknown> = { organisationId: orgId };
  if (!includeInactive) {
    where.active = true;
  }

  return prisma.leaveType.findMany({
    where,
    orderBy: { name: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// CREATE leave type
// ---------------------------------------------------------------------------

export async function createLeaveType(
  orgId: number,
  input: {
    name: string;
    annualQuota?: number;
    accrualRate?: number;
    carryForward?: boolean;
    requiresDoc?: boolean;
    paid?: boolean;
  },
) {
  // Check for duplicate name within org
  const existing = await prisma.leaveType.findFirst({
    where: { organisationId: orgId, name: input.name },
  });
  if (existing) {
    throw AppError.conflict(
      `A leave type with the name "${input.name}" already exists`,
      ERROR_CODES.CONFLICT,
    );
  }

  const leaveType = await prisma.leaveType.create({
    data: {
      organisationId: orgId,
      name: input.name,
      annualQuota: input.annualQuota ?? 20,
      accrualRate: input.accrualRate ?? 0,
      carryForward: input.carryForward ?? true,
      requiresDoc: input.requiresDoc ?? false,
      paid: input.paid ?? true,
      active: true,
    },
  });

  // Initialize balance records for all active users in the org
  const currentYear = new Date().getFullYear();
  const activeUsers = await prisma.user.findMany({
    where: { organisationId: orgId, status: 'active' },
    select: { id: true },
  });

  if (activeUsers.length > 0) {
    await prisma.leaveBalance.createMany({
      data: activeUsers.map((user) => ({
        userId: user.id,
        leaveTypeId: leaveType.id,
        year: currentYear,
        allocatedDays: leaveType.annualQuota,
      })),
      skipDuplicates: true,
    });
  }

  logger.info({ leaveTypeId: leaveType.id, orgId }, 'Leave type created');
  return leaveType;
}

// ---------------------------------------------------------------------------
// UPDATE leave type
// ---------------------------------------------------------------------------

export async function updateLeaveType(
  id: number,
  orgId: number,
  input: {
    name?: string;
    annualQuota?: number;
    accrualRate?: number;
    carryForward?: boolean;
    requiresDoc?: boolean;
    paid?: boolean;
    active?: boolean;
  },
) {
  const leaveType = await prisma.leaveType.findFirst({
    where: { id, organisationId: orgId },
  });

  if (!leaveType) {
    throw AppError.notFound('Leave type not found');
  }

  // Check name uniqueness if name is being changed
  if (input.name && input.name !== leaveType.name) {
    const duplicate = await prisma.leaveType.findFirst({
      where: { organisationId: orgId, name: input.name, id: { not: id } },
    });
    if (duplicate) {
      throw AppError.conflict(
        `A leave type with the name "${input.name}" already exists`,
        ERROR_CODES.CONFLICT,
      );
    }
  }

  const updated = await prisma.leaveType.update({
    where: { id },
    data: {
      name: input.name ?? leaveType.name,
      annualQuota: input.annualQuota ?? leaveType.annualQuota,
      accrualRate: input.accrualRate ?? leaveType.accrualRate,
      carryForward: input.carryForward ?? leaveType.carryForward,
      requiresDoc: input.requiresDoc ?? leaveType.requiresDoc,
      paid: input.paid ?? leaveType.paid,
      active: input.active !== undefined ? input.active : leaveType.active,
    },
  });

  logger.info({ leaveTypeId: id, orgId }, 'Leave type updated');
  return updated;
}

// ---------------------------------------------------------------------------
// DEACTIVATE leave type (soft delete)
// ---------------------------------------------------------------------------

export async function deactivateLeaveType(id: number, orgId: number) {
  const leaveType = await prisma.leaveType.findFirst({
    where: { id, organisationId: orgId },
  });

  if (!leaveType) {
    throw AppError.notFound('Leave type not found');
  }

  if (!leaveType.active) {
    throw AppError.badRequest(
      'Leave type is already inactive',
      ERROR_CODES.VALIDATION_ERROR,
    );
  }

  const deactivated = await prisma.leaveType.update({
    where: { id },
    data: { active: false },
  });

  logger.info({ leaveTypeId: id, orgId }, 'Leave type deactivated');
  return deactivated;
}
