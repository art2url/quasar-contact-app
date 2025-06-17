import http from 'http';
import {Server} from 'socket.io';
import mongoose from 'mongoose';
import path from 'path';
import express from 'express';
import app from './app';
import {setupSocket} from './sockets';
import env from './config/env';

// Static file serving is now handled in app.ts - remove from here to avoid conflicts

// Health check endpoint (this might be duplicate - check app.ts)
app.get('/health', (req, res) => {
  res.json({status: 'OK', timestamp: new Date().toISOString()});
});

const server = http.createServer(app);

import {socketCorsOptions} from './config/cors';
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
io.engine.on('connection_error', (err) => {
  console.error('❌ Socket.IO connection error:', {
    req: err.req?.url,
    code: err.code,
    message: err.message,
    context: err.context,
  });
});

// Monitor socket connections for debugging
io.on('connection', (socket) => {
  console.log(`🔌 New socket connection: ${socket.id}`);

  socket.on('disconnect', (reason) => {
    console.log(`❌ Socket ${socket.id} disconnected: ${reason}`);
  });
});

// Register the enhanced socket event handlers
setupSocket(io);

// Enhanced MongoDB connection with better error handling
mongoose
  .connect(env.MONGO_URI, {
    // Connection options for better stability
    maxPoolSize: 10, // Maintain up to 10 socket connections
    serverSelectionTimeoutMS: 5000, // Keep trying to send operations for 5 seconds
    socketTimeoutMS: 45000, // Close sockets after 45 seconds of inactivity
  })
  .then(() => {
    console.log('✅ Connected to MongoDB');

    // Start server after successful DB connection
    server.listen(env.PORT, () => {
      console.log(`🚀 Server running on http://localhost:${env.PORT}`);
      console.log(`🏠 Landing: http://localhost:${env.PORT}/`);
      console.log(`💬 Chat App: http://localhost:${env.PORT}/app`);
      console.log(`🛠️  API: http://localhost:${env.PORT}/api`);
      console.log(`📡 Socket.IO transports: websocket, polling`);
      console.log(`⏰ Ping interval: ${25000}ms, timeout: ${60000}ms`);

      if (process.env.NODE_ENV === 'development') {
        console.log('🔧 Development mode - enhanced logging enabled');
      }
    });
  })
  .catch((err) => {
    console.error('❌ DB connection failed:', err);
    process.exit(1);
  });

// Enhanced server error handling
server.on('error', (err) => {
  console.error('❌ Server error:', err);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('⚠️ SIGTERM received, shutting down gracefully...');

  server.close(async () => {
    console.log('✅ HTTP server closed');

    try {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error closing MongoDB connection:', err);
      process.exit(1);
    }
  });
});

process.on('SIGINT', () => {
  console.log('⚠️ SIGINT received, shutting down gracefully...');

  server.close(async () => {
    console.log('✅ HTTP server closed');

    try {
      await mongoose.connection.close();
      console.log('✅ MongoDB connection closed');
      process.exit(0);
    } catch (err) {
      console.error('❌ Error closing MongoDB connection:', err);
      process.exit(1);
    }
  });
});

// Handle uncaught exceptions
process.on('uncaughtException', (err) => {
  console.error('❌ Uncaught Exception:', err);
  process.exit(1);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('❌ Unhandled Rejection at:', promise, 'reason:', reason);
  process.exit(1);
});
