import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as teamService from '../services/team.service.js';

export const getMyManagers = tryCatch(async (req: Request, res: Response) => {
  const { userId } = req.user;

  const data = await teamService.getMyManagers(userId);

  res.json({ success: true, data });
});

export const getMyReports = tryCatch(async (req: Request, res: Response) => {
  const { userId } = req.user;

  const data = await teamService.getMyReports(userId);

  res.json({ success: true, data });
});

export const getUserManagers = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;
  const targetUserId = Number(req.params.userId);

  const data = await teamService.getUserManagers(targetUserId, orgId);

  res.json({ success: true, data });
});

export const assignManagers = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;
  const targetUserId = Number(req.params.userId);
  const { managerIds } = req.body;

  const data = await teamService.assignManagers(targetUserId, managerIds, orgId);

  res.json({ success: true, data });
});
