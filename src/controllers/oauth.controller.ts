import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import { logger } from '../utils/logger.js';

const FRONTEND_URL = process.env.CORS_ORIGIN ?? 'http://localhost:5173';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

export const googleCallback = tryCatch(async (req: Request, res: Response) => {
  // Passport attaches the result to req.user after authentication
  const authResult = (req as unknown as { user: { accessToken: string; refreshToken: string } }).user as { accessToken: string; refreshToken: string } | undefined;

  if (!authResult) {
    logger.error('OAuth callback: no auth result');
    res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    return;
  }

  res.cookie('refreshToken', authResult.refreshToken, COOKIE_OPTIONS);
  res.redirect(`${FRONTEND_URL}/oauth/success?token=${authResult.accessToken}`);
});

export const microsoftCallback = tryCatch(async (req: Request, res: Response) => {
  const authResult = (req as unknown as { user: { accessToken: string; refreshToken: string } }).user as { accessToken: string; refreshToken: string } | undefined;

  if (!authResult) {
    logger.error('OAuth callback: no auth result');
    res.redirect(`${FRONTEND_URL}/login?error=oauth_failed`);
    return;
  }

  res.cookie('refreshToken', authResult.refreshToken, COOKIE_OPTIONS);
  res.redirect(`${FRONTEND_URL}/oauth/success?token=${authResult.accessToken}`);
});
