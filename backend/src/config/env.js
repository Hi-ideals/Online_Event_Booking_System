import 'dotenv/config';

function required(name, fallback) {
  const value = process.env[name] ?? fallback;
  if (value === undefined || value === '') {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

const env = {
  nodeEnv: process.env.NODE_ENV || 'development',
  isProd: process.env.NODE_ENV === 'production',
  port: Number(process.env.PORT) || 5000,
  clientUrl: process.env.CLIENT_URL || 'http://localhost:5173',

  db: {
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT) || 5432,
    name: required('DB_NAME', 'event_booking'),
    user: required('DB_USER', 'postgres'),
    password: process.env.DB_PASSWORD || '',
  },

  jwt: {
    accessSecret: required('JWT_ACCESS_SECRET'),
    accessExpiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m',
    refreshExpiresDays: Number(process.env.REFRESH_TOKEN_EXPIRES_DAYS) || 7,
  },

  booking: {
    holdMinutes: Number(process.env.BOOKING_HOLD_MINUTES) || 10,
    convenienceFeePercent: Number(process.env.CONVENIENCE_FEE_PERCENT) || 0,
  },

  payments: {
    provider: process.env.PAYMENT_PROVIDER || 'mock',
    mockSecret: process.env.MOCK_PAYMENT_SECRET || 'mock-secret',
    razorpay: {
      keyId: process.env.RAZORPAY_KEY_ID || '',
      keySecret: process.env.RAZORPAY_KEY_SECRET || '',
      webhookSecret: process.env.RAZORPAY_WEBHOOK_SECRET || '',
    },
  },

  tickets: {
    qrSecret: required('TICKET_QR_SECRET'),
  },

  checkIn: {
    opensHoursBefore: Number(process.env.CHECKIN_OPENS_HOURS_BEFORE ?? 24),
    closesHoursAfter: Number(process.env.CHECKIN_CLOSES_HOURS_AFTER ?? 6),
  },

  platform: {
    name: process.env.PLATFORM_NAME || 'EventBooking',
    address: process.env.PLATFORM_ADDRESS || '',
    gstin: process.env.PLATFORM_GSTIN || '',
    supportEmail: process.env.PLATFORM_SUPPORT_EMAIL || '',
  },

  mail: {
    smtpHost: process.env.SMTP_HOST || '',
    smtpPort: Number(process.env.SMTP_PORT) || 587,
    smtpSecure: process.env.SMTP_SECURE === 'true',
    smtpUser: process.env.SMTP_USER || '',
    smtpPass: process.env.SMTP_PASS || '',
    from: process.env.MAIL_FROM || 'EventBooking <no-reply@eventbooking.com>',
  },

  admin: {
    name: process.env.ADMIN_NAME || 'Platform Admin',
    email: process.env.ADMIN_EMAIL,
    password: process.env.ADMIN_PASSWORD,
  },
};

export default env;
