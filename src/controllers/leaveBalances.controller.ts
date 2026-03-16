import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as leaveBalancesService from '../services/leaveBalances.service.js';

export const getOwn = tryCatch(async (req: Request, res: Response) => {
  const { userId } = req.user;
  const year = req.query.year ? Number(req.query.year) : undefined;

  const data = await leaveBalancesService.getOwnBalances(userId, year);

  res.json({ success: true, data });
});

export const getByUserId = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const targetUserId = Number(req.params.userId);
  const year = req.query.year ? Number(req.query.year) : undefined;

  const data = await leaveBalancesService.getUserBalances(targetUserId, userId, orgId, role, year);

  res.json({ success: true, data });
});
