import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as timesheetsService from '../services/timesheets.service.js';

export const list = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId } = req.user;
  const page = Number(req.query.page) || 1;
  const limit = Number(req.query.limit) || 20;
  const status = req.query.status as string | undefined;

  const result = await timesheetsService.listTimesheets(userId, orgId, page, limit, status);

  res.json({ success: true, data: result.data, meta: result.meta });
});

export const create = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const { weekStartDate, entries } = req.body;

  const timesheet = await timesheetsService.createTimesheet(userId, orgId, role, weekStartDate, entries);

  res.status(201).json({ success: true, data: timesheet });
});

export const getById = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId } = req.user;
  const timesheetId = Number(req.params.id);

  const timesheet = await timesheetsService.getTimesheet(timesheetId, userId, orgId);

  res.json({ success: true, data: timesheet });
});

export const update = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const timesheetId = Number(req.params.id);
  const { entries } = req.body;

  const timesheet = await timesheetsService.updateTimesheet(timesheetId, userId, orgId, role, entries);

  res.json({ success: true, data: timesheet });
});

export const remove = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId } = req.user;
  const timesheetId = Number(req.params.id);

  await timesheetsService.deleteTimesheet(timesheetId, userId, orgId);

  res.json({ success: true, data: null });
});

export const submit = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId } = req.user;
  const timesheetId = Number(req.params.id);

  const timesheet = await timesheetsService.submitTimesheet(timesheetId, userId, orgId);

  res.json({ success: true, data: timesheet });
});

export const copyPreviousWeek = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const { targetWeekStartDate, targetWeekStart, force } = req.body;
  const weekStart = targetWeekStartDate || targetWeekStart;

  const timesheet = await timesheetsService.copyPreviousWeek(userId, orgId, role, weekStart, force === true);

  res.status(201).json({ success: true, data: timesheet });
});

// ---- Time Entries ----

export const listEntries = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId } = req.user;
  const timesheetId = Number(req.params.id);

  const entries = await timesheetsService.listEntries(timesheetId, userId, orgId);

  res.json({ success: true, data: entries });
});

export const createEntry = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const timesheetId = Number(req.params.id);

  const entry = await timesheetsService.createEntry(timesheetId, userId, orgId, req.body, role);

  res.status(201).json({ success: true, data: entry });
});

export const updateEntry = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId, role } = req.user;
  const timesheetId = Number(req.params.id);
  const entryId = Number(req.params.eid);

  const entry = await timesheetsService.updateEntry(timesheetId, entryId, userId, orgId, req.body, role);

  res.json({ success: true, data: entry });
});

export const deleteEntry = tryCatch(async (req: Request, res: Response) => {
  const { userId, orgId } = req.user;
  const timesheetId = Number(req.params.id);
  const entryId = Number(req.params.eid);

  await timesheetsService.deleteEntry(timesheetId, entryId, userId, orgId);

  res.json({ success: true, data: null });
});
