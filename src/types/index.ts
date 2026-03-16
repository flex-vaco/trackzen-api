import { UserRole } from '@prisma/client';

export interface JwtPayload {
  userId: number;
  orgId: number;
  role: UserRole;
}

export interface AuthenticatedRequest {
  user: JwtPayload;
}

export interface PaginationParams {
  page: number;
  limit: number;
}

export interface PaginatedResponse<T> {
  success: true;
  data: T[];
  meta: {
    total: number;
    page: number;
    limit: number;
  };
}

export interface SuccessResponse<T> {
  success: true;
  data: T;
}

export interface ErrorResponse {
  success: false;
  error: string;
  code: string;
}

export interface EmailPayload {
  to: string;
  subject: string;
  html: string;
}

export interface RegisterInput {
  orgName: string;
  name: string;
  email: string;
  password: string;
}

export interface LoginInput {
  email: string;
  password: string;
}

export interface CreateTimesheetInput {
  weekStartDate: string;
}

export interface TimeEntryInput {
  projectId: number;
  billable?: boolean;
  monHours?: number;
  monDesc?: string;
  monTimeOff?: number;
  tueHours?: number;
  tueDesc?: string;
  tueTimeOff?: number;
  wedHours?: number;
  wedDesc?: string;
  wedTimeOff?: number;
  thuHours?: number;
  thuDesc?: string;
  thuTimeOff?: number;
  friHours?: number;
  friDesc?: string;
  friTimeOff?: number;
  satHours?: number;
  satDesc?: string;
  satTimeOff?: number;
  sunHours?: number;
  sunDesc?: string;
  sunTimeOff?: number;
}

export interface CreateProjectInput {
  code: string;
  name: string;
  client: string;
  budgetHours?: number;
  managerIds?: number[];
  employeeIds?: number[];
}

export interface CreateUserInput {
  name: string;
  email: string;
  password: string;
  role?: UserRole;
  department?: string;
}

export interface CreateLeaveRequestInput {
  leaveTypeId: number;
  startDate: string;
  endDate: string;
  reason?: string;
}

export interface CreateLeaveTypeInput {
  name: string;
  annualQuota?: number;
  accrualRate?: number;
  carryForward?: boolean;
  requiresDoc?: boolean;
  paid?: boolean;
}

export interface CreateHolidayInput {
  name: string;
  date: string;
  recurring?: boolean;
}
