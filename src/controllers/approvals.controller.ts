import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as approvalsService from '../services/approvals.service.js';

export const list = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  const result = await approvalsService.listPendingTimesheets(userId, orgId, role, page, limit);

  res.json({ success: true, data: result.data, meta: result.meta });
});

export const stats = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;

  const data = await approvalsService.getApprovalStats(userId, orgId, role);

  res.json({ success: true, data });
});

export const approve = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const timesheetId = Number(req.params.id);

  const timesheet = await approvalsService.approveTimesheet(timesheetId, userId, orgId, role);

  res.json({ success: true, data: timesheet });
});

export const reject = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const timesheetId = Number(req.params.id);
  const { reason } = req.body;

  const timesheet = await approvalsService.rejectTimesheet(timesheetId, userId, orgId, role, reason);

  res.json({ success: true, data: timesheet });
});
