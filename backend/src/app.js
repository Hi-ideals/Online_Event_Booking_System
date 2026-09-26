import cookieParser from 'cookie-parser';
import cors from 'cors';
import express from 'express';
import rateLimit from 'express-rate-limit';
import helmet from 'helmet';
import morgan from 'morgan';
import env from './config/env.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';
import { UPLOAD_ROOT } from './middleware/upload.js';
import { webhookHandler } from './modules/payments/payments.routes.js';
import routes from './routes.js';

const app = express();

app.set('trust proxy', 1);
app.disable('x-powered-by');

// Allow the frontend (another origin) to display uploaded images.
app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(cors({ origin: env.clientUrl, credentials: true }));
app.use('/uploads', express.static(UPLOAD_ROOT, { maxAge: '7d', index: false }));

// Gateway webhooks need the exact raw bytes to verify the signature, so this runs before express.json().
app.post('/api/v1/payments/webhook/:provider', express.raw({ type: '*/*', limit: '1mb' }), webhookHandler);
app.use(express.json({ limit: '1mb' }));
app.use(express.urlencoded({ extended: false }));
app.use(cookieParser());
if (!env.isProd) app.use(morgan('dev'));

app.use(
  '/api',
  rateLimit({
    windowMs: 60 * 1000,
    limit: 300,
    standardHeaders: 'draft-8',
    legacyHeaders: false,
    message: { success: false, message: 'Too many requests, please slow down' },
  })
);

app.get('/', (_req, res) => res.json({ success: true, message: 'Event Booking API', docs: '/api/v1/health' }));
app.use('/api/v1', routes);

app.use(notFound);
app.use(errorHandler);

export default app;
