import { Response } from 'express';

interface CookieOptions {
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'strict' | 'lax' | 'none';
  maxAge?: number;
  domain?: string;
  path?: string;
}

export const setCookieOptions = (isDev: boolean = false): CookieOptions => {
  return {
    httpOnly: true,
    secure: !isDev, // Use secure cookies in production
    sameSite: isDev ? 'lax' : 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    path: '/',
    // Set domain for cross-subdomain sharing in production
    ...(process.env.NODE_ENV === 'production' && {
      domain: '.quasar.contact',
    }),
  };
};

export const setAuthCookie = (res: Response, token: string): void => {
  const isDev = process.env.NODE_ENV !== 'production';
  res.cookie('auth_token', token, setCookieOptions(isDev));
};

export const clearAuthCookie = (res: Response): void => {
  const isDev = process.env.NODE_ENV !== 'production';
  res.clearCookie('auth_token', {
    httpOnly: true,
    secure: !isDev,
    sameSite: isDev ? 'lax' : 'strict',
    path: '/',
    ...(process.env.NODE_ENV === 'production' && {
      domain: '.quasar.contact',
    }),
  });
};

// Generate CSRF token
export const generateCSRFToken = (): string => {
  return require('crypto').randomBytes(32).toString('hex');
};

export const setCSRFCookie = (res: Response, token: string): void => {
  const isDev = process.env.NODE_ENV !== 'production';
  res.cookie('csrf_token', token, {
    httpOnly: false, // CSRF token needs to be readable by JavaScript
    secure: !isDev,
    sameSite: isDev ? 'lax' : 'strict',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
    ...(process.env.NODE_ENV === 'production' && {
      domain: '.quasar.contact',
    }),
  });
};
