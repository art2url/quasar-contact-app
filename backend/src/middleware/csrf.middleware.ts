import { NextFunction, Request, Response } from 'express';

export interface CSRFRequest extends Request {
  csrfToken?: string;
}

// Middleware to validate CSRF token for state-changing operations
export const validateCSRF = (
  req: CSRFRequest,
  res: Response,
  next: NextFunction,
) => {
  // Skip CSRF validation for GET, HEAD, OPTIONS requests
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  const tokenFromCookie = req.cookies?.csrf_token;
  const tokenFromHeader =
    req.headers['x-csrf-token'] || req.headers['csrf-token'];

  if (!tokenFromCookie) {
    return res.status(403).json({
      message: 'CSRF token missing from cookies.',
      code: 'CSRF_COOKIE_MISSING',
    });
  }

  if (!tokenFromHeader) {
    return res.status(403).json({
      message: 'CSRF token missing from headers.',
      code: 'CSRF_HEADER_MISSING',
    });
  }

  // Double-submit cookie pattern: compare cookie value with header value
  if (tokenFromCookie !== tokenFromHeader) {
    return res.status(403).json({
      message: 'CSRF token mismatch.',
      code: 'CSRF_TOKEN_MISMATCH',
    });
  }

  req.csrfToken = tokenFromCookie;
  next();
};

// Middleware to add CSRF token to responses
export const addCSRFToken = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  // Add CSRF token to response locals so it can be accessed in views/responses
  res.locals.csrfToken = req.cookies?.csrf_token;
  next();
};
