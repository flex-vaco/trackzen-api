import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as holidaysService from '../services/holidays.service.js';

export const list = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;
  const year = req.query.year ? Number(req.query.year) : undefined;

  const data = await holidaysService.listHolidays(orgId, year);

  res.json({ success: true, data });
});

export const create = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;

  const holiday = await holidaysService.createHoliday(orgId, req.body);

  res.status(201).json({ success: true, data: holiday });
});

export const remove = tryCatch(async (req: Request, res: Response) => {
  const { orgId } = req.user;
  const holidayId = Number(req.params.id);

  await holidaysService.deleteHoliday(holidayId, orgId);

  res.json({ success: true, data: null });
});
