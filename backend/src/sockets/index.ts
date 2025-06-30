import {Server, Socket} from 'socket.io';
import jwt from 'jsonwebtoken';
import Message from '../models/Message';
import env from '../config/env';

type JwtPayload = {
  userId: string;
  username: string;
  avatarUrl: string;
};

// Enhanced connection tracking with better stability
const userSockets = new Map<string, Set<string>>();
const socketToUser = new Map<string, string>();
const offlineTimers = new Map<string, NodeJS.Timeout>();

// Event queue for disconnected users
const eventQueue = new Map<
  string,
  Array<{
    type: string;
    data: any;
    timestamp: number;
  }>
>();

const OFFLINE_DELAY_MS = env.OFFLINE_DELAY_MS || 15000;
const EVENT_QUEUE_TTL = 30000; // 30 seconds to replay events
const MAX_QUEUED_EVENTS = 50; // Prevent memory leaks

// Helper to get primary socket for user (most recent connection)
const getSocketId = (uid: string): string | undefined => {
  const sockets = userSockets.get(uid);
  if (!sockets || sockets.size === 0) return undefined;

  // Return the most recently added socket (last in Set)
  return [...sockets].pop();
};

// Queue events for offline users
const queueEventForUser = (userId: string, eventType: string, data: any) => {
  if (!eventQueue.has(userId)) {
    eventQueue.set(userId, []);
  }

  const queue = eventQueue.get(userId)!;
  queue.push({
    type: eventType,
    data,
    timestamp: Date.now(),
  });

  // Limit queue size
  if (queue.length > MAX_QUEUED_EVENTS) {
    queue.shift(); // Remove oldest event
  }

  console.log(`📬 Queued ${eventType} event for offline user ${userId}`);
};

// Replay queued events when user reconnects
const replayQueuedEvents = (socket: Socket, userId: string) => {
  const queue = eventQueue.get(userId);
  if (!queue || queue.length === 0) return;

  const now = Date.now();
  const validEvents = queue.filter(
    (event) => now - event.timestamp < EVENT_QUEUE_TTL
  );

  console.log(
    `🔄 Replaying ${validEvents.length} queued events for user ${userId}`
  );

  validEvents.forEach((event) => {
    socket.emit(event.type, event.data);
  });

  // Clear queue after replay
  eventQueue.delete(userId);
};

// Enhanced socket emission with queueing fallback
const emitToUser = (
  io: Server,
  userId: string,
  eventType: string,
  data: any
) => {
  const socketId = getSocketId(userId);

  if (socketId) {
    console.log(
      `📤 Emitting ${eventType} to user ${userId} via socket ${socketId}`
    );
    io.to(socketId).emit(eventType, data);
    return true;
  } else {
    console.log(`📭 User ${userId} offline, queueing ${eventType} event`);
    queueEventForUser(userId, eventType, data);
    return false;
  }
};

