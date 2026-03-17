import express from 'express';
import cors from 'cors';
import cookieParser from 'cookie-parser';
import { connectDB } from './utils/db.js';
import { logger } from './utils/logger.js';
import { errorHandler } from './middleware/errorHandler.js';
import { apiLimiter } from './middleware/rateLimiter.js';

// Import all route modules
import authRoutes from './routes/auth.routes.js';
import oauthRoutes from './routes/oauth.routes.js';
import timesheetRoutes from './routes/timesheets.routes.js';
import approvalRoutes from './routes/approvals.routes.js';
import projectRoutes from './routes/projects.routes.js';
import teamRoutes from './routes/team.routes.js';
import userRoutes from './routes/users.routes.js';
import holidayRoutes from './routes/holidays.routes.js';
import settingsRoutes from './routes/settings.routes.js';
import notificationRoutes from './routes/notifications.routes.js';
import leaveRoutes from './routes/leave.routes.js';
import leaveApprovalRoutes from './routes/leaveApprovals.routes.js';
import leaveTypeRoutes from './routes/leaveTypes.routes.js';
import leaveBalanceRoutes from './routes/leaveBalances.routes.js';
import leaveCalendarRoutes from './routes/leaveCalendar.routes.js';
import reportRoutes from './routes/reports.routes.js';
import { scheduleAccrualJob } from './jobs/leaveAccrual.job.js';

const app = express();
const PORT = process.env.PORT ?? 3001;

// Global middleware
app.use(cors({ origin: process.env.CORS_ORIGIN, credentials: true }));
app.use(express.json());
app.use(cookieParser());
app.use('/api/v1', apiLimiter);

// Health check
app.get('/health', (_req, res) => {
  res.json({ status: 'ok', service: 'trackzen-api' });
});

// Routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/auth/oauth', oauthRoutes);
app.use('/api/v1/timesheets', timesheetRoutes);
app.use('/api/v1/approvals', approvalRoutes);
app.use('/api/v1/projects', projectRoutes);
app.use('/api/v1/team', teamRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/holidays', holidayRoutes);
app.use('/api/v1/settings', settingsRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/leave/approvals', leaveApprovalRoutes);
app.use('/api/v1/leave/types', leaveTypeRoutes);
app.use('/api/v1/leave/balances', leaveBalanceRoutes);
app.use('/api/v1/leave/calendar', leaveCalendarRoutes);
app.use('/api/v1/leave', leaveRoutes);
app.use('/api/v1/reports', reportRoutes);

// Error handler (must be last)
app.use(errorHandler);

async function start() {
  await connectDB();
  scheduleAccrualJob();
  app.listen(PORT, () => {
    logger.info(`TrackZen API running on port ${PORT}`);
  });
}

start().catch((err) => {
  logger.error(err, 'Failed to start');
  process.exit(1);
});
