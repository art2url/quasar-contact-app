import { NextFunction, Request, Response } from 'express';
import { RateLimiterMemory, RateLimiterRes } from 'rate-limiter-flexible';
import { SECURITY_LIMITS } from '../config/security-limits';
import { SecurityLogger } from '../utils/security-logger.utils';

// Enhanced rate limiters with different strategies
const rateLimiters = {
  // Progressive penalty: gets stricter with repeated violations
  progressive: new RateLimiterMemory({
    points: SECURITY_LIMITS.RATE_LIMITS.GENERAL_REQUESTS_PER_MINUTE,
    duration: 60, // 1 minute
    blockDuration: 60, // Block for 1 minute initially
    execEvenly: true, // Spread requests evenly
  }),

  // Burst protection: allows short bursts but enforces overall limit
  burst: new RateLimiterMemory({
    points: SECURITY_LIMITS.RATE_LIMITS.BURST_LIMIT,
    duration: 10, // 10 seconds
    blockDuration: 30, // Block for 30 seconds
  }),

  // API-specific limiter (stricter)
  api: new RateLimiterMemory({
    points: SECURITY_LIMITS.RATE_LIMITS.API_REQUESTS_PER_MINUTE,
    duration: 60,
    blockDuration: 120, // Block for 2 minutes
  }),

  // Severe violations get longer blocks
  severe: new RateLimiterMemory({
    points: 3,
    duration: 300, // 5 minutes
    blockDuration: 900, // Block for 15 minutes
  }),
};

const getClientIP = (req: Request): string => {
  return req.ip ||
         req.headers['x-forwarded-for']?.toString().split(',')[0] ||
         req.headers['x-real-ip']?.toString() ||
         'unknown';
};

export const enhancedRateLimit = (type: 'progressive' | 'burst' | 'api' | 'severe' = 'progressive') => {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const clientIP = getClientIP(req);
    const limiter = rateLimiters[type];

    try {
      const resRateLimiter = await limiter.consume(clientIP);

      // Add rate limit headers
      res.set({
        'X-RateLimit-Limit': limiter.points.toString(),
        'X-RateLimit-Remaining': resRateLimiter.remainingPoints?.toString() || '0',
        'X-RateLimit-Reset': new Date(Date.now() + resRateLimiter.msBeforeNext).toISOString(),
      });

      next();
    } catch (rateLimiterRes) {
      const rateLimitRes = rateLimiterRes as RateLimiterRes;

      // Log rate limit violation
      SecurityLogger.logRateLimitExceeded(clientIP, req.path);

      // Enhanced response with retry information
      const response = {
        error: 'Too Many Requests',
        message: 'Rate limit exceeded. Please slow down.',
        retryAfter: Math.round(rateLimitRes.msBeforeNext / 1000),
        limit: limiter.points,
        windowMs: limiter.duration * 1000,
      };

      res.status(429)
         .set({
           'Retry-After': Math.round(rateLimitRes.msBeforeNext / 1000).toString(),
           'X-RateLimit-Limit': limiter.points.toString(),
           'X-RateLimit-Remaining': '0',
           'X-RateLimit-Reset': new Date(Date.now() + rateLimitRes.msBeforeNext).toISOString(),
         })
         .json(response);
    }
  };
};

// Middleware factory for different endpoints
export const createRateLimitMiddleware = {
  // For general API endpoints
  api: () => enhancedRateLimit('api'),

  // For authentication endpoints (stricter)
  auth: () => enhancedRateLimit('severe'),

  // For public endpoints
  public: () => enhancedRateLimit('progressive'),

  // For endpoints that should allow bursts
  burst: () => enhancedRateLimit('burst'),
};