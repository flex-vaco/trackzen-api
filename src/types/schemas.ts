import { z } from 'zod';

export const registerSchema = z.object({
  orgName: z.string().min(1, 'Organisation name is required'),
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
});

export const loginSchema = z.object({
  email: z.string().email('Invalid email'),
  password: z.string().min(1, 'Password is required'),
});

export const createTimesheetSchema = z.object({
  weekStartDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date'),
});

export const copyPreviousWeekSchema = z.object({
  targetWeekStartDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date').optional(),
  targetWeekStart: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date').optional(),
  force: z.boolean().optional().default(false),
}).refine((data) => data.targetWeekStartDate || data.targetWeekStart, {
  message: 'Either targetWeekStartDate or targetWeekStart is required',
});

export const timeEntrySchema = z.object({
  projectId: z.number().int().positive(),
  billable: z.boolean().optional().default(true),
  monHours: z.number().min(0).optional().default(0),
  monDesc: z.string().optional().nullable(),
  monTimeOff: z.number().min(0).optional().default(0),
  tueHours: z.number().min(0).optional().default(0),
  tueDesc: z.string().optional().nullable(),
  tueTimeOff: z.number().min(0).optional().default(0),
  wedHours: z.number().min(0).optional().default(0),
  wedDesc: z.string().optional().nullable(),
  wedTimeOff: z.number().min(0).optional().default(0),
  thuHours: z.number().min(0).optional().default(0),
  thuDesc: z.string().optional().nullable(),
  thuTimeOff: z.number().min(0).optional().default(0),
  friHours: z.number().min(0).optional().default(0),
  friDesc: z.string().optional().nullable(),
  friTimeOff: z.number().min(0).optional().default(0),
  satHours: z.number().min(0).optional().default(0),
  satDesc: z.string().optional().nullable(),
  satTimeOff: z.number().min(0).optional().default(0),
  sunHours: z.number().min(0).optional().default(0),
  sunDesc: z.string().optional().nullable(),
  sunTimeOff: z.number().min(0).optional().default(0),
});

export const updateTimesheetSchema = z.object({
  entries: z.array(timeEntrySchema).optional(),
});

export const createTimeEntrySchema = timeEntrySchema;

export const updateTimeEntrySchema = z.object({
  projectId: z.number().int().positive().optional(),
  billable: z.boolean().optional(),
  monHours: z.number().min(0).optional(),
  monDesc: z.string().optional().nullable(),
  monTimeOff: z.number().min(0).optional(),
  tueHours: z.number().min(0).optional(),
  tueDesc: z.string().optional().nullable(),
  tueTimeOff: z.number().min(0).optional(),
  wedHours: z.number().min(0).optional(),
  wedDesc: z.string().optional().nullable(),
  wedTimeOff: z.number().min(0).optional(),
  thuHours: z.number().min(0).optional(),
  thuDesc: z.string().optional().nullable(),
  thuTimeOff: z.number().min(0).optional(),
  friHours: z.number().min(0).optional(),
  friDesc: z.string().optional().nullable(),
  friTimeOff: z.number().min(0).optional(),
  satHours: z.number().min(0).optional(),
  satDesc: z.string().optional().nullable(),
  satTimeOff: z.number().min(0).optional(),
  sunHours: z.number().min(0).optional(),
  sunDesc: z.string().optional().nullable(),
  sunTimeOff: z.number().min(0).optional(),
});

export const createProjectSchema = z.object({
  code: z.string().min(1, 'Project code is required'),
  name: z.string().min(1, 'Project name is required'),
  client: z.string().min(1, 'Client is required'),
  budgetHours: z.number().min(0).optional().default(0),
  managerIds: z.array(z.number().int().positive()).optional(),
  employeeIds: z.array(z.number().int().positive()).optional(),
});

export const updateProjectSchema = z.object({
  code: z.string().min(1).optional(),
  name: z.string().min(1).optional(),
  client: z.string().min(1).optional(),
  budgetHours: z.number().min(0).optional(),
  status: z.enum(['active', 'inactive']).optional(),
  managerIds: z.array(z.number().int().positive()).optional(),
  employeeIds: z.array(z.number().int().positive()).optional(),
});

export const createUserSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('Invalid email'),
  password: z.string().min(8, 'Password must be at least 8 characters'),
  role: z.enum(['EMPLOYEE', 'MANAGER', 'ADMIN']).optional().default('EMPLOYEE'),
  department: z.string().optional().nullable(),
  employeeType: z.enum(['FULL_TIME', 'CONTRACTUAL', 'CONSULTANT', 'TRAINEE']).optional().default('FULL_TIME'),
  joiningDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date').optional().nullable(),
});

