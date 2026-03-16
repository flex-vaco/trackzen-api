import { Router } from 'express';
import { authenticate } from '../middleware/authenticate.js';
import { validate } from '../middleware/validate.js';
import * as ctrl from '../controllers/timesheets.controller.js';
import { createTimesheetSchema, updateTimesheetSchema, copyPreviousWeekSchema, createTimeEntrySchema, updateTimeEntrySchema } from '../types/schemas.js';

const router = Router();

router.use(authenticate);

// Timesheet CRUD
router.get('/', ctrl.list);
router.post('/', validate(createTimesheetSchema), ctrl.create);
router.post('/copy-previous-week', validate(copyPreviousWeekSchema), ctrl.copyPreviousWeek);
router.get('/:id', ctrl.getById);
router.put('/:id', validate(updateTimesheetSchema), ctrl.update);
router.delete('/:id', ctrl.remove);
router.post('/:id/submit', ctrl.submit);

// Time Entries (nested under timesheets)
router.get('/:id/entries', ctrl.listEntries);
router.post('/:id/entries', validate(createTimeEntrySchema), ctrl.createEntry);
router.put('/:id/entries/:eid', validate(updateTimeEntrySchema), ctrl.updateEntry);
router.delete('/:id/entries/:eid', ctrl.deleteEntry);

export default router;
