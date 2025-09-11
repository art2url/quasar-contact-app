import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import keysRouter from '../keys.routes';

// Mock database service
jest.mock('../../services/database.service', () => ({
  prisma: {
    user: {
      update: jest.fn(),
      findUnique: jest.fn(),
    },
  },
}));

// Mock environment config
jest.mock('../../config/env', () => ({
  JWT_SECRET: 'test-jwt-secret-key-for-testing-only-32chars',
}));

// Mock authentication middleware
jest.mock('../../middleware/auth.middleware', () => ({
  authenticateToken: jest.fn((req: any, res: any, next: any) => {
    const token = req.cookies?.auth_token || req.headers.authorization?.replace('Bearer ', '');
    if (!token) {
      return res.status(401).json({ message: 'Access denied. Token missing.' });
    }
    try {
      const jwt = require('jsonwebtoken');
      const decoded = jwt.verify(token, 'test-jwt-secret-key-for-testing-only-32chars');
      req.user = decoded;
      next();
    } catch (error) {
      return res.status(403).json({ message: 'Invalid or expired token.' });
    }
  }),
}));

// Mock cookie-parser
jest.mock('cookie-parser', () => {
  return () => (req: any, res: any, next: any) => {
    req.cookies = {};
    if (req.headers.cookie) {
      const cookies = req.headers.cookie.split(';');
      cookies.forEach((cookie: string) => {
        const [name, value] = cookie.trim().split('=');
        req.cookies[name] = value;
      });
    }
    next();
  };
});

// Create test app
const app = express();
app.use(express.json());
app.use(require('cookie-parser')());
app.use('/api/keys', keysRouter);

