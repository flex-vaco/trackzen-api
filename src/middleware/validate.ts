import { Request, Response, NextFunction } from 'express';
import { ZodSchema } from 'zod';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants.js';

export const validate = (schema: ZodSchema) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const errors = result.error.errors.map((e) => ({
        field: e.path.join('.'),
        message: e.message,
      }));

      res.status(HTTP_STATUS.BAD_REQUEST).json({
        success: false,
        error: 'Validation failed',
        code: ERROR_CODES.VALIDATION_ERROR,
        details: errors,
      });
      return;
    }

    req.body = result.data;
    next();
  };
};