export const setupSocket = (io: Server) => {
  // Enhanced authentication middleware (now using cookies)
  io.use((socket: Socket, next) => {
    // First try to get token from auth.token (backward compatibility)
    let token = socket.handshake.auth.token as string | undefined;
    
    // If no token in auth, try to get from cookies
    if (!token) {
      const cookies = socket.handshake.headers.cookie;
      if (cookies) {
        const cookiePairs = cookies.split(';');
        for (const cookie of cookiePairs) {
          const [name, value] = cookie.trim().split('=');
          if (name === 'auth_token') {
            token = value;
            break;
          }
        }
      }
    }

    if (!token) {
      console.error('❌ Socket auth failed: No token in auth or cookies');
      return next(new Error('Authentication token missing'));
    }

    try {
      const {userId, username, avatarUrl} = jwt.verify(
        token,
        env.JWT_SECRET
      ) as JwtPayload;

      socket.data.userId = userId;
      socket.data.username = username;
      socket.data.avatarUrl = avatarUrl;

      console.log(`✅ Socket authenticated: ${username} (${userId})`);
      next();
    } catch (err) {
      console.error('❌ Socket auth failed:', err);
      next(new Error('Invalid token'));
    }
  });

  io.on('connection', (socket: Socket) => {
    const userId = socket.data.userId as string;
    const username = socket.data.username as string;

    console.log(`🔌 Socket ${socket.id} connected → ${username} (${userId})`);

    // Enhanced connection tracking
    if (!userSockets.has(userId)) {
      userSockets.set(userId, new Set());
    }
    userSockets.get(userId)!.add(socket.id);
    socketToUser.set(socket.id, userId);

    // Cancel offline timer if exists
    if (offlineTimers.has(userId)) {
      console.log(`⏰ Cancelling offline timer for ${username}`);
      clearTimeout(offlineTimers.get(userId)!);
      offlineTimers.delete(userId);
    }

    // Replay any queued events
    replayQueuedEvents(socket, userId);

    // Send current online users to the new connection
    const currentOnlineUsers = [...userSockets.keys()];
    console.log(`📤 Sending online users to ${username}:`, currentOnlineUsers);
    socket.emit('online-users', {userIds: currentOnlineUsers});

    // Broadcast user online (only if they weren't already online)
    if (userSockets.get(userId)!.size === 1) {
      console.log(
        `📢 Broadcasting that ${username} is online to all other users`
      );
      socket.broadcast.emit('user-online', {userId, username});
    } else {
      console.log(
        `👤 ${username} already had connections, not broadcasting online status`
      );
    }

    // Enhanced message handling with better error recovery
    socket.on(
      'send-message',
      async ({
        toUserId,
        ciphertext,
        avatarUrl,
      }: {
        toUserId: string;
        ciphertext: string;
        avatarUrl?: string;
      }) => {
        try {
          console.log(`💬 ${username} sending message to ${toUserId}`);

          const messageData = {
            senderId: userId,
            receiverId: toUserId,
            ciphertext,
            avatarUrl: avatarUrl ?? socket.data.avatarUrl,
          };

          const saved = await Message.create(messageData);
          const timestamp = saved.timestamp || saved.createdAt;

          console.log('[Socket] Message saved:', {
            id: saved._id,
            timestamp: timestamp,
          });

          // Always acknowledge to sender first
          socket.emit('message-sent', {
            messageId: saved._id,
            timestamp: timestamp,
          });

          // Enhanced recipient delivery with fallback
          const delivered = emitToUser(io, toUserId, 'receive-message', {
            fromUserId: userId,
            fromUsername: username,
            avatarUrl: avatarUrl ?? socket.data.avatarUrl,
            ciphertext,
            messageId: saved._id,
            timestamp: timestamp,
          });

          if (!delivered) {
            console.log(`📭 Message queued for offline user ${toUserId}`);
          }
        } catch (err) {
          console.error('[Socket] send-message error:', err);
          socket.emit('message-error', {
            error: 'Failed to send message',
            details: err instanceof Error ? err.message : 'Unknown error',
          });
        }
      }
    );

    // Enhanced typing indicator with better delivery
    socket.on('typing', ({toUserId}: {toUserId: string}) => {
      console.log(`⌨️ ${username} is typing to ${toUserId}`);

      // Don't queue typing events (they're ephemeral)
      const socketId = getSocketId(toUserId);
      if (socketId) {
        io.to(socketId).emit('typing', {
          fromUserId: userId,
          fromUsername: username,
        });
      } else {
        console.log(`⌨️ User ${toUserId} offline, skipping typing indicator`);
      }
    });

    // Enhanced read receipts
    socket.on('read-message', async ({messageId}: {messageId: string}) => {
      try {
        const updated = await Message.findByIdAndUpdate(
          messageId,
          {read: true, readAt: new Date()},
          {new: true}
        );

        if (updated) {
          const senderId = updated.senderId.toString();
          emitToUser(io, senderId, 'message-read', {messageId});
        }
      } catch (err) {
        console.error('[Socket] read-message error:', err);
      }
    });

    // Enhanced edit-message with better synchronization
    socket.on(
      'edit-message',
      async ({
        messageId,
        ciphertext,
        avatarUrl,
      }: {
        messageId: string;
        ciphertext: string;
        avatarUrl?: string;
      }) => {
        try {
          const updated = await Message.findOneAndUpdate(
            {_id: messageId, senderId: userId},
            {ciphertext, avatarUrl, editedAt: new Date()},
            {new: true}
          );

          if (!updated) {
            socket.emit('message-error', {
              error: 'Message not found or permission denied',
            });
            return;
          }

          const eventData = {
            messageId: updated._id,
            ciphertext: updated.ciphertext,
            editedAt: updated.editedAt,
            avatarUrl: updated.avatarUrl,
          };

          // Always update sender immediately
          socket.emit('message-edited', eventData);

          // Send to recipient with queueing
          const receiverId = updated.receiverId.toString();
          emitToUser(io, receiverId, 'message-edited', eventData);
        } catch (err) {
          console.error('[Socket] edit-message error:', err);
          socket.emit('message-error', {
            error: 'Failed to edit message',
          });
        }
      }
    );

    // Enhanced delete-message with better synchronization
    socket.on('delete-message', async ({messageId}: {messageId: string}) => {
      try {
        const msg = await Message.findOneAndUpdate(
          {_id: messageId, senderId: userId},
          {deleted: true, deletedAt: new Date(), ciphertext: ''},
          {new: true}
        );

        if (!msg) {
          socket.emit('message-error', {
            error: 'Message not found or permission denied',
          });
          return;
        }

        const eventData = {
          messageId: msg._id,
          deletedAt: msg.deletedAt,
        };

        // Always update sender immediately
        socket.emit('message-deleted', eventData);

        // Send to recipient with queueing
        const receiverId = msg.receiverId.toString();
        emitToUser(io, receiverId, 'message-deleted', eventData);
      } catch (err) {
        console.error('[Socket] delete-message error:', err);
        socket.emit('message-error', {
          error: 'Failed to delete message',
        });
      }
    });

    // Enhanced disconnect handling
    socket.on('disconnect', (reason) => {
      console.log(
        `❌ Socket ${socket.id} disconnected (user ${username}), reason: ${reason}`
      );

      // Clean up socket tracking
      socketToUser.delete(socket.id);

      const userSocketSet = userSockets.get(userId);
      if (userSocketSet) {
        userSocketSet.delete(socket.id);

        if (userSocketSet.size === 0) {
          console.log(
            `👤 ${username} has no more active connections, starting offline timer`
          );
          userSockets.delete(userId);

          const offlineTimer = setTimeout(() => {
            console.log(`🛑 User ${username} considered offline after timeout`);
            // FIXED: Emit to all clients that user went offline
            socket.broadcast.emit('user-offline', {userId});
            console.log(
              `📢 Broadcasted that ${username} (${userId}) is offline`
            );
            offlineTimers.delete(userId);

            // Clean up old queued events
            const queue = eventQueue.get(userId);
            if (queue) {
              const now = Date.now();
              const validEvents = queue.filter(
                (event) => now - event.timestamp < EVENT_QUEUE_TTL
              );

              if (validEvents.length === 0) {
                eventQueue.delete(userId);
              } else {
                eventQueue.set(userId, validEvents);
              }
            }
          }, OFFLINE_DELAY_MS);

          offlineTimers.set(userId, offlineTimer);
        } else {
          console.log(
            `👤 ${username} still has ${userSocketSet.size} active connection(s)`
          );
        }
      }
    });

    // Add connection health check
    socket.on('ping', () => {
      socket.emit('pong');
    });
  });

  // Enhanced monitoring for development
  if (process.env.NODE_ENV === 'development') {
    setInterval(() => {
      console.log(`📊 Current connections: ${userSockets.size} users online`);
      console.log(`📬 Queued events for ${eventQueue.size} offline users`);
      console.log(`⏰ Active offline timers: ${offlineTimers.size}`);

      for (const [userId, sockets] of userSockets.entries()) {
        console.log(`  - User ${userId}: ${sockets.size} socket(s)`);
      }

      // Log offline timers for debugging
      for (const [userId, timer] of offlineTimers.entries()) {
        console.log(`  - Offline timer for user ${userId}`);
      }
    }, 30000);
  }
};
