import { prisma } from '../utils/db.js';
import { AppError } from '../types/errors.js';
import {
  ERROR_CODES,
  LEAVE_STATUS,
  PAGINATION,
  NOTIFICATION_TYPES,
} from '../utils/constants.js';
import { countBusinessDays, isInPast, formatDateRange } from '../utils/dateHelpers.js';
import { logger } from '../utils/logger.js';
import { createNotification } from './notifications.service.js';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function getOrgSettings(orgId: number) {
  const settings = await prisma.orgSettings.findUnique({
    where: { organisationId: orgId },
  });
  if (!settings) {
    throw AppError.internal('Organisation settings not found');
  }
  return settings;
}

async function getHolidayDates(orgId: number, start: Date, end: Date): Promise<Date[]> {
  const holidays = await prisma.holiday.findMany({
    where: {
      organisationId: orgId,
      date: { gte: start, lte: end },
    },
    select: { date: true },
  });
  return holidays.map((h) => h.date);
}

async function getOrCreateBalance(userId: number, leaveTypeId: number, year: number) {
  let balance = await prisma.leaveBalance.findUnique({
    where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
  });

  if (!balance) {
    const leaveType = await prisma.leaveType.findUnique({
      where: { id: leaveTypeId },
      select: { annualQuota: true },
    });
    balance = await prisma.leaveBalance.create({
      data: {
        userId,
        leaveTypeId,
        year,
        allocatedDays: leaveType?.annualQuota ?? 0,
      },
    });
  }

  return balance;
}

function availableDays(balance: { allocatedDays: number; carriedOver: number; usedDays: number; pendingDays: number }): number {
  return balance.allocatedDays + balance.carriedOver - balance.usedDays - balance.pendingDays;
}

// ---------------------------------------------------------------------------
// CREATE leave request
// ---------------------------------------------------------------------------

