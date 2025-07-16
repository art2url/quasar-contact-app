import dotenv from 'dotenv';

// Load environment variables from .env file
dotenv.config();

interface EnvConfig {
  PORT: number;
  NODE_ENV: string;
  DATABASE_PUBLIC_URL: string;
  APP_NAME: string;
  JWT_SECRET: string;
  CLIENT_ORIGIN: string;
  LANDING_URL: string;
  RL_GLOBAL_MAX: number;
  RL_AUTH_MAX: number;
  OFFLINE_DELAY_MS: number;

  // Email configuration (optional)
  SMTP_HOST?: string;
  SMTP_PORT?: number;
  SMTP_SECURE?: boolean;
  SMTP_USER?: string;
  SMTP_PASS?: string;
  SMTP_FROM?: string;
}

// Define and validate environment variables
export const env: EnvConfig = {
  PORT: parseInt(process.env.PORT || '5000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  DATABASE_PUBLIC_URL: process.env.DATABASE_PUBLIC_URL || '',
  APP_NAME: process.env.APP_NAME || 'Quasar Contact',
  JWT_SECRET: process.env.JWT_SECRET || '',
  CLIENT_ORIGIN: process.env.CLIENT_ORIGIN || 'http://localhost:4200',
  LANDING_URL: process.env.LANDING_URL || 'https://quasar.contact',
  RL_GLOBAL_MAX: parseInt(process.env.RL_GLOBAL_MAX || '300', 10),
  RL_AUTH_MAX: parseInt(process.env.RL_AUTH_MAX || '5', 10),
  OFFLINE_DELAY_MS: parseInt(process.env.OFFLINE_DELAY_MS || '7000', 10),

  // Email settings (optional)
  SMTP_HOST: process.env.SMTP_HOST,
  SMTP_PORT: process.env.SMTP_PORT ? parseInt(process.env.SMTP_PORT, 10) : undefined,
  SMTP_SECURE: process.env.SMTP_SECURE === 'true',
  SMTP_USER: process.env.SMTP_USER,
  SMTP_PASS: process.env.SMTP_PASS,
  SMTP_FROM: process.env.SMTP_FROM || 'noreply@quasar.contact',
};

// Validate required environment variables
const validateEnv = () => {
  if (!env.DATABASE_PUBLIC_URL) {
    throw new Error('DATABASE_PUBLIC_URL is required');
  }

  if (!env.JWT_SECRET) {
    throw new Error('JWT_SECRET is required');
  }

  if (env.JWT_SECRET.length < 32) {
    console.warn(
      'WARNING: JWT_SECRET should be at least 32 characters long for security',
    );
  }

  // Warn if email settings are not configured
  if (!env.SMTP_HOST || !env.SMTP_USER || !env.SMTP_PASS) {
    console.warn(
      'WARNING: email settings not configured. Password reset emails will not be sent.',
    );
    console.warn(
      'To enable email functionality, set SMTP_HOST, SMTP_PORT, SMTP_USER, and SMTP_PASS in your .env file.',
    );
    console.warn(
      'Example settings:\n' +
        '  SMTP_HOST=mail.yourdomain.com\n' +
        '  SMTP_PORT=587\n' +
        '  SMTP_SECURE=false\n' +
        '  SMTP_USER=noreply@yourdomain.com\n' +
        '  SMTP_PASS=your-email-password',
    );
  } else {
    // Email service configured successfully
  }

  return true;
};

// Validate env variables on import
validateEnv();

export default env;
