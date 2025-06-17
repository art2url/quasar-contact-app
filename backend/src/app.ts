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

// ─── CRITICAL: Set trust proxy IMMEDIATELY ─────────────────
app.set('trust proxy', 1);
console.log('🔧 Trust proxy set to 1 immediately');

// Import rate limiter AFTER trust proxy is set
import {globalLimiter} from './config/ratelimits';

// ─── Health-check route ────────────────────────────────────
app.get('/health', (_req, res) =>
  res.status(200).json({
    status: 'ok',
    uptime: process.uptime(),
    date: new Date().toISOString(),
    trustProxy: app.get('trust proxy'),
  })
);

// ─── Middleware: Security and Parsing ──────────────────────
app.use(httpCors);

app.use(
  helmet({
    contentSecurityPolicy: false,
  })
);
app.use(express.json());

// ─────────── rate-limiting ────────────────────────────────
// Rate limiter comes AFTER trust proxy is set
app.use(globalLimiter);

// ─── API Routes ────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/keys', keyRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/users', userRoutes);
app.use('/api/rooms', roomsRoutes);

// ─── Serve Static Files ───────────────────────────────────
// 1. Landing Page static assets (from /public folder)
app.use('/assets', express.static(path.join(__dirname, '../../public/assets')));
app.use('/css', express.static(path.join(__dirname, '../../public/css')));
app.use('/js', express.static(path.join(__dirname, '../../public/js')));
app.use('/images', express.static(path.join(__dirname, '../../public/images')));

// 2. Angular App static assets (from /dist folder)
app.use(
  '/app/assets',
  express.static(path.join(__dirname, '../../dist/assets'))
);
app.use('/app', express.static(path.join(__dirname, '../../dist')));

// ─── Route Handlers ────────────────────────────────────────
// Landing page route (exact match for root)
app.get('/', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../public', 'index.html'));
});

// Angular App routes (SPA fallback for /app/*)
app.get('/app/*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../dist', 'index.html'));
});

// ─── Error handler ────────────────────────────────────────
app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    _next: express.NextFunction
  ) => {
    console.error('[Unhandled Error]', err);
    res.status(500).json({message: 'Server error'});
  }
);

// ─── 404 fallback  ─────────────────────────────────────────
app.use((_req, res) => {
  res.status(404).json({message: 'Not Found'});
});

// ─── Export App ────────────────────────────────────────────
export default app;
