import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import * as ctrl from '../controllers/settings.controller.js';
import { updateSettingsSchema } from '../types/schemas.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('ADMIN'));

router.get('/', ctrl.get);
router.put('/', validate(updateSettingsSchema), ctrl.update);

export default router;