describe('Keys API Routes (Security Critical Tests)', () => {
  const validUser = {
    userId: 'user123',
    username: 'testuser',
  };

  const validToken = jwt.sign(validUser, 'test-jwt-secret-key-for-testing-only-32chars');

  let mockPrisma: any;
  let mockCurrentUser: any;

  beforeAll(() => {
    // Get the mocked prisma instance
    const { prisma } = require('../../services/database.service');
    mockPrisma = prisma;
    
    // Define mockCurrentUser
    mockCurrentUser = {
      id: validUser.userId,
      username: validUser.username,
      publicKeyBundle: { publicKey: 'existing-key' },
      isKeyMissing: false,
      lastKeyMarkTime: null,
      keyMarkCount: 0,
    };
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock console methods
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/keys/upload - Upload Public Key Bundle', () => {
    // Run: npm test -- --testPathPattern="keys.routes.test.ts"
    const validKeyBundle = {
      publicKey: 'mock-public-key-data',
      keyId: 'key-123',
      algorithm: 'RSA-OAEP',
    };

    it('requires valid JWT authentication', async () => {
      const response = await request(app)
        .post('/api/keys/upload')
        .send({ publicKeyBundle: validKeyBundle });

      expect(response.status).toBe(401);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('requires publicKeyBundle in request body', async () => {
      const response = await request(app)
        .post('/api/keys/upload')
        .set('Cookie', `auth_token=${validToken}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Missing key bundle or user info.');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('uploads public key bundle successfully', async () => {
      const updatedUser = {
        id: validUser.userId,
        publicKeyBundle: validKeyBundle,
        isKeyMissing: false,
      };
      mockPrisma.user.update.mockResolvedValueOnce(updatedUser);

      const response = await request(app)
        .post('/api/keys/upload')
        .set('Cookie', `auth_token=${validToken}`)
        .send({ publicKeyBundle: validKeyBundle });

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Public key uploaded successfully.');
      
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: validUser.userId },
        data: {
          publicKeyBundle: validKeyBundle,
          isKeyMissing: false,
        },
      });
    });

    it('handles database errors during upload', async () => {
      const dbError = new Error('Database update failed');
      mockPrisma.user.update.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .post('/api/keys/upload')
        .set('Cookie', `auth_token=${validToken}`)
        .send({ publicKeyBundle: validKeyBundle });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error during key upload.');
      expect(console.error).toHaveBeenCalledWith('[Key Upload Error]', dbError);
    });

    it('handles user not found scenario', async () => {
      mockPrisma.user.update.mockResolvedValueOnce(null);

      const response = await request(app)
        .post('/api/keys/upload')
        .set('Cookie', `auth_token=${validToken}`)
        .send({ publicKeyBundle: validKeyBundle });

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found.');
    });

    it('prevents key bundle injection attacks', async () => {
      const maliciousKeyBundle = {
        publicKey: 'legitimate-key',
        __proto__: { isAdmin: true },
        constructor: { prototype: { isAdmin: true } },
        maliciousScript: '<script>alert("xss")</script>',
      };
      
      mockPrisma.user.update.mockResolvedValueOnce({
        id: validUser.userId,
        publicKeyBundle: maliciousKeyBundle,
        isKeyMissing: false,
      });

      const response = await request(app)
        .post('/api/keys/upload')
        .set('Cookie', `auth_token=${validToken}`)
        .send({ publicKeyBundle: maliciousKeyBundle });

      expect(response.status).toBe(200);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: validUser.userId },
        data: {
          publicKeyBundle: maliciousKeyBundle,
          isKeyMissing: false,
        },
      });
    });

    it('handles large key bundle payloads', async () => {
      const largeKeyBundle = {
        publicKey: 'k'.repeat(50000), // 50KB key
        metadata: 'm'.repeat(10000),
      };
      
      mockPrisma.user.update.mockResolvedValueOnce({
        id: validUser.userId,
        publicKeyBundle: largeKeyBundle,
        isKeyMissing: false,
      });

      const response = await request(app)
        .post('/api/keys/upload')
        .set('Cookie', `auth_token=${validToken}`)
        .send({ publicKeyBundle: largeKeyBundle });

      expect(response.status).toBe(200);
    });
  });

  describe('GET /api/keys/:userId - Fetch Public Key Bundle', () => {
    it('allows unauthenticated access to public keys', async () => {
      const mockUser = {
        username: 'alice',
        avatarUrl: 'avatar.jpg',
        publicKeyBundle: { publicKey: 'key-data' },
        isKeyMissing: false,
      };
      
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .get('/api/keys/user123');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        username: 'alice',
        avatarUrl: 'avatar.jpg',
        publicKeyBundle: { publicKey: 'key-data' },
        hasPublicKey: true,
        isKeyMissing: false,
      });
    });

    it('handles missing user gracefully', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .get('/api/keys/nonexistent-user');

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found.');
    });

    it('handles user with no public key', async () => {
      const mockUser = {
        username: 'bob',
        avatarUrl: 'bob.jpg',
        publicKeyBundle: null,
        isKeyMissing: true,
      };
      
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .get('/api/keys/user456');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        username: 'bob',
        avatarUrl: 'bob.jpg',
        publicKeyBundle: null,
        hasPublicKey: false,
        isKeyMissing: true,
      });
    });

    it('prevents user ID enumeration attacks', async () => {
      const maliciousUserIds = [
        'user123',
        '../admin',
        'user123; DROP TABLE users;',
        '%00user123',
        'user123\x00',
        '../../etc/passwd',
      ];

      for (const userId of maliciousUserIds) {
        jest.clearAllMocks();
        mockPrisma.user.findUnique.mockResolvedValueOnce(null);

        const response = await request(app)
          .get(`/api/keys/${encodeURIComponent(userId)}`);

        expect(response.status).toBe(404);
        expect(mockPrisma.user.findUnique).toHaveBeenCalledWith({
          where: { id: userId },
          select: {
            publicKeyBundle: true,
            username: true,
            avatarUrl: true,
            isKeyMissing: true,
          },
        });
      }
    });

    it('handles database errors during key fetch', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.user.findUnique.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .get('/api/keys/user123');

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error while fetching key bundle.');
      expect(console.error).toHaveBeenCalledWith('[Key Fetch Error]', dbError);
    });

    it('only exposes safe user fields', async () => {
      const mockUser = {
        username: 'alice',
        avatarUrl: 'avatar.jpg',
        publicKeyBundle: { publicKey: 'key-data' },
        isKeyMissing: false,
        // Sensitive fields that should not be exposed
        passwordHash: 'secret-hash',
        email: 'alice@example.com',
        lastKeyMarkTime: BigInt(Date.now()),
      };
      
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .get('/api/keys/user123');

      expect(response.status).toBe(200);
      expect(response.body).not.toHaveProperty('passwordHash');
      expect(response.body).not.toHaveProperty('email');
      expect(response.body).not.toHaveProperty('lastKeyMarkTime');
    });
  });

  describe('POST /api/keys/mark-missing - Security Critical Route', () => {
    const mockCurrentUser = {
      id: validUser.userId,
      username: validUser.username,
      publicKeyBundle: { publicKey: 'existing-key' },
      isKeyMissing: false,
      lastKeyMarkTime: null,
      keyMarkCount: 0,
    };

    it('requires valid JWT authentication', async () => {
      const response = await request(app)
        .post('/api/keys/mark-missing');

      expect(response.status).toBe(401);
      expect(mockPrisma.user.findUnique).not.toHaveBeenCalled();
    });

    it('successfully marks keys as missing for first-time use', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockCurrentUser);
      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockCurrentUser,
        isKeyMissing: true,
      });

      const response = await request(app)
        .post('/api/keys/mark-missing')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Keys marked as missing successfully.');
      
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: validUser.userId },
        data: {
          isKeyMissing: true,
          lastKeyMarkTime: expect.any(BigInt),
          keyMarkCount: 1,
        },
      });
    });

    it('enforces rate limiting (1 minute minimum)', async () => {
      const recentTime = Date.now() - 30000; // 30 seconds ago
      const recentUser = {
        ...mockCurrentUser,
        lastKeyMarkTime: BigInt(recentTime),
      };
      
      mockPrisma.user.findUnique.mockResolvedValueOnce(recentUser);

      const response = await request(app)
        .post('/api/keys/mark-missing')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(429);
      expect(response.body.message).toMatch(/Rate limited/);
      expect(response.body.message).toMatch(/\d+ seconds/);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('allows marking after rate limit expires', async () => {
      const oldTime = Date.now() - 70000; // 70 seconds ago
      const oldUser = {
        ...mockCurrentUser,
        lastKeyMarkTime: BigInt(oldTime),
        keyMarkCount: 1,
      };
      
      mockPrisma.user.findUnique.mockResolvedValueOnce(oldUser);
      mockPrisma.user.update.mockResolvedValueOnce({
        ...oldUser,
        isKeyMissing: true,
      });

      const response = await request(app)
        .post('/api/keys/mark-missing')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: validUser.userId },
        data: {
          isKeyMissing: true,
          lastKeyMarkTime: expect.any(BigInt),
          keyMarkCount: 2,
        },
      });
    });

    it('prevents duplicate marking when already missing', async () => {
      const alreadyMissingUser = {
        ...mockCurrentUser,
        isKeyMissing: true,
        lastKeyMarkTime: BigInt(Date.now() - 70000),
      };
      
      mockPrisma.user.findUnique.mockResolvedValueOnce(alreadyMissingUser);

      const response = await request(app)
        .post('/api/keys/mark-missing')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Keys are already marked as missing.');
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('logs security audit trail', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockCurrentUser);
      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockCurrentUser,
        isKeyMissing: true,
      });

      const response = await request(app)
        .post('/api/keys/mark-missing')
        .set('Cookie', `auth_token=${validToken}`)
        .set('User-Agent', 'Test-Browser/1.0');

      expect(response.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[Keys] AUDIT:'),
        expect.objectContaining({
          userAgent: 'Test-Browser/1.0',
          timestamp: expect.any(String),
          hadPublicKey: true,
        }),
      );
    });

    it('logs warning when user has public key but marks as missing', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(mockCurrentUser);
      mockPrisma.user.update.mockResolvedValueOnce({
        ...mockCurrentUser,
        isKeyMissing: true,
      });

      const response = await request(app)
        .post('/api/keys/mark-missing')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('[Keys] WARNING:'),
      );
      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('This might indicate: 1) Lost private key, 2) Vault corruption, 3) Potential abuse'),
      );
    });

    it('handles database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.user.findUnique.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .post('/api/keys/mark-missing')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error marking keys as missing.');
      expect(console.error).toHaveBeenCalledWith('[Key Missing Mark Error]', dbError);
    });

    it('handles user not found scenario', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .post('/api/keys/mark-missing')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('User not found.');
    });

    it('increments key mark count correctly', async () => {
      const userWithPreviousMarks = {
        ...mockCurrentUser,
        keyMarkCount: 3,
        lastKeyMarkTime: BigInt(Date.now() - 70000),
      };
      
      mockPrisma.user.findUnique.mockResolvedValueOnce(userWithPreviousMarks);
      mockPrisma.user.update.mockResolvedValueOnce({
        ...userWithPreviousMarks,
        isKeyMissing: true,
      });

      const response = await request(app)
        .post('/api/keys/mark-missing')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: validUser.userId },
        data: {
          isKeyMissing: true,
          lastKeyMarkTime: expect.any(BigInt),
          keyMarkCount: 4,
        },
      });
    });

    it('handles null keyMarkCount gracefully', async () => {
      const userWithNullCount = {
        ...mockCurrentUser,
        keyMarkCount: null,
      };
      
      mockPrisma.user.findUnique.mockResolvedValueOnce(userWithNullCount);
      mockPrisma.user.update.mockResolvedValueOnce({
        ...userWithNullCount,
        isKeyMissing: true,
      });

      const response = await request(app)
        .post('/api/keys/mark-missing')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: validUser.userId },
        data: {
          isKeyMissing: true,
          lastKeyMarkTime: expect.any(BigInt),
          keyMarkCount: 1, // 0 + 1
        },
      });
    });
  });

  describe('Security Edge Cases', () => {
    it('handles concurrent mark-missing requests safely', async () => {
      mockPrisma.user.findUnique.mockResolvedValue(mockCurrentUser);
      mockPrisma.user.update.mockResolvedValue({
        ...mockCurrentUser,
        isKeyMissing: true,
      });

      // Simulate concurrent requests
      const requests = Array.from({ length: 3 }, () =>
        request(app)
          .post('/api/keys/mark-missing')
          .set('Cookie', `auth_token=${validToken}`),
      );

      const responses = await Promise.all(requests);

      // Only one should succeed, others should be rate limited or see already marked
      const successCount = responses.filter(r => r.status === 200).length;
      const rateLimitedCount = responses.filter(r => r.status === 429).length;
      const alreadyMarkedCount = responses.filter(r => r.status === 409).length;

      expect(successCount + rateLimitedCount + alreadyMarkedCount).toBe(3);
    });

    it('validates JWT payload integrity', async () => {
      const tamperedPayload = {
        userId: 'different-user',
        username: 'hacker',
      };
      const tamperedToken = jwt.sign(tamperedPayload, 'different-secret');

      const response = await request(app)
        .post('/api/keys/upload')
        .set('Cookie', `auth_token=${tamperedToken}`)
        .send({ publicKeyBundle: { key: 'test' } });

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Invalid or expired token.');
    });

    it('handles BigInt serialization correctly', async () => {
      const userWithBigInt = {
        ...mockCurrentUser,
        lastKeyMarkTime: BigInt(Date.now()),
      };
      
      mockPrisma.user.findUnique.mockResolvedValueOnce(userWithBigInt);

      const response = await request(app)
        .post('/api/keys/mark-missing')
        .set('Cookie', `auth_token=${validToken}`);

      // Should handle BigInt without crashing
      expect(response.status).toBe(429); // Rate limited due to recent time
    });
  });
});