import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as reportsService from '../services/reports.service.js';
import { streamCSV, streamExcel, streamPDF, generateMonthlyTimesheetExcel } from '../utils/exportHelpers.js';

export const getReports = tryCatch(async (req: Request, res: Response) => {
  const { dateFrom, dateTo, userId, status, projectId } = req.query;

  const result = await reportsService.getReportData({
    orgId: req.user.orgId,
    dateFrom: dateFrom as string | undefined,
    dateTo: dateTo as string | undefined,
    userId: userId ? Number(userId) : undefined,
    status: status as string | undefined,
    projectId: projectId ? Number(projectId) : undefined,
  });

  res.json({ success: true, data: result });
});

export const exportReport = tryCatch(async (req: Request, res: Response) => {
  const { format, dateFrom, dateTo, userId, status, projectId } = req.query;

  const result = await reportsService.getReportData({
    orgId: req.user.orgId,
    dateFrom: dateFrom as string | undefined,
    dateTo: dateTo as string | undefined,
    userId: userId ? Number(userId) : undefined,
    status: status as string | undefined,
    projectId: projectId ? Number(projectId) : undefined,
  });

  const filename = `timesheet-report-${new Date().toISOString().split('T')[0]}`;

  switch (format) {
    case 'excel':
      await streamExcel(res, result.rows, `${filename}.xlsx`);
      break;
    case 'pdf':
      await streamPDF(res, result.rows, `${filename}.pdf`);
      break;
    case 'csv':
    default:
      streamCSV(res, result.rows, `${filename}.csv`);
      break;
  }
});

export const exportMonthly = tryCatch(async (req: Request, res: Response) => {
  const { userId, year, month } = req.query;

  const targetUserId = Number(userId) || req.user.userId;
  const targetYear = Number(year) || new Date().getFullYear();
  const targetMonth = Number(month) || new Date().getMonth() + 1;

  const data = await reportsService.getMonthlyTimesheetData(
    targetUserId,
    req.user.orgId,
    targetYear,
    targetMonth,
    req.user.userId,
    req.user.role,
  );

  const filename = `timesheet-${data.employeeName.replace(/\s+/g, '-').toLowerCase()}-${data.month.replace("'", '')}.xlsx`;
  const buffer = await generateMonthlyTimesheetExcel(data);

  res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
  res.setHeader('Content-Disposition', `attachment; filename=${filename}`);
  res.send(buffer);
});
