import { Router } from 'express';
import { query } from './config/db.js';
import adminRoutes from './modules/admin/admin.routes.js';
import authRoutes from './modules/auth/auth.routes.js';
import * as bookings from './modules/bookings/bookings.routes.js';
import * as categories from './modules/categories/categories.routes.js';
import * as checkin from './modules/checkin/checkin.routes.js';
import * as events from './modules/events/events.routes.js';
import * as finance from './modules/finance/finance.routes.js';
import * as payments from './modules/payments/payments.routes.js';
import userRoutes from './modules/users/users.routes.js';
import venueRoutes from './modules/venues/venues.routes.js';

const router = Router();

router.get('/health', async (_req, res) => {
  let database = 'up';
  try {
    await query('SELECT 1');
  } catch {
    database = 'down';
  }
  res.status(database === 'up' ? 200 : 503).json({ success: database === 'up', data: { api: 'up', database } });
});

// Public
router.use('/auth', authRoutes);
router.use('/categories', categories.publicRouter);
router.use('/events', events.publicRouter);

// Any logged-in user
router.use('/users', userRoutes);

// Attendee
router.use('/bookings/:id/refund-requests', finance.attendeeRouter);
router.use('/bookings', bookings.attendeeRouter);
router.use('/payments', payments.attendeeRouter);

// Organizer
router.use('/organizer', finance.organizerRouter);
router.use('/organizer/events/:eventId/check-in', checkin.organizerRouter);
router.use('/organizer/events/:eventId', bookings.organizerRouter);
router.use('/organizer/events', events.organizerRouter);
router.use('/organizer', venueRoutes);

// Admin (specific routers before the general /admin router)
router.use('/admin', finance.adminRouter);
router.use('/admin/categories', categories.adminRouter);
router.use('/admin/events/:eventId/check-in', checkin.adminRouter);
router.use('/admin/events', events.adminRouter);
router.use('/admin/bookings', bookings.adminRouter);
router.use('/admin/payments', payments.adminPaymentsRouter);
router.use('/admin/refunds', payments.adminRefundsRouter);
router.use('/admin', adminRoutes);

export default router;
