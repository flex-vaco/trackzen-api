import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/rbac.js';
import * as ctrl from '../controllers/reports.controller.js';

const router = Router();

router.use(authenticate);

// All users can download their own monthly timesheet; service layer enforces scoping
router.get('/export-monthly', ctrl.exportMonthly);

// Report generation and export restricted to managers and admins
router.get('/', requireRole('MANAGER', 'ADMIN'), ctrl.getReports);
router.get('/export', requireRole('MANAGER', 'ADMIN'), ctrl.exportReport);

export default router;
