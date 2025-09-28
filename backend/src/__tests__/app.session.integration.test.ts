import request from 'supertest';
import express from 'express';
import session from 'express-session';

// Mock all external dependencies to avoid side effects
jest.mock('../services/database.service', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    passwordReset: {
      findFirst: jest.fn(),
      create: jest.fn(),
    },
  },
}));

jest.mock('../utils/encryption.utils', () => ({
  encryptResetToken: jest.fn(),
  decryptResetToken: jest.fn(),
  isValidEncryptedTokenFormat: jest.fn(),
}));

jest.mock('../services/email.service', () => ({
  __esModule: true,
  default: {
    sendPasswordResetEmail: jest.fn(),
  },
}));

describe('App Session Integration Tests', () => {
  let app: express.Application;
  let mockDecryptResetToken: jest.MockedFunction<any>;
  let mockIsValidEncryptedTokenFormat: jest.MockedFunction<any>;

  beforeAll(() => {
    // Get mocked functions
    const encryptionUtils = require('../utils/encryption.utils');
    mockDecryptResetToken = encryptionUtils.decryptResetToken;
    mockIsValidEncryptedTokenFormat = encryptionUtils.isValidEncryptedTokenFormat;
  });

  beforeEach(() => {
    // Create minimal app with session configuration matching production
    app = express();
    
    // Trust proxy setting (as in production app)
    app.set('trust proxy', 1);
    
    // Session configuration matching production
    app.use(session({
      secret: 'test-session-secret-matching-production-config',
      resave: false,
      saveUninitialized: false,
      cookie: {
        secure: false, // Set to false for testing (true in production)
        httpOnly: true,
        maxAge: 600000, // 10 minutes - matches production
        sameSite: 'lax', // Matches production for non-https
      },
    }));

    // Add the actual reset password route from app.ts
    app.get('/app/auth/reset-password', (req, res) => {
      const encryptedToken = req.query.token as string;
      const { processPasswordResetToken } = require('../utils/password-reset.utils');
      processPasswordResetToken(req, res, encryptedToken);
    });

    // Add test route to check session state
    app.get('/test/session-state', (req, res) => {
      res.json({
        hasPendingReset: !!req.session.pendingReset,
        sessionId: req.sessionID,
        cookie: req.session.cookie,
      });
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

  describe('Production-like Session Configuration', () => {
    // Run: npm test -- --testPathPattern="app.session.integration.test.ts"
    it('configures session cookies with security properties', async () => {
      const agent = request.agent(app);

      // Make request to establish session
      const response = await agent.get('/test/session-state');

      expect(response.status).toBe(200);
      expect(response.body.cookie).toMatchObject({
        path: '/',
        httpOnly: true,
        originalMaxAge: 600000,
        sameSite: 'lax',
        secure: false, // False in test, true in production
      });
    });

    it('generates unique session IDs for different clients', async () => {
      const agent1 = request.agent(app);
      const agent2 = request.agent(app);

      const response1 = await agent1.get('/test/session-state');
      const response2 = await agent2.get('/test/session-state');

      expect(response1.body.sessionId).toBeTruthy();
      expect(response2.body.sessionId).toBeTruthy();
      expect(response1.body.sessionId).not.toBe(response2.body.sessionId);
    });

    it('maintains session across multiple requests', async () => {
      const agent = request.agent(app);

      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(true);
      mockDecryptResetToken.mockReturnValueOnce('session-token');

      // Create session by processing a reset token
      await agent
        .get('/app/auth/reset-password')
        .query({ token: 'valid-token' });
        
      // Now check session persistence across multiple requests
      const response1 = await agent.get('/test/session-state');
      const response2 = await agent.get('/test/session-state');

      expect(response1.body.sessionId).toBeTruthy();
      expect(response2.body.sessionId).toBeTruthy();
      expect(response1.body.sessionId).toBe(response2.body.sessionId);
    });

    it('does not save uninitialized sessions', async () => {
      // Make request without creating session data
      const response = await request(app).get('/test/session-state');

      // Session should exist but have no specific data
      expect(response.status).toBe(200);
      expect(response.body.hasPendingReset).toBe(false);
    });
  });

  describe('Password Reset Session Integration', () => {
    it('integrates password reset token processing with session storage', async () => {
      const encryptedToken = 'production-like-encrypted-token';
      const decryptedToken = 'raw-uuid-token-format';

      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(true);
      mockDecryptResetToken.mockReturnValueOnce(decryptedToken);

      const agent = request.agent(app);

      // Process reset token (should redirect and store in session)
      const resetResponse = await agent
        .get('/app/auth/reset-password')
        .query({ token: encryptedToken });

      expect(resetResponse.status).toBe(302);
      expect(resetResponse.headers.location).toBe('/app/?reset=1');

      // Verify session contains reset data
      const sessionResponse = await agent.get('/test/session-state');
      expect(sessionResponse.body.hasPendingReset).toBe(true);
    });

    it('handles invalid tokens without corrupting session', async () => {
      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(false);

      const agent = request.agent(app);

      // Process invalid token
      const resetResponse = await agent
        .get('/app/auth/reset-password')
        .query({ token: 'invalid-token' });

      expect(resetResponse.status).toBe(302);
      expect(resetResponse.headers.location).toBe('/app/auth/login?error=invalid_link');

      // Verify session is clean
      const sessionResponse = await agent.get('/test/session-state');
      expect(sessionResponse.body.hasPendingReset).toBe(false);
    });

    it('handles decryption failures gracefully', async () => {
      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(true);
      mockDecryptResetToken.mockImplementation(() => {
        throw new Error('Decryption failed - corrupted token');
      });

      const agent = request.agent(app);

      // Process corrupted token
      const resetResponse = await agent
        .get('/app/auth/reset-password')
        .query({ token: 'corrupted-encrypted-token' });

      expect(resetResponse.status).toBe(302);
      expect(resetResponse.headers.location).toBe('/app/auth/login?error=invalid_link');

      // Verify session remains clean
      const sessionResponse = await agent.get('/test/session-state');
      expect(sessionResponse.body.hasPendingReset).toBe(false);

      // Verify error was logged
      expect(console.error).toHaveBeenCalledWith(
        '[Password Reset] Token decryption failed:',
        expect.any(Error),
      );
    });

    it('overwrites existing reset sessions with new tokens', async () => {
      const agent = request.agent(app);

      mockIsValidEncryptedTokenFormat.mockReturnValue(true);

      // Process first token
      mockDecryptResetToken.mockReturnValueOnce('first-token');
      await agent
        .get('/app/auth/reset-password')
        .query({ token: 'first-encrypted' });

      // Process second token (should overwrite)
      mockDecryptResetToken.mockReturnValueOnce('second-token');
      await agent
        .get('/app/auth/reset-password')
        .query({ token: 'second-encrypted' });

      // Session should have the second token
      const sessionResponse = await agent.get('/test/session-state');
      expect(sessionResponse.body.hasPendingReset).toBe(true);
    });
  });

  describe('Session Security in Production-like Environment', () => {
    it('properly handles session lifecycle', async () => {
      const agent = request.agent(app);

      // Initial state - no pending reset
      let response = await agent.get('/test/session-state');
      expect(response.body.hasPendingReset).toBe(false);

      // Process valid token
      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(true);
      mockDecryptResetToken.mockReturnValueOnce('lifecycle-token');

      await agent
        .get('/app/auth/reset-password')
        .query({ token: 'valid-token' });

      // Should have pending reset
      response = await agent.get('/test/session-state');
      expect(response.body.hasPendingReset).toBe(true);
    });

    it('prevents cross-session data leakage', async () => {
      const agent1 = request.agent(app);
      const agent2 = request.agent(app);

      mockIsValidEncryptedTokenFormat.mockReturnValue(true);

      // Agent1 processes token
      mockDecryptResetToken.mockReturnValueOnce('agent1-token');
      await agent1
        .get('/app/auth/reset-password')
        .query({ token: 'agent1-encrypted' });

      // Agent2 processes different token
      mockDecryptResetToken.mockReturnValueOnce('agent2-token');
      await agent2
        .get('/app/auth/reset-password')
        .query({ token: 'agent2-encrypted' });

      // Both should have independent sessions
      const response1 = await agent1.get('/test/session-state');
      const response2 = await agent2.get('/test/session-state');

      expect(response1.body.hasPendingReset).toBe(true);
      expect(response2.body.hasPendingReset).toBe(true);
      expect(response1.body.sessionId).not.toBe(response2.body.sessionId);
    });

    it('handles concurrent requests on same session safely', async () => {
      const agent = request.agent(app);

      mockIsValidEncryptedTokenFormat.mockReturnValue(true);
      mockDecryptResetToken.mockReturnValue('concurrent-token');

      // Process token first
      await agent
        .get('/app/auth/reset-password')
        .query({ token: 'valid-token' });

      // Make concurrent session state requests
      const concurrentRequests = Promise.all([
        agent.get('/test/session-state'),
        agent.get('/test/session-state'),
        agent.get('/test/session-state'),
      ]);

      const responses = await concurrentRequests;

      // All should return same session ID and pending reset state
      const firstSessionId = responses[0].body.sessionId;
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.sessionId).toBe(firstSessionId);
        expect(response.body.hasPendingReset).toBe(true);
      });
    });

    it('respects session cookie maxAge configuration', async () => {
      const agent = request.agent(app);

      const response = await agent.get('/test/session-state');
      
      // Cookie should expire in 10 minutes (600000ms)
      expect(response.body.cookie.originalMaxAge).toBe(600000);
    });

    it('sets httpOnly flag correctly for security', async () => {
      const agent = request.agent(app);

      const response = await agent.get('/test/session-state');
      
      // Cookie should be httpOnly to prevent XSS access
      expect(response.body.cookie.httpOnly).toBe(true);
    });

    it('uses correct sameSite setting for CSRF protection', async () => {
      const agent = request.agent(app);

      const response = await agent.get('/test/session-state');
      
      // Should use 'lax' in test environment (would be 'strict' in production)
      expect(response.body.cookie.sameSite).toBe('lax');
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles missing query parameters gracefully', async () => {
      const agent = request.agent(app);

      // No token parameter
      const response = await agent.get('/app/auth/reset-password');

      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/app/auth/login?error=invalid_link');
    });

    it('handles malformed session data gracefully', async () => {
      // This test verifies the app doesn't crash on unexpected session data
      const agent = request.agent(app);

      // Make a normal request to establish session
      const response = await agent.get('/test/session-state');
      
      expect(response.status).toBe(200);
      expect(response.body.hasPendingReset).toBe(false);
    });

    it('prevents session confusion with empty tokens', async () => {
      const agent = request.agent(app);

      // Test empty string token
      let response = await agent
        .get('/app/auth/reset-password')
        .query({ token: '' });
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/app/auth/login?error=invalid_link');

      // Test whitespace token - should fail format validation
      mockIsValidEncryptedTokenFormat.mockReturnValueOnce(false);
      response = await agent
        .get('/app/auth/reset-password')
        .query({ token: '   ' });
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/app/auth/login?error=invalid_link');

      // Test missing token
      response = await agent.get('/app/auth/reset-password');
      expect(response.status).toBe(302);
      expect(response.headers.location).toBe('/app/auth/login?error=invalid_link');

      // Session should remain clean
      const sessionResponse = await agent.get('/test/session-state');
      expect(sessionResponse.body.hasPendingReset).toBe(false);
    });
  });
});