import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import * as ctrl from '../controllers/leaveTypes.controller.js';
import { createLeaveTypeSchema, updateLeaveTypeSchema } from '../types/schemas.js';

const router = Router();

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', requireRole('ADMIN'), validate(createLeaveTypeSchema), ctrl.create);
router.put('/:id', requireRole('ADMIN'), validate(updateLeaveTypeSchema), ctrl.update);
router.delete('/:id', requireRole('ADMIN'), ctrl.remove);

export default router;
