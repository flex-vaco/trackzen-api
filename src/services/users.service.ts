import bcrypt from 'bcryptjs';
import { prisma } from '../utils/db.js';
import { AppError } from '../types/errors.js';
import { ERROR_CODES, USER_STATUS } from '../utils/constants.js';
import { logger } from '../utils/logger.js';
import { initializeBalances } from './leaveBalances.service.js';
import type { UserRole } from '@prisma/client';

const BCRYPT_ROUNDS = 12;

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
// LIST users
// ---------------------------------------------------------------------------

export async function listUsers(
  orgId: number,
  role: UserRole,
  userId: number,
  page = 1,
  limit = 20,
) {
  const take = Math.min(limit, 100);
  const skip = (page - 1) * take;

  let where: Record<string, unknown> = { organisationId: orgId };

  // Manager sees only direct reports
  if (role === 'MANAGER') {
    const reportIds = await getDirectReportIds(userId);
    where = { ...where, id: { in: reportIds } };
  }

  const [data, total] = await Promise.all([
    prisma.user.findMany({
      where,
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        status: true,
        createdAt: true,
      },
      orderBy: { name: 'asc' },
      skip,
      take,
    }),
    prisma.user.count({ where }),
  ]);

  return { data, meta: { total, page, limit: take } };
}

// ---------------------------------------------------------------------------
// CREATE user
// ---------------------------------------------------------------------------

export async function createUser(
  orgId: number,
  input: {
    name: string;
    email: string;
    password: string;
    role?: UserRole;
    department?: string;
  },
  creatorRole: UserRole,
) {
  // Managers can only create EMPLOYEE users
  if (creatorRole === 'MANAGER' && input.role && input.role !== 'EMPLOYEE') {
    throw AppError.forbidden(
      'Managers can only create employees',
      ERROR_CODES.FORBIDDEN,
    );
  }

  // Check for duplicate email
  const existing = await prisma.user.findUnique({ where: { email: input.email } });
  if (existing) {
    throw AppError.conflict('Email already registered', ERROR_CODES.CONFLICT);
  }

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);

  const user = await prisma.user.create({
    data: {
      organisationId: orgId,
      name: input.name,
      email: input.email,
      passwordHash,
      role: input.role ?? 'EMPLOYEE',
      department: input.department ?? null,
      status: USER_STATUS.ACTIVE,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      status: true,
      createdAt: true,
    },
  });

  // Initialize leave balances for the new user
  await initializeBalances(user.id, orgId).catch((err) =>
    logger.error({ err, userId: user.id }, 'Failed to initialize leave balances'),
  );

  logger.info({ userId: user.id, orgId }, 'User created');
  return user;
}

// ---------------------------------------------------------------------------
// UPDATE user
// ---------------------------------------------------------------------------

export async function updateUser(
  id: number,
  orgId: number,
  input: {
    name?: string;
    email?: string;
    role?: UserRole;
    department?: string;
  },
) {
  const user = await prisma.user.findFirst({
    where: { id, organisationId: orgId },
  });

  if (!user) {
    throw AppError.notFound('User not found');
  }

  // Check email uniqueness if changing email
  if (input.email && input.email !== user.email) {
    const duplicate = await prisma.user.findUnique({ where: { email: input.email } });
    if (duplicate) {
      throw AppError.conflict('Email already in use', ERROR_CODES.CONFLICT);
    }
  }

  const updated = await prisma.user.update({
    where: { id },
    data: {
      name: input.name ?? user.name,
      email: input.email ?? user.email,
      role: input.role ?? user.role,
      department: input.department !== undefined ? input.department : user.department,
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      department: true,
      status: true,
      createdAt: true,
    },
  });

  logger.info({ userId: id, orgId }, 'User updated');
  return updated;
}

// ---------------------------------------------------------------------------
// DEACTIVATE user (soft delete)
// ---------------------------------------------------------------------------

export async function deactivateUser(id: number, orgId: number) {
  const user = await prisma.user.findFirst({
    where: { id, organisationId: orgId },
  });

  if (!user) {
    throw AppError.notFound('User not found');
  }

  if (user.status === USER_STATUS.INACTIVE) {
    throw AppError.badRequest('User is already inactive', ERROR_CODES.VALIDATION_ERROR);
  }

  const deactivated = await prisma.$transaction(async (tx) => {
    // Set user status to inactive
    const updated = await tx.user.update({
      where: { id },
      data: { status: USER_STATUS.INACTIVE },
      select: {
        id: true,
        name: true,
        email: true,
        role: true,
        department: true,
        status: true,
        createdAt: true,
      },
    });

    // Remove all ManagerEmployee assignments (as manager or employee)
    await tx.managerEmployee.deleteMany({
      where: {
        OR: [{ managerId: id }, { employeeId: id }],
      },
    });

    return updated;
  });

  logger.info({ userId: id, orgId }, 'User deactivated');
  return deactivated;
}
