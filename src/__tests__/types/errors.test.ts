import { AppError } from '../../types/errors.js';
import { ERROR_CODES, HTTP_STATUS } from '../../utils/constants.js';

describe('AppError', () => {
  it('creates an error with message, statusCode, and code', () => {
    const err = new AppError('Test error', 400, ERROR_CODES.VALIDATION_ERROR);
    expect(err.message).toBe('Test error');
    expect(err.statusCode).toBe(400);
    expect(err.code).toBe('VALIDATION_ERROR');
    expect(err.isOperational).toBe(true);
    expect(err).toBeInstanceOf(Error);
    expect(err).toBeInstanceOf(AppError);
  });

  describe('static factories', () => {
    it('badRequest returns 400', () => {
      const err = AppError.badRequest('Bad input');
      expect(err.statusCode).toBe(HTTP_STATUS.BAD_REQUEST);
      expect(err.code).toBe(ERROR_CODES.VALIDATION_ERROR);
      expect(err.message).toBe('Bad input');
    });

    it('badRequest with custom code', () => {
      const err = AppError.badRequest('Max exceeded', ERROR_CODES.MAX_HOURS_EXCEEDED);
      expect(err.code).toBe('MAX_HOURS_EXCEEDED');
    });

    it('unauthorized returns 401', () => {
      const err = AppError.unauthorized();
      expect(err.statusCode).toBe(HTTP_STATUS.UNAUTHORIZED);
      expect(err.code).toBe(ERROR_CODES.UNAUTHORIZED);
      expect(err.message).toBe('Unauthorized');
    });

    it('unauthorized with custom message', () => {
      const err = AppError.unauthorized('Token expired');
      expect(err.message).toBe('Token expired');
    });

    it('forbidden returns 403', () => {
      const err = AppError.forbidden();
      expect(err.statusCode).toBe(HTTP_STATUS.FORBIDDEN);
      expect(err.code).toBe(ERROR_CODES.FORBIDDEN);
    });

    it('forbidden with custom code', () => {
      const err = AppError.forbidden('Not your report', ERROR_CODES.NOT_DIRECT_REPORT);
      expect(err.code).toBe('NOT_DIRECT_REPORT');
    });

    it('notFound returns 404', () => {
      const err = AppError.notFound('Timesheet not found');
      expect(err.statusCode).toBe(HTTP_STATUS.NOT_FOUND);
      expect(err.code).toBe(ERROR_CODES.NOT_FOUND);
      expect(err.message).toBe('Timesheet not found');
    });

    it('notFound with default message', () => {
      const err = AppError.notFound();
      expect(err.message).toBe('Resource not found');
    });

    it('conflict returns 409', () => {
      const err = AppError.conflict('Already exists');
      expect(err.statusCode).toBe(HTTP_STATUS.CONFLICT);
      expect(err.code).toBe(ERROR_CODES.CONFLICT);
    });

    it('internal returns 500', () => {
      const err = AppError.internal();
      expect(err.statusCode).toBe(HTTP_STATUS.INTERNAL_ERROR);
      expect(err.code).toBe(ERROR_CODES.INTERNAL_ERROR);
      expect(err.message).toBe('Internal server error');
    });
  });
});
