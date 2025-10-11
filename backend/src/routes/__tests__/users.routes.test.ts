import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import usersRouter from '../users.routes';

// Mock database service
jest.mock('../../services/database.service', () => ({
  prisma: {
    user: {
      findMany: jest.fn(),
      update: jest.fn(),
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
app.use('/api/users', usersRouter);

describe('Users API Routes (Security Tests)', () => {
  const validUser = {
    userId: 'user123',
    username: 'testuser',
  };

  const validToken = jwt.sign(validUser, 'test-jwt-secret-key-for-testing-only-32chars');

  let mockPrisma: any;

  beforeAll(() => {
    // Get the mocked prisma instance
    const { prisma } = require('../../services/database.service');
    mockPrisma = prisma;
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

  describe('GET /api/users - List Users', () => {
    // Run: npm test -- --testPathPattern="users.routes.test.ts"
    it('requires valid JWT authentication', async () => {
      const response = await request(app)
        .get('/api/users');

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Access denied. Token missing.');
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('rejects invalid JWT tokens', async () => {
      const response = await request(app)
        .get('/api/users')
        .set('Cookie', 'auth_token=invalid-token');

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Invalid or expired token.');
      expect(mockPrisma.user.findMany).not.toHaveBeenCalled();
    });

    it('returns user list for authenticated requests', async () => {
      const mockUsers = [
        { id: 'user1', username: 'alice', avatarUrl: 'avatar1.jpg' },
        { id: 'user2', username: 'bob', avatarUrl: 'avatar2.jpg' },
      ];
      
      mockPrisma.user.findMany.mockResolvedValueOnce(mockUsers);

      const response = await request(app)
        .get('/api/users')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        { _id: 'user1', username: 'alice', avatarUrl: 'avatar1.jpg' },
        { _id: 'user2', username: 'bob', avatarUrl: 'avatar2.jpg' },
      ]);

      expect(mockPrisma.user.findMany).toHaveBeenCalledWith({
        select: {
          id: true,
          username: true,
          avatarUrl: true,
        },
      });
    });

    it('only exposes safe user fields', async () => {
      const mockUsers = [
        { 
          id: 'user1', 
          username: 'alice', 
          avatarUrl: 'avatar1.jpg',
          // These sensitive fields should not be exposed
          passwordHash: 'secret-hash',
          email: 'alice@example.com',
          publicKeyBundle: 'sensitive-key-data',
        },
      ];
      
      mockPrisma.user.findMany.mockResolvedValueOnce(mockUsers);

      const response = await request(app)
        .get('/api/users')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body[0]).not.toHaveProperty('passwordHash');
      expect(response.body[0]).not.toHaveProperty('email');
      expect(response.body[0]).not.toHaveProperty('publicKeyBundle');
    });

    it('handles database errors gracefully', async () => {
      const dbError = new Error('Database connection failed');
      mockPrisma.user.findMany.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .get('/api/users')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error while fetching users.');
      expect(console.error).toHaveBeenCalledWith('[Users Fetch Error]', dbError);
    });

    it('handles empty user list', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/users')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('validates token from Authorization header as fallback', async () => {
      const mockUsers = [
        { id: 'user1', username: 'alice', avatarUrl: 'avatar1.jpg' },
      ];
      
      mockPrisma.user.findMany.mockResolvedValueOnce(mockUsers);

      const response = await request(app)
        .get('/api/users')
        .set('Authorization', `Bearer ${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toHaveLength(1);
    });
  });

  describe('PUT /api/users/me/avatar - Update Avatar', () => {
    it('requires valid JWT authentication', async () => {
      const response = await request(app)
        .put('/api/users/me/avatar')
        .send({ avatarUrl: 'new-avatar.jpg' });

      expect(response.status).toBe(401);
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('requires avatarUrl in request body', async () => {
      const response = await request(app)
        .put('/api/users/me/avatar')
        .set('Cookie', `auth_token=${validToken}`)
        .send({});

      expect(response.status).toBe(422);
      expect(response.body.errors).toBeDefined();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });

    it('rejects empty avatarUrl', async () => {
      const response = await request(app)
        .put('/api/users/me/avatar')
        .set('Cookie', `auth_token=${validToken}`)
        .send({ avatarUrl: '' });

      expect(response.status).toBe(422);
      expect(response.body.errors).toBeDefined();
    });

    it('updates avatar for authenticated user', async () => {
      const validAvatarUrl = 'https://example.com/new-avatar.jpg';
      mockPrisma.user.update.mockResolvedValueOnce({
        id: validUser.userId,
        avatarUrl: validAvatarUrl,
      });

      const response = await request(app)
        .put('/api/users/me/avatar')
        .set('Cookie', `auth_token=${validToken}`)
        .send({ avatarUrl: validAvatarUrl });

      expect(response.status).toBe(204);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: validUser.userId },
        data: { avatarUrl: validAvatarUrl },
      });
    });

    it('handles database errors during avatar update', async () => {
      const dbError = new Error('Update failed');
      mockPrisma.user.update.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .put('/api/users/me/avatar')
        .set('Cookie', `auth_token=${validToken}`)
        .send({ avatarUrl: 'https://example.com/new-avatar.jpg' });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error while updating avatar.');
      expect(console.error).toHaveBeenCalledWith('[Avatar Update Error]', dbError);
    });

    it('validates avatarUrl format (basic)', async () => {
      mockPrisma.user.update.mockResolvedValueOnce({});

      const validUrls = [
        'https://example.com/avatar.jpg',
        'https://cdn.example.com/images/user123.png',
      ];

      for (const avatarUrl of validUrls) {
        jest.clearAllMocks();
        mockPrisma.user.update.mockResolvedValueOnce({});

        const response = await request(app)
          .put('/api/users/me/avatar')
          .set('Cookie', `auth_token=${validToken}`)
          .send({ avatarUrl });

        expect(response.status).toBe(204);
      }
    });

    it('handles malformed JSON in request body', async () => {
      const response = await request(app)
        .put('/api/users/me/avatar')
        .set('Cookie', `auth_token=${validToken}`)
        .set('Content-Type', 'application/json')
        .send('{"avatarUrl": invalid-json}');

      expect(response.status).toBe(400);
    });

    it('rejects non-HTTPS URLs', async () => {
      const nonHttpsUrls = [
        'http://example.com/avatar.jpg',
        '/static/avatars/default.svg',
        'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8/5+hHgAHggJ/PchI7wAAAABJRU5ErkJggg==',
        'ftp://example.com/avatar.jpg'
      ];

      for (const avatarUrl of nonHttpsUrls) {
        const response = await request(app)
          .put('/api/users/me/avatar')
          .set('Cookie', `auth_token=${validToken}`)
          .send({ avatarUrl });

        expect(response.status).toBe(422);
        expect(response.body.errors).toBeDefined();
      }
    });

    it('prevents SQL injection in avatarUrl', async () => {
      // Use a URL with SQL injection attempt - should be rejected by URL validation
      const maliciousUrl = "https://example.com/avatar.jpg?id=1'; DROP TABLE users; --";

      const response = await request(app)
        .put('/api/users/me/avatar')
        .set('Cookie', `auth_token=${validToken}`)
        .send({ avatarUrl: maliciousUrl });

      // URL validator should reject malformed URLs with unencoded special characters
      // This prevents injection attempts before they reach the ORM
      expect(response.status).toBe(422);
      expect(response.body.errors).toBeDefined();
      expect(mockPrisma.user.update).not.toHaveBeenCalled();
    });
  });

  describe('Security Headers and CORS', () => {
    it('does not leak server information in errors', async () => {
      const dbError = new Error('Detailed database error with sensitive info');
      mockPrisma.user.findMany.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .get('/api/users')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error while fetching users.');
      expect(response.body.message).not.toContain('database');
      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('error');
    });

    it('returns JSON content type for API responses', async () => {
      mockPrisma.user.findMany.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/users')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(response.type).toBe('application/json');
    });

    it('handles concurrent requests safely', async () => {
      mockPrisma.user.findMany.mockResolvedValue([
        { id: 'user1', username: 'alice', avatarUrl: 'avatar1.jpg' },
      ]);

      // Make multiple concurrent requests
      const requests = Array.from({ length: 5 }, () =>
        request(app)
          .get('/api/users')
          .set('Cookie', `auth_token=${validToken}`),
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body).toHaveLength(1);
      });

      expect(mockPrisma.user.findMany).toHaveBeenCalledTimes(5);
    });
  });

  describe('Input Validation Edge Cases', () => {
    it('rejects very long avatarUrl strings', async () => {
      const longUrl = `https://example.com/${'a'.repeat(1000)}.jpg`;
      mockPrisma.user.update.mockResolvedValueOnce({});

      const response = await request(app)
        .put('/api/users/me/avatar')
        .set('Cookie', `auth_token=${validToken}`)
        .send({ avatarUrl: longUrl });

      expect(response.status).toBe(422);
      expect(response.body.errors).toBeDefined();
    });

    it('handles special characters in avatarUrl', async () => {
      const specialUrl = 'https://example.com/avatar%20with%20spaces%26symbols.jpg?v=1&t=2';
      mockPrisma.user.update.mockResolvedValueOnce({});

      const response = await request(app)
        .put('/api/users/me/avatar')
        .set('Cookie', `auth_token=${validToken}`)
        .send({ avatarUrl: specialUrl });

      expect(response.status).toBe(204);
    });

    it('handles null values gracefully', async () => {
      const response = await request(app)
        .put('/api/users/me/avatar')
        .set('Cookie', `auth_token=${validToken}`)
        .send({ avatarUrl: null });

      expect(response.status).toBe(422);
      expect(response.body.errors).toBeDefined();
    });

    it('handles additional unexpected fields', async () => {
      mockPrisma.user.update.mockResolvedValueOnce({});

      const response = await request(app)
        .put('/api/users/me/avatar')
        .set('Cookie', `auth_token=${validToken}`)
        .send({
          avatarUrl: 'https://example.com/avatar.jpg',
          extraField: 'should-be-ignored',
          maliciousScript: '<script>alert("xss")</script>',
        });

      expect(response.status).toBe(204);
      expect(mockPrisma.user.update).toHaveBeenCalledWith({
        where: { id: validUser.userId },
        data: { avatarUrl: 'https://example.com/avatar.jpg' },
      });
    });
  });
});