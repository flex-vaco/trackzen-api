import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/rbac.js';
import * as ctrl from '../controllers/reports.controller.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('MANAGER', 'ADMIN'));

router.get('/', ctrl.getReports);
router.get('/export', ctrl.exportReport);
router.get('/export-monthly', ctrl.exportMonthly);

export default router;
