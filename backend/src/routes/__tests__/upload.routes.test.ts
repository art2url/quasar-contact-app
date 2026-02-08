import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import uploadRoutes from '../upload.routes';

// Mock database service
jest.mock('../../services/database.service', () => ({
  prisma: {
    message: {
      create: jest.fn(),
    },
    user: {
      findUnique: jest.fn(),
    },
  },
}));

// Mock socket server
jest.mock('../../server', () => ({
  io: {},
}));

// Mock socket functions
jest.mock('../../sockets', () => ({
  emitToUser: jest.fn(),
}));

// Mock environment config
jest.mock('../../config/env', () => ({
  JWT_SECRET: 'test-jwt-secret-key-for-testing-only-32chars',
}));

describe('Upload Routes (Security Critical)', () => {
  let app: express.Application;
  let mockPrisma: any;
  let mockEmitToUser: jest.MockedFunction<any>;

  const validUser = {
    userId: 'user123',
    username: 'testuser',
    avatarUrl: 'test-avatar.jpg',
  };

  const createValidToken = (user: typeof validUser) => {
    return jwt.sign(user, 'test-jwt-secret-key-for-testing-only-32chars');
  };

  const createTestImageBuffer = () => {
    // Create a simple PNG-like buffer for testing
    return Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64');
  };

  beforeEach(() => {
    // Get mocked instances
    const { prisma } = require('../../services/database.service');
    const { emitToUser } = require('../../sockets');
    mockPrisma = prisma;
    mockEmitToUser = emitToUser;

    app = express();
    app.use(express.json());
    app.use('/api/upload', uploadRoutes);

    // Clear all mocks
    jest.clearAllMocks();

    // Mock console methods
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();

    // Mock receiver user exists by default (tests can override if needed)
    mockPrisma.user.findUnique.mockResolvedValue({
      id: 'receiver123',
    });
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/upload/image - Image Upload', () => {
    // Run: npm test -- --testPathPattern="upload.routes.test.ts"
    it('successfully uploads and processes image', async () => {
      const token = createValidToken(validUser);
      const imageBuffer = createTestImageBuffer();

      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', imageBuffer, 'test.png')
        .field('receiverId', 'receiver123')
        .field('encryptedPayload', 'encrypted-image-data');

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        imageData: expect.any(String),
        size: expect.any(Number),
        mimeType: 'image/png',
        receiverId: 'receiver123',
        encryptedPayload: 'encrypted-image-data',
      });
      expect(response.body.imageData).toBeTruthy();
    });

    it('requires authentication', async () => {
      const imageBuffer = createTestImageBuffer();

      const response = await request(app)
        .post('/api/upload/image')
        .attach('image', imageBuffer, 'test.png')
        .field('receiverId', 'receiver123')
        .field('encryptedPayload', 'encrypted-data');

      expect(response.status).toBe(401);
    });

    it('validates image file is provided', async () => {
      const token = createValidToken(validUser);

      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${token}`)
        .field('receiverId', 'receiver123')
        .field('encryptedPayload', 'encrypted-data');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        message: 'No image file provided',
      });
    });

    it('validates receiverId is provided', async () => {
      const token = createValidToken(validUser);
      const imageBuffer = createTestImageBuffer();

      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', imageBuffer, 'test.png')
        .field('encryptedPayload', 'encrypted-data');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        message: 'Missing receiverId or encryptedPayload',
      });
    });

    it('validates receiverId exists in database', async () => {
      const token = createValidToken(validUser);
      const imageBuffer = createTestImageBuffer();

      // Mock receiver does not exist
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', imageBuffer, 'test.png')
        .field('receiverId', 'nonexistent-user')
        .field('encryptedPayload', 'encrypted-data');

      expect(response.status).toBe(404);
      expect(response.body).toEqual({
        success: false,
        message: 'Receiver not found',
      });
    });

    it('validates encryptedPayload is provided', async () => {
      const token = createValidToken(validUser);
      const imageBuffer = createTestImageBuffer();

      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', imageBuffer, 'test.png')
        .field('receiverId', 'receiver123');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        message: 'Missing receiverId or encryptedPayload',
      });
    });

    it('rejects non-image files', async () => {
      const token = createValidToken(validUser);
      const textBuffer = Buffer.from('This is not an image');

      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', textBuffer, 'test.txt')
        .field('receiverId', 'receiver123')
        .field('encryptedPayload', 'encrypted-data');

      expect(response.status).toBe(500);
      expect(response.text).toContain('Only image files are allowed');
    });

    it('enforces file size limit', async () => {
      const token = createValidToken(validUser);
      // Create a buffer larger than 5MB
      const largeBuffer = Buffer.alloc(6 * 1024 * 1024);

      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', largeBuffer, 'large.png')
        .field('receiverId', 'receiver123')
        .field('encryptedPayload', 'encrypted-data');

      expect(response.status).toBe(500);
      expect(response.text).toContain('File too large');
    });

    it('handles various image formats', async () => {
      const token = createValidToken(validUser);
      const imageFormats = [
        { buffer: createTestImageBuffer(), filename: 'test.png', mimeType: 'image/png' },
        { buffer: createTestImageBuffer(), filename: 'test.jpg', mimeType: 'image/jpeg' },
        { buffer: createTestImageBuffer(), filename: 'test.gif', mimeType: 'image/gif' },
      ];

      for (const format of imageFormats) {
        const response = await request(app)
          .post('/api/upload/image')
          .set('Authorization', `Bearer ${token}`)
          .attach('image', format.buffer, format.filename)
          .field('receiverId', 'receiver123')
          .field('encryptedPayload', 'encrypted-data');

        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      }
    });

    it('handles empty receiverId and encryptedPayload', async () => {
      const token = createValidToken(validUser);
      const imageBuffer = createTestImageBuffer();

      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${token}`)
        .attach('image', imageBuffer, 'test.png')
        .field('receiverId', '')
        .field('encryptedPayload', '');

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        message: 'Missing receiverId or encryptedPayload',
      });
    });
  });

  describe('POST /api/upload/message-with-image - Message with Image', () => {
    it('successfully sends message with image data', async () => {
      const token = createValidToken(validUser);
      
      // Mock database operations
      const mockMessage = {
        id: 'msg123',
        senderId: 'user123',
        receiverId: 'receiver123',
        ciphertext: 'encrypted-payload',
        timestamp: new Date(),
      };
      mockPrisma.message.create.mockResolvedValueOnce(mockMessage);

      const mockSender = {
        username: 'testuser',
        avatarUrl: 'test-avatar.jpg',
      };
      // Mock both receiver validation and sender lookup
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: 'receiver123' }) // First call: receiver validation
        .mockResolvedValueOnce(mockSender); // Second call: sender lookup
      
      // Mock socket emission
      mockEmitToUser.mockReturnValueOnce(true);

      const response = await request(app)
        .post('/api/upload/message-with-image')
        .set('Authorization', `Bearer ${token}`)
        .send({
          receiverId: 'receiver123',
          encryptedPayload: 'encrypted-image-payload',
          retryAttempt: 0,
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        messageId: 'msg123',
        timestamp: mockMessage.timestamp.toISOString(),
        retryAttempt: 0,
      });

      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          senderId: 'user123',
          receiverId: 'receiver123',
          ciphertext: 'encrypted-image-payload',
        },
      });

      expect(mockEmitToUser).toHaveBeenCalledWith(
        {},
        'receiver123',
        'receive-message',
        {
          fromUserId: 'user123',
          fromUsername: 'testuser',
          avatarUrl: 'test-avatar.jpg',
          ciphertext: 'encrypted-image-payload',
          messageId: 'msg123',
          timestamp: mockMessage.timestamp,
        },
      );
    });

    it('requires authentication', async () => {
      const response = await request(app)
        .post('/api/upload/message-with-image')
        .send({
          receiverId: 'receiver123',
          encryptedPayload: 'encrypted-data',
        });

      expect(response.status).toBe(401);
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it('validates receiverId is provided', async () => {
      const token = createValidToken(validUser);

      const response = await request(app)
        .post('/api/upload/message-with-image')
        .set('Authorization', `Bearer ${token}`)
        .send({
          encryptedPayload: 'encrypted-data',
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        message: 'Missing receiverId or encryptedPayload',
      });
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it('validates encryptedPayload is provided', async () => {
      const token = createValidToken(validUser);

      const response = await request(app)
        .post('/api/upload/message-with-image')
        .set('Authorization', `Bearer ${token}`)
        .send({
          receiverId: 'receiver123',
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        success: false,
        message: 'Missing receiverId or encryptedPayload',
      });
    });

    it('handles database errors gracefully', async () => {
      const token = createValidToken(validUser);
      
      mockPrisma.message.create.mockRejectedValueOnce(
        new Error('Database connection error'),
      );

      const response = await request(app)
        .post('/api/upload/message-with-image')
        .set('Authorization', `Bearer ${token}`)
        .send({
          receiverId: 'receiver123',
          encryptedPayload: 'encrypted-data',
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        success: false,
        message: 'Failed to send message with image',
      });
      expect(console.error).toHaveBeenCalledWith(
        '[Image Message Send Error]',
        expect.any(Error),
      );
    });

    it('handles offline recipient gracefully', async () => {
      const token = createValidToken(validUser);

      // Mock successful database operations
      const mockMessage = {
        id: 'msg123',
        senderId: 'user123',
        receiverId: 'receiver123',
        ciphertext: 'encrypted-payload',
        timestamp: new Date(),
      };
      mockPrisma.message.create.mockResolvedValueOnce(mockMessage);
      // Mock both receiver validation and sender lookup
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: 'receiver123' }) // First call: receiver validation
        .mockResolvedValueOnce({
          username: 'testuser',
          avatarUrl: 'test-avatar.jpg',
        }); // Second call: sender lookup
      
      // Mock socket emission failure (user offline)
      mockEmitToUser.mockReturnValueOnce(false);

      const response = await request(app)
        .post('/api/upload/message-with-image')
        .set('Authorization', `Bearer ${token}`)
        .send({
          receiverId: 'receiver123',
          encryptedPayload: 'encrypted-data',
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      // Should still succeed even if recipient is offline
    });

    it('handles missing sender information gracefully', async () => {
      const token = createValidToken(validUser);

      const mockMessage = {
        id: 'msg123',
        senderId: 'user123',
        receiverId: 'receiver123',
        ciphertext: 'encrypted-payload',
        timestamp: new Date(),
      };
      mockPrisma.message.create.mockResolvedValueOnce(mockMessage);

      // Mock receiver exists, but sender user not found
      mockPrisma.user.findUnique
        .mockResolvedValueOnce({ id: 'receiver123' }) // First call: receiver validation
        .mockResolvedValueOnce(null); // Second call: sender lookup
      mockEmitToUser.mockReturnValueOnce(true);

      const response = await request(app)
        .post('/api/upload/message-with-image')
        .set('Authorization', `Bearer ${token}`)
        .send({
          receiverId: 'receiver123',
          encryptedPayload: 'encrypted-data',
        });

      expect(response.status).toBe(200);
      expect(mockEmitToUser).toHaveBeenCalledWith(
        {},
        'receiver123',
        'receive-message',
        expect.objectContaining({
          fromUsername: 'Unknown',
          avatarUrl: undefined,
        }),
      );
    });

    it('handles retry attempts correctly', async () => {
      const token = createValidToken(validUser);
      
      const mockMessage = {
        id: 'msg123',
        timestamp: new Date(),
      };
      mockPrisma.message.create.mockResolvedValueOnce(mockMessage);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        username: 'testuser',
        avatarUrl: 'test-avatar.jpg',
      });
      mockEmitToUser.mockReturnValueOnce(true);

      const response = await request(app)
        .post('/api/upload/message-with-image')
        .set('Authorization', `Bearer ${token}`)
        .send({
          receiverId: 'receiver123',
          encryptedPayload: 'encrypted-data',
          retryAttempt: 3,
        });

      expect(response.status).toBe(200);
      expect(response.body.retryAttempt).toBe(3);
    });
  });

  describe('Security and Edge Cases', () => {
    it('validates JWT token format', async () => {
      const imageBuffer = createTestImageBuffer();

      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', 'Bearer invalid-token')
        .attach('image', imageBuffer, 'test.png')
        .field('receiverId', 'receiver123')
        .field('encryptedPayload', 'encrypted-data');

      expect(response.status).toBe(403);
    });

    it('handles malformed request data', async () => {
      const token = createValidToken(validUser);

      const testCases = [
        { receiverId: null, encryptedPayload: 'data' },
        { receiverId: '', encryptedPayload: 'data' },
        { receiverId: 'receiver123', encryptedPayload: null },
        { receiverId: 'receiver123', encryptedPayload: '' },
        { wrongField: 'value' },
      ];

      for (const body of testCases) {
        const response = await request(app)
          .post('/api/upload/message-with-image')
          .set('Authorization', `Bearer ${token}`)
          .send(body);

        expect(response.status).toBe(400);
        expect(response.body.success).toBe(false);
      }
    });

    it('prevents unauthorized image uploads', async () => {
      const expiredToken = jwt.sign(
        { userId: 'user123', exp: Math.floor(Date.now() / 1000) - 60 },
        'test-jwt-secret-key-for-testing-only-32chars',
      );
      const imageBuffer = createTestImageBuffer();

      const response = await request(app)
        .post('/api/upload/image')
        .set('Authorization', `Bearer ${expiredToken}`)
        .attach('image', imageBuffer, 'test.png')
        .field('receiverId', 'receiver123')
        .field('encryptedPayload', 'encrypted-data');

      expect(response.status).toBe(403);
    });

    it('preserves encrypted payload integrity', async () => {
      const token = createValidToken(validUser);
      const sensitivePayload = 'encrypted-sensitive-data-12345';
      
      const mockMessage = {
        id: 'msg123',
        timestamp: new Date(),
      };
      mockPrisma.message.create.mockResolvedValueOnce(mockMessage);
      mockPrisma.user.findUnique.mockResolvedValueOnce({
        username: 'testuser',
        avatarUrl: 'test-avatar.jpg',
      });
      mockEmitToUser.mockReturnValueOnce(true);

      const response = await request(app)
        .post('/api/upload/message-with-image')
        .set('Authorization', `Bearer ${token}`)
        .send({
          receiverId: 'receiver123',
          encryptedPayload: sensitivePayload,
        });

      expect(response.status).toBe(200);
      expect(mockPrisma.message.create).toHaveBeenCalledWith(
        expect.objectContaining({
          data: expect.objectContaining({
            ciphertext: sensitivePayload,
          }),
        }),
      );
    });

    it('handles concurrent upload attempts', async () => {
      const token = createValidToken(validUser);
      const imageBuffer = createTestImageBuffer();

      // Simulate concurrent uploads
      const uploadPromises = Array(3).fill(null).map(() =>
        request(app)
          .post('/api/upload/image')
          .set('Authorization', `Bearer ${token}`)
          .attach('image', imageBuffer, 'test.png')
          .field('receiverId', 'receiver123')
          .field('encryptedPayload', 'encrypted-data'),
      );

      const responses = await Promise.all(uploadPromises);
      
      // All uploads should succeed independently
      responses.forEach(response => {
        expect(response.status).toBe(200);
        expect(response.body.success).toBe(true);
      });
    });
  });
});