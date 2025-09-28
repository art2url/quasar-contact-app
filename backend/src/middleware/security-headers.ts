import { Request, Response, NextFunction } from 'express';

export const securityHeaders = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  // Remove server header
  res.removeHeader('X-Powered-By');

  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Permissions-Policy',
    'geolocation=(), microphone=(), camera=()',
  );

  // Strict Transport Security (HSTS)
  if (process.env.NODE_ENV === 'production') {
    res.setHeader(
      'Strict-Transport-Security',
      'max-age=31536000; includeSubDomains; preload',
    );
  }

  // Content Security Policy for API endpoints
  if (req.path?.startsWith('/api/')) {
    res.setHeader(
      'Content-Security-Policy',
      'default-src \'none\'; frame-ancestors \'none\'',
    );
  }

  next();
};
