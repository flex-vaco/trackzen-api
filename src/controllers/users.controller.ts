import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as usersService from '../services/users.service.js';

export const list = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;

  const result = await usersService.listUsers(orgId, role, userId, page, limit);

  res.json({ success: true, data: result.data, meta: result.meta });
});

export const create = tryCatch(async (req: Request, res: Response) => {
  const { orgId, role } = req.user;

  const user = await usersService.createUser(orgId, req.body, role);

  res.status(201).json({ success: true, data: user });
});

export const update = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;
  const targetUserId = Number(req.params.id);

  const user = await usersService.updateUser(targetUserId, orgId, req.body);

  res.json({ success: true, data: user });
});

export const remove = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;
  const targetUserId = Number(req.params.id);

  const user = await usersService.deactivateUser(targetUserId, orgId);

  res.json({ success: true, data: user });
});
