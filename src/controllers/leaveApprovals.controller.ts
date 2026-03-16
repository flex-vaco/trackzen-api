import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as leaveApprovalsService from '../services/leaveApprovals.service.js';

export const list = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  const result = await leaveApprovalsService.listPendingLeave(userId, orgId, role, page, limit);

  res.json({ success: true, data: result.data, meta: result.meta });
});

export const stats = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;

  const data = await leaveApprovalsService.getLeaveApprovalStats(userId, orgId, role);

  res.json({ success: true, data });
});

export const approve = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const leaveRequestId = Number(req.params.id);
  const { comment } = req.body ?? {};

  const data = await leaveApprovalsService.approveLeave(leaveRequestId, userId, orgId, role, comment);

  res.json({ success: true, data });
});

export const reject = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const leaveRequestId = Number(req.params.id);
  const { comment } = req.body;

  const data = await leaveApprovalsService.rejectLeave(leaveRequestId, userId, orgId, role, comment);

  res.json({ success: true, data });
});
