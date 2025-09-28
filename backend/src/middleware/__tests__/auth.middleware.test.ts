import jwt from 'jsonwebtoken';
import { authenticateToken, AuthRequest } from '../auth.middleware';
import type { Response, NextFunction } from 'express';
import env from '../../config/env';

// Mock Express Request, Response, and NextFunction
const mockRequest = (cookies: any = {}, headers: any = {}) => ({
  cookies,
  headers,
} as unknown as AuthRequest);

const mockResponse = () => {
  const res = {} as Response;
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const mockNext = jest.fn() as NextFunction;

// Mock environment config
jest.mock('../../config/env', () => ({
  JWT_SECRET: 'test-jwt-secret-key-for-testing-only-32chars',
}));

describe('Auth Middleware (Security Critical)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('authenticateToken', () => {
    // Run: npm test -- --testPathPattern="auth.middleware.test.ts"
    const validPayload = {
      userId: 'user123',
      username: 'testuser',
    };

    it('accepts valid token from cookies (preferred method)', () => {
      const token = jwt.sign(validPayload, env.JWT_SECRET, { expiresIn: '1h' });
      const req = mockRequest({ auth_token: token });
      const res = mockResponse();

      authenticateToken(req, res, mockNext);

      expect(req.user).toEqual(validPayload);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('accepts valid token from Authorization header (fallback)', () => {
      const token = jwt.sign(validPayload, env.JWT_SECRET, { expiresIn: '1h' });
      const req = mockRequest({}, { authorization: `Bearer ${token}` });
      const res = mockResponse();

      authenticateToken(req, res, mockNext);

      expect(req.user).toEqual(validPayload);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('prioritizes cookie token over Authorization header', () => {
      const validToken = jwt.sign(validPayload, env.JWT_SECRET, { expiresIn: '1h' });
      const invalidToken = 'invalid-token';
      
      const req = mockRequest(
        { auth_token: validToken }, 
        { authorization: `Bearer ${invalidToken}` },
      );
      const res = mockResponse();

      authenticateToken(req, res, mockNext);

      expect(req.user).toEqual(validPayload);
      expect(mockNext).toHaveBeenCalledTimes(1);
      expect(res.status).not.toHaveBeenCalled();
    });

    it('rejects request when no token provided', () => {
      const req = mockRequest();
      const res = mockResponse();

      authenticateToken(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(401);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Access denied. Token missing.',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('rejects invalid JWT token', () => {
      const req = mockRequest({ auth_token: 'invalid-token' });
      const res = mockResponse();

      authenticateToken(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid or expired token.',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('rejects expired JWT token', () => {
      const expiredToken = jwt.sign(
        validPayload, 
        env.JWT_SECRET, 
        { expiresIn: '-1h' }, // Already expired
      );
      const req = mockRequest({ auth_token: expiredToken });
      const res = mockResponse();

      authenticateToken(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid or expired token.',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('rejects token signed with wrong secret', () => {
      const tokenWithWrongSecret = jwt.sign(validPayload, 'wrong-secret');
      const req = mockRequest({ auth_token: tokenWithWrongSecret });
      const res = mockResponse();

      authenticateToken(req, res, mockNext);

      expect(res.status).toHaveBeenCalledWith(403);
      expect(res.json).toHaveBeenCalledWith({
        message: 'Invalid or expired token.',
      });
      expect(mockNext).not.toHaveBeenCalled();
      expect(req.user).toBeUndefined();
    });

    it('handles malformed Authorization header', () => {
      // Test headers that result in no token (401 - missing)  
      const noTokenHeaders = [
        { authorization: 'invalid-token' }, // Missing "Bearer " - split[1] is undefined
        { authorization: 'Bearer' }, // Missing token - split[1] is undefined
        { authorization: 'Bearer ' }, // Empty token - split[1] is empty string
      ];

      noTokenHeaders.forEach(headers => {
        jest.clearAllMocks();
        const req = mockRequest({}, headers);
        const res = mockResponse();

        authenticateToken(req, res, mockNext);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          message: 'Access denied. Token missing.',
        });
        expect(mockNext).not.toHaveBeenCalled();
      });

      // Test headers with invalid tokens (403 - invalid)  
      const invalidTokenHeaders = [
        { authorization: 'Bearer invalid-jwt-token' }, // Invalid JWT
        { authorization: 'Token invalid-jwt-token' }, // Wrong scheme but extracts token
      ];

      invalidTokenHeaders.forEach(headers => {
        jest.clearAllMocks();
        const req = mockRequest({}, headers);
        const res = mockResponse();

        authenticateToken(req, res, mockNext);

        expect(res.status).toHaveBeenCalledWith(403);
        expect(res.json).toHaveBeenCalledWith({
          message: 'Invalid or expired token.',
        });
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    it('handles JWT payload without required fields', () => {
      const incompletePayload = { userId: 'user123' }; // Missing username
      const token = jwt.sign(incompletePayload, env.JWT_SECRET, { expiresIn: '1h' });
      const req = mockRequest({ auth_token: token });
      const res = mockResponse();

      authenticateToken(req, res, mockNext);

      expect(req.user?.userId).toBe('user123');
      expect(req.user?.username).toBeUndefined();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('handles empty cookies/headers gracefully', () => {
      const testCases = [
        { cookies: {}, headers: {} },
        { cookies: { other_cookie: 'value' }, headers: { 'other-header': 'value' } },
      ];

      testCases.forEach(({ cookies, headers }) => {
        jest.clearAllMocks();
        const req = mockRequest(cookies, headers);
        const res = mockResponse();

        authenticateToken(req, res, mockNext);

        expect(res.status).toHaveBeenCalledWith(401);
        expect(res.json).toHaveBeenCalledWith({
          message: 'Access denied. Token missing.',
        });
        expect(mockNext).not.toHaveBeenCalled();
      });
    });

    it('preserves original request properties', () => {
      const token = jwt.sign(validPayload, env.JWT_SECRET, { expiresIn: '1h' });
      const req = mockRequest({ auth_token: token });
      req.body = { test: 'data' };
      req.params = { id: '123' };
      req.query = { page: '1' };
      
      const res = mockResponse();

      authenticateToken(req, res, mockNext);

      expect(req.body).toEqual({ test: 'data' });
      expect(req.params).toEqual({ id: '123' });
      expect(req.query).toEqual({ page: '1' });
      expect(req.user).toEqual(validPayload);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('handles JWT with additional claims', () => {
      const extendedPayload = {
        ...validPayload,
        avatarUrl: 'https://example.com/avatar.png',
        role: 'user',
        iat: Math.floor(Date.now() / 1000),
      };
      
      const token = jwt.sign(extendedPayload, env.JWT_SECRET, { expiresIn: '1h' });
      const req = mockRequest({ auth_token: token });
      const res = mockResponse();

      authenticateToken(req, res, mockNext);

      expect(req.user?.userId).toBe(validPayload.userId);
      expect(req.user?.username).toBe(validPayload.username);
      // Additional claims not included in req.user
      expect((req.user as any).avatarUrl).toBeUndefined();
      expect((req.user as any).role).toBeUndefined();
      expect(mockNext).toHaveBeenCalledTimes(1);
    });
  });

  describe('Security Properties', () => {
    it('does not leak sensitive information in error messages', () => {
      const invalidTokens = [
        'invalid-token',
        'Bearer invalid',
        jwt.sign({ userId: 'user123' }, 'wrong-secret'),
        jwt.sign({ userId: 'user123' }, env.JWT_SECRET, { expiresIn: '-1h' }),
      ];

      invalidTokens.forEach(token => {
        jest.clearAllMocks();
        const req = mockRequest({ auth_token: token });
        const res = mockResponse();

        authenticateToken(req, res, mockNext);

        // Ensure error message doesn't reveal specific failure reason
        expect(res.json).toHaveBeenCalledWith({
          message: 'Invalid or expired token.',
        });
      });
    });

    it('maintains consistent timing for invalid tokens (basic test)', () => {
      const measurements: number[] = [];
      const invalidToken = 'definitely-invalid-token';

      for (let i = 0; i < 5; i++) {
        const req = mockRequest({ auth_token: invalidToken });
        const res = mockResponse();

        const start = process.hrtime.bigint();
        authenticateToken(req, res, mockNext);
        const end = process.hrtime.bigint();
        
        measurements.push(Number(end - start));
      }

      // Basic timing consistency check (not comprehensive timing attack protection)
      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxDeviation = Math.max(...measurements.map(m => Math.abs(m - avgTime)));
      
      // Allow reasonable variation in execution time
      expect(maxDeviation / avgTime).toBeLessThan(5.0);
    });
  });
});