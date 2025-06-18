// ─── Imports ───────────────────────────────────────────────
import express from 'express';
import helmet from 'helmet';
import path from 'path';
import {httpCors} from './config/cors';

// ─── Route Imports ─────────────────────────────────────────
import authRoutes from './routes/auth.routes';
import keyRoutes from './routes/keys.routes';
import messageRoutes from './routes/messages.routes';
import userRoutes from './routes/users.routes';
import roomsRoutes from './routes/rooms.routes';

// ─── App Initialization ────────────────────────────────────
const app = express();

// ─── HTTPS Redirect Middleware (must be first) ─────────────
app.use((req, res, next) => {
  // Force HTTPS in production
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

// ─── Health-check route ────────────────────────────────────
app.get('/health', (_req, res) =>
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    date: new Date().toISOString(),
    secure: process.env.NODE_ENV === 'production',
    stage: process.env.NODE_ENV === 'production' ? 'production' : 'alpha',
  })
);

// ─── Security Headers ──────────────────────────────────────
app.use(
  helmet({
    contentSecurityPolicy: false, // Disable CSP for Angular app
    hsts: {
      maxAge: 31536000, // 1 year
      includeSubDomains: true,
      preload: true,
    },
  })
);

// ─── Error-handler  ────────────────────────────────────────
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[Unhandled]', err);
    res.status(500).json({message: 'Server error'});
  }
);

// ─── CORS ──────────────────────────────────────────────────
app.use(httpCors);

// ─── Body Parsing ──────────────────────────────────────────
app.use(express.json());

// ─── Serve Static Files ────────────────────────────────────
app.use('/', express.static(path.join(__dirname, '../../public')));
app.use('/app', express.static(path.join(__dirname, '../../dist')));
app.use(express.static(path.join(__dirname, '../../dist')));

// ─── SMART RATE LIMITING: Only for sensitive endpoints ─────
// Only apply rate limiting to auth endpoints that need protection
import rateLimit from 'express-rate-limit';

const authOnlyLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 50, // Much higher limit - 50 attempts per 15 min
  message: {
    error: 'Too many auth attempts. Please wait 15 minutes.',
    type: 'auth_rate_limit',
  },
  standardHeaders: true,
  legacyHeaders: false,
  // Only apply to login/register
  skip: (req) => {
    const sensitiveEndpoints = [
      '/api/auth/login',
      '/api/auth/register',
      '/api/auth/forgot-password',
    ];
    return !sensitiveEndpoints.some((endpoint) => req.path === endpoint);
  },
});

// Apply smart rate limiting only to auth routes
app.use('/api/auth', authOnlyLimiter);

// ─── API Routes (no global rate limiting) ──────────────────
app.use('/api/auth', authRoutes);
app.use('/api/keys', keyRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomsRoutes);

// ─── Angular Router fallback ───────────────────────────────
app.get('/app/*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../dist', 'index.html'));
});

// ─── 404 fallback  ─────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({message: 'Not Found'});
});

// ─── Export App ────────────────────────────────────────────
export default app;
