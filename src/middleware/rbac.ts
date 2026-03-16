import { Request, Response, NextFunction } from 'express';
import { UserRole } from '@prisma/client';
import { ERROR_CODES, HTTP_STATUS } from '../utils/constants.js';

export const requireRole = (...roles: UserRole[]) => {
  return (req: Request, res: Response, next: NextFunction): void => {
    if (!req.user || !roles.includes(req.user.role as UserRole)) {
      res.status(HTTP_STATUS.FORBIDDEN).json({
        success: false,
        error: 'Forbidden',
        code: ERROR_CODES.FORBIDDEN,
      });
      return;
    }
    next();
  };
};
