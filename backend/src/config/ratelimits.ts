import rateLimit from 'express-rate-limit';
import env from './env';

/* ── global (soft) limiter ─────────────────────────────── */
export const globalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15-min
  max: env.RL_GLOBAL_MAX,
  standardHeaders: true,
  legacyHeaders: false,
});

/* ── auth-only limiter ─────────────────────────────────── */
export const authLimiter = rateLimit({
  windowMs: 10 * 60 * 1000, // 10-min
  max: env.RL_AUTH_MAX,
  message: 'Too many login attempts, please wait a bit.',
  standardHeaders: true,
  legacyHeaders: false,
});
