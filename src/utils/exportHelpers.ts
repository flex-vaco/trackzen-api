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

export async function generateMonthlyTimesheetExcel(
  res: Response,
  data: {
    userName: string;
    year: number;
    month: number;
    entries: {
      date: string;
      day: string;
      projectName: string;
      hours: number;
      overtime: number;
      timeOff: number;
      isHoliday: boolean;
    }[];
  },
  filename: string
): Promise<void> {
  try {
    const ExcelJS = await import('exceljs');
    const workbook = new ExcelJS.default.Workbook();
    const sheet = workbook.addWorksheet('Monthly Timesheet');

    // Title
    sheet.mergeCells('A1:G1');
    const titleCell = sheet.getCell('A1');
    titleCell.value = `Monthly Timesheet — ${data.userName}`;
    titleCell.font = { bold: true, size: 14, color: { argb: 'FF2C5F7C' } };

    sheet.mergeCells('A2:G2');
    sheet.getCell('A2').value = `${data.year}-${String(data.month).padStart(2, '0')}`;

    sheet.addRow([]);

    sheet.columns = [
      { header: 'Date', key: 'date', width: 15 },
      { header: 'Day', key: 'day', width: 12 },
      { header: 'Project', key: 'project', width: 25 },
      { header: 'Hours', key: 'hours', width: 10 },
      { header: 'Overtime', key: 'overtime', width: 10 },
      { header: 'Time Off', key: 'timeOff', width: 10 },
      { header: 'Holiday', key: 'holiday', width: 10 },
    ];

    const headerRow = sheet.getRow(4);
    headerRow.values = ['Date', 'Day', 'Project', 'Hours', 'Overtime', 'Time Off', 'Holiday'];
    headerRow.font = { bold: true, color: { argb: 'FFFFFFFF' } };
    headerRow.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2C5F7C' } };

    for (const entry of data.entries) {
      const row = sheet.addRow({
        date: entry.date,
        day: entry.day,
        project: entry.projectName,
        hours: entry.hours,
        overtime: entry.overtime,
        timeOff: entry.timeOff,
        holiday: entry.isHoliday ? 'Yes' : '',
      });

      if (entry.isHoliday) {
        row.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF3CD' } };
      }
    }

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    await workbook.xlsx.write(res);
    res.end();
  } catch {
    res.status(500).json({ success: false, error: 'Export failed', code: 'INTERNAL_ERROR' });
  }
}
