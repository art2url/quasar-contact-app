import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import messagesRouter from '../messages.routes';

// Mock database service
jest.mock('../../services/database.service', () => ({
  prisma: {
    message: {
      create: jest.fn(),
      findMany: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
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
app.use('/api/messages', messagesRouter);

describe('Messages API Routes (Security Critical Tests)', () => {
  const validUser = {
    userId: 'user123',
    username: 'testuser',
  };

  const validToken = jwt.sign(validUser, 'test-jwt-secret-key-for-testing-only-32chars');
  const otherUserId = 'user456';

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

  describe('POST /api/messages/send - Send Encrypted Message', () => {
    // Run: npm test -- --testPathPattern="messages.routes.test.ts"
    const validMessage = {
      receiverId: otherUserId,
      ciphertext: 'encrypted-message-content',
    };

    it('requires valid JWT authentication', async () => {
      const response = await request(app)
        .post('/api/messages/send')
        .send(validMessage);

      expect(response.status).toBe(401);
      expect(mockPrisma.message.create).not.toHaveBeenCalled();
    });

    it('requires receiverId in request body', async () => {
      const response = await request(app)
        .post('/api/messages/send')
        .set('Cookie', `auth_token=${validToken}`)
        .send({ ciphertext: 'encrypted-content' });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Missing receiverId or ciphertext.');
    });

    it('requires ciphertext in request body', async () => {
      const response = await request(app)
        .post('/api/messages/send')
        .set('Cookie', `auth_token=${validToken}`)
        .send({ receiverId: otherUserId });

      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Missing receiverId or ciphertext.');
    });

    it('successfully sends encrypted message', async () => {
      const createdMessage = {
        id: 'msg123',
        senderId: validUser.userId,
        receiverId: otherUserId,
        ciphertext: validMessage.ciphertext,
        timestamp: new Date(),
      };
      
      mockPrisma.message.create.mockResolvedValueOnce(createdMessage);

      const response = await request(app)
        .post('/api/messages/send')
        .set('Cookie', `auth_token=${validToken}`)
        .send(validMessage);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('Message sent successfully.');
      
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          senderId: validUser.userId,
          receiverId: otherUserId,
          ciphertext: validMessage.ciphertext,
        },
      });
    });

    it('handles database errors during message creation', async () => {
      const dbError = new Error('Database insert failed');
      mockPrisma.message.create.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .post('/api/messages/send')
        .set('Cookie', `auth_token=${validToken}`)
        .send(validMessage);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error while sending message.');
      expect(console.error).toHaveBeenCalledWith('[Message Send Error]', dbError);
    });

    it('prevents sending messages to self (if implemented)', async () => {
      const selfMessage = {
        receiverId: validUser.userId, // Same as sender
        ciphertext: 'self-message',
      };
      
      mockPrisma.message.create.mockResolvedValueOnce({
        id: 'msg124',
        senderId: validUser.userId,
        receiverId: validUser.userId,
        ciphertext: selfMessage.ciphertext,
      });

      const response = await request(app)
        .post('/api/messages/send')
        .set('Cookie', `auth_token=${validToken}`)
        .send(selfMessage);

      // Currently allows self-messages, but tests the behavior
      expect(response.status).toBe(201);
    });

    it('handles very large encrypted payloads', async () => {
      const largeMessage = {
        receiverId: otherUserId,
        ciphertext: 'e'.repeat(100000), // 100KB encrypted content
      };
      
      mockPrisma.message.create.mockResolvedValueOnce({
        id: 'msg125',
        senderId: validUser.userId,
        receiverId: otherUserId,
        ciphertext: largeMessage.ciphertext,
      });

      const response = await request(app)
        .post('/api/messages/send')
        .set('Cookie', `auth_token=${validToken}`)
        .send(largeMessage);

      expect(response.status).toBe(201);
    });

    it('preserves encrypted content without modification', async () => {
      const specialCiphertext = 'encrypted+content/with=special&chars%20and<tags>';
      const messageWithSpecialChars = {
        receiverId: otherUserId,
        ciphertext: specialCiphertext,
      };
      
      mockPrisma.message.create.mockResolvedValueOnce({
        id: 'msg126',
        senderId: validUser.userId,
        receiverId: otherUserId,
        ciphertext: specialCiphertext,
      });

      const response = await request(app)
        .post('/api/messages/send')
        .set('Cookie', `auth_token=${validToken}`)
        .send(messageWithSpecialChars);

      expect(response.status).toBe(201);
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          senderId: validUser.userId,
          receiverId: otherUserId,
          ciphertext: specialCiphertext,
        },
      });
    });
  });

  describe('GET /api/messages/overview - Message Overview', () => {
    it('requires valid JWT authentication', async () => {
      const response = await request(app)
        .get('/api/messages/overview');

      expect(response.status).toBe(401);
      expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    });

    it('returns message overview for authenticated user', async () => {
      const mockMessages = [
        {
          senderId: 'sender1',
          ciphertext: 'encrypted-msg-1',
          read: false,
          sender: { username: 'alice' },
        },
        {
          senderId: 'sender1',
          ciphertext: 'encrypted-msg-2',
          read: false,
          sender: { username: 'alice' },
        },
        {
          senderId: 'sender2',
          ciphertext: 'encrypted-msg-3',
          read: true,
          sender: { username: 'bob' },
        },
      ];
      
      mockPrisma.message.findMany.mockResolvedValueOnce(mockMessages);

      const response = await request(app)
        .get('/api/messages/overview')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          peerId: 'sender1',
          lastText: 'encrypted-msg-1',
          unread: 2,
        },
        {
          peerId: 'sender2',
          lastText: 'encrypted-msg-3',
          unread: 0,
        },
      ]);

      expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
        where: {
          receiverId: validUser.userId,
          deleted: false,
        },
        orderBy: {
          timestamp: 'desc',
        },
        include: {
          sender: true,
        },
      });
    });

    it('handles empty message list', async () => {
      mockPrisma.message.findMany.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/messages/overview')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('handles database errors gracefully', async () => {
      const dbError = new Error('Database query failed');
      mockPrisma.message.findMany.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .get('/api/messages/overview')
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error');
      expect(console.error).toHaveBeenCalledWith('[Overview Error]', dbError);
    });
  });

  describe('GET /api/messages/:userId - Fetch User Messages', () => {
    it('requires valid JWT authentication', async () => {
      const response = await request(app)
        .get(`/api/messages/${validUser.userId}`);

      expect(response.status).toBe(401);
    });

    it('only allows access to own messages (authorization check)', async () => {
      const response = await request(app)
        .get(`/api/messages/${otherUserId}`)
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(403);
      expect(response.body.message).toBe('Access denied.');
      expect(mockPrisma.message.findMany).not.toHaveBeenCalled();
    });

    it('returns messages for authenticated user', async () => {
      const mockMessages = [
        {
          senderId: 'sender1',
          ciphertext: 'encrypted-msg-1',
          timestamp: new Date('2024-01-01'),
        },
        {
          senderId: 'sender2',
          ciphertext: 'encrypted-msg-2',
          timestamp: new Date('2024-01-02'),
        },
      ];
      
      mockPrisma.message.findMany.mockResolvedValueOnce(mockMessages);

      const response = await request(app)
        .get(`/api/messages/${validUser.userId}`)
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.messages).toEqual([
        {
          senderId: 'sender1',
          ciphertext: 'encrypted-msg-1',
          timestamp: '2024-01-01T00:00:00.000Z',
        },
        {
          senderId: 'sender2',
          ciphertext: 'encrypted-msg-2',
          timestamp: '2024-01-02T00:00:00.000Z',
        },
      ]);

      expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
        where: {
          receiverId: validUser.userId,
          deleted: false,
        },
        orderBy: {
          timestamp: 'asc',
        },
        select: {
          senderId: true,
          ciphertext: true,
          timestamp: true,
        },
      });
    });

    it('handles database errors during message fetch', async () => {
      const dbError = new Error('Database query failed');
      mockPrisma.message.findMany.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .get(`/api/messages/${validUser.userId}`)
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error while fetching messages.');
      expect(console.error).toHaveBeenCalledWith('[Message Fetch Error]', dbError);
    });
  });

  describe('GET /api/messages/history/:userId - Message History', () => {
    it('requires valid JWT authentication', async () => {
      const response = await request(app)
        .get(`/api/messages/history/${otherUserId}`);

      expect(response.status).toBe(401);
    });

    it('returns conversation history between two users', async () => {
      const mockMessages = [
        {
          id: 'msg1',
          senderId: validUser.userId,
          receiverId: otherUserId,
          ciphertext: 'encrypted-msg-1',
          timestamp: new Date('2024-01-01'),
          read: false,
          avatarUrl: null,
          editedAt: null,
          deleted: false,
          deletedAt: null,
          createdAt: new Date('2024-01-01'),
        },
        {
          id: 'msg2',
          senderId: otherUserId,
          receiverId: validUser.userId,
          ciphertext: 'encrypted-msg-2',
          timestamp: new Date('2024-01-02'),
          read: true,
          avatarUrl: null,
          editedAt: null,
          deleted: false,
          deletedAt: null,
          createdAt: new Date('2024-01-02'),
        },
      ];
      
      mockPrisma.message.findMany.mockResolvedValueOnce(mockMessages);

      const response = await request(app)
        .get(`/api/messages/history/${otherUserId}`)
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.messages).toHaveLength(2);

      expect(mockPrisma.message.findMany).toHaveBeenCalledWith({
        where: {
          OR: [
            { senderId: validUser.userId, receiverId: otherUserId },
            { senderId: otherUserId, receiverId: validUser.userId },
          ],
        },
        orderBy: {
          timestamp: 'asc',
        },
        select: {
          id: true,
          senderId: true,
          receiverId: true,
          ciphertext: true,
          timestamp: true,
          read: true,
          avatarUrl: true,
          editedAt: true,
          deleted: true,
          deletedAt: true,
          createdAt: true,
        },
      });
    });

    it('handles database errors during history fetch', async () => {
      const dbError = new Error('History query failed');
      mockPrisma.message.findMany.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .get(`/api/messages/history/${otherUserId}`)
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error while fetching history.');
      expect(console.error).toHaveBeenCalledWith('[Message History Error]', dbError);
    });
  });

  describe('PATCH /api/messages/:id - Edit Message', () => {
    const messageId = 'msg123';
    const updateData = {
      ciphertext: 'updated-encrypted-content',
      avatarUrl: 'updated-avatar.jpg',
    };

    it('requires valid JWT authentication', async () => {
      const response = await request(app)
        .patch(`/api/messages/${messageId}`)
        .send(updateData);

      expect(response.status).toBe(401);
    });

    it('requires ciphertext in request body', async () => {
      const response = await request(app)
        .patch(`/api/messages/${messageId}`)
        .set('Cookie', `auth_token=${validToken}`)
        .send({ avatarUrl: 'avatar.jpg' });

      expect(response.status).toBe(422);
      expect(response.body.errors).toBeDefined();
      expect(response.body.errors[0].msg).toBe('ciphertext required');
    });

    it('only allows sender to edit their own messages', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce(null); // Message not found for this sender

      const response = await request(app)
        .patch(`/api/messages/${messageId}`)
        .set('Cookie', `auth_token=${validToken}`)
        .send(updateData);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Message not found');

      expect(mockPrisma.message.findUnique).toHaveBeenCalledWith({
        where: {
          id: messageId,
          senderId: validUser.userId,
        },
      });
    });

    it('successfully updates message for authorized sender', async () => {
      const existingMessage = {
        id: messageId,
        senderId: validUser.userId,
        receiverId: otherUserId,
        ciphertext: 'old-encrypted-content',
      };
      
      const updatedMessage = {
        id: messageId,
        ciphertext: updateData.ciphertext,
        avatarUrl: updateData.avatarUrl,
        editedAt: new Date(),
        deleted: false,
        deletedAt: null,
      };

      mockPrisma.message.findUnique.mockResolvedValueOnce(existingMessage);
      mockPrisma.message.update.mockResolvedValueOnce(updatedMessage);

      const response = await request(app)
        .patch(`/api/messages/${messageId}`)
        .set('Cookie', `auth_token=${validToken}`)
        .send(updateData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        _id: messageId,
        ciphertext: updateData.ciphertext,
        editedAt: expect.any(String), // Date is serialized as string in JSON
        avatarUrl: updateData.avatarUrl,
        deleted: false,
        deletedAt: null,
      });

      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: messageId },
        data: {
          ciphertext: updateData.ciphertext,
          avatarUrl: updateData.avatarUrl,
          editedAt: expect.any(Date),
        },
      });
    });

    it('handles database errors during message update', async () => {
      const existingMessage = {
        id: messageId,
        senderId: validUser.userId,
      };
      
      const dbError = new Error('Update failed');
      mockPrisma.message.findUnique.mockResolvedValueOnce(existingMessage);
      mockPrisma.message.update.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .patch(`/api/messages/${messageId}`)
        .set('Cookie', `auth_token=${validToken}`)
        .send(updateData);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error while editing message');
      expect(console.error).toHaveBeenCalledWith('[Message Edit Error]', dbError);
    });
  });

  describe('DELETE /api/messages/:id - Delete Message', () => {
    const messageId = 'msg123';

    it('requires valid JWT authentication', async () => {
      const response = await request(app)
        .delete(`/api/messages/${messageId}`);

      expect(response.status).toBe(401);
    });

    it('only allows sender to delete their own messages', async () => {
      mockPrisma.message.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .delete(`/api/messages/${messageId}`)
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Message not found');

      expect(mockPrisma.message.findUnique).toHaveBeenCalledWith({
        where: {
          id: messageId,
          senderId: validUser.userId,
          deleted: false,
        },
      });
    });

    it('successfully soft-deletes message for authorized sender', async () => {
      const existingMessage = {
        id: messageId,
        senderId: validUser.userId,
        deleted: false,
      };
      
      const deletedMessage = {
        id: messageId,
        deletedAt: new Date(),
      };

      mockPrisma.message.findUnique.mockResolvedValueOnce(existingMessage);
      mockPrisma.message.update.mockResolvedValueOnce(deletedMessage);

      const response = await request(app)
        .delete(`/api/messages/${messageId}`)
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        _id: messageId,
        deletedAt: expect.any(String), // Date is serialized as string in JSON
      });

      expect(mockPrisma.message.update).toHaveBeenCalledWith({
        where: { id: messageId },
        data: {
          deleted: true,
          deletedAt: expect.any(Date),
          ciphertext: '',
        },
      });
    });

    it('handles database errors during message deletion', async () => {
      const existingMessage = {
        id: messageId,
        senderId: validUser.userId,
        deleted: false,
      };
      
      const dbError = new Error('Delete failed');
      mockPrisma.message.findUnique.mockResolvedValueOnce(existingMessage);
      mockPrisma.message.update.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .delete(`/api/messages/${messageId}`)
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error while deleting message');
      expect(console.error).toHaveBeenCalledWith('[Message Delete Error]', dbError);
    });
  });

  describe('PUT /api/messages/mark-read/:senderId - Mark Messages as Read', () => {
    const senderId = 'sender123';

    it('requires valid JWT authentication', async () => {
      const response = await request(app)
        .put(`/api/messages/mark-read/${senderId}`);

      expect(response.status).toBe(401);
    });

    it('successfully marks messages as read', async () => {
      const updateResult = { count: 3 };
      mockPrisma.message.updateMany.mockResolvedValueOnce(updateResult);

      const response = await request(app)
        .put(`/api/messages/mark-read/${senderId}`)
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        message: 'Messages marked as read',
        count: 3,
      });

      expect(mockPrisma.message.updateMany).toHaveBeenCalledWith({
        where: {
          senderId,
          receiverId: validUser.userId,
          read: false,
          deleted: false,
        },
        data: {
          read: true,
        },
      });
    });

    it('handles no messages to update', async () => {
      const updateResult = { count: 0 };
      mockPrisma.message.updateMany.mockResolvedValueOnce(updateResult);

      const response = await request(app)
        .put(`/api/messages/mark-read/${senderId}`)
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(200);
      expect(response.body.count).toBe(0);
    });

    it('handles database errors during mark-read operation', async () => {
      const dbError = new Error('Update failed');
      mockPrisma.message.updateMany.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .put(`/api/messages/mark-read/${senderId}`)
        .set('Cookie', `auth_token=${validToken}`);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error while marking messages as read');
      expect(console.error).toHaveBeenCalledWith('[Mark Read Error]', dbError);
    });
  });

  describe('Security Edge Cases', () => {
    it('prevents message injection attacks', async () => {
      const maliciousMessage = {
        receiverId: otherUserId,
        ciphertext: 'legitimate-encrypted-content',
        maliciousField: '<script>alert("xss")</script>',
        __proto__: { isAdmin: true },
      };
      
      mockPrisma.message.create.mockResolvedValueOnce({
        id: 'msg123',
        senderId: validUser.userId,
        receiverId: otherUserId,
        ciphertext: maliciousMessage.ciphertext,
      });

      const response = await request(app)
        .post('/api/messages/send')
        .set('Cookie', `auth_token=${validToken}`)
        .send(maliciousMessage);

      expect(response.status).toBe(201);
      
      // Only expected fields should be passed to database
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          senderId: validUser.userId,
          receiverId: otherUserId,
          ciphertext: maliciousMessage.ciphertext,
        },
      });
    });

    it('handles concurrent message operations safely', async () => {
      mockPrisma.message.create.mockResolvedValue({
        id: 'msg123',
        senderId: validUser.userId,
        receiverId: otherUserId,
        ciphertext: 'test-message',
      });

      const requests = Array.from({ length: 5 }, (_, i) =>
        request(app)
          .post('/api/messages/send')
          .set('Cookie', `auth_token=${validToken}`)
          .send({
            receiverId: otherUserId,
            ciphertext: `encrypted-message-${i}`,
          }),
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(201);
      });

      expect(mockPrisma.message.create).toHaveBeenCalledTimes(5);
    });

    it('preserves encrypted content integrity', async () => {
      const binaryContent = '\x00\x01\x02\x03encrypted\xff\xfe\xfd';
      const messageWithBinary = {
        receiverId: otherUserId,
        ciphertext: binaryContent,
      };
      
      mockPrisma.message.create.mockResolvedValueOnce({
        id: 'msg123',
        senderId: validUser.userId,
        receiverId: otherUserId,
        ciphertext: binaryContent,
      });

      const response = await request(app)
        .post('/api/messages/send')
        .set('Cookie', `auth_token=${validToken}`)
        .send(messageWithBinary);

      expect(response.status).toBe(201);
      expect(mockPrisma.message.create).toHaveBeenCalledWith({
        data: {
          senderId: validUser.userId,
          receiverId: otherUserId,
          ciphertext: binaryContent,
        },
      });
    });
  });
});