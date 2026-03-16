import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as leaveCalendarService from '../services/leaveCalendar.service.js';

export const getCalendar = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const from = req.query.from as string | undefined;
  const to = req.query.to as string | undefined;

  if (!from || !to) {
    res.status(400).json({
      success: false,
      error: 'Both "from" and "to" query parameters are required',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  if (isNaN(Date.parse(from)) || isNaN(Date.parse(to))) {
    res.status(400).json({
      success: false,
      error: 'Invalid date format for "from" or "to"',
      code: 'VALIDATION_ERROR',
    });
    return;
  }

  const data = await leaveCalendarService.getTeamCalendar(userId, orgId, role, from, to);

  res.json({ success: true, data });
});
