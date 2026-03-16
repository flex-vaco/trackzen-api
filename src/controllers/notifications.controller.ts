import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as notificationsService from '../services/notifications.service.js';

export const list = tryCatch(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  const result = await notificationsService.listNotifications(userId, page, limit);

  res.json({ success: true, data: result.data, meta: result.meta });
});

export const markAsRead = tryCatch(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const notificationId = Number(req.params.id);

  const data = await notificationsService.markAsRead(notificationId, userId);

  res.json({ success: true, data });
});

export const markAllAsRead = tryCatch(async (req: Request, res: Response) => {
  const { userId } = req.user;

  const data = await notificationsService.markAllAsRead(userId);

  res.json({ success: true, data });
});
