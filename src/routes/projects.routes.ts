import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { requireRole } from '../middleware/rbac.js';
import { validate } from '../middleware/validate.js';
import * as ctrl from '../controllers/projects.controller.js';
import { createProjectSchema, updateProjectSchema, assignProjectEmployeesSchema } from '../types/schemas.js';

const router = Router();

router.use(authenticate);

router.get('/', ctrl.list);
router.get('/:id', ctrl.getById);
router.post('/', requireRole('MANAGER', 'ADMIN'), validate(createProjectSchema), ctrl.create);
router.put('/:id', requireRole('MANAGER', 'ADMIN'), validate(updateProjectSchema), ctrl.update);
router.delete('/:id', requireRole('MANAGER', 'ADMIN'), ctrl.remove);
router.put('/:id/employees', requireRole('MANAGER', 'ADMIN'), validate(assignProjectEmployeesSchema), ctrl.assignEmployees);

export default router;
