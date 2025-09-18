import {
  setCookieOptions,
  setAuthCookie,
  clearAuthCookie,
  generateCSRFToken,
  setCSRFCookie,
} from '../cookie.utils';
import type { Response } from 'express';

// Mock Express Response
const mockResponse = () => {
  const res = {} as Response;
  res.cookie = jest.fn().mockReturnValue(res);
  res.clearCookie = jest.fn().mockReturnValue(res);
  return res;
};

describe('Cookie Utils (Security Critical)', () => {
  // Run: npm test -- --testPathPattern="cookie.utils.test.ts"
  beforeEach(() => {
    jest.clearAllMocks();
    // Reset NODE_ENV before each test
    delete process.env.NODE_ENV;
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setCookieOptions', () => {
    it('returns secure production options by default', () => {
      process.env.NODE_ENV = 'production';
      const options = setCookieOptions(false);
      
      expect(options).toEqual({
        httpOnly: true,
        secure: true, // Secure in production
        sameSite: 'strict', // Strict in production
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
        domain: '.quasar.contact', // Production domain
      });
    });

    it('returns development-friendly options when isDev=true', () => {
      const options = setCookieOptions(true);
      
      expect(options).toEqual({
        httpOnly: true,
        secure: false, // Not secure in dev
        sameSite: 'lax', // Lax in dev for easier testing
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
        path: '/',
        // No domain in development
      });
    });

    it('adapts to NODE_ENV for production domain setting', () => {
      // Test non-production environment
      process.env.NODE_ENV = 'development';
      const devOptions = setCookieOptions(false);
      expect(devOptions.domain).toBeUndefined();
      
      // Test production environment
      process.env.NODE_ENV = 'production';
      const prodOptions = setCookieOptions(false);
      expect(prodOptions.domain).toBe('.quasar.contact');
    });

    it('has correct security settings for httpOnly', () => {
      const options = setCookieOptions();
      expect(options.httpOnly).toBe(true); // Always httpOnly for auth cookies
    });

    it('sets appropriate maxAge (7 days)', () => {
      const options = setCookieOptions();
      const sevenDaysInMs = 7 * 24 * 60 * 60 * 1000;
      expect(options.maxAge).toBe(sevenDaysInMs);
    });

    it('sets correct path for site-wide access', () => {
      const options = setCookieOptions();
      expect(options.path).toBe('/');
    });
  });

  describe('setAuthCookie', () => {
    it('sets auth cookie with correct options in production', () => {
      process.env.NODE_ENV = 'production';
      const res = mockResponse();
      const token = 'test-auth-token-12345';
      
      setAuthCookie(res, token);
      
      expect(res.cookie).toHaveBeenCalledWith('auth_token', token, {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
        domain: '.quasar.contact',
      });
    });

    it('sets auth cookie with development options in non-production', () => {
      process.env.NODE_ENV = 'development';
      const res = mockResponse();
      const token = 'test-dev-token';
      
      setAuthCookie(res, token);
      
      expect(res.cookie).toHaveBeenCalledWith('auth_token', token, {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        maxAge: 7 * 24 * 60 * 60 * 1000,
        path: '/',
        // No domain in development
      });
    });

    it('handles various token formats', () => {
      const res = mockResponse();
      const testTokens = [
        'simple-token',
        'jwt.token.with.dots',
        'very-long-token-that-might-be-used-in-production-12345',
        'token-with-special-chars!@#$',
      ];

      testTokens.forEach(token => {
        jest.clearAllMocks();
        setAuthCookie(res, token);
        expect(res.cookie).toHaveBeenCalledWith('auth_token', token, expect.any(Object));
      });
    });
  });

  describe('clearAuthCookie', () => {
    it('clears auth cookie with matching options in production', () => {
      process.env.NODE_ENV = 'production';
      const res = mockResponse();
      
      clearAuthCookie(res);
      
      expect(res.clearCookie).toHaveBeenCalledWith('auth_token', {
        httpOnly: true,
        secure: true,
        sameSite: 'strict',
        path: '/',
        domain: '.quasar.contact',
      });
    });

    it('clears auth cookie with development options in non-production', () => {
      process.env.NODE_ENV = 'development';
      const res = mockResponse();
      
      clearAuthCookie(res);
      
      expect(res.clearCookie).toHaveBeenCalledWith('auth_token', {
        httpOnly: true,
        secure: false,
        sameSite: 'lax',
        path: '/',
        // No domain in development
      });
    });

    it('uses consistent options between set and clear operations', () => {
      process.env.NODE_ENV = 'production';
      const res = mockResponse();
      const token = 'test-token';
      
      // Set cookie
      setAuthCookie(res, token);
      const setOptions = (res.cookie as jest.Mock).mock.calls[0][2];
      
      // Clear cookie
      clearAuthCookie(res);
      const clearOptions = (res.clearCookie as jest.Mock).mock.calls[0][1];
      
      // Options should match (excluding maxAge which is not needed for clear)
      expect(clearOptions.httpOnly).toBe(setOptions.httpOnly);
      expect(clearOptions.secure).toBe(setOptions.secure);
      expect(clearOptions.sameSite).toBe(setOptions.sameSite);
      expect(clearOptions.path).toBe(setOptions.path);
      expect(clearOptions.domain).toBe(setOptions.domain);
    });
  });

  describe('generateCSRFToken', () => {
    it('generates a valid CSRF token', () => {
      const token = generateCSRFToken();
      
      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.length).toBe(64); // 32 bytes as hex = 64 characters
    });

    it('generates unique tokens on each call', () => {
      const token1 = generateCSRFToken();
      const token2 = generateCSRFToken();
      const token3 = generateCSRFToken();
      
      expect(token1).not.toBe(token2);
      expect(token2).not.toBe(token3);
      expect(token1).not.toBe(token3);
    });

    it('generates hex format tokens', () => {
      const token = generateCSRFToken();
      
      // Should only contain hex characters (0-9, a-f)
      expect(token).toMatch(/^[0-9a-f]+$/);
    });

    it('has sufficient entropy for security', () => {
      // Generate multiple tokens and check for randomness
      const tokens = Array.from({ length: 100 }, () => generateCSRFToken());
      const uniqueTokens = new Set(tokens);
      
      // All tokens should be unique
      expect(uniqueTokens.size).toBe(100);
      
      // Check character distribution (basic entropy test)
      const allChars = tokens.join('');
      const charCounts: Record<string, number> = {};
      for (const char of allChars) {
        charCounts[char] = (charCounts[char] || 0) + 1;
      }
      
      // Should use variety of hex characters
      const usedChars = Object.keys(charCounts);
      expect(usedChars.length).toBeGreaterThan(10); // At least most hex chars
    });
  });

  describe('setCSRFCookie', () => {
    it('sets CSRF cookie with correct options in production', () => {
      process.env.NODE_ENV = 'production';
      const res = mockResponse();
      const token = 'csrf-token-12345';
      
      setCSRFCookie(res, token);
      
      expect(res.cookie).toHaveBeenCalledWith('csrf_token', token, {
        httpOnly: false, // CSRF needs to be readable by JS
        secure: true,
        sameSite: 'strict',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours (shorter than auth)
        path: '/',
        domain: '.quasar.contact',
      });
    });

    it('sets CSRF cookie with development options in non-production', () => {
      process.env.NODE_ENV = 'development';
      const res = mockResponse();
      const token = 'dev-csrf-token';
      
      setCSRFCookie(res, token);
      
      expect(res.cookie).toHaveBeenCalledWith('csrf_token', token, {
        httpOnly: false, // CSRF needs to be readable by JS
        secure: false,
        sameSite: 'lax',
        maxAge: 24 * 60 * 60 * 1000, // 24 hours
        path: '/',
        // No domain in development
      });
    });

    it('uses httpOnly=false for JavaScript accessibility', () => {
      const res = mockResponse();
      const token = 'csrf-test-token';
      
      setCSRFCookie(res, token);
      
      const cookieOptions = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(cookieOptions.httpOnly).toBe(false);
    });

    it('has shorter maxAge than auth cookies', () => {
      const res = mockResponse();
      const token = 'csrf-token';
      
      setCSRFCookie(res, token);
      
      const csrfOptions = (res.cookie as jest.Mock).mock.calls[0][2];
      const authMaxAge = 7 * 24 * 60 * 60 * 1000; // 7 days
      const csrfMaxAge = 24 * 60 * 60 * 1000; // 24 hours
      
      expect(csrfOptions.maxAge).toBe(csrfMaxAge);
      expect(csrfOptions.maxAge).toBeLessThan(authMaxAge);
    });
  });

  describe('Security Integration Tests', () => {
    it('ensures production cookies are secure across all functions', () => {
      process.env.NODE_ENV = 'production';
      const res = mockResponse();
      
      // Test auth cookie
      setAuthCookie(res, 'auth-token');
      let options = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(options.secure).toBe(true);
      expect(options.sameSite).toBe('strict');
      expect(options.httpOnly).toBe(true);
      
      // Test CSRF cookie
      jest.clearAllMocks();
      setCSRFCookie(res, 'csrf-token');
      options = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(options.secure).toBe(true);
      expect(options.sameSite).toBe('strict');
      expect(options.httpOnly).toBe(false); // CSRF is different
    });

    it('ensures development cookies are accessible for testing', () => {
      process.env.NODE_ENV = 'development';
      const res = mockResponse();
      
      // Test auth cookie
      setAuthCookie(res, 'auth-token');
      let options = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(options.secure).toBe(false);
      expect(options.sameSite).toBe('lax');
      expect(options.domain).toBeUndefined();
      
      // Test CSRF cookie
      jest.clearAllMocks();
      setCSRFCookie(res, 'csrf-token');
      options = (res.cookie as jest.Mock).mock.calls[0][2];
      expect(options.secure).toBe(false);
      expect(options.sameSite).toBe('lax');
      expect(options.domain).toBeUndefined();
    });

    it('generates and sets CSRF token properly', () => {
      const res = mockResponse();
      const token = generateCSRFToken();
      
      expect(token).toMatch(/^[0-9a-f]{64}$/);
      
      setCSRFCookie(res, token);
      expect(res.cookie).toHaveBeenCalledWith('csrf_token', token, expect.any(Object));
    });

    it('maintains cookie consistency between environments', () => {
      const res1 = mockResponse();
      const res2 = mockResponse();
      const token = 'consistent-token';
      
      // Production
      process.env.NODE_ENV = 'production';
      setAuthCookie(res1, token);
      const prodOptions = (res1.cookie as jest.Mock).mock.calls[0][2];
      
      // Development
      process.env.NODE_ENV = 'development';
      setAuthCookie(res2, token);
      const devOptions = (res2.cookie as jest.Mock).mock.calls[0][2];
      
      // Core security properties should be consistent
      expect(prodOptions.httpOnly).toBe(devOptions.httpOnly);
      expect(prodOptions.path).toBe(devOptions.path);
      expect(prodOptions.maxAge).toBe(devOptions.maxAge);
      
      // Environment-specific differences
      expect(prodOptions.secure).not.toBe(devOptions.secure);
      expect(prodOptions.sameSite).not.toBe(devOptions.sameSite);
      expect(prodOptions.domain).toBeDefined();
      expect(devOptions.domain).toBeUndefined();
    });
  });
});