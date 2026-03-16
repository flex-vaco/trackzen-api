import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/rbac.js';
import * as ctrl from '../controllers/leaveCalendar.controller.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('MANAGER', 'ADMIN'));

router.get('/', ctrl.getCalendar);

export default router;
