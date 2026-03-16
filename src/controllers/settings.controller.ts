import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as settingsService from '../services/settings.service.js';

export const get = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;

  const data = await settingsService.getSettings(orgId);

  res.json({ success: true, data });
});

export const update = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;

  const data = await settingsService.updateSettings(orgId, req.body);

  res.json({ success: true, data });
});
