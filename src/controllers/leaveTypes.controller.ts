import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as leaveTypesService from '../services/leaveTypes.service.js';

export const list = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;
  const includeInactive = req.query.includeInactive === 'true';

  const data = await leaveTypesService.listLeaveTypes(orgId, includeInactive);

  res.json({ success: true, data });
});

export const create = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;

  const leaveType = await leaveTypesService.createLeaveType(orgId, req.body);

  res.status(201).json({ success: true, data: leaveType });
});

export const update = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;
  const leaveTypeId = Number(req.params.id);

  const leaveType = await leaveTypesService.updateLeaveType(leaveTypeId, orgId, req.body);

  res.json({ success: true, data: leaveType });
});

export const remove = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;
  const leaveTypeId = Number(req.params.id);

  const leaveType = await leaveTypesService.deactivateLeaveType(leaveTypeId, orgId);

  res.json({ success: true, data: leaveType });
});
