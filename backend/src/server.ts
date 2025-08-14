import http from 'http';
import { Server } from 'socket.io';
import { connectDatabase, disconnectDatabase } from './services/database.service';
import app from './app';
import { setupSocket } from './sockets';
import env from './config/env';

// Static file serving is now handled in app.ts - remove from here to avoid conflicts

// Health check endpoint is defined in app.ts

const server = http.createServer(app);

import { socketCorsOptions } from './config/cors';
const io = new Server(server, {
  ...socketCorsOptions,
  // Additional stability configurations
  transports: ['websocket', 'polling'],
  allowEIO3: true,

  // Connection timeout and ping settings for better stability
  pingTimeout: 60000, // 60 seconds - how long to wait for a ping response
  pingInterval: 25000, // 25 seconds - how often to send ping packets
  upgradeTimeout: 30000, // 30 seconds - how long to wait for transport upgrade

  // Enhanced connection handling
  maxHttpBufferSize: 1e6, // 1MB max buffer size

  // Connection state recovery for better reliability
  connectionStateRecovery: {
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    skipMiddlewares: true,
  },

  // Enhanced error handling
  allowRequest: (req, callback) => {
    // Additional request validation can be added here
    callback(null, true);
  },
});

// Enhanced server monitoring and logging
io.engine.on('connection_error', err => {
  console.error('❌ Socket.IO connection error:', {
    req: err.req?.url,
    code: err.code,
    message: err.message,
    context: err.context,
  });
});

// Handle socket connections
io.on('connection', socket => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🔌 New socket connection: ${socket.id}`);
  }

  socket.on('disconnect', reason => {
    if (process.env.NODE_ENV === 'development') {
      console.log(`❌ Socket ${socket.id} disconnected: ${reason}`);
    }
  });
});

// Register the enhanced socket event handlers
setupSocket(io);

// Export socket.io instance for use in routes
export { io };

// Start server immediately, connect to database asynchronously
server.listen(env.PORT, () => {
  if (process.env.NODE_ENV === 'development') {
    console.log(`🚀 Server running on http://localhost:${env.PORT}`);
    console.log(`🏠 Landing: http://localhost:${env.PORT}/`);
    console.log(`💬 Chat App: http://localhost:${env.PORT}/app`);
    console.log(`🛠️  API: http://localhost:${env.PORT}/api`);
    console.log('📡 Socket.IO transports: websocket, polling');
    console.log(`⏰ Ping interval: ${25000}ms, timeout: ${60000}ms`);
    console.log('🔧 Development mode - enhanced logging enabled');
  }

  // Connect to database after server starts
  connectDatabase()
    .then(() => {
      // Database connected successfully
    })
    .catch(err => {
      console.error('❌ DB connection failed:', err);
      console.error('⚠️  Server running without database connection');
    });
});

// Enhanced server error handling
server.on('error', err => {
  console.error('❌ Server error:', err);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  if (process.env.NODE_ENV === 'development') {
    console.log('⚠️ SIGTERM received, shutting down gracefully...');
  }

  server.close(async () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ HTTP server closed');
    }

    try {
      await disconnectDatabase();
      // eslint-disable-next-line no-process-exit
      process.exit(0);
    } catch (err) {
      console.error('❌ Error closing database connection:', err);
      // eslint-disable-next-line no-process-exit
      process.exit(1);
    }
  });
});

process.on('SIGINT', () => {
  if (process.env.NODE_ENV === 'development') {
    console.log('⚠️ SIGINT received, shutting down gracefully...');
  }

  server.close(async () => {
    if (process.env.NODE_ENV === 'development') {
      console.log('✅ HTTP server closed');
    }

    try {
      await disconnectDatabase();
      // eslint-disable-next-line no-process-exit
      process.exit(0);
    } catch (err) {
      console.error('❌ Error closing database connection:', err);
      // eslint-disable-next-line no-process-exit
      process.exit(1);
    }
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', err => {
  console.error('❌ Uncaught Exception:', err);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  // eslint-disable-next-line no-process-exit
  process.exit(1);
});