export async function createLeaveRequest(
  userId: number,
  orgId: number,
  input: {
    leaveTypeId: number;
    startDate: string;
    endDate: string;
    reason?: string;
  },
) {
  const startDate = new Date(input.startDate);
  const endDate = new Date(input.endDate);
  startDate.setUTCHours(0, 0, 0, 0);
  endDate.setUTCHours(0, 0, 0, 0);

  // Validate date range
  if (endDate < startDate) {
    throw AppError.badRequest(
      'End date must be on or after start date',
      ERROR_CODES.INVALID_DATE_RANGE,
    );
  }

  const settings = await getOrgSettings(orgId);

  // Check backdating
  if (!settings.leaveAllowBackdated && isInPast(startDate)) {
    throw AppError.badRequest(
      'Back-dated leave requests are not allowed',
      ERROR_CODES.BACKDATING_NOT_ALLOWED,
    );
  }

  // Check leave type is active and belongs to org
  const leaveType = await prisma.leaveType.findFirst({
    where: { id: input.leaveTypeId, organisationId: orgId },
  });
  if (!leaveType) {
    throw AppError.notFound('Leave type not found');
  }
  if (!leaveType.active) {
    throw AppError.badRequest('This leave type is no longer active', ERROR_CODES.VALIDATION_ERROR);
  }

  // Calculate business days
  const holidays = await getHolidayDates(orgId, startDate, endDate);
  const businessDays = countBusinessDays(startDate, endDate, holidays);

  if (businessDays <= 0) {
    throw AppError.badRequest(
      'Leave request must cover at least one business day',
      ERROR_CODES.INVALID_DATE_RANGE,
    );
  }

  // Check overlapping leave requests
  const overlapping = await prisma.leaveRequest.findFirst({
    where: {
      userId,
      organisationId: orgId,
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
  if (overlapping) {
    throw AppError.conflict(
      'You already have a leave request overlapping with this date range',
      ERROR_CODES.OVERLAPPING_LEAVE,
    );
  }

  // Check balance
  const year = startDate.getFullYear();
  const balance = await getOrCreateBalance(userId, input.leaveTypeId, year);
  const available = availableDays(balance);

  if (businessDays > available) {
    throw AppError.badRequest(
      `Insufficient leave balance. Available: ${available} days, Requested: ${businessDays} days`,
      ERROR_CODES.INSUFFICIENT_LEAVE_BALANCE,
    );
  }

  // Create request and hold pendingDays in a transaction
  const leaveRequest = await prisma.$transaction(async (tx) => {
    const request = await tx.leaveRequest.create({
      data: {
        organisationId: orgId,
        userId,
        leaveTypeId: input.leaveTypeId,
        startDate,
        endDate,
        businessDays,
        reason: input.reason ?? null,
        status: 'PENDING',
      },
      include: {
        leaveType: { select: { name: true } },
        user: { select: { id: true, name: true } },
      },
    });

    // Hold pending days on balance
    await tx.leaveBalance.update({
      where: { userId_leaveTypeId_year: { userId, leaveTypeId: input.leaveTypeId, year } },
      data: { pendingDays: { increment: businessDays } },
    });

    // Create approval records based on approval levels
    if (settings.leaveRequireApproval) {
      const levels = settings.leaveApprovalLevels;
      const managerRows = await tx.managerEmployee.findMany({
        where: { employeeId: userId },
        select: { managerId: true },
        orderBy: { createdAt: 'asc' },
      });

      for (let level = 1; level <= levels; level++) {
        // Assign manager if available, otherwise use the first manager for all levels
        const assignedManagerId = managerRows[level - 1]?.managerId ?? managerRows[0]?.managerId;
        if (assignedManagerId) {
          await tx.leaveApproval.create({
            data: {
              leaveRequestId: request.id,
              approverId: assignedManagerId,
              level,
              status: 'PENDING',
            },
          });
        }
      }
    }

    return request;
  });

  // Notify managers
  const managers = await prisma.managerEmployee.findMany({
    where: { employeeId: userId },
    select: { managerId: true },
  });

  const dateRange = formatDateRange(startDate, endDate);
  for (const { managerId } of managers) {
    createNotification(
      managerId,
      NOTIFICATION_TYPES.LEAVE_SUBMITTED,
      `${leaveRequest.user.name} has requested ${leaveRequest.leaveType.name} leave for ${dateRange} (${businessDays} day${businessDays !== 1 ? 's' : ''})`,
    ).catch((err) => logger.error({ err }, 'Notification dispatch error'));
  }

  logger.info({ leaveRequestId: leaveRequest.id, userId }, 'Leave request created');
  return leaveRequest;
}

// ---------------------------------------------------------------------------
// LIST leave requests (user's own, paginated)
// ---------------------------------------------------------------------------

export async function listLeaveRequests(
  userId: number,
  orgId: number,
  filters: {
    year?: number;
    status?: string;
    page?: number;
    limit?: number;
  } = {},
) {
  const page = filters.page ?? PAGINATION.DEFAULT_PAGE;
  const take = Math.min(filters.limit ?? PAGINATION.DEFAULT_LIMIT, PAGINATION.MAX_LIMIT);
  const skip = (page - 1) * take;

  const where: Record<string, unknown> = {
    userId,
    organisationId: orgId,
  };

  if (filters.status) {
    where.status = filters.status;
  }

  if (filters.year) {
    where.startDate = {
      gte: new Date(`${filters.year}-01-01`),
      lt: new Date(`${filters.year + 1}-01-01`),
    };
  }

  const [data, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: {
        leaveType: { select: { id: true, name: true } },
        approvals: {
          select: { id: true, level: true, status: true, comment: true, actionDate: true },
          orderBy: { level: 'asc' },
        },
      },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.leaveRequest.count({ where }),
  ]);

  return { data, meta: { total, page, limit: take } };
}

// ---------------------------------------------------------------------------
// GET single leave request
// ---------------------------------------------------------------------------

export async function getLeaveRequest(id: number, userId: number, orgId: number) {
  const request = await prisma.leaveRequest.findFirst({
    where: { id, organisationId: orgId },
    include: {
      leaveType: { select: { id: true, name: true } },
      user: { select: { id: true, name: true, email: true } },
      approvals: {
        include: {
          approver: { select: { id: true, name: true } },
        },
        orderBy: { level: 'asc' },
      },
    },
  });

  if (!request) {
    throw AppError.notFound('Leave request not found');
  }

  return request;
}

// ---------------------------------------------------------------------------
// UPDATE leave request (only PENDING)
// ---------------------------------------------------------------------------

export async function updateLeaveRequest(
  id: number,
  userId: number,
  orgId: number,
  input: {
    leaveTypeId?: number;
    startDate?: string;
    endDate?: string;
    reason?: string;
  },
) {
  const existing = await prisma.leaveRequest.findFirst({
    where: { id, userId, organisationId: orgId },
  });

  if (!existing) {
    throw AppError.notFound('Leave request not found');
  }

  if (existing.status !== LEAVE_STATUS.PENDING) {
    throw AppError.badRequest(
      'Only PENDING leave requests can be updated',
      ERROR_CODES.INVALID_TRANSITION,
    );
  }

  const leaveTypeId = input.leaveTypeId ?? existing.leaveTypeId;
  const startDate = input.startDate ? new Date(input.startDate) : new Date(existing.startDate);
  const endDate = input.endDate ? new Date(input.endDate) : new Date(existing.endDate);
  startDate.setUTCHours(0, 0, 0, 0);
  endDate.setUTCHours(0, 0, 0, 0);

  if (endDate < startDate) {
    throw AppError.badRequest(
      'End date must be on or after start date',
      ERROR_CODES.INVALID_DATE_RANGE,
    );
  }

  const settings = await getOrgSettings(orgId);

  if (!settings.leaveAllowBackdated && isInPast(startDate)) {
    throw AppError.badRequest(
      'Back-dated leave requests are not allowed',
      ERROR_CODES.BACKDATING_NOT_ALLOWED,
    );
  }

  // Verify leave type
  if (input.leaveTypeId) {
    const leaveType = await prisma.leaveType.findFirst({
      where: { id: input.leaveTypeId, organisationId: orgId, active: true },
    });
    if (!leaveType) {
      throw AppError.notFound('Leave type not found or inactive');
    }
  }

  // Check overlapping (excluding this request)
  const overlapping = await prisma.leaveRequest.findFirst({
    where: {
      userId,
      organisationId: orgId,
      id: { not: id },
      status: { in: ['PENDING', 'APPROVED'] },
      startDate: { lte: endDate },
      endDate: { gte: startDate },
    },
  });
  if (overlapping) {
    throw AppError.conflict(
      'You already have a leave request overlapping with this date range',
      ERROR_CODES.OVERLAPPING_LEAVE,
    );
  }

  // Recalculate business days
  const holidays = await getHolidayDates(orgId, startDate, endDate);
  const businessDays = countBusinessDays(startDate, endDate, holidays);

  if (businessDays <= 0) {
    throw AppError.badRequest(
      'Leave request must cover at least one business day',
      ERROR_CODES.INVALID_DATE_RANGE,
    );
  }

  const year = startDate.getFullYear();
  const oldYear = new Date(existing.startDate).getFullYear();

  const updated = await prisma.$transaction(async (tx) => {
    // Release old pending hold
    await tx.leaveBalance.update({
      where: {
        userId_leaveTypeId_year: {
          userId,
          leaveTypeId: existing.leaveTypeId,
          year: oldYear,
        },
      },
      data: { pendingDays: { decrement: existing.businessDays } },
    });

    // Check new balance
    const balance = await getOrCreateBalance(userId, leaveTypeId, year);
    // Re-read after decrement (if same type+year the decrement already happened above)
    const freshBalance = await tx.leaveBalance.findUnique({
      where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
    });
    const available = freshBalance
      ? availableDays(freshBalance)
      : availableDays(balance);

    if (businessDays > available) {
      throw AppError.badRequest(
        `Insufficient leave balance. Available: ${available} days, Requested: ${businessDays} days`,
        ERROR_CODES.INSUFFICIENT_LEAVE_BALANCE,
      );
    }

    // Place new hold
    await tx.leaveBalance.update({
      where: { userId_leaveTypeId_year: { userId, leaveTypeId, year } },
      data: { pendingDays: { increment: businessDays } },
    });

    return tx.leaveRequest.update({
      where: { id },
      data: {
        leaveTypeId,
        startDate,
        endDate,
        businessDays,
        reason: input.reason !== undefined ? input.reason : existing.reason,
      },
      include: {
        leaveType: { select: { id: true, name: true } },
      },
    });
  });

  logger.info({ leaveRequestId: id, userId }, 'Leave request updated');
  return updated;
}

// ---------------------------------------------------------------------------
// CANCEL leave request
// ---------------------------------------------------------------------------

export async function cancelLeaveRequest(
  id: number,
  userId: number,
  orgId: number,
  cancelReason?: string,
) {
  const request = await prisma.leaveRequest.findFirst({
    where: { id, userId, organisationId: orgId },
    include: {
      leaveType: { select: { name: true } },
      user: { select: { id: true, name: true } },
    },
  });

  if (!request) {
    throw AppError.notFound('Leave request not found');
  }

  if (request.status === LEAVE_STATUS.REJECTED || request.status === LEAVE_STATUS.CANCELLED) {
    throw AppError.badRequest(
      'This leave request cannot be cancelled',
      ERROR_CODES.LEAVE_NOT_CANCELLABLE,
    );
  }

  // APPROVED can only be cancelled if start date is in the future
  if (request.status === LEAVE_STATUS.APPROVED) {
    const today = new Date();
    today.setUTCHours(0, 0, 0, 0);
    const start = new Date(request.startDate);
    start.setUTCHours(0, 0, 0, 0);

    if (start <= today) {
      throw AppError.badRequest(
        'Approved leave that has already started cannot be cancelled',
        ERROR_CODES.LEAVE_NOT_CANCELLABLE,
      );
    }
  }

  const year = new Date(request.startDate).getFullYear();

  const cancelled = await prisma.$transaction(async (tx) => {
    // Release balance hold
    if (request.status === LEAVE_STATUS.PENDING) {
      await tx.leaveBalance.update({
        where: {
          userId_leaveTypeId_year: { userId, leaveTypeId: request.leaveTypeId, year },
        },
        data: { pendingDays: { decrement: request.businessDays } },
      });
    } else if (request.status === LEAVE_STATUS.APPROVED) {
      await tx.leaveBalance.update({
        where: {
          userId_leaveTypeId_year: { userId, leaveTypeId: request.leaveTypeId, year },
        },
        data: { usedDays: { decrement: request.businessDays } },
      });
    }

    return tx.leaveRequest.update({
      where: { id },
      data: {
        status: 'CANCELLED',
        cancelledAt: new Date(),
        cancelReason: cancelReason ?? null,
      },
      include: {
        leaveType: { select: { id: true, name: true } },
      },
    });
  });

  // Notify managers
  const managers = await prisma.managerEmployee.findMany({
    where: { employeeId: userId },
    select: { managerId: true },
  });

  const dateRange = formatDateRange(request.startDate, request.endDate);
  for (const { managerId } of managers) {
    createNotification(
      managerId,
      NOTIFICATION_TYPES.LEAVE_CANCELLED,
      `${request.user.name} has cancelled their ${request.leaveType.name} leave for ${dateRange}`,
    ).catch((err) => logger.error({ err }, 'Notification dispatch error'));
  }

  logger.info({ leaveRequestId: id, userId }, 'Leave request cancelled');
  return cancelled;
}
