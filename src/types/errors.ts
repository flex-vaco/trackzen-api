import { ERROR_CODES, HTTP_STATUS } from '../utils/constants.js';

type ErrorCode = (typeof ERROR_CODES)[keyof typeof ERROR_CODES];

export class AppError extends Error {
  public readonly statusCode: number;
  public readonly code: ErrorCode;
  public readonly isOperational: boolean;

  constructor(message: string, statusCode: number, code: ErrorCode) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
    this.isOperational = true;
    Object.setPrototypeOf(this, AppError.prototype);
  }

  static badRequest(message: string, code: ErrorCode = ERROR_CODES.VALIDATION_ERROR): AppError {
    return new AppError(message, HTTP_STATUS.BAD_REQUEST, code);
  }

  static unauthorized(message = 'Unauthorized'): AppError {
    return new AppError(message, HTTP_STATUS.UNAUTHORIZED, ERROR_CODES.UNAUTHORIZED);
  }

  static forbidden(message = 'Forbidden', code: ErrorCode = ERROR_CODES.FORBIDDEN): AppError {
    return new AppError(message, HTTP_STATUS.FORBIDDEN, code);
  }

  static notFound(message = 'Resource not found'): AppError {
    return new AppError(message, HTTP_STATUS.NOT_FOUND, ERROR_CODES.NOT_FOUND);
  }

  static conflict(message: string, code: ErrorCode = ERROR_CODES.CONFLICT): AppError {
    return new AppError(message, HTTP_STATUS.CONFLICT, code);
  }

  static internal(message = 'Internal server error'): AppError {
    return new AppError(message, HTTP_STATUS.INTERNAL_ERROR, ERROR_CODES.INTERNAL_ERROR);
  }
}
