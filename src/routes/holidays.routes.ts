import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import * as ctrl from '../controllers/holidays.controller.js';
import { createHolidaySchema } from '../types/schemas.js';

const router = Router();

router.use(authenticate);

router.get('/', ctrl.list);
router.post('/', requireRole('ADMIN'), validate(createHolidaySchema), ctrl.create);
router.delete('/:id', requireRole('ADMIN'), ctrl.remove);

export default router;
