import { Request, Response } from 'express';
import { tryCatch } from '../utils/tryCatch.js';
import * as authService from '../services/auth.service.js';

const COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === 'production',
  sameSite: 'strict' as const,
  maxAge: 7 * 24 * 60 * 60 * 1000,
  path: '/',
};

export const register = tryCatch(async (req: Request, res: Response) => {
  const result = await authService.register(req.body);

  res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

  res.status(201).json({
    success: true,
    data: {
      accessToken: result.accessToken,
      user: result.user,
    },
  });
});

export const login = tryCatch(async (req: Request, res: Response) => {
  const result = await authService.login(req.body);

  res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

  res.json({
    success: true,
    data: {
      accessToken: result.accessToken,
      user: result.user,
    },
  });
});

export const refresh = tryCatch(async (req: Request, res: Response) => {
  const oldRefreshToken = req.cookies?.refreshToken;
  if (!oldRefreshToken) {
    res.status(401).json({
      success: false,
      error: 'Missing refresh token',
      code: 'UNAUTHORIZED',
    });
    return;
  }
  const result = await authService.refreshTokens(oldRefreshToken);

  res.cookie('refreshToken', result.refreshToken, COOKIE_OPTIONS);

  res.json({
    success: true,
    data: {
      accessToken: result.accessToken,
      user: result.user,
    },
  });
});

export const logout = tryCatch(async (req: Request, res: Response) => {
  await authService.logout(req.user.userId);

  res.clearCookie('refreshToken', COOKIE_OPTIONS);

  res.json({ success: true, data: null });
});
