import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import * as ctrl from '../controllers/leave.controller.js';
import { createLeaveRequestSchema, updateLeaveRequestSchema, cancelLeaveSchema } from '../types/schemas.js';

const router = Router();

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', validate(createLeaveRequestSchema), ctrl.create);
router.get('/:id', ctrl.getById);
router.put('/:id', validate(updateLeaveRequestSchema), ctrl.update);
router.post('/:id/cancel', validate(cancelLeaveSchema), ctrl.cancel);

export default router;
