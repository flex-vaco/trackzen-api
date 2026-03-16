import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import * as ctrl from '../controllers/notifications.controller.js';

const router = Router();

router.use(authenticate);

router.get('/', ctrl.list);
router.put('/read-all', ctrl.markAllAsRead);
router.put('/:id/read', ctrl.markAsRead);

export default router;
