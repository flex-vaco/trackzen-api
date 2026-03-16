import { prisma } from '../utils/db.js';
import { AppError } from '../types/errors.js';
import { PAGINATION } from '../utils/constants.js';
import { logger } from '../utils/logger.js';
import { sendEmail } from './email.service.js';
import {
  tsApprovedEmail,
  tsRejectedEmail,
  tsSubmittedEmail,
} from '../utils/emailTemplates.js';

// ---------------------------------------------------------------------------
// Create a notification (DB record + fire-and-forget email)
// ---------------------------------------------------------------------------

export async function createNotification(
  userId: number,
  type: string,
  message: string,
): Promise<void> {
  try {
    await prisma.notification.create({
      data: { userId, type, message },
    });

    // Fire-and-forget email — look up user for the address
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true },
    });

    if (user) {
      sendEmail({
        to: user.email,
        subject: message,
        html: `<p>${message}</p>`,
      }).catch((err) => {
        logger.error({ err, userId }, 'Fire-and-forget email failed');
      });
    }
  } catch (err) {
    // Notifications should never break the calling flow
    logger.error({ err, userId, type }, 'Failed to create notification');
  }
}

// ---------------------------------------------------------------------------
// List notifications (paginated)
// ---------------------------------------------------------------------------

export async function listNotifications(
  userId: number,
  page: number = PAGINATION.DEFAULT_PAGE,
  limit: number = PAGINATION.DEFAULT_LIMIT,
) {
  const take = Math.min(limit, PAGINATION.MAX_LIMIT);
  const skip = (page - 1) * take;

  const [data, total] = await Promise.all([
    prisma.notification.findMany({
      where: { userId },
      orderBy: { createdAt: 'desc' },
      skip,
      take,
    }),
    prisma.notification.count({ where: { userId } }),
  ]);

  return { data, meta: { total, page, limit: take } };
}

// ---------------------------------------------------------------------------
// Mark a single notification as read
// ---------------------------------------------------------------------------

export async function markAsRead(notificationId: number, userId: number) {
  const notification = await prisma.notification.findUnique({
    where: { id: notificationId },
  });

  if (!notification) {
    throw AppError.notFound('Notification not found');
  }

  if (notification.userId !== userId) {
    throw AppError.forbidden('Cannot mark another user\'s notification');
  }

  return prisma.notification.update({
    where: { id: notificationId },
    data: { read: true },
  });
}

// ---------------------------------------------------------------------------
// Mark all notifications as read
// ---------------------------------------------------------------------------

export async function markAllAsRead(userId: number) {
  const { count } = await prisma.notification.updateMany({
    where: { userId, read: false },
    data: { read: true },
  });

  return { updated: count };
}
