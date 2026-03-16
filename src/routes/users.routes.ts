import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import * as ctrl from '../controllers/users.controller.js';
import { createUserSchema, updateUserSchema } from '../types/schemas.js';

const router = Router();

router.use(authenticate);
router.use(requireRole('MANAGER', 'ADMIN'));

router.get('/', ctrl.list);
router.post('/', validate(createUserSchema), ctrl.create);
router.put('/:id', validate(updateUserSchema), ctrl.update);
router.delete('/:id', ctrl.remove);

export default router;
