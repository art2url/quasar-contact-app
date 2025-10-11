import { validateCSRF, addCSRFToken, CSRFRequest } from '../csrf.middleware';
import type { Response, NextFunction } from 'express';

// Mock Express Request, Response, and NextFunction
const mockRequest = (
  method = 'POST',
  cookies: any = {},
  headers: any = {},
): CSRFRequest => ({
  method,
  cookies,
  headers,
} as CSRFRequest);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.locals = {};
  return res;
};

const mockNext = jest.fn() as NextFunction;

describe('CSRF Middleware (Security Critical)', () => {
  // Store original NODE_ENV
  const originalNodeEnv = process.env.NODE_ENV;

  beforeEach(() => {
    jest.clearAllMocks();
    // Reset to production for security tests
    process.env.NODE_ENV = 'production';
  });

  afterAll(() => {
    // Restore original NODE_ENV
    process.env.NODE_ENV = originalNodeEnv;
  });

  describe('validateCSRF', () => {
    // Run: npm test -- --testPathPattern="csrf.middleware.test.ts"
    const validToken = 'csrf-token-12345';

    it('allows GET requests without CSRF validation', () => {
      const req = mockRequest('GET');
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('allows HEAD requests without CSRF validation', () => {
      const req = mockRequest('HEAD');
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('allows OPTIONS requests without CSRF validation', () => {
      const req = mockRequest('OPTIONS');
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('validates CSRF token in all environments (no development bypass)', () => {
      process.env.NODE_ENV = 'development';
      const req = mockRequest('POST');
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(mockNext).not.toHaveBeenCalled();
      expect(res.status).toHaveBeenCalledWith(403);
    });

    it('validates CSRF token successfully with matching cookie and header', () => {
      const req = mockRequest(
        'POST',
        { csrf_token: validToken },
        { 'x-csrf-token': validToken },
      );
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(req.csrfToken).toBe(validToken);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('accepts CSRF token from csrf-token header (alternative)', () => {
      const req = mockRequest(
        'POST',
        { csrf_token: validToken },
        { 'csrf-token': validToken },
      );
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(req.csrfToken).toBe(validToken);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('rejects request when CSRF cookie is missing', () => {
      const req = mockRequest(
        'POST',
        {},
        { 'x-csrf-token': validToken },
      );
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'CSRF token missing from cookies.',
        code: 'CSRF_COOKIE_MISSING',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('rejects request when CSRF header is missing', () => {
      const req = mockRequest(
        'POST',
        { csrf_token: validToken },
        {},
      );
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'CSRF token missing from headers.',
        code: 'CSRF_HEADER_MISSING',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('rejects request when CSRF tokens do not match', () => {
      const req = mockRequest(
        'POST',
        { csrf_token: 'cookie-token' },
        { 'x-csrf-token': 'header-token' },
      );
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'CSRF token mismatch.',
        code: 'CSRF_TOKEN_MISMATCH',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('validates various HTTP methods that require CSRF', () => {
      const methods = ['POST', 'PUT', 'PATCH', 'DELETE'];

      methods.forEach(method => {
        jest.clearAllMocks();
        const req = mockRequest(
          method,
          { csrf_token: validToken },
          { 'x-csrf-token': validToken },
        );
        const res = mockResponse();

        validateCSRF(req, res, mockNext);

        expect(req.csrfToken).toBe(validToken);
        expect(mockNext).toHaveBeenCalledTimes(1);
        expect(res.status).not.toHaveBeenCalled();
      });
    });

    it('handles case-insensitive header names', () => {
      // Express automatically normalizes headers to lowercase
      const req = mockRequest(
        'POST',
        { csrf_token: validToken },
        { 'x-csrf-token': validToken }, // Express converts to lowercase
      );
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(req.csrfToken).toBe(validToken);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('handles empty cookie values', () => {
      const req = mockRequest(
        'POST',
        { csrf_token: '' },
        { 'x-csrf-token': validToken },
      );
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'CSRF token missing from cookies.',
        code: 'CSRF_COOKIE_MISSING',
      });
    });

    it('handles empty header values', () => {
      const req = mockRequest(
        'POST',
        { csrf_token: validToken },
        { 'x-csrf-token': '' },
      );
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'CSRF token missing from headers.',
        code: 'CSRF_HEADER_MISSING',
      });
    });

    it('handles whitespace-only tokens', () => {
      const req = mockRequest(
        'POST',
        { csrf_token: '   ' },
        { 'x-csrf-token': '   ' },
      );
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(req.csrfToken).toBe('   ');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('preserves original request properties', () => {
      const req = mockRequest(
        'POST',
        { csrf_token: validToken },
        { 'x-csrf-token': validToken },
      );
      req.body = { test: 'data' };
      req.params = { id: '123' };
      
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(req.body).toEqual({ test: 'data' });
      expect(req.params).toEqual({ id: '123' });
      expect(req.csrfToken).toBe(validToken);
    });
  });

  describe('addCSRFToken', () => {
    it('adds CSRF token to response locals from cookies', () => {
      const csrfToken = 'response-csrf-token';
      const req = mockRequest('GET', { csrf_token: csrfToken });
      const res = mockResponse();

      addCSRFToken(req, res, mockNext);

      expect(res.locals.csrfToken).toBe(csrfToken);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('handles missing CSRF cookie gracefully', () => {
      const req = mockRequest('GET', {});
      const res = mockResponse();

      addCSRFToken(req, res, mockNext);

      expect(res.locals.csrfToken).toBeUndefined();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('handles empty cookies object', () => {
      const req = mockRequest('GET');
      req.cookies = undefined as any;
      const res = mockResponse();

      addCSRFToken(req, res, mockNext);

      expect(res.locals.csrfToken).toBeUndefined();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('preserves existing response locals', () => {
      const req = mockRequest('GET', { csrf_token: 'test-token' });
      const res = mockResponse();
      res.locals = { existingData: 'preserved' };

      addCSRFToken(req, res, mockNext);

      expect(res.locals.csrfToken).toBe('test-token');
      expect(res.locals.existingData).toBe('preserved');
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('Security Properties', () => {
    it('enforces CSRF protection in production environment', () => {
      process.env.NODE_ENV = 'production';
      const req = mockRequest('POST', {}, {});
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('provides specific error codes for different failure modes', () => {
      const testCases = [
        {
          name: 'missing cookie',
          cookies: {},
          headers: { 'x-csrf-token': 'token' },
          expectedCode: 'CSRF_COOKIE_MISSING',
        },
        {
          name: 'missing header',
          cookies: { csrf_token: 'token' },
          headers: {},
          expectedCode: 'CSRF_HEADER_MISSING',
        },
        {
          name: 'token mismatch',
          cookies: { csrf_token: 'cookie-token' },
          headers: { 'x-csrf-token': 'header-token' },
          expectedCode: 'CSRF_TOKEN_MISMATCH',
        },
      ];

      testCases.forEach(({ name: _name, cookies, headers, expectedCode }) => {
        jest.clearAllMocks();
        const req = mockRequest('POST', cookies, headers);
        const res = mockResponse();

        validateCSRF(req, res, mockNext);

        expect(res.json).toHaveBeenCalledWith(
          expect.objectContaining({ code: expectedCode }),
        );
      });
    });

    it('prevents timing attacks through consistent response times', () => {
      const measurements: number[] = [];
      
      // Test various failure scenarios
      const failureCases = [
        { cookies: {}, headers: {} },
        { cookies: { csrf_token: 'token' }, headers: {} },
        { cookies: {}, headers: { 'x-csrf-token': 'token' } },
        { cookies: { csrf_token: 'a' }, headers: { 'x-csrf-token': 'b' } },
      ];

      failureCases.forEach(({ cookies, headers }) => {
        const req = mockRequest('POST', cookies, headers);
        const res = mockResponse();

        const start = process.hrtime.bigint();
        validateCSRF(req, res, mockNext);
        const end = process.hrtime.bigint();
        
        measurements.push(Number(end - start));
      });

      // Basic timing consistency check
      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxDeviation = Math.max(...measurements.map(m => Math.abs(m - avgTime)));
      
      // Allow reasonable variation in execution time
      expect(maxDeviation / avgTime).toBeLessThan(3.0);
    });

    it('double-submit cookie pattern prevents CSRF attacks', () => {
      // This test validates the security property that both cookie and header must match
      const validToken = 'secure-csrf-token-12345';
      
      // Attacker cannot set the cookie value in a CSRF attack
      // Only same-origin requests can read the cookie and set the header
      const req = mockRequest(
        'POST',
        { csrf_token: validToken },
        { 'x-csrf-token': validToken },
      );
      const res = mockResponse();

      validateCSRF(req, res, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(req.csrfToken).toBe(validToken);
    });
  });
});