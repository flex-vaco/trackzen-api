import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/rbac.js';
import * as ctrl from '../controllers/leaveBalances.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', ctrl.getOwn);
router.get('/:userId', requireRole('MANAGER', 'ADMIN'), ctrl.getByUserId);

export default router;
