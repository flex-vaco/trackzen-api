import cron from 'node-cron';
import { runMonthlyAccrual } from '../services/leaveAccrual.service.js';
import { logger } from '../utils/logger.js';

export function scheduleAccrualJob() {
  // Run on the 1st of each month at midnight
  cron.schedule('0 0 1 * *', async () => {
    logger.info('Running monthly leave accrual job');
    try {
      await runMonthlyAccrual();
      logger.info('Monthly leave accrual completed');
    } catch (err) {
      logger.error(err, 'Leave accrual job failed');
    }
  });
  logger.info('Leave accrual job scheduled (1st of each month)');
}
