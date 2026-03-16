import {
  USER_STATUS,
  ERROR_CODES,
  HTTP_STATUS,
  TIMESHEET_STATUS,
  LEAVE_STATUS,
  APPROVAL_STATUS,
  NOTIFICATION_TYPES,
  PAGINATION,
} from '../../utils/constants.js';

describe('constants', () => {
  describe('USER_STATUS', () => {
    it('has ACTIVE and INACTIVE', () => {
      expect(USER_STATUS.ACTIVE).toBe('active');
      expect(USER_STATUS.INACTIVE).toBe('inactive');
    });
  });

  describe('HTTP_STATUS', () => {
    it('has correct status codes', () => {
      expect(HTTP_STATUS.OK).toBe(200);
      expect(HTTP_STATUS.CREATED).toBe(201);
      expect(HTTP_STATUS.BAD_REQUEST).toBe(400);
      expect(HTTP_STATUS.UNAUTHORIZED).toBe(401);
      expect(HTTP_STATUS.FORBIDDEN).toBe(403);
      expect(HTTP_STATUS.NOT_FOUND).toBe(404);
      expect(HTTP_STATUS.CONFLICT).toBe(409);
      expect(HTTP_STATUS.INTERNAL_ERROR).toBe(500);
    });
  });

  describe('TIMESHEET_STATUS', () => {
    it('has all four statuses', () => {
      expect(TIMESHEET_STATUS.DRAFT).toBe('DRAFT');
      expect(TIMESHEET_STATUS.SUBMITTED).toBe('SUBMITTED');
      expect(TIMESHEET_STATUS.APPROVED).toBe('APPROVED');
      expect(TIMESHEET_STATUS.REJECTED).toBe('REJECTED');
    });

    it('has exactly 4 values', () => {
      expect(Object.keys(TIMESHEET_STATUS)).toHaveLength(4);
    });
  });

  describe('LEAVE_STATUS', () => {
    it('has all four statuses', () => {
      expect(LEAVE_STATUS.PENDING).toBe('PENDING');
      expect(LEAVE_STATUS.APPROVED).toBe('APPROVED');
      expect(LEAVE_STATUS.REJECTED).toBe('REJECTED');
      expect(LEAVE_STATUS.CANCELLED).toBe('CANCELLED');
    });

    it('has exactly 4 values', () => {
      expect(Object.keys(LEAVE_STATUS)).toHaveLength(4);
    });
  });

  describe('APPROVAL_STATUS', () => {
    it('has three statuses', () => {
      expect(APPROVAL_STATUS.PENDING).toBe('PENDING');
      expect(APPROVAL_STATUS.APPROVED).toBe('APPROVED');
      expect(APPROVAL_STATUS.REJECTED).toBe('REJECTED');
    });
  });

  describe('ERROR_CODES', () => {
    it('has all expected error codes', () => {
      const expected = [
        'VALIDATION_ERROR', 'INVALID_TRANSITION', 'MAX_HOURS_EXCEEDED',
        'BACKDATING_NOT_ALLOWED', 'DESCRIPTION_REQUIRED', 'COPY_WEEK_DISABLED',
        'SELF_MANAGER_ASSIGNMENT', 'INSUFFICIENT_LEAVE_BALANCE', 'INVALID_DATE_RANGE',
        'OVERLAPPING_LEAVE', 'UNAUTHORIZED', 'OAUTH_PROVIDER_ERROR', 'SSO_DISABLED',
        'FORBIDDEN', 'OAUTH_PROVIDER_CONFLICT', 'SELF_APPROVAL_FORBIDDEN',
        'IMMUTABLE_TIMESHEET', 'NOT_DIRECT_REPORT', 'EMPLOYEE_NOT_ASSIGNED',
        'LEAVE_NOT_CANCELLABLE', 'NOT_FOUND', 'CONFLICT', 'INTERNAL_ERROR',
      ];
      for (const code of expected) {
        expect((ERROR_CODES as Record<string, string>)[code]).toBe(code);
      }
    });
  });

  describe('NOTIFICATION_TYPES', () => {
    it('has timesheet notification types', () => {
      expect(NOTIFICATION_TYPES.TS_SUBMITTED).toBe('ts_submitted');
      expect(NOTIFICATION_TYPES.TS_APPROVED).toBe('ts_approved');
      expect(NOTIFICATION_TYPES.TS_REJECTED).toBe('ts_rejected');
      expect(NOTIFICATION_TYPES.TS_REMINDER).toBe('ts_reminder');
    });

    it('has leave notification types', () => {
      expect(NOTIFICATION_TYPES.LEAVE_SUBMITTED).toBe('leave_submitted');
      expect(NOTIFICATION_TYPES.LEAVE_APPROVED).toBe('leave_approved');
      expect(NOTIFICATION_TYPES.LEAVE_REJECTED).toBe('leave_rejected');
      expect(NOTIFICATION_TYPES.LEAVE_CANCELLED).toBe('leave_cancelled');
    });
  });

  describe('PAGINATION', () => {
    it('has correct defaults', () => {
      expect(PAGINATION.DEFAULT_PAGE).toBe(1);
      expect(PAGINATION.DEFAULT_LIMIT).toBe(20);
      expect(PAGINATION.MAX_LIMIT).toBe(100);
    });

    it('MAX_LIMIT > DEFAULT_LIMIT', () => {
      expect(PAGINATION.MAX_LIMIT).toBeGreaterThan(PAGINATION.DEFAULT_LIMIT);
    });
  });
});
