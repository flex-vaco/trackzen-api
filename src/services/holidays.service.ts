import { prisma } from '../utils/db.js';
import { AppError } from '../types/errors.js';
import { ERROR_CODES } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

// ---------------------------------------------------------------------------
// LIST holidays
// ---------------------------------------------------------------------------

export async function listHolidays(orgId: number, year?: number) {
  const where: Record<string, unknown> = { organisationId: orgId };

  if (year) {
    const yearStart = new Date(Date.UTC(year, 0, 1));
    const yearEnd = new Date(Date.UTC(year, 11, 31, 23, 59, 59, 999));
    where.date = { gte: yearStart, lte: yearEnd };
  }

  return prisma.holiday.findMany({
    where,
    orderBy: { date: 'asc' },
  });
}

// ---------------------------------------------------------------------------
// CREATE holiday
// ---------------------------------------------------------------------------

export async function createHoliday(
  orgId: number,
  input: { name: string; date: string; recurring?: boolean },
) {
  const holidayDate = new Date(input.date);

  // Check for duplicate date within org
  const existing = await prisma.holiday.findFirst({
    where: {
      organisationId: orgId,
      date: holidayDate,
    },
  });

  if (existing) {
    throw AppError.conflict(
      'A holiday already exists on this date',
      ERROR_CODES.CONFLICT,
    );
  }

  const holiday = await prisma.holiday.create({
    data: {
      organisationId: orgId,
      name: input.name,
      date: holidayDate,
      recurring: input.recurring ?? false,
    },
  });

  logger.info({ holidayId: holiday.id, orgId }, 'Holiday created');
  return holiday;
}

// ---------------------------------------------------------------------------
// DELETE holiday
// ---------------------------------------------------------------------------

export async function deleteHoliday(id: number, orgId: number) {
  const holiday = await prisma.holiday.findFirst({
    where: { id, organisationId: orgId },
  });

  if (!holiday) {
    throw AppError.notFound('Holiday not found');
  }

  await prisma.holiday.delete({ where: { id } });

  logger.info({ holidayId: id, orgId }, 'Holiday deleted');
}
