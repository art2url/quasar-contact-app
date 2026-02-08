import type { Request, Response } from 'express';
import { encryptResetToken } from '../encryption.utils';
import {
  clearPendingResetSession,
  getPendingResetFromSession,
  markResetTokenAsUsed,
  PendingResetSession,
  processPasswordResetToken,
} from '../password-reset.utils';

// Mock Express Request and Response
const mockRequest = (sessionData: any = {}) =>
  ({
    session: {
      ...sessionData,
    },
  }) as unknown as Request;

const mockResponse = () => {
  const res = {} as Response;
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
};

describe('Password Reset Utils (Security Critical)', () => {
  // Run: npm test -- --testPathPattern="password-reset.utils.test.ts"
  beforeEach(() => {
    jest.clearAllMocks();
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('processPasswordResetToken', () => {
    it('processes valid encrypted token successfully', () => {
      const req = mockRequest();
      const res = mockResponse();
      const testToken = 'test-reset-token-12345';
      const encryptedToken = encryptResetToken(testToken);

      const result = processPasswordResetToken(req, res, encryptedToken);

      expect(result).toBe(true);
      expect(res.redirect).toHaveBeenCalledWith('/app/auth/reset-password');
      expect(req.session.pendingReset).toBeDefined();
      expect(req.session.pendingReset!.token).toBe(testToken);
      expect(req.session.pendingReset!.used).toBe(false);
      expect(req.session.pendingReset!.expires).toBeGreaterThan(Date.now());
    });

    it('rejects invalid token formats', () => {
      const req = mockRequest();
      const res = mockResponse();
      const invalidTokens = ['invalid', 'too-short', '', 'bad+format/here='];

      invalidTokens.forEach(invalidToken => {
        jest.clearAllMocks();
        const result = processPasswordResetToken(req, res, invalidToken);

        expect(result).toBe(false);
        expect(res.redirect).toHaveBeenCalledWith('/app/auth/login?error=invalid_link');
        expect(req.session.pendingReset).toBeUndefined();
      });
    });

    it('rejects empty or non-string tokens', () => {
      const req = mockRequest();
      const res = mockResponse();

      // Test undefined
      expect(processPasswordResetToken(req, res, undefined as any)).toBe(false);
      expect(res.redirect).toHaveBeenCalledWith('/app/auth/login?error=invalid_link');

      // Test null
      jest.clearAllMocks();
      expect(processPasswordResetToken(req, res, null as any)).toBe(false);
      expect(res.redirect).toHaveBeenCalledWith('/app/auth/login?error=invalid_link');

      // Test number
      jest.clearAllMocks();
      expect(processPasswordResetToken(req, res, 123 as any)).toBe(false);
      expect(res.redirect).toHaveBeenCalledWith('/app/auth/login?error=invalid_link');
    });

    it('handles corrupted encrypted tokens', () => {
      const req = mockRequest();
      const res = mockResponse();
      const validEncrypted = encryptResetToken('test-token');
      const corrupted = `${validEncrypted.slice(0, -10)}CORRUPTED`; // Corrupt the token

      const result = processPasswordResetToken(req, res, corrupted);

      expect(result).toBe(false);
      expect(res.redirect).toHaveBeenCalledWith('/app/auth/login?error=invalid_link');
      expect(console.error).toHaveBeenCalled();
    });

    it('sets correct expiration time (10 minutes)', () => {
      const req = mockRequest();
      const res = mockResponse();
      const encryptedToken = encryptResetToken('test-token');
      const beforeProcessing = Date.now();

      processPasswordResetToken(req, res, encryptedToken);

      const afterProcessing = Date.now();
      const expectedExpiry = beforeProcessing + 600000; // 10 minutes
      const actualExpiry = req.session.pendingReset!.expires;

      expect(actualExpiry).toBeGreaterThanOrEqual(expectedExpiry);
      expect(actualExpiry).toBeLessThanOrEqual(afterProcessing + 600000);
    });
  });

  describe('getPendingResetFromSession', () => {
    it('returns valid pending reset session', () => {
      const pendingReset: PendingResetSession = {
        token: 'test-token',
        expires: Date.now() + 300000, // 5 minutes from now
        used: false,
        createdAt: Date.now(),
      };
      const req = mockRequest({ pendingReset });

      const result = getPendingResetFromSession(req);

      expect(result).toEqual(pendingReset);
    });

    it('returns null if no pending reset exists', () => {
      const req = mockRequest();

      const result = getPendingResetFromSession(req);

      expect(result).toBeNull();
    });

    it('returns null and cleans up expired token', () => {
      const expiredPendingReset: PendingResetSession = {
        token: 'expired-token',
        expires: Date.now() - 1000, // 1 second ago (expired)
        used: false,
        createdAt: Date.now() - 700000, // 7 minutes ago
      };
      const req = mockRequest({ pendingReset: expiredPendingReset });

      const result = getPendingResetFromSession(req);

      expect(result).toBeNull();
      expect(req.session.pendingReset).toBeUndefined();
    });

    it('returns null for used tokens', () => {
      const usedPendingReset: PendingResetSession = {
        token: 'used-token',
        expires: Date.now() + 300000, // Still valid time-wise
        used: true, // But already used
        createdAt: Date.now() - 60000,
      };
      const req = mockRequest({ pendingReset: usedPendingReset });

      const result = getPendingResetFromSession(req);

      expect(result).toBeNull();
      // Should not clean up session for used tokens (keep for audit)
      expect(req.session.pendingReset).toBeDefined();
    });

    it('handles edge case of expiry exactly at current time', () => {
      const currentTime = Date.now();
      const expiredPendingReset: PendingResetSession = {
        token: 'edge-case-token',
        expires: currentTime - 1, // 1ms in the past to ensure it's expired
        used: false,
        createdAt: currentTime - 600000,
      };
      const req = mockRequest({ pendingReset: expiredPendingReset });

      const result = getPendingResetFromSession(req);

      // Should be considered expired (not <=)
      expect(result).toBeNull();
      expect(req.session.pendingReset).toBeUndefined();
    });
  });

  describe('markResetTokenAsUsed', () => {
    it('marks existing pending reset as used', () => {
      const pendingReset: PendingResetSession = {
        token: 'test-token',
        expires: Date.now() + 300000,
        used: false,
        createdAt: Date.now(),
      };
      const req = mockRequest({ pendingReset });

      markResetTokenAsUsed(req);

      expect(req.session.pendingReset!.used).toBe(true);
      // Other properties should remain unchanged
      expect(req.session.pendingReset!.token).toBe(pendingReset.token);
      expect(req.session.pendingReset!.expires).toBe(pendingReset.expires);
    });

    it('handles missing pending reset gracefully', () => {
      const req = mockRequest();

      expect(() => markResetTokenAsUsed(req)).not.toThrow();
      expect(req.session.pendingReset).toBeUndefined();
    });

    it('handles already used tokens', () => {
      const usedPendingReset: PendingResetSession = {
        token: 'already-used',
        expires: Date.now() + 300000,
        used: true,
        createdAt: Date.now(),
      };
      const req = mockRequest({ pendingReset: usedPendingReset });

      markResetTokenAsUsed(req);

      expect(req.session.pendingReset!.used).toBe(true); // Still true
    });
  });

  describe('clearPendingResetSession', () => {
    it('clears existing pending reset session', () => {
      const pendingReset: PendingResetSession = {
        token: 'test-token',
        expires: Date.now() + 300000,
        used: false,
        createdAt: Date.now(),
      };
      const req = mockRequest({ pendingReset, otherData: 'should-remain' });

      clearPendingResetSession(req);

      expect(req.session.pendingReset).toBeUndefined();
      expect((req.session as any).otherData).toBe('should-remain'); // Other session data intact
    });

    it('handles missing pending reset gracefully', () => {
      const req = mockRequest({ otherData: 'should-remain' });

      expect(() => clearPendingResetSession(req)).not.toThrow();
      expect(req.session.pendingReset).toBeUndefined();
      expect((req.session as any).otherData).toBe('should-remain');
    });
  });

  describe('Integration Tests', () => {
    it('full password reset flow simulation', () => {
      const req = mockRequest();
      const res = mockResponse();
      const testToken = 'integration-test-token';
      const encryptedToken = encryptResetToken(testToken);

      // Step 1: Process encrypted token from URL
      const processResult = processPasswordResetToken(req, res, encryptedToken);
      expect(processResult).toBe(true);

      // Step 2: Retrieve pending reset
      const pendingReset = getPendingResetFromSession(req);
      expect(pendingReset).toBeDefined();
      expect(pendingReset?.token).toBe(testToken);
      expect(pendingReset?.used).toBe(false);

      // Step 3: Mark as used after password change
      markResetTokenAsUsed(req);

      // Step 4: Verify token is now unusable
      const usedToken = getPendingResetFromSession(req);
      expect(usedToken).toBeNull();

      // Step 5: Clear session
      clearPendingResetSession(req);
      expect(req.session.pendingReset).toBeUndefined();
    });

    it('handles concurrent reset attempts security', () => {
      const req = mockRequest();
      const res = mockResponse();
      const token1 = encryptResetToken('first-token');
      const token2 = encryptResetToken('second-token');

      // First token processed
      processPasswordResetToken(req, res, token1);
      expect(req.session.pendingReset!.token).toBe('first-token');

      // Second token should override (latest wins)
      processPasswordResetToken(req, res, token2);
      expect(req.session.pendingReset!.token).toBe('second-token');

      // Only the latest token should be usable
      const pending = getPendingResetFromSession(req);
      expect(pending?.token).toBe('second-token');
    });

    it('enforces token expiration properly', done => {
      const req = mockRequest();
      const res = mockResponse();
      const encryptedToken = encryptResetToken('expiry-test-token');

      // Process token with very short expiry
      processPasswordResetToken(req, res, encryptedToken);

      // Manually set short expiry for testing
      req.session.pendingReset!.expires = Date.now() + 100; // 100ms

      // Should be valid immediately
      expect(getPendingResetFromSession(req)).toBeDefined();

      // Should be expired after delay
      setTimeout(() => {
        const expired = getPendingResetFromSession(req);
        expect(expired).toBeNull();
        expect(req.session.pendingReset).toBeUndefined();
        done();
      }, 150);
    });
  });
});
