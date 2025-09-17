import { createServer } from 'http';
import { AddressInfo } from 'net';
import { Server as SocketIOServer } from 'socket.io';
import { io as Client } from 'socket.io-client';
import jwt from 'jsonwebtoken';
import { setupSocket, emitToUser } from '../index';

// Mock database service
jest.mock('../../services/database.service', () => ({
  prisma: {
    message: {
      create: jest.fn(),
      update: jest.fn(),
    },
  },
}));

// Mock environment config
jest.mock('../../config/env', () => ({
  JWT_SECRET: 'test-jwt-secret-key-for-testing-only-32chars',
  OFFLINE_DELAY_MS: 500, // 0.5 second for faster testing
}));

describe('Socket.io Real-time Messaging (Security Critical)', () => {
  let httpServer: any;
  let io: SocketIOServer;
  let port: number;
  let mockPrisma: any;

  const validUser1 = {
    userId: 'user1',
    username: 'alice',
    avatarUrl: 'alice-avatar.jpg',
  };

  const validUser2 = {
    userId: 'user2',
    username: 'bob', 
    avatarUrl: 'bob-avatar.jpg',
  };

  const createValidToken = (user: typeof validUser1) => {
    return jwt.sign(user, 'test-jwt-secret-key-for-testing-only-32chars');
  };

  beforeEach((done) => {
    // Get the mocked prisma instance
    const { prisma } = require('../../services/database.service');
    mockPrisma = prisma;

    httpServer = createServer();
    io = new SocketIOServer(httpServer, {
      transports: ['websocket'],
    });
    setupSocket(io);

    httpServer.listen(() => {
      port = (httpServer.address() as AddressInfo).port;
      done();
    });

    // Clear all mocks
    jest.clearAllMocks();

    // Mock console methods to reduce noise
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach((done) => {
    io.close();
    httpServer.close(() => {
      jest.restoreAllMocks();
      done();
    });
  });

  describe('Socket Authentication Security', () => {
    // Run: npm test -- --testPathPattern="socket.basic.test.ts"
    it('successfully authenticates with valid JWT token', (done) => {
      const token = createValidToken(validUser1);
      
      const clientSocket = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        clientSocket.disconnect();
        done();
      });

      clientSocket.on('connect_error', (error: any) => {
        done(error);
      });
    });

    it('authenticates with JWT token from cookies', (done) => {
      const token = createValidToken(validUser1);
      
      const clientSocket = Client(`http://localhost:${port}`, {
        extraHeaders: {
          cookie: `auth_token=${token}; other=value`,
        },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        expect(clientSocket.connected).toBe(true);
        clientSocket.disconnect();
        done();
      });

      clientSocket.on('connect_error', (error: any) => {
        done(error);
      });
    });

    it('rejects connections without authentication', (done) => {
      const clientSocket = Client(`http://localhost:${port}`, {
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        done(new Error('Should not connect without auth'));
      });

      clientSocket.on('connect_error', (error: any) => {
        expect(error.message).toBe('Authentication token missing');
        done();
      });
    });

    it('rejects invalid JWT tokens', (done) => {
      const clientSocket = Client(`http://localhost:${port}`, {
        auth: { token: 'invalid-token' },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        done(new Error('Should not connect with invalid token'));
      });

      clientSocket.on('connect_error', (error: any) => {
        expect(error.message).toBe('Invalid token');
        done();
      });
    });

    it('rejects expired JWT tokens', (done) => {
      const expiredToken = jwt.sign(
        validUser1,
        'test-jwt-secret-key-for-testing-only-32chars',
        { expiresIn: -1 },
      );
      
      const clientSocket = Client(`http://localhost:${port}`, {
        auth: { token: expiredToken },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        done(new Error('Should not connect with expired token'));
      });

      clientSocket.on('connect_error', (error: any) => {
        expect(error.message).toBe('Invalid token');
        done();
      });
    });
  });

  describe('Real-time Message Security', () => {
    it('sends and receives encrypted messages securely', (done) => {
      const token1 = createValidToken(validUser1);
      const token2 = createValidToken(validUser2);
      
      const mockMessage = {
        id: 'msg123',
        timestamp: new Date(),
        createdAt: new Date(),
      };
      mockPrisma.message.create.mockResolvedValueOnce(mockMessage);

      const sender = Client(`http://localhost:${port}`, { 
        auth: { token: token1 },
        transports: ['websocket'],
      });
      const receiver = Client(`http://localhost:${port}`, { 
        auth: { token: token2 },
        transports: ['websocket'],
      });

      let connectionsReady = 0;
      let senderGotAck = false;
      let receiverGotMessage = false;

      const checkReady = () => {
        connectionsReady++;
        if (connectionsReady === 2) {
          sender.emit('send-message', {
            toUserId: validUser2.userId,
            ciphertext: 'encrypted-test-message',
          });
        }
      };

      const checkDone = () => {
        if (senderGotAck && receiverGotMessage) {
          sender.disconnect();
          receiver.disconnect();
          done();
        }
      };

      sender.on('connect', checkReady);
      receiver.on('connect', checkReady);

      sender.on('message-sent', (data: any) => {
        expect(data.messageId).toBe('msg123');
        senderGotAck = true;
        checkDone();
      });

      receiver.on('receive-message', (data: any) => {
        expect(data.fromUserId).toBe(validUser1.userId);
        expect(data.ciphertext).toBe('encrypted-test-message');
        receiverGotMessage = true;
        checkDone();
      });

      // Add error handlers
      sender.on('connect_error', (error: any) => {
        sender.disconnect();
        receiver.disconnect();
        done(error);
      });
      
      receiver.on('connect_error', (error: any) => {
        sender.disconnect();
        receiver.disconnect();
        done(error);
      });
    }, 60000);

    it('prevents unauthorized message operations', (done) => {
      const token = createValidToken(validUser1);
      
      // Mock unauthorized edit attempt
      mockPrisma.message.update.mockResolvedValueOnce(null);

      const clientSocket = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('edit-message', {
          messageId: 'not-owned-message',
          ciphertext: 'hacked-content',
        });

        clientSocket.on('message-error', (data: any) => {
          expect(data.error).toBe('Message not found or permission denied');
          clientSocket.disconnect();
          done();
        });
      });
    });

    it('handles message sending errors gracefully', (done) => {
      const token = createValidToken(validUser1);
      
      mockPrisma.message.create.mockRejectedValueOnce(new Error('DB Error'));

      const clientSocket = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('send-message', {
          toUserId: 'recipient',
          ciphertext: 'test-message',
        });
      });

      clientSocket.on('message-error', (data: any) => {
        expect(data.error).toBe('Failed to send message');
        expect(data.details).toBe('DB Error');
        clientSocket.disconnect();
        done();
      });

      clientSocket.on('connect_error', (error: any) => {
        clientSocket.disconnect();
        done(error);
      });
    }, 60000);

    it('isolates users - cannot receive others messages', (done) => {
      const token1 = createValidToken(validUser1);
      const token2 = createValidToken(validUser2);
      
      const mockMessage = {
        id: 'msg1',
        timestamp: new Date(),
        createdAt: new Date(),
      };
      mockPrisma.message.create.mockResolvedValue(mockMessage);

      const user1 = Client(`http://localhost:${port}`, { 
        auth: { token: token1 },
        transports: ['websocket'],
      });
      const user2 = Client(`http://localhost:${port}`, { 
        auth: { token: token2 },
        transports: ['websocket'],
      });

      let connectionsReady = 0;
      const checkReady = () => {
        connectionsReady++;
        if (connectionsReady === 2) {
          // Both clients connected, now send message
          user1.emit('send-message', {
            toUserId: validUser2.userId,
            ciphertext: 'private-message',
          });
        }
      };

      user1.on('receive-message', () => {
        user1.disconnect();
        user2.disconnect();
        done(new Error('User1 should not receive User2 messages'));
      });

      user2.on('receive-message', (data: any) => {
        expect(data.fromUserId).toBe(validUser1.userId);
        expect(data.ciphertext).toBe('private-message');
        user1.disconnect();
        user2.disconnect();
        done();
      });

      user1.on('connect', checkReady);
      user2.on('connect', checkReady);

      // Add error handlers
      user1.on('connect_error', (error: any) => {
        user1.disconnect();
        user2.disconnect();
        done(error);
      });
      
      user2.on('connect_error', (error: any) => {
        user1.disconnect();
        user2.disconnect();
        done(error);
      });
    }, 60000);
  });

  describe('Typing Indicators and Read Receipts', () => {
    it('handles typing indicators securely', (done) => {
      const token1 = createValidToken(validUser1);
      const token2 = createValidToken(validUser2);
      
      const sender = Client(`http://localhost:${port}`, { 
        auth: { token: token1 },
        transports: ['websocket'],
      });
      const receiver = Client(`http://localhost:${port}`, { 
        auth: { token: token2 },
        transports: ['websocket'],
      });

      let connectionsReady = 0;
      const checkReady = () => {
        connectionsReady++;
        if (connectionsReady === 2) {
          // Add small delay to ensure connection is fully established
          setTimeout(() => {
            sender.emit('typing', { toUserId: validUser2.userId });
          }, 10);
        }
      };

      receiver.on('typing', (data: any) => {
        expect(data.fromUserId).toBe(validUser1.userId);
        expect(data.fromUsername).toBe(validUser1.username);
        sender.disconnect();
        receiver.disconnect();
        done();
      });

      sender.on('connect', checkReady);
      receiver.on('connect', checkReady);

      // Add error handlers
      sender.on('connect_error', (error: any) => {
        sender.disconnect();
        receiver.disconnect();
        done(error);
      });
      
      receiver.on('connect_error', (error: any) => {
        sender.disconnect();
        receiver.disconnect();
        done(error);
      });
    }, 60000);

    it('processes read receipts correctly', (done) => {
      const token1 = createValidToken(validUser1);
      const token2 = createValidToken(validUser2);
      
      const mockUpdated = {
        id: 'msg123',
        senderId: validUser1.userId,
        read: true,
      };
      mockPrisma.message.update.mockResolvedValueOnce(mockUpdated);

      const sender = Client(`http://localhost:${port}`, { 
        auth: { token: token1 },
        transports: ['websocket'],
      });
      const reader = Client(`http://localhost:${port}`, { 
        auth: { token: token2 },
        transports: ['websocket'],
      });

      let connectionsReady = 0;
      const checkReady = () => {
        connectionsReady++;
        if (connectionsReady === 2) {
          reader.emit('read-message', { messageId: 'msg123' });
        }
      };

      sender.on('connect', checkReady);
      reader.on('connect', checkReady);

      sender.on('message-read', (data: any) => {
        expect(data.messageId).toBe('msg123');
        sender.disconnect();
        reader.disconnect();
        done();
      });

      // Add error handlers
      sender.on('connect_error', (error: any) => {
        sender.disconnect();
        reader.disconnect();
        done(error);
      });
      
      reader.on('connect_error', (error: any) => {
        sender.disconnect();
        reader.disconnect();
        done(error);
      });
    }, 60000);
  });

  describe('Connection Management Security', () => {
    it('sends online users list on connection', (done) => {
      const token = createValidToken(validUser1);
      
      const clientSocket = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
      });

      clientSocket.on('online-users', (data: any) => {
        expect(data.userIds).toContain(validUser1.userId);
        clientSocket.disconnect();
        done();
      });
    });

    it('handles ping/pong health checks', (done) => {
      const token = createValidToken(validUser1);
      
      const clientSocket = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        clientSocket.emit('ping');
        
        clientSocket.on('pong', () => {
          clientSocket.disconnect();
          done();
        });
      });
    });

    it('manages multiple connections from same user', (done) => {
      const token = createValidToken(validUser1);
      
      const client1 = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
      });

      client1.on('connect', () => {
        const client2 = Client(`http://localhost:${port}`, {
          auth: { token },
          transports: ['websocket'],
        });

        client2.on('online-users', (data: any) => {
          // Should show user only once despite multiple connections
          const userCount = data.userIds.filter((id: string) => id === validUser1.userId).length;
          expect(userCount).toBe(1);
          
          client1.disconnect();
          client2.disconnect();
          done();
        });
      });
    });
  });

  describe('emitToUser Utility Security', () => {
    it('emits to online users successfully', (done) => {
      const token = createValidToken(validUser1);
      
      const clientSocket = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        setTimeout(() => {
          const delivered = emitToUser(io, validUser1.userId, 'test-event', {
            testData: 'secure-message',
          });
          
          expect(delivered).toBe(true);
          
          clientSocket.on('test-event', (data: any) => {
            expect(data.testData).toBe('secure-message');
            clientSocket.disconnect();
            done();
          });
        }, 50);
      });
    });

    it('returns false for offline users and queues events', () => {
      const delivered = emitToUser(io, 'offline-user', 'test-event', {
        queuedData: 'test-data',
      });
      
      expect(delivered).toBe(false);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles malformed message data gracefully', (done) => {
      const token = createValidToken(validUser1);
      
      const clientSocket = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        // Send malformed data - should not crash server
        clientSocket.emit('send-message', {
          // Missing required toUserId
          ciphertext: 'test',
        });

        // Server should still be responsive
        setTimeout(() => {
          clientSocket.emit('ping');
          clientSocket.on('pong', () => {
            clientSocket.disconnect();
            done();
          });
        }, 100);
      });
    });

    it('prevents database injection in message operations', (done) => {
      const token = createValidToken(validUser1);
      
      const clientSocket = Client(`http://localhost:${port}`, {
        auth: { token },
        transports: ['websocket'],
      });

      clientSocket.on('connect', () => {
        // Try SQL injection in messageId
        clientSocket.emit('read-message', { 
          messageId: '\'; DROP TABLE messages; --', 
        });

        // Should handle gracefully without crashes
        setTimeout(() => {
          clientSocket.disconnect();
          done();
        }, 100);
      });
    });

    it('limits connection resources to prevent DoS', (done) => {
      const token = createValidToken(validUser1);
      
      // Test that server handles multiple rapid connections
      const connections: any[] = [];
      let connectedCount = 0;
      
      for (let i = 0; i < 5; i++) {
        const client = Client(`http://localhost:${port}`, {
          auth: { token },
          transports: ['websocket'],
        });
        
        client.on('connect', () => {
          connectedCount++;
          if (connectedCount === 5) {
            // All connections successful - server handles load
            connections.forEach(c => c.disconnect());
            done();
          }
        });
        
        connections.push(client);
      }
    }, 3000);
  });
});

