// ─── Imports ───────────────────────────────────────────────
import express from 'express';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import path from 'path';
import { httpCors } from './config/cors';

// ─── Security Middleware ────────────────────────────────────
import { blockBots, honeypot } from './middleware/bot-blocker';
import { setupBotTraps, checkTrappedIP } from './middleware/bot-trap';
import { securityHeaders } from './middleware/security-headers';
import {
  logSuspiciousRequest,
  accessLogger,
  analyzeAttackPatterns,
} from './middleware/request-logger';
import { debugMiddleware } from './middleware/debug';

// ─── Route Imports ─────────────────────────────────────────
import authRoutes from './routes/auth.routes';
import keyRoutes from './routes/keys.routes';
import messageRoutes from './routes/messages.routes';
import userRoutes from './routes/users.routes';
import roomsRoutes from './routes/rooms.routes';
import analyticsRoutes from './routes/analytics.routes';

// ─── App Initialization ────────────────────────────────────
const app = express();

// ─── DEBUG: to see ALL requests ────────────
if (process.env.NODE_ENV !== 'production') {
  app.use(debugMiddleware);
}

// ─── SECURITY LAYER 1: HTTPS Redirect ──────────────────────
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    if (req.header('x-forwarded-proto') !== 'https') {
      return res.redirect(`https://${req.header('host')}${req.url}`);
    }
  }
  next();
});

// ─── Trust Proxy (Railway) ─────────────────────────────────
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', 1);
}

// ─── SECURITY LAYER 2: Custom Security Headers ─────────────
app.use(securityHeaders);

// ─── SECURITY LAYER 3: Request Logging ─────────────────────
app.use(accessLogger);
app.use(logSuspiciousRequest);

// Start attack pattern analysis
analyzeAttackPatterns();

// ─── SECURITY LAYER 4: Bot Blocking & Traps ────────────────
// Check trapped IPs first
app.use(checkTrappedIP);

// Main bot blocker
app.use(blockBots);

// Setup bot traps (before routes)
setupBotTraps(app);

// ─── Honeypot Routes (High Priority) ───────────────────────
app.get('/admin', honeypot);
app.get('/wp-admin', honeypot);
app.get('/wp-login.php', honeypot);
app.get('/.env', honeypot);

// ─── Health-check route ────────────────────────────────────
app.get('/health', (_req, res) =>
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    date: new Date().toISOString(),
    secure: process.env.NODE_ENV === 'production',
    stage: process.env.NODE_ENV === 'production' ? 'production' : 'alpha',
    security: 'enhanced',
  })
);

// ─── SECURITY LAYER 5: Helmet ──────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for Angular app
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
    hidePoweredBy: true,
    noSniff: true,
    xssFilter: true,
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
  })
);

// ─── CORS ──────────────────────────────────────────────────
app.use(httpCors);

// ─── Body Parsing with Limits ─────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─── Cookie Parser ─────────────────────────────────────────
app.use(cookieParser(process.env.COOKIE_SECRET || 'fallback-secret-key'));

// ─── Serve Static Files BEFORE API routes ─────────────────
const staticOptions = {
  dotfiles: 'ignore',
  etag: true,
  extensions: ['html', 'js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico'],
  index: 'index.html', // Enable index.html serving
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  redirect: false,
};

app.use(
  '/',
  express.static(path.join(__dirname, '../../public'), staticOptions)
);
app.use(
  '/app',
  express.static(path.join(__dirname, '../../dist'), staticOptions)
);
app.use(express.static(path.join(__dirname, '../../dist'), staticOptions));

// ─── SECURITY LAYER 6: Smart Rate Limiting ─────────────────
import rateLimit from 'express-rate-limit';

// Strict rate limiting for auth endpoints
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 20, // 20 attempts per window
  message: {
    error: 'Too many authentication attempts. Please try again later.',
    type: 'auth_rate_limit',
    retryAfter: 15,
  },
  standardHeaders: true,
  legacyHeaders: false,
  skip: (req) => {
    // Only apply to sensitive endpoints
    const sensitiveEndpoints = [
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/forgot-password',
    ];
    return !sensitiveEndpoints.some((endpoint) => req.path === endpoint);
  },
  handler: (req, res) => {
    console.log(`⚠️  Rate limit exceeded for ${req.ip} on ${req.path}`);
    res.status(429).json({
      error: 'Too many requests',
      message: 'Please try again later',
    });
  },
});

// General API rate limiting
const apiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 100, // 100 requests per minute
  message: {
    error: 'Too many requests',
    type: 'api_rate_limit',
  },
  skip: (req) => {
    // Skip rate limiting for static assets
    return !!req.path.match(
      /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/
    );
  },
  keyGenerator: (req) => {
    // Use the real IP from X-Forwarded-For header
    return req.ip || 'unknown';
  },
});

// ─── API Health Check (under /api prefix) ──────────────────
app.get('/api/health', (_req, res) =>
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    date: new Date().toISOString(),
    secure: process.env.NODE_ENV === 'production',
    stage: process.env.NODE_ENV === 'production' ? 'production' : 'alpha',
    security: 'enhanced',
  })
);

// ─── API Routes with Rate Limiting ────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/keys', apiLimiter, keyRoutes);
app.use('/api/messages', apiLimiter, messageRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/rooms', apiLimiter, roomsRoutes);
app.use('/api/analytics', apiLimiter, analyticsRoutes);

// ─── Handle /app redirect ─────────────────────────────────
app.get('/app', (_req, res) => {
  res.redirect('/app/');
});

// ─── Angular Router fallback ───────────────────────────────
app.get('/app/*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../dist', 'index.html'));
});

// ─── 404 Handler ───────────────────────────────────────────
app.use((req, res) => {
  // Log 404s as they might be scanning attempts
  console.log(`404: ${req.method} ${req.path} from ${req.ip}`);
  res.status(404).json({
    error: 'Not Found',
    message: 'The requested resource does not exist',
  });
});

// ─── Error Handler ─────────────────────────────────────────
app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[ERROR]', {
      error: err,
      path: req.path,
      method: req.method,
      ip: req.ip,
    });

    // Don't leak error details in production
    if (process.env.NODE_ENV === 'production') {
      res.status(500).json({
        error: 'Internal Server Error',
        message: 'An unexpected error occurred',
      });
    } else {
      res.status(500).json({
        error: 'Server Error',
        message: err instanceof Error ? err.message : 'Unknown error',
      });
    }
  }
);

// ─── Export App ────────────────────────────────────────────
export default app;
