import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import * as ctrl from '../controllers/team.controller.js';
import { assignManagersSchema } from '../types/schemas.js';

const router = Router();

router.use(authenticate);

router.get('/my-managers', ctrl.getMyManagers);
router.get('/my-reports', requireRole('MANAGER', 'ADMIN'), ctrl.getMyReports);
router.get('/users/:userId/managers', requireRole('ADMIN'), ctrl.getUserManagers);
router.put('/users/:userId/managers', requireRole('ADMIN'), validate(assignManagersSchema), ctrl.assignManagers);

export default router;
