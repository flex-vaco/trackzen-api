import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as leaveService from '../services/leave.service.js';

export const list = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId } = req.user;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const status = req.query.status as string | undefined;
  const year = req.query.year ? Number(req.query.year) : undefined;

  const result = await leaveService.listLeaveRequests(userId, orgId, { year, status, page, limit });

  res.json({ success: true, data: result.data, meta: result.meta });
});

export const create = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId } = req.user;

  const leaveRequest = await leaveService.createLeaveRequest(userId, orgId, req.body);

  res.status(201).json({ success: true, data: leaveRequest });
});

export const getById = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId } = req.user;
  const id = Number(req.params.id);

  const leaveRequest = await leaveService.getLeaveRequest(id, userId, orgId);

  res.json({ success: true, data: leaveRequest });
});

export const update = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId } = req.user;
  const id = Number(req.params.id);

  const leaveRequest = await leaveService.updateLeaveRequest(id, userId, orgId, req.body);

  res.json({ success: true, data: leaveRequest });
});

export const cancel = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId } = req.user;
  const id = Number(req.params.id);
  const { cancelReason } = req.body;

  const leaveRequest = await leaveService.cancelLeaveRequest(id, userId, orgId, cancelReason);

  res.json({ success: true, data: leaveRequest });
});
