import { Response } from 'express';

interface ReportRow {
  employeeName: string;
  weekRange: string;
  status: string;
  totalHours: number;
  billableHours: number;
  projectBreakdown?: { projectName: string; hours: number }[];
}

export function generateCSV(rows: ReportRow[]): string {
  const headers = ['Employee', 'Week', 'Status', 'Total Hours', 'Billable Hours'];
  const lines = [headers.join(',')];

  for (const row of rows) {
    const values = [
      `"${row.employeeName}"`,
      `"${row.weekRange}"`,
      row.status,
      row.totalHours.toFixed(1),
      row.billableHours.toFixed(1),
    ];
    lines.push(values.join(','));
  }

  return lines.join('\n');
}

export function streamCSV(res: Response, rows: ReportRow[], filename: string): void {
  const csv = generateCSV(rows);
  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
  res.send(csv);
}

export async function streamExcel(res: Response, rows: ReportRow[], filename: string): Promise<void> {
  try {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    const sheet = workbook.addWorksheet('Report');

    sheet.columns = [
      { header: 'Employee', key: 'employee', width: 25 },
      { header: 'Week', key: 'week', width: 30 },
      { header: 'Status', key: 'status', width: 15 },
      { header: 'Total Hours', key: 'totalHours', width: 15 },
      { header: 'Billable Hours', key: 'billableHours', width: 15 },
    ];

    // Style header
    const headerRow = sheet.getRow(1);
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = {
      type: 'pattern',
      pattern: 'solid',
      fgColor: { argb: 'FF2C5F7C' },
    };

    for (const row of rows) {
      sheet.addRow({
        employee: row.employeeName,
        week: row.weekRange,
        status: row.status,
        totalHours: row.totalHours,
        billableHours: row.billableHours,
      });
    }

    // Summary row
    const totalRow = sheet.addRow({
      employee: 'TOTAL',
      week: '',
      status: '',
      totalHours: rows.reduce((sum, r) => sum + r.totalHours, 0),
      billableHours: rows.reduce((sum, r) => sum + r.billableHours, 0),
    });
    totalRow.font = { bold: true };

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch {
    // ExcelJS not installed — fallback to CSV
    streamCSV(res, rows, filename.replace('.xlsx', '.csv'));
  }
}

export async function streamPDF(res: Response, rows: ReportRow[], filename: string): Promise<void> {
  try {
    const PDFDocument = (await import('pdfkit')).default;
    const doc = new PDFDocument({ layout: 'landscape', margin: 40 });

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    doc.pipe(res);

    // Header
    doc.fontSize(18).fillColor('#2C5F7C').text('TrackZen — Timesheet Report', { align: 'center' });
    doc.moveDown();

    // Table header
    const tableTop = doc.y;
    const colWidths = [150, 180, 80, 80, 80];
    const headers = ['Employee', 'Week', 'Status', 'Total Hrs', 'Billable Hrs'];

    doc.fontSize(10).fillColor('#FFFFFF');
    let x = 40;
    doc.rect(40, tableTop, colWidths.reduce((a, b) => a + b, 0), 20).fill('#2C5F7C');
    for (let i = 0; i < headers.length; i++) {
      doc.fillColor('#FFFFFF').text(headers[i], x + 4, tableTop + 5, { width: colWidths[i] - 8 });
      x += colWidths[i];
    }

    // Table rows
    let y = tableTop + 22;
    doc.fillColor('#1F2937').fontSize(9);
    for (const row of rows) {
      if (y > 500) {
        doc.addPage();
        y = 40;
      }
      x = 40;
      const values = [row.employeeName, row.weekRange, row.status, row.totalHours.toFixed(1), row.billableHours.toFixed(1)];
      for (let i = 0; i < values.length; i++) {
        doc.text(values[i], x + 4, y, { width: colWidths[i] - 8 });
        x += colWidths[i];
      }
      y += 18;
    }

    doc.end();
  } catch {
    // PDFKit not installed — fallback to CSV
    streamCSV(res, rows, filename.replace('.pdf', '.csv'));
  }
}

export interface MonthlyDayRow {
  date: string;
  day: string;
  project: string;
  task: string;
  time: number;
  overtime: number;
  totalTime: number;
  timeOffHours: number;
  isHoliday: boolean;
  holidayName?: string;
  isLeave: boolean;
  isWeekend: boolean;
}

export interface MonthlyTimesheetData {
  employeeName: string;
  employeeId: number;
  department: string;
  month: string;       // e.g. "Dec'25"
  monthFull: string;   // e.g. "December 2025"
  days: MonthlyDayRow[];
  totalHours: number;
  totalOvertime: number;
  holidayCount: number;
  leaveCount: number;
}

const ORANGE_HEADER = 'FFE8A44C';
const HOLIDAY_RED = 'FFFF4444';
const HOLIDAY_BG = 'FFFFE0E0';
const LEAVE_YELLOW = 'FFFFFF00';
const LEAVE_BG = 'FFFFFFCC';
const WEEKEND_BG = 'FFF0F0F0';

const thinBorder = {
  top: { style: 'thin' as const },
  left: { style: 'thin' as const },
  bottom: { style: 'thin' as const },
  right: { style: 'thin' as const },
};

export async function generateMonthlyTimesheetExcel(data: MonthlyTimesheetData): Promise<Buffer> {
  const ExcelJS = await import('exceljs');
  const workbook = new ExcelJS.default.Workbook();
  const sheet = workbook.addWorksheet('Timesheet');

  sheet.getColumn('A').width = 10;
  sheet.getColumn('B').width = 12;
  sheet.getColumn('C').width = 28;
  sheet.getColumn('D').width = 40;
  sheet.getColumn('E').width = 10;
  sheet.getColumn('F').width = 10;
  sheet.getColumn('G').width = 12;

  // Row 1: Name / Emp Code / Process
  const r1 = sheet.getRow(1);
  r1.getCell('A').value = 'Name -';
  r1.getCell('A').font = { bold: true, size: 10 };
  r1.getCell('B').value = data.employeeName;
  r1.getCell('B').font = { bold: true, size: 10 };
  r1.getCell('D').value = 'Emp Code';
  r1.getCell('D').font = { bold: true, size: 10 };
  r1.getCell('E').value = `EMP${String(data.employeeId).padStart(4, '0')}`;
  r1.getCell('E').font = { size: 10 };
  r1.getCell('F').value = 'Process';
  r1.getCell('F').font = { bold: true, size: 10 };
  r1.getCell('G').value = data.department || 'General';
  r1.getCell('G').font = { size: 10 };

  // Row 2: Month
  const r2 = sheet.getRow(2);
  r2.getCell('A').value = 'Month -';
  r2.getCell('A').font = { bold: true, size: 10 };
  r2.getCell('B').value = data.month;
  r2.getCell('B').font = { bold: true, size: 10 };

  // Row 4: Column headers
  const hdr = sheet.getRow(4);
  const headers = ['Date', 'Day', 'Project / BD Lead / Others activity', 'Task', 'Time', 'Over time', 'Total Time'];
  headers.forEach((label, i) => {
    const cell = hdr.getCell(i + 1);
    cell.value = label;
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE_HEADER } };
    cell.border = thinBorder;
    cell.alignment = { horizontal: i >= 4 ? 'center' : 'left', vertical: 'middle' };
  });

  // Day rows
  let rowNum = 5;
  for (const day of data.days) {
    const row = sheet.getRow(rowNum);

    row.getCell('A').value = day.date;
    row.getCell('B').value = day.day;
    row.getCell('C').value = day.project;

    if (day.isHoliday) {
      row.getCell('D').value = `Holiday - ${day.holidayName ?? 'Holiday'}`;
    } else if (day.isLeave) {
      row.getCell('D').value = 'Leave';
    } else {
      row.getCell('D').value = day.task;
    }

    row.getCell('E').value = day.isLeave ? (day.timeOffHours || '') : (day.time || '');
    row.getCell('E').alignment = { horizontal: 'center' };
    row.getCell('F').value = day.overtime || '';
    row.getCell('F').alignment = { horizontal: 'center' };
    row.getCell('G').value = day.totalTime || '';
    row.getCell('G').alignment = { horizontal: 'center' };

    const bgColor = day.isHoliday ? HOLIDAY_BG : day.isLeave ? LEAVE_BG : day.isWeekend ? WEEKEND_BG : undefined;

    for (let col = 1; col <= 7; col++) {
      const cell = row.getCell(col);
      cell.border = thinBorder;
      cell.font = { size: 10 };
      if (bgColor) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: bgColor } };
      }
    }

    if (day.isHoliday) {
      row.getCell('D').font = { bold: true, color: { argb: HOLIDAY_RED }, size: 10 };
    } else if (day.isLeave) {
      row.getCell('D').font = { bold: true, size: 10 };
      row.getCell('D').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LEAVE_YELLOW } };
    }

    rowNum++;
  }

  // Summary rows
  const totalRow = sheet.getRow(rowNum);
  totalRow.getCell('A').value = 'Total Working Hours';
  totalRow.getCell('A').font = { bold: true, size: 10 };
  sheet.mergeCells(`A${rowNum}:D${rowNum}`);
  totalRow.getCell('E').value = data.totalHours;
  totalRow.getCell('E').alignment = { horizontal: 'center' };
  totalRow.getCell('F').value = data.totalOvertime;
  totalRow.getCell('F').alignment = { horizontal: 'center' };
  totalRow.getCell('G').value = data.totalHours + data.totalOvertime;
  totalRow.getCell('G').alignment = { horizontal: 'center' };
  for (let col = 1; col <= 7; col++) {
    const cell = totalRow.getCell(col);
    cell.border = thinBorder;
    cell.font = { bold: true, size: 10 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: ORANGE_HEADER } };
  }

  rowNum++;
  const holidayRow = sheet.getRow(rowNum);
  sheet.mergeCells(`A${rowNum}:F${rowNum}`);
  holidayRow.getCell('A').value = 'Holiday';
  holidayRow.getCell('A').font = { bold: true, size: 10 };
  holidayRow.getCell('A').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOLIDAY_BG } };
  holidayRow.getCell('G').value = data.holidayCount;
  holidayRow.getCell('G').alignment = { horizontal: 'center' };
  holidayRow.getCell('G').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: HOLIDAY_BG } };
  for (let col = 1; col <= 7; col++) holidayRow.getCell(col).border = thinBorder;

  rowNum++;
  const leaveRow = sheet.getRow(rowNum);
  sheet.mergeCells(`A${rowNum}:F${rowNum}`);
  leaveRow.getCell('A').value = 'Leave';
  leaveRow.getCell('A').font = { bold: true, size: 10 };
  leaveRow.getCell('A').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LEAVE_BG } };
  leaveRow.getCell('G').value = data.leaveCount;
  leaveRow.getCell('G').alignment = { horizontal: 'center' };
  leaveRow.getCell('G').fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: LEAVE_BG } };
  for (let col = 1; col <= 7; col++) leaveRow.getCell(col).border = thinBorder;

  const buffer = await workbook.xlsx.writeBuffer();
  return Buffer.from(buffer);
}
