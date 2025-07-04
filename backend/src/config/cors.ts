import cors, { CorsOptions } from 'cors';
import env from './env';

// Explicitly set allowed origins for development and production
const allowedOrigins = [
  'https://quasar.contact', // Production domain
  'https://www.quasar.contact', // Production domain with www
  env.CLIENT_ORIGIN, // From environment variable
].filter(Boolean); // Remove any undefined/null values

// A dynamic origin checker
const originChecker: CorsOptions['origin'] = (incoming, callback) => {
  // Allow requests with no origin (like mobile apps, curl, Postman, etc.)
  if (!incoming) {
    callback(null, true);
    return;
  }

  // Check if the origin is in our allowed list
  if (allowedOrigins.includes(incoming)) {
    console.log(`✅ CORS allowed origin: ${incoming}`);
    callback(null, true);
  } else {
    console.warn(`❌ CORS blocked request from origin: ${incoming}`);
    console.warn(`📋 Allowed origins: ${allowedOrigins.join(', ')}`);
    callback(new Error(`CORS error: origin ${incoming} not allowed`));
  }
};

export const httpCors = cors({
  origin: originChecker,
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'x-access-token',
    'x-csrf-token',
    'csrf-token',
    'Cache-Control',
    'Origin',
    'X-Requested-With',
    'Accept',
  ],
});

// Enhanced Socket.IO configuration for better stability
export const socketCorsOptions = {
  cors: {
    origin: allowedOrigins,
    credentials: true,
    methods: ['GET', 'POST'],
  },
  // Enhanced transport configuration for stability
  transports: ['websocket', 'polling'],
  allowEIO3: true,
  // Connection timeout and ping settings
  pingTimeout: 60000, // 60 seconds
  pingInterval: 25000, // 25 seconds
  upgradeTimeout: 30000, // 30 seconds
  // Enhanced error handling
  allowRequest: (req: any, callback: any) => {
    // Additional validation can be added here
    callback(null, true);
  },
  // Connection state recovery
  connectionStateRecovery: {
    // the backup duration of the sessions and the packets
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    // whether to skip middlewares upon successful recovery
    skipMiddlewares: true,
  },
};
