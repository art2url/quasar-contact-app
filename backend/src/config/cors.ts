import cors from 'cors';
import { Request } from 'express';
import env from './env';

// Explicitly set allowed origins for development and production
const allowedOrigins = [
  'https://quasar.contact', // Production domain
  'https://www.quasar.contact', // Production domain with www
  env.CLIENT_ORIGIN, // From environment variable
].filter(Boolean); // Remove any undefined/null values

// A dynamic origin checker
const originChecker = (
  incoming: string | undefined,
  callback: (err: Error | null, allow?: boolean) => void,
  req?: Request,
): void => {
  // Allow requests without origin for health checks and static files (proxies, load balancers)
  if (!incoming) {
    // Always allow health checks and root paths (for load balancers and proxies)
    if (req?.path === '/health' || req?.path === '/' || req?.path === '/api/health') {
      callback(null, true);
      return;
    }

    // In production, require origin for API endpoints
    if (env.NODE_ENV === 'production') {
      callback(new Error('CORS error: origin header required for API requests'));
      return;
    }
    // Allow requests without origin in development (for testing tools like Postman, curl)
    callback(null, true);
    return;
  }

  // Check if the origin is in our allowed list
  if (allowedOrigins.includes(incoming)) {
    // CORS origin allowed
    callback(null, true);
  } else {
    // CORS origin blocked - not in allowed list
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
  // Note: allowRequest callback removed to prevent CORS bypass
  // Origin validation is enforced through the cors configuration above
  // Connection state recovery
  connectionStateRecovery: {
    // the backup duration of the sessions and the packets
    maxDisconnectionDuration: 2 * 60 * 1000, // 2 minutes
    // whether to skip middlewares upon successful recovery
    skipMiddlewares: true,
  },
};
