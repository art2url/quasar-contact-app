// ─── Imports ───────────────────────────────────────────────
import cookieParser from 'cookie-parser';
import express from 'express';
import session from 'express-session';
import helmet from 'helmet';
import path from 'path';
import { httpCors } from './config/cors';
import { SECURITY_LIMITS } from './config/security-limits';

// ─── Security Middleware ────────────────────────────────────
import { blockBots, honeypot } from './middleware/bot-blocker';
import { checkTrappedIP, setupBotTraps } from './middleware/bot-trap';
import {
  accessLogger,
  analyzeAttackPatterns,
  logSuspiciousRequest,
} from './middleware/request-logger';
import { securityHeaders } from './middleware/security-headers';

// ─── Route Imports ─────────────────────────────────────────
import analyticsRoutes from './routes/analytics.routes';
import authRoutes from './routes/auth.routes';
import keyRoutes from './routes/keys.routes';
import messageRoutes from './routes/messages.routes';
import roomsRoutes from './routes/rooms.routes';
import uploadRoutes from './routes/upload.routes';
import userRoutes from './routes/users.routes';

// ─── App Initialization ────────────────────────────────────
const app = express();

// ─── SECURITY LAYER 1: HTTPS Redirect ──────────────────────
app.use((req, res, next) => {
  if (process.env.NODE_ENV === 'production') {
    // Skip HTTPS redirect for health check endpoints
    if (req.path === '/health' || req.path === '/') {
      return next();
    }
    if (req.header('x-forwarded-proto') !== 'https') {
      // Validate host header to prevent open redirect attacks
      const host = req.header('host');
      const allowedHosts = ['quasar.contact', 'www.quasar.contact'];

      if (!host || !allowedHosts.includes(host)) {
        return res.status(400).json({ error: 'Invalid host header' });
      }

      return res.redirect(`https://${host}${req.url}`);
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
    timestamp: new Date().toISOString(),
  }),
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
  }),
);

// ─── CORS ──────────────────────────────────────────────────
app.use(httpCors);

// ─── Body Parsing with Limits ─────────────────────────────
app.use(express.json({
  limit: '5mb',  // Reduced from 10mb for security
  verify: (req: any, _res, buf) => {
    // Store raw body for signature verification if needed
    req.rawBody = buf;
  },
}));
app.use(express.urlencoded({
  extended: true,
  limit: '5mb',  // Reduced from 10mb
  parameterLimit: 50,  // Limit number of parameters
}));

// ─── Cookie Parser ─────────────────────────────────────────
if (!process.env.COOKIE_SECRET) {
  console.error('❌ COOKIE_SECRET environment variable is required');
  throw new Error('COOKIE_SECRET environment variable is required');
}
app.use(cookieParser(process.env.COOKIE_SECRET));

// ─── Session Configuration ─────────────────────────────────
// Note: Using MemoryStore for simplicity since sessions are short-lived (10 min)
// For production scale, consider using a persistent store like Redis
if (process.env.NODE_ENV === 'production') {
  console.warn('[Session] Using MemoryStore in production - consider Redis for multi-instance deployments');
}

if (!process.env.SESSION_SECRET) {
  console.error('❌ SESSION_SECRET environment variable is required');
  throw new Error('SESSION_SECRET environment variable is required');
}

app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: false,
  cookie: {
    secure: process.env.NODE_ENV === 'production',
    httpOnly: true,
    maxAge: SECURITY_LIMITS.PASSWORD_RESET.SESSION_MAX_AGE_MS, // 10 minutes for password reset sessions
    sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
  },
}));

// ─── Serve Static Files BEFORE API routes ─────────────────
const staticOptions = {
  dotfiles: 'ignore',
  etag: true,
  extensions: ['html', 'js', 'css', 'png', 'jpg', 'jpeg', 'gif', 'svg', 'ico'],
  index: 'index.html', // Enable index.html serving
  maxAge: process.env.NODE_ENV === 'production' ? '1d' : 0,
  redirect: true, // Enable redirects for proper directory access
};

app.use('/', express.static(path.join(__dirname, '../../public'), staticOptions));
app.use('/app', express.static(path.join(__dirname, '../../dist'), staticOptions));
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
  skip: req => {
    // Only apply to sensitive endpoints
    const sensitiveEndpoints = [
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/forgot-password',
    ];
    return !sensitiveEndpoints.some(endpoint => req.path === endpoint);
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
  skip: req => {
    // Skip rate limiting for static assets
    return !!req.path.match(/\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot)$/);
  },
  keyGenerator: req => {
    // Use the real IP from X-Forwarded-For header
    return req.ip || 'unknown';
  },
});

// ─── API Health Check (under /api prefix) ──────────────────
app.get('/api/health', (_req, res) =>
  res.status(200).json({
    status: 'ok',
    timestamp: new Date().toISOString(),
  }),
);

// ─── API Routes with Rate Limiting ────────────────────────
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/keys', apiLimiter, keyRoutes);
app.use('/api/messages', apiLimiter, messageRoutes);
app.use('/api/users', apiLimiter, userRoutes);
app.use('/api/rooms', apiLimiter, roomsRoutes);
app.use('/api/upload', apiLimiter, uploadRoutes);
app.use('/api/analytics', apiLimiter, analyticsRoutes);

// ─── Handle /app redirect ─────────────────────────────────
app.get('/app', (_req, res) => {
  res.redirect('/app/');
});

// ─── Angular Router - only serve valid routes ──────────────

// Serve Angular app for valid routes
app.get('/app/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../dist', 'index.html'));
});

app.get('/app/chat', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../dist', 'index.html'));
});

app.get('/app/chat-room/:id', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../dist', 'index.html'));
});

app.get('/app/settings', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../dist', 'index.html'));
});

app.get('/app/auth/login', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../dist', 'index.html'));
});

app.get('/app/auth/register', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../dist', 'index.html'));
});

app.get('/app/auth/forgot-password', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../dist', 'index.html'));
});

app.get('/app/auth/reset-password', (_req, res) => {
  // Serve the frontend app - the component handles the token from URL params
  res.sendFile(path.join(__dirname, '../../dist', 'index.html'));
});

// Handle invalid /app routes - serve 404 page
app.get('/app/*', (_req, res) => {
  res.status(404).sendFile(path.join(__dirname, '../../public/404.html'), err => {
    if (err) {
      console.error('404.html not found for /app route, falling back to JSON response');
      res.status(404).json({
        error: 'Not Found',
        message: 'The requested resource does not exist',
      });
    }
  });
});

// ─── 404 Handler ───────────────────────────────────────────
app.use((req, res) => {
  // Log 404s as they might be scanning attempts
  console.log(`404: ${req.method} ${req.path} from ${req.ip}`);

  // For API routes, return JSON
  if (req.path.startsWith('/api/')) {
    res.status(404).json({
      error: 'Not Found',
      message: 'The requested resource does not exist',
    });
  } else {
    // For landing site routes, serve the 404.html page
    res.status(404).sendFile(path.join(__dirname, '../../public/404.html'), err => {
      if (err) {
        // Fallback if 404.html doesn't exist
        console.error('404.html not found, falling back to JSON response');
        res.status(404).json({
          error: 'Not Found',
          message: 'The requested resource does not exist',
        });
      }
    });
  }
});

// ─── Error Handler ─────────────────────────────────────────
app.use(
  (
    err: unknown,
    req: express.Request,
    res: express.Response,
    _next: express.NextFunction,
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
  },
);

// ─── Export App ────────────────────────────────────────────
export default app;
