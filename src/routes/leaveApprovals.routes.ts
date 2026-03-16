import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import * as ctrl from '../controllers/leaveApprovals.controller.js';
import { approveLeaveSchema, rejectLeaveSchema } from '../types/schemas.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('MANAGER', 'ADMIN'));

router.get('/', ctrl.list);
router.get('/stats', ctrl.stats);
router.post('/:id/approve', validate(approveLeaveSchema), ctrl.approve);
router.post('/:id/reject', validate(rejectLeaveSchema), ctrl.reject);

export default router;
