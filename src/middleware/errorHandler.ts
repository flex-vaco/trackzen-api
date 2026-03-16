import { Request, Response, NextFunction } from 'express';
import { AppError } from '../types/errors.js';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants.js';
import { logger } from '../utils/logger.js';

export const errorHandler = (
  err: Error,
  _req: Request,
  res: Response,
  _next: NextFunction
): void => {
  if (err instanceof AppError) {
    res.status(err.statusCode).json({
      success: false,
      error: err.message,
      code: err.code,
    });
    return;
  }

  logger.error({ err }, 'Unhandled error');

  res.status(HTTP_STATUS.INTERNAL_ERROR).json({
    success: false,
    error: 'Internal server error',
    code: ERROR_CODES.INTERNAL_ERROR,
  });
};
