import { prisma } from '../utils/db.js';
import { AppError } from '../types/errors.js';
import {
  ERROR_CODES,
  LEAVE_STATUS,
  APPROVAL_STATUS,
  NOTIFICATION_TYPES,
} from '../utils/constants.js';
import { formatDateRange } from '../utils/dateHelpers.js';
import { logger } from '../utils/logger.js';
import { createNotification } from './notifications.service.js';
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

async function getOrgSettings(orgId: number) {
  const settings = await prisma.orgSettings.findUnique({
    where: { organisationId: orgId },
  });
  if (!settings) {
    throw AppError.internal('Organisation settings not found');
  }
  return settings;
}

function buildUserFilter(role: UserRole, reportIds: number[]) {
  if (role === 'MANAGER') {
    return { userId: { in: reportIds } };
  }
  // ADMIN sees all in the org
  return {};
}

// ---------------------------------------------------------------------------
// LIST pending leave requests (for approval)
// ---------------------------------------------------------------------------

export async function listPendingLeave(
  userId: number,
  orgId: number,
  role: UserRole,
  page = 1,
  limit = 20,
) {
  const take = Math.min(limit, 100);
  const skip = (page - 1) * take;

  let userFilter: { userId?: { in: number[] } } = {};
  if (role === 'MANAGER') {
    const reportIds = await getDirectReportIds(userId);
    userFilter = buildUserFilter(role, reportIds);
  }

  const where = {
    organisationId: orgId,
    status: 'PENDING' as const,
    ...userFilter,
  };

  const [data, total] = await Promise.all([
    prisma.leaveRequest.findMany({
      where,
      include: {
        user: { select: { id: true, name: true, email: true, department: true } },
        leaveType: { select: { id: true, name: true } },
        approvals: {
          orderBy: { level: 'asc' },
          include: {
            approver: { select: { id: true, name: true } },
          },
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
// APPROVAL STATS
// ---------------------------------------------------------------------------

export async function getLeaveApprovalStats(
  userId: number,
  orgId: number,
  role: UserRole,
) {
  let userFilter: { userId?: { in: number[] } } = {};
  let teamMemberCount = 0;

  if (role === 'MANAGER') {
    const reportIds = await getDirectReportIds(userId);
    userFilter = buildUserFilter(role, reportIds);
    teamMemberCount = reportIds.length;
  } else {
    const orgUsers = await prisma.user.count({
      where: { organisationId: orgId, status: 'active' },
    });
    teamMemberCount = orgUsers;
  }

  const now = new Date();
  const yearStart = new Date(Date.UTC(now.getUTCFullYear(), 0, 1));
  const yearEnd = new Date(Date.UTC(now.getUTCFullYear(), 11, 31, 23, 59, 59, 999));

  const [pendingCount, approvedThisYear, rejectedThisYear] = await Promise.all([
    prisma.leaveRequest.count({
      where: {
        organisationId: orgId,
        status: "PENDING",
        ...userFilter,
      },
    }),
    prisma.leaveRequest.count({
      where: {
        organisationId: orgId,
        status: "APPROVED",
        updatedAt: { gte: yearStart, lte: yearEnd },
        ...userFilter,
      },
    }),
    prisma.leaveRequest.count({
      where: {
        organisationId: orgId,
        status: "REJECTED",
        updatedAt: { gte: yearStart, lte: yearEnd },
        ...userFilter,
      },
    }),
  ]);

  return {
    pendingCount,
    approvedThisYear,
    rejectedThisYear,
    teamMembers: teamMemberCount,
  };
}

// ---------------------------------------------------------------------------
// APPROVE leave request
// ---------------------------------------------------------------------------

export async function approveLeave(
  leaveRequestId: number,
  approverId: number,
  orgId: number,
  role: UserRole,
  comment?: string,
) {
  const request = await prisma.leaveRequest.findFirst({
    where: { id: leaveRequestId, organisationId: orgId },
    include: {
      user: { select: { id: true, name: true } },
      leaveType: { select: { id: true, name: true } },
      approvals: { orderBy: { level: 'asc' } },
    },
  });

  if (!request) {
    throw AppError.notFound('Leave request not found');
  }

  if (request.status !== LEAVE_STATUS.PENDING) {
    throw AppError.badRequest(
      'Only PENDING leave requests can be approved',
      ERROR_CODES.INVALID_TRANSITION,
    );
  }

  // Self-approval forbidden
  if (request.userId === approverId) {
    throw AppError.forbidden(
      'You cannot approve your own leave request',
      ERROR_CODES.SELF_APPROVAL_FORBIDDEN,
    );
  }

  // Manager can only approve direct reports
  if (role === 'MANAGER') {
    const reportIds = await getDirectReportIds(approverId);
    if (!reportIds.includes(request.userId)) {
      throw AppError.forbidden(
        'You can only approve leave for your direct reports',
        ERROR_CODES.NOT_DIRECT_REPORT,
      );
    }
  }

  const settings = await getOrgSettings(orgId);
  const approvalLevels = settings.leaveApprovalLevels;

  // Find the next pending approval level
  const pendingApproval = request.approvals.find(
    (a) => a.status === APPROVAL_STATUS.PENDING,
  );

  if (!pendingApproval) {
    throw AppError.badRequest(
      'No pending approval level found for this request',
      ERROR_CODES.VALIDATION_ERROR,
    );
  }

  const currentLevel = pendingApproval.level;
  const isFinalLevel = currentLevel >= approvalLevels;

  const result = await prisma.$transaction(async (tx) => {
    // Update the approval record
    await tx.leaveApproval.update({
      where: { id: pendingApproval.id },
      data: {
        approverId,
        status: 'APPROVED',
        comment: comment ?? null,
        actionDate: new Date(),
      },
    });

    if (isFinalLevel) {
      // Final approval — update leave request status and move pendingDays to usedDays
      const year = new Date(request.startDate).getFullYear();

      await tx.leaveBalance.update({
        where: {
          userId_leaveTypeId_year: {
            userId: request.userId,
            leaveTypeId: request.leaveTypeId,
            year,
          },
        },
        data: {
          pendingDays: { decrement: request.businessDays },
          usedDays: { increment: request.businessDays },
        },
      });

      return tx.leaveRequest.update({
        where: { id: leaveRequestId },
        data: { status: 'APPROVED' },
        include: {
          leaveType: { select: { id: true, name: true } },
          user: { select: { id: true, name: true } },
          approvals: { orderBy: { level: 'asc' } },
        },
      });
    }

    // Not final level — request stays PENDING
    return tx.leaveRequest.findUnique({
      where: { id: leaveRequestId },
      include: {
        leaveType: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        approvals: { orderBy: { level: 'asc' } },
      },
    });
  });

  // Notify the employee
  const dateRange = formatDateRange(request.startDate, request.endDate);

  if (isFinalLevel) {
    createNotification(
      request.userId,
      NOTIFICATION_TYPES.LEAVE_APPROVED,
      `Your ${request.leaveType.name} leave for ${dateRange} has been approved`,
    ).catch((err) => logger.error({ err }, 'Notification dispatch error'));
  } else {
    createNotification(
      request.userId,
      NOTIFICATION_TYPES.LEAVE_SUBMITTED,
      `Your ${request.leaveType.name} leave for ${dateRange} has passed level ${currentLevel} approval`,
    ).catch((err) => logger.error({ err }, 'Notification dispatch error'));
  }

  logger.info(
    { leaveRequestId, approverId, level: currentLevel, isFinalLevel },
    'Leave request approved',
  );
  return result;
}

// ---------------------------------------------------------------------------
// REJECT leave request
// ---------------------------------------------------------------------------

export async function rejectLeave(
  leaveRequestId: number,
  approverId: number,
  orgId: number,
  role: UserRole,
  comment?: string,
) {
  const request = await prisma.leaveRequest.findFirst({
    where: { id: leaveRequestId, organisationId: orgId },
    include: {
      user: { select: { id: true, name: true } },
      leaveType: { select: { id: true, name: true } },
      approvals: { orderBy: { level: 'asc' } },
    },
  });

  if (!request) {
    throw AppError.notFound('Leave request not found');
  }

  if (request.status !== LEAVE_STATUS.PENDING) {
    throw AppError.badRequest(
      'Only PENDING leave requests can be rejected',
      ERROR_CODES.INVALID_TRANSITION,
    );
  }

  // Self-rejection forbidden
  if (request.userId === approverId) {
    throw AppError.forbidden(
      'You cannot reject your own leave request',
      ERROR_CODES.SELF_APPROVAL_FORBIDDEN,
    );
  }

  // Manager can only reject direct reports
  if (role === 'MANAGER') {
    const reportIds = await getDirectReportIds(approverId);
    if (!reportIds.includes(request.userId)) {
      throw AppError.forbidden(
        'You can only reject leave for your direct reports',
        ERROR_CODES.NOT_DIRECT_REPORT,
      );
    }
  }

  // Find the next pending approval level
  const pendingApproval = request.approvals.find(
    (a) => a.status === APPROVAL_STATUS.PENDING,
  );

  const year = new Date(request.startDate).getFullYear();

  const rejected = await prisma.$transaction(async (tx) => {
    // Update approval record if exists
    if (pendingApproval) {
      await tx.leaveApproval.update({
        where: { id: pendingApproval.id },
        data: {
          approverId,
          status: 'REJECTED',
          comment: comment ?? null,
          actionDate: new Date(),
        },
      });
    }

    // Release pendingDays
    await tx.leaveBalance.update({
      where: {
        userId_leaveTypeId_year: {
          userId: request.userId,
          leaveTypeId: request.leaveTypeId,
          year,
        },
      },
      data: { pendingDays: { decrement: request.businessDays } },
    });

    // Reject the leave request
    return tx.leaveRequest.update({
      where: { id: leaveRequestId },
      data: { status: 'REJECTED' },
      include: {
        leaveType: { select: { id: true, name: true } },
        user: { select: { id: true, name: true } },
        approvals: { orderBy: { level: 'asc' } },
      },
    });
  });

  // Notify the employee
  const dateRange = formatDateRange(request.startDate, request.endDate);
  createNotification(
    request.userId,
    NOTIFICATION_TYPES.LEAVE_REJECTED,
    `Your ${request.leaveType.name} leave for ${dateRange} has been rejected${comment ? `: ${comment}` : ''}`,
  ).catch((err) => logger.error({ err }, 'Notification dispatch error'));

  logger.info({ leaveRequestId, approverId }, 'Leave request rejected');
  return rejected;
}
