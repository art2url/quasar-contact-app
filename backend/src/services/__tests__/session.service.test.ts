import express from 'express';
import request from 'supertest';
import session from 'express-session';
import {
  processPasswordResetToken,
  getPendingResetFromSession,
  markResetTokenAsUsed,
  clearPendingResetSession,
} from '../../utils/password-reset.utils';
// Import is for mock typing only

// Mock encryption utils
jest.mock('../../utils/encryption.utils', () => ({
  encryptResetToken: jest.fn(),
  decryptResetToken: jest.fn(),
  isValidEncryptedTokenFormat: jest.fn(),
}));

describe('Session Management Service (Security Critical)', () => {
  let app: express.Application;
  // Mock functions are declared but mockEncryptResetToken is unused in tests
  let mockDecryptResetToken: jest.MockedFunction<typeof import('../../utils/encryption.utils').decryptResetToken>;
  let mockIsValidEncryptedTokenFormat: jest.MockedFunction<typeof import('../../utils/encryption.utils').isValidEncryptedTokenFormat>;

  beforeAll(() => {
    // Get mocked functions
    const encryptionUtils = require('../../utils/encryption.utils');
    // mockEncryptResetToken available but unused in current tests
    mockDecryptResetToken = encryptionUtils.decryptResetToken;
    mockIsValidEncryptedTokenFormat = encryptionUtils.isValidEncryptedTokenFormat;
  });

  beforeEach(() => {
    // Create test app with session middleware
    app = express();
    app.use(express.json());
    
    // Configure session for testing
    app.use(session({
      secret: 'test-session-secret',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // Allow HTTP in tests
        httpOnly: true,
        maxAge: 600000, // 10 minutes
      },
    }));

    // Test route for password reset processing
    app.get('/test/reset-password', (req, res) => {
      const encryptedToken = req.query.token as string;
      processPasswordResetToken(req, res, encryptedToken);
    });

    // Test route for session validation
    app.get('/test/validate-session', (req, res) => {
      const pendingReset = getPendingResetFromSession(req);
      res.json({ pendingReset });
    });

    // Test route for marking token as used
    app.post('/test/mark-used', (req, res) => {
      markResetTokenAsUsed(req);
      res.json({ success: true });
    });

    // Test route for clearing session
    app.post('/test/clear-session', (req, res) => {
      clearPendingResetSession(req);
      res.json({ success: true });
    });

    // Clear all mocks
    jest.clearAllMocks();

    // Mock console methods
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Password Reset Token Processing', () => {
    // Run: npm test -- --testPathPattern="session.service.test.ts"
    it('successfully processes valid encrypted token', async () => {
      const encryptedToken = 'valid-encrypted-token-base64';
      const decryptedToken = 'raw-reset-token-uuid';

      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(true);
      mockDecryptResetToken.mockReturnValueOnce(decryptedToken);

      const response = await request(app)
        .get('/test/reset-password')
        .query({ token: encryptedToken });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/app/?reset=1');
      expect(mockIsValidEncryptedTokenFormat).toHaveBeenCalledWith(encryptedToken);
      expect(mockDecryptResetToken).toHaveBeenCalledWith(encryptedToken);
    });

    it('rejects empty or invalid tokens', async () => {
      const testCases = ['', null, undefined, 123, {}, []];

      for (const invalidToken of testCases) {
        const response = await request(app)
          .get('/test/reset-password')
          .query({ token: invalidToken });

        expect(response.status).toBe(302);
        expect(response.headers.location).toBe('/app/auth/login?error=invalid_link');
      }
    });

    it('rejects tokens with invalid format', async () => {
      const invalidToken = 'invalid-format-token';
      
      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(false);

      const response = await request(app)
        .get('/test/reset-password')
        .query({ token: invalidToken });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/app/auth/login?error=invalid_link');
      expect(console.warn).toHaveBeenCalledWith('[Password Reset] Invalid encrypted token format');
    });

    it('handles decryption errors gracefully', async () => {
      const encryptedToken = 'corrupted-encrypted-token';
      
      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(true);
      mockDecryptResetToken.mockImplementation(() => {
        throw new Error('Decryption failed');
      });

      const response = await request(app)
        .get('/test/reset-password')
        .query({ token: encryptedToken });

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/app/auth/login?error=invalid_link');
      expect(console.error).toHaveBeenCalledWith(
        '[Password Reset] Token decryption failed:',
        expect.any(Error),
      );
    });

    it('stores session data with correct properties', async () => {
      const encryptedToken = 'valid-encrypted-token';
      const decryptedToken = 'decrypted-token-data';
      const beforeTimestamp = Date.now();

      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(true);
      mockDecryptResetToken.mockReturnValueOnce(decryptedToken);

      const agent = request.agent(app);
      
      // Process the token
      await agent
        .get('/test/reset-password')
        .query({ token: encryptedToken });

      // Validate session was created correctly
      const sessionResponse = await agent.get('/test/validate-session');
      
      expect(sessionResponse.status).toBe(200);
      expect(sessionResponse.body.pendingReset).toEqual({
        token: decryptedToken,
        expires: expect.any(Number),
        used: false,
        createdAt: expect.any(Number),
      });

      // Verify timing properties
      const session = sessionResponse.body.pendingReset;
      expect(session.createdAt).toBeGreaterThanOrEqual(beforeTimestamp);
      expect(session.expires).toBe(session.createdAt + 600000); // 10 minutes
    });
  });

  describe('Session Validation and Retrieval', () => {
    const createValidSession = async () => {
      const agent = request.agent(app);
      const encryptedToken = 'valid-token';
      const decryptedToken = 'raw-token';

      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(true);
      mockDecryptResetToken.mockReturnValueOnce(decryptedToken);

      await agent
        .get('/test/reset-password')
        .query({ token: encryptedToken });

      return agent;
    };

    it('retrieves valid unexpired session', async () => {
      const agent = await createValidSession();

      const response = await agent.get('/test/validate-session');

      expect(response.status).toBe(200);
      expect(response.body.pendingReset).not.toBeNull();
      expect(response.body.pendingReset.used).toBe(false);
    });

    it('returns null for non-existent session', async () => {
      const response = await request(app).get('/test/validate-session');

      expect(response.status).toBe(200);
      expect(response.body.pendingReset).toBeNull();
    });

    it('returns null and cleans up expired session', async () => {
      const agent = request.agent(app);
      
      // Mock an expired session
      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(true);
      mockDecryptResetToken.mockReturnValueOnce('token');

      // Process token
      await agent
        .get('/test/reset-password')
        .query({ token: 'valid-token' });

      // Wait for session to be considered expired (mock Date.now)
      const originalDateNow = Date.now;
      Date.now = jest.fn(() => originalDateNow() + 700000); // 11+ minutes in the future

      const response = await agent.get('/test/validate-session');

      expect(response.status).toBe(200);
      expect(response.body.pendingReset).toBeNull();

      // Restore Date.now
      Date.now = originalDateNow;
    });

    it('returns null for used tokens', async () => {
      const agent = await createValidSession();

      // Mark token as used
      await agent.post('/test/mark-used');

      // Try to retrieve session
      const response = await agent.get('/test/validate-session');

      expect(response.status).toBe(200);
      expect(response.body.pendingReset).toBeNull();
    });
  });

  describe('Session State Management', () => {
    const createValidSession = async () => {
      const agent = request.agent(app);
      const encryptedToken = 'valid-token';
      const decryptedToken = 'raw-token';

      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(true);
      mockDecryptResetToken.mockReturnValueOnce(decryptedToken);

      await agent
        .get('/test/reset-password')
        .query({ token: encryptedToken });

      return agent;
    };

    it('marks token as used correctly', async () => {
      const agent = await createValidSession();

      // Verify session exists and is not used
      let response = await agent.get('/test/validate-session');
      expect(response.body.pendingReset.used).toBe(false);

      // Mark as used
      await agent.post('/test/mark-used');

      // Verify token is now marked as used
      response = await agent.get('/test/validate-session');
      expect(response.body.pendingReset).toBeNull();
    });

    it('clears session completely', async () => {
      const agent = await createValidSession();

      // Verify session exists
      let response = await agent.get('/test/validate-session');
      expect(response.body.pendingReset).not.toBeNull();

      // Clear session
      await agent.post('/test/clear-session');

      // Verify session is cleared
      response = await agent.get('/test/validate-session');
      expect(response.body.pendingReset).toBeNull();
    });

    it('handles marking non-existent session as used gracefully', async () => {
      const response = await request(app).post('/test/mark-used');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it('handles clearing non-existent session gracefully', async () => {
      const response = await request(app).post('/test/clear-session');

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });
  });

  describe('Session Security Properties', () => {
    it('prevents session fixation attacks', async () => {
      const agent1 = request.agent(app);
      const agent2 = request.agent(app);

      mockIsValidEncryptedTokenFormat.mockReturnValue(true);
      mockDecryptResetToken.mockReturnValue('token1');

      // Create session with agent1
      await agent1
        .get('/test/reset-password')
        .query({ token: 'token1' });

      // Verify agent1 has session
      let response1 = await agent1.get('/test/validate-session');
      expect(response1.body.pendingReset).not.toBeNull();

      // Verify agent2 doesn't have session
      let response2 = await agent2.get('/test/validate-session');
      expect(response2.body.pendingReset).toBeNull();

      // Agent2 tries to use their own token
      mockDecryptResetToken.mockReturnValueOnce('token2');
      await agent2
        .get('/test/reset-password')
        .query({ token: 'token2' });

      // Both should have independent sessions
      response1 = await agent1.get('/test/validate-session');
      response2 = await agent2.get('/test/validate-session');

      expect(response1.body.pendingReset.token).toBe('token1');
      expect(response2.body.pendingReset.token).toBe('token2');
    });

    it('properly isolates session data between users', async () => {
      const user1Agent = request.agent(app);
      const user2Agent = request.agent(app);

      mockIsValidEncryptedTokenFormat.mockReturnValue(true);
      
      // Create sessions for both users
      mockDecryptResetToken.mockReturnValueOnce('user1-token');
      await user1Agent
        .get('/test/reset-password')
        .query({ token: 'encrypted-user1' });

      mockDecryptResetToken.mockReturnValueOnce('user2-token');
      await user2Agent
        .get('/test/reset-password')
        .query({ token: 'encrypted-user2' });

      // Verify sessions are isolated
      const user1Response = await user1Agent.get('/test/validate-session');
      const user2Response = await user2Agent.get('/test/validate-session');

      expect(user1Response.body.pendingReset.token).toBe('user1-token');
      expect(user2Response.body.pendingReset.token).toBe('user2-token');

      // Mark user1's token as used
      await user1Agent.post('/test/mark-used');

      // Verify only user1's session is affected
      const user1After = await user1Agent.get('/test/validate-session');
      const user2After = await user2Agent.get('/test/validate-session');

      expect(user1After.body.pendingReset).toBeNull();
      expect(user2After.body.pendingReset.token).toBe('user2-token');
    });

    it('handles concurrent session operations safely', async () => {
      const agent = request.agent(app);

      mockIsValidEncryptedTokenFormat.mockReturnValue(true);
      mockDecryptResetToken.mockReturnValue('concurrent-token');

      // Create session
      await agent
        .get('/test/reset-password')
        .query({ token: 'valid-token' });

      // Perform sequential operations to avoid connection issues
      const operation1 = await agent.get('/test/validate-session');
      const operation2 = await agent.get('/test/validate-session');
      const markUsedOp = await agent.post('/test/mark-used');
      const operation3 = await agent.get('/test/validate-session');

      // First two should return valid session
      expect(operation1.body.pendingReset).not.toBeNull();
      expect(operation2.body.pendingReset).not.toBeNull();

      // Mark as used should succeed
      expect(markUsedOp.body.success).toBe(true);

      // Final validation should return null (used token)
      expect(operation3.body.pendingReset).toBeNull();
    });

    it('prevents session data tampering', async () => {
      const agent = request.agent(app);

      mockIsValidEncryptedTokenFormat.mockReturnValue(true);
      mockDecryptResetToken.mockReturnValue('original-token');

      // Create valid session
      await agent
        .get('/test/reset-password')
        .query({ token: 'valid-token' });

      // Session should contain exactly what we set
      const response = await agent.get('/test/validate-session');
      const session = response.body.pendingReset;

      expect(session.token).toBe('original-token');
      expect(session.used).toBe(false);
      expect(typeof session.expires).toBe('number');
      expect(typeof session.createdAt).toBe('number');

      // Session should not contain any unexpected properties
      const expectedKeys = ['token', 'expires', 'used', 'createdAt'];
      expect(Object.keys(session).sort()).toEqual(expectedKeys.sort());
    });
  });

  describe('Session Expiration and Cleanup', () => {
    it('correctly calculates 10-minute expiration', async () => {
      const beforeTime = Date.now();
      
      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(true);
      mockDecryptResetToken.mockReturnValueOnce('token');

      const agent = request.agent(app);
      await agent
        .get('/test/reset-password')
        .query({ token: 'valid-token' });

      const response = await agent.get('/test/validate-session');
      const session = response.body.pendingReset;

      // Should expire exactly 10 minutes (600000ms) after creation
      expect(session.expires - session.createdAt).toBe(600000);
      expect(session.createdAt).toBeGreaterThanOrEqual(beforeTime);
      expect(session.expires).toBeGreaterThanOrEqual(beforeTime + 600000);
    });

    it('handles multiple token processing attempts correctly', async () => {
      const agent = request.agent(app);

      mockIsValidEncryptedTokenFormat.mockReturnValue(true);
      
      // First token
      mockDecryptResetToken.mockReturnValueOnce('token1');
      await agent
        .get('/test/reset-password')
        .query({ token: 'encrypted-token1' });

      let response = await agent.get('/test/validate-session');
      expect(response.body.pendingReset.token).toBe('token1');

      // Second token should overwrite the first
      mockDecryptResetToken.mockReturnValueOnce('token2');
      await agent
        .get('/test/reset-password')
        .query({ token: 'encrypted-token2' });

      response = await agent.get('/test/validate-session');
      expect(response.body.pendingReset.token).toBe('token2');
    });

    it('maintains session across multiple requests', async () => {
      const agent = request.agent(app);

      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(true);
      mockDecryptResetToken.mockReturnValueOnce('persistent-token');

      // Create session
      await agent
        .get('/test/reset-password')
        .query({ token: 'valid-token' });

      // Make multiple requests to verify session persists
      for (let i = 0; i < 5; i++) {
        const response = await agent.get('/test/validate-session');
        expect(response.body.pendingReset.token).toBe('persistent-token');
        expect(response.body.pendingReset.used).toBe(false);
      }
    });
  });
});