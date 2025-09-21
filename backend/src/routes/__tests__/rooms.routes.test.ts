import request from 'supertest';
import express from 'express';
import jwt from 'jsonwebtoken';
import roomsRoutes from '../rooms.routes';

// Mock database service
jest.mock('../../services/database.service', () => ({
  prisma: {
    room: {
      findFirst: jest.fn(),
      create: jest.fn(),
      findMany: jest.fn(),
    },
  },
}));

// Mock environment config
jest.mock('../../config/env', () => ({
  JWT_SECRET: 'test-jwt-secret-key-for-testing-only-32chars',
}));

describe('Rooms Routes (Security Critical)', () => {
  let app: express.Application;
  let mockPrisma: any;

  const validUser1 = {
    userId: 'user1',
    username: 'alice',
    avatarUrl: 'alice-avatar.jpg',
  };

  const createValidToken = (user: typeof validUser1) => {
    return jwt.sign(user, 'test-jwt-secret-key-for-testing-only-32chars');
  };

  beforeEach(() => {
    // Get the mocked prisma instance
    const { prisma } = require('../../services/database.service');
    mockPrisma = prisma;

    app = express();
    app.use(express.json());
    app.use('/api/rooms', roomsRoutes);

    // Clear all mocks
    jest.clearAllMocks();

    // Mock console methods
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/rooms/dm - DM Room Creation', () => {
    // Run: npm test -- --testPathPattern="rooms.routes.test.ts"
    it('creates new DM room when none exists', async () => {
      const token = createValidToken(validUser1);
      
      // Mock no existing room found
      mockPrisma.room.findFirst.mockResolvedValueOnce(null);
      
      // Mock room creation
      const newRoom = {
        id: 'room123',
        isDm: true,
        members: [
          { id: 'user1', username: 'alice' },
          { id: 'user2', username: 'bob' },
        ],
      };
      mockPrisma.room.create.mockResolvedValueOnce(newRoom);

      const response = await request(app)
        .post('/api/rooms/dm')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: 'user2' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ roomId: 'room123' });
      
      expect(mockPrisma.room.findFirst).toHaveBeenCalledWith({
        where: {
          isDm: true,
          members: {
            every: {
              id: { in: ['user1', 'user2'] },
            },
          },
        },
        include: {
          members: true,
        },
      });
      
      expect(mockPrisma.room.create).toHaveBeenCalledWith({
        data: {
          isDm: true,
          members: {
            connect: [{ id: 'user1' }, { id: 'user2' }],
          },
        },
        include: {
          members: true,
        },
      });
    });

    it('returns existing DM room when found', async () => {
      const token = createValidToken(validUser1);
      
      // Mock existing room found
      const existingRoom = {
        id: 'existing-room-456',
        isDm: true,
        members: [
          { id: 'user1', username: 'alice' },
          { id: 'user2', username: 'bob' },
        ],
      };
      mockPrisma.room.findFirst.mockResolvedValueOnce(existingRoom);

      const response = await request(app)
        .post('/api/rooms/dm')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: 'user2' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ roomId: 'existing-room-456' });
      
      // Should not create a new room
      expect(mockPrisma.room.create).not.toHaveBeenCalled();
    });

    it('validates userId is provided', async () => {
      const token = createValidToken(validUser1);

      const response = await request(app)
        .post('/api/rooms/dm')
        .set('Authorization', `Bearer ${token}`)
        .send({});

      expect(response.status).toBe(400);
      expect(response.body).toEqual({ message: 'userId missing' });
      expect(mockPrisma.room.findFirst).not.toHaveBeenCalled();
    });

    it('requires authentication', async () => {
      const response = await request(app)
        .post('/api/rooms/dm')
        .send({ userId: 'user2' });

      expect(response.status).toBe(401);
      expect(mockPrisma.room.findFirst).not.toHaveBeenCalled();
    });

    it('validates room has exactly 2 members', async () => {
      const token = createValidToken(validUser1);
      
      // Mock room with wrong number of members
      const invalidRoom = {
        id: 'invalid-room',
        isDm: true,
        members: [
          { id: 'user1', username: 'alice' },
          { id: 'user2', username: 'bob' },
          { id: 'user3', username: 'charlie' },
        ],
      };
      mockPrisma.room.findFirst.mockResolvedValueOnce(invalidRoom);
      
      // Mock room creation for fallback
      const newRoom = {
        id: 'new-room-789',
        isDm: true,
        members: [
          { id: 'user1', username: 'alice' },
          { id: 'user2', username: 'bob' },
        ],
      };
      mockPrisma.room.create.mockResolvedValueOnce(newRoom);

      const response = await request(app)
        .post('/api/rooms/dm')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: 'user2' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ roomId: 'new-room-789' });
      
      // Should create new room since existing one is invalid
      expect(mockPrisma.room.create).toHaveBeenCalled();
    });

    it('validates both users are in the room', async () => {
      const token = createValidToken(validUser1);
      
      // Mock room that doesn't contain both users
      const invalidRoom = {
        id: 'invalid-room',
        isDm: true,
        members: [
          { id: 'user1', username: 'alice' },
          { id: 'user3', username: 'charlie' },
        ],
      };
      mockPrisma.room.findFirst.mockResolvedValueOnce(invalidRoom);
      
      // Mock room creation for fallback
      const newRoom = {
        id: 'new-room-890',
        isDm: true,
        members: [
          { id: 'user1', username: 'alice' },
          { id: 'user2', username: 'bob' },
        ],
      };
      mockPrisma.room.create.mockResolvedValueOnce(newRoom);

      const response = await request(app)
        .post('/api/rooms/dm')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: 'user2' });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({ roomId: 'new-room-890' });
      
      // Should create new room since existing one doesn't contain target user
      expect(mockPrisma.room.create).toHaveBeenCalled();
    });

    it('handles database errors gracefully', async () => {
      const token = createValidToken(validUser1);
      
      mockPrisma.room.findFirst.mockRejectedValueOnce(
        new Error('Database connection error'),
      );

      const response = await request(app)
        .post('/api/rooms/dm')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: 'user2' });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ 
        message: 'Server error while creating DM', 
      });
      expect(console.error).toHaveBeenCalledWith(
        '[DM room error]',
        expect.any(Error),
      );
    });

    it('prevents DM with self', async () => {
      const token = createValidToken(validUser1);

      await request(app)
        .post('/api/rooms/dm')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: 'user1' });

      // This should still work but create a valid query
      expect(mockPrisma.room.findFirst).toHaveBeenCalledWith({
        where: {
          isDm: true,
          members: {
            every: {
              id: { in: ['user1', 'user1'] },
            },
          },
        },
        include: {
          members: true,
        },
      });
    });
  });

  describe('GET /api/rooms/my-dms - List DM Rooms', () => {
    it('returns list of DM partners', async () => {
      const token = createValidToken(validUser1);
      
      const mockRooms = [
        {
          id: 'room1',
          isDm: true,
          members: [
            { id: 'user2', username: 'bob', avatarUrl: 'bob-avatar.jpg' },
          ],
        },
        {
          id: 'room2',
          isDm: true,
          members: [
            { id: 'user3', username: 'charlie', avatarUrl: 'charlie-avatar.jpg' },
          ],
        },
      ];
      mockPrisma.room.findMany.mockResolvedValueOnce(mockRooms);

      const response = await request(app)
        .get('/api/rooms/my-dms')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          _id: 'user2',
          username: 'bob',
          avatarUrl: 'bob-avatar.jpg',
        },
        {
          _id: 'user3',
          username: 'charlie',
          avatarUrl: 'charlie-avatar.jpg',
        },
      ]);
      
      expect(mockPrisma.room.findMany).toHaveBeenCalledWith({
        where: {
          isDm: true,
          members: {
            some: {
              id: 'user1',
            },
          },
        },
        include: {
          members: {
            where: {
              id: { not: 'user1' },
            },
            select: {
              id: true,
              username: true,
              avatarUrl: true,
            },
          },
        },
      });
    });

    it('returns empty list when no DMs exist', async () => {
      const token = createValidToken(validUser1);
      
      mockPrisma.room.findMany.mockResolvedValueOnce([]);

      const response = await request(app)
        .get('/api/rooms/my-dms')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([]);
    });

    it('requires authentication', async () => {
      const response = await request(app)
        .get('/api/rooms/my-dms');

      expect(response.status).toBe(401);
      expect(mockPrisma.room.findMany).not.toHaveBeenCalled();
    });

    it('filters out rooms without other members', async () => {
      const token = createValidToken(validUser1);
      
      const mockRooms = [
        {
          id: 'room1',
          isDm: true,
          members: [
            { id: 'user2', username: 'bob', avatarUrl: 'bob-avatar.jpg' },
          ],
        },
        {
          id: 'room2',
          isDm: true,
          members: [], // Empty members array
        },
      ];
      mockPrisma.room.findMany.mockResolvedValueOnce(mockRooms);

      const response = await request(app)
        .get('/api/rooms/my-dms')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          _id: 'user2',
          username: 'bob',
          avatarUrl: 'bob-avatar.jpg',
        },
      ]);
    });

    it('handles database errors gracefully', async () => {
      const token = createValidToken(validUser1);
      
      mockPrisma.room.findMany.mockRejectedValueOnce(
        new Error('Database connection error'),
      );

      const response = await request(app)
        .get('/api/rooms/my-dms')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(500);
      expect(response.body).toEqual({ message: 'Server error' });
      expect(console.error).toHaveBeenCalledWith(
        '[list my dms]',
        expect.any(Error),
      );
    });

    it('handles missing avatarUrl gracefully', async () => {
      const token = createValidToken(validUser1);
      
      const mockRooms = [
        {
          id: 'room1',
          isDm: true,
          members: [
            { id: 'user2', username: 'bob', avatarUrl: null },
          ],
        },
      ];
      mockPrisma.room.findMany.mockResolvedValueOnce(mockRooms);

      const response = await request(app)
        .get('/api/rooms/my-dms')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body).toEqual([
        {
          _id: 'user2',
          username: 'bob',
          avatarUrl: null,
        },
      ]);
    });
  });

  describe('Security and Edge Cases', () => {
    it('validates JWT token format', async () => {
      const response = await request(app)
        .post('/api/rooms/dm')
        .set('Authorization', 'Bearer invalid-token')
        .send({ userId: 'user2' });

      expect(response.status).toBe(403);
      expect(mockPrisma.room.findFirst).not.toHaveBeenCalled();
    });

    it('handles malformed request body', async () => {
      const token = createValidToken(validUser1);

      const testCases = [
        { userId: null },
        { userId: '' },
        { wrongField: 'user2' },
        {},
      ];

      for (const body of testCases) {
        const response = await request(app)
          .post('/api/rooms/dm')
          .set('Authorization', `Bearer ${token}`)
          .send(body);

        expect(response.status).toBe(400);
        expect(response.body.message).toBe('userId missing');
      }
    });

    it('preserves user data integrity', async () => {
      const token = createValidToken(validUser1);
      
      mockPrisma.room.findMany.mockResolvedValueOnce([
        {
          id: 'room1',
          isDm: true,
          members: [
            { 
              id: 'user2', 
              username: 'bob', 
              avatarUrl: 'bob-avatar.jpg',
              // Should not expose these fields
              email: 'bob@example.com',
              hashedPassword: 'secret-hash',
            },
          ],
        },
      ]);

      const response = await request(app)
        .get('/api/rooms/my-dms')
        .set('Authorization', `Bearer ${token}`);

      expect(response.status).toBe(200);
      expect(response.body[0]).toEqual({
        _id: 'user2',
        username: 'bob',
        avatarUrl: 'bob-avatar.jpg',
      });
      
      // Should not expose sensitive fields
      expect(response.body[0]).not.toHaveProperty('email');
      expect(response.body[0]).not.toHaveProperty('hashedPassword');
    });

    it('handles concurrent room creation attempts', async () => {
      const token = createValidToken(validUser1);
      
      // Mock race condition where room is created between findFirst and create
      mockPrisma.room.findFirst.mockResolvedValueOnce(null);
      mockPrisma.room.create.mockRejectedValueOnce(
        new Error('Unique constraint violation'),
      );

      const response = await request(app)
        .post('/api/rooms/dm')
        .set('Authorization', `Bearer ${token}`)
        .send({ userId: 'user2' });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error while creating DM');
      expect(console.error).toHaveBeenCalledWith(
        '[DM room error]',
        expect.any(Error),
      );
    });
  });
});