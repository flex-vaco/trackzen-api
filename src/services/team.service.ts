import { prisma } from '../utils/db.js';
import { AppError } from '../types/errors.js';
import { ERROR_CODES } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// Get managers assigned to the current user
// ---------------------------------------------------------------------------

export async function getMyManagers(userId: number) {
  const rows = await prisma.managerEmployee.findMany({
    where: { employeeId: userId },
    include: {
      manager: {
        select: { id: true, name: true, email: true, role: true, department: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((r) => r.manager);
}

// ---------------------------------------------------------------------------
// Get direct reports of the current user
// ---------------------------------------------------------------------------

export async function getMyReports(userId: number) {
  const rows = await prisma.managerEmployee.findMany({
    where: { managerId: userId },
    include: {
      employee: {
        select: { id: true, name: true, email: true, role: true, department: true, status: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((r) => r.employee);
}

// ---------------------------------------------------------------------------
// Get managers for a given user (Admin only — scoped to org)
// ---------------------------------------------------------------------------

export async function getUserManagers(userId: number, orgId: number) {
  // Verify user belongs to org
  const user = await prisma.user.findFirst({
    where: { id: userId, organisationId: orgId },
    select: { id: true },
  });
  if (!user) throw AppError.notFound('User not found in this organisation');

  const rows = await prisma.managerEmployee.findMany({
    where: { employeeId: userId },
    include: {
      manager: {
        select: { id: true, name: true, email: true, role: true, department: true },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  return rows.map((r) => r.manager);
}

// ---------------------------------------------------------------------------
// Assign managers to a user (Admin only)
// ---------------------------------------------------------------------------

export async function assignManagers(
  userId: number,
  managerIds: number[],
  orgId: number,
) {
  // No self-assignment
  if (managerIds.includes(userId)) {
    throw AppError.badRequest(
      'A user cannot be assigned as their own manager',
      ERROR_CODES.SELF_MANAGER_ASSIGNMENT,
    );
  }

  // Verify the target user belongs to the org
  const user = await prisma.user.findFirst({
    where: { id: userId, organisationId: orgId },
    select: { id: true, name: true },
  });
  if (!user) throw AppError.notFound('User not found in this organisation');

  // Verify all managers belong to the same org
  if (managerIds.length > 0) {
    const managers = await prisma.user.findMany({
      where: { id: { in: managerIds }, organisationId: orgId },
      select: { id: true },
    });
    const foundIds = new Set(managers.map((m) => m.id));
    for (const mid of managerIds) {
      if (!foundIds.has(mid)) {
        throw AppError.notFound(`Manager with id ${mid} not found in this organisation`);
      }
    }
  }

  // Replace all manager assignments
  await prisma.$transaction(async (tx) => {
    await tx.managerEmployee.deleteMany({ where: { employeeId: userId } });

    if (managerIds.length > 0) {
      await tx.managerEmployee.createMany({
        data: managerIds.map((managerId) => ({
          managerId,
          employeeId: userId,
        })),
      });
    }
  });

  logger.info({ userId, managerIds, orgId }, 'Managers assigned');

  // Return the updated list
  return getUserManagers(userId, orgId);
}
