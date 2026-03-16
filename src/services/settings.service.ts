import { prisma } from '../utils/db.js';
import { AppError } from '../types/errors.js';
import { logger } from '../utils/logger.js';

export async function getSettings(orgId: number) {
  const settings = await prisma.orgSettings.findUnique({
    where: { organisationId: orgId },
  });

  if (!settings) {
    throw AppError.notFound('Organisation settings not found');
  }

  return settings;
}

export async function updateSettings(orgId: number, input: Record<string, unknown>) {
  const settings = await prisma.orgSettings.findUnique({
    where: { organisationId: orgId },
  });

  if (!settings) {
    throw AppError.notFound('Organisation settings not found');
  }

  // Only allow fields that exist on OrgSettings
  const allowedFields = [
    'workWeekStart', 'standardHours', 'timeFormat', 'timeIncrement',
    'maxHoursPerDay', 'maxHoursPerWeek', 'requireApproval', 'allowBackdated',
    'enableOvertime', 'mandatoryDesc', 'allowCopyWeek', 'dailyReminderTime',
    'weeklyDeadline', 'leaveRequireApproval', 'leaveAllowBackdated',
    'accrualEnabled', 'carryForwardEnabled', 'carryForwardMaxDays',
    'leaveApprovalLevels', 'ssoGoogleEnabled', 'ssoMicrosoftEnabled',
    'payrollType', 'pmType',
  ];

  const data: Record<string, unknown> = {};
  for (const key of allowedFields) {
    if (key in input) {
      data[key] = input[key];
    }
  }

  const updated = await prisma.orgSettings.update({
    where: { organisationId: orgId },
    data,
  });

  logger.info({ orgId }, 'Organisation settings updated');
  return updated;
}
