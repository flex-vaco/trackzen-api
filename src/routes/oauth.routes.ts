import { Router, Request, Response } from 'express';

const router = Router();

const notConfigured = (_req: Request, res: Response): void => {
  res.status(501).json({ success: false, error: 'OAuth not configured' });
};

router.get('/google', notConfigured);
router.get('/google/callback', notConfigured);
router.get('/microsoft', notConfigured);
router.get('/microsoft/callback', notConfigured);

export default router;