export const updateUserSchema = z.object({
  name: z.string().min(1).optional(),
  email: z.string().email().optional(),
  role: z.enum(['EMPLOYEE', 'MANAGER', 'ADMIN']).optional(),
  department: z.string().optional().nullable(),
  employeeType: z.enum(['FULL_TIME', 'CONTRACTUAL', 'CONSULTANT', 'TRAINEE']).optional(),
  joiningDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date').optional().nullable(),
  status: z.enum(['active', 'inactive']).optional(),
});

export const createLeaveRequestSchema = z.object({
  leaveTypeId: z.number().int().positive(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid start date'),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid end date'),
  reason: z.string().optional().nullable(),
});

export const updateLeaveRequestSchema = z.object({
  leaveTypeId: z.number().int().positive().optional(),
  startDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid start date').optional(),
  endDate: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid end date').optional(),
  reason: z.string().optional().nullable(),
});

export const cancelLeaveSchema = z.object({
  cancelReason: z.string().optional().nullable(),
});

export const createLeaveTypeSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  annualQuota: z.number().min(0).optional().default(20),
  accrualRate: z.number().min(0).optional().default(0),
  creditSchedule: z.enum(['ANNUAL', 'BIANNUAL', 'MONTHLY']).optional().default('ANNUAL'),
  carryForward: z.boolean().optional().default(true),
  maxCarryForward: z.number().min(0).optional().default(0),
  maxEncashment: z.number().min(0).optional().default(0),
  requiresDoc: z.boolean().optional().default(false),
  requiresDocAfterDays: z.number().int().min(0).optional().default(0),
  paid: z.boolean().optional().default(true),
  eligibleTypes: z.string().optional().default('ALL'),
});

export const updateLeaveTypeSchema = z.object({
  name: z.string().min(1).optional(),
  annualQuota: z.number().min(0).optional(),
  accrualRate: z.number().min(0).optional(),
  creditSchedule: z.enum(['ANNUAL', 'BIANNUAL', 'MONTHLY']).optional(),
  carryForward: z.boolean().optional(),
  maxCarryForward: z.number().min(0).optional(),
  maxEncashment: z.number().min(0).optional(),
  requiresDoc: z.boolean().optional(),
  requiresDocAfterDays: z.number().int().min(0).optional(),
  paid: z.boolean().optional(),
  eligibleTypes: z.string().optional(),
  active: z.boolean().optional(),
});

export const createHolidaySchema = z.object({
  name: z.string().min(1, 'Name is required'),
  date: z.string().refine((val) => !isNaN(Date.parse(val)), 'Invalid date'),
  recurring: z.boolean().optional().default(false),
});

export const updateSettingsSchema = z.object({
  workWeekStart: z.enum(['monday', 'sunday']).optional(),
  standardHours: z.number().min(0).max(24).optional(),
  timeFormat: z.enum(['decimal', 'hhmm']).optional(),
  timeIncrement: z.number().refine((v) => [15, 30, 60].includes(v)).optional(),
  maxHoursPerDay: z.number().min(0).max(24).optional(),
  maxHoursPerWeek: z.number().min(0).max(168).optional(),
  requireApproval: z.boolean().optional(),
  allowBackdated: z.boolean().optional(),
  enableOvertime: z.boolean().optional(),
  mandatoryDesc: z.boolean().optional(),
  allowCopyWeek: z.boolean().optional(),
  dailyReminderTime: z.string().optional().nullable(),
  weeklyDeadline: z.string().optional().nullable(),
  leaveRequireApproval: z.boolean().optional(),
  leaveAllowBackdated: z.boolean().optional(),
  accrualEnabled: z.boolean().optional(),
  carryForwardEnabled: z.boolean().optional(),
  carryForwardMaxDays: z.number().min(0).optional(),
  leaveApprovalLevels: z.number().refine((v) => [1, 2].includes(v)).optional(),
  ssoGoogleEnabled: z.boolean().optional(),
  ssoMicrosoftEnabled: z.boolean().optional(),
  payrollType: z.string().optional().nullable(),
  pmType: z.string().optional().nullable(),
});

export const rejectTimesheetSchema = z.object({
  reason: z.string().min(1, 'Rejection reason is required'),
});

export const rejectLeaveSchema = z.object({
  comment: z.string().min(1, 'Comment is required'),
});

export const approveLeaveSchema = z.object({
  comment: z.string().optional().nullable(),
});

export const assignManagersSchema = z.object({
  managerIds: z.array(z.number().int().positive()),
});
