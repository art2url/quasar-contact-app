/**
 * Enhanced security limits and configurations
 */

export const SECURITY_LIMITS = {
  // Password Reset
  PASSWORD_RESET: {
    MAX_ATTEMPTS_PER_EMAIL: 3,        // Max attempts per email per window
    MAX_ATTEMPTS_PER_IP: 5,           // Max attempts per IP per window
    RATE_LIMIT_WINDOW: 15 * 60 * 1000, // 15 minutes
    TOKEN_EXPIRY: 10 * 60 * 1000,     // 10 minutes
    COOLDOWN_AFTER_MAX: 60 * 60 * 1000, // 1 hour cooldown after max attempts
  },

  // Authentication
  AUTH: {
    MAX_LOGIN_ATTEMPTS: 5,            // Max login attempts per IP
    LOGIN_RATE_WINDOW: 15 * 60 * 1000, // 15 minutes
    ACCOUNT_LOCKOUT_DURATION: 30 * 60 * 1000, // 30 minutes
    JWT_EXPIRY: '24h',                // 24h access token + 30d refresh token (secure + good UX)
    BCRYPT_ROUNDS: 12,                // Industry standard for secure password hashing
  },

  // Input Validation
  INPUT: {
    MAX_USERNAME_LENGTH: 50,
    MIN_USERNAME_LENGTH: 3,
    MAX_PASSWORD_LENGTH: 128,
    MIN_PASSWORD_LENGTH: 8,           // Increased from 6
    MAX_EMAIL_LENGTH: 254,
    MAX_AVATAR_URL_LENGTH: 500,
    MAX_MESSAGE_LENGTH: 10000,
  },

  // Bot Protection
  BOT_PROTECTION: {
    SUSPICIOUS_ACTIVITY_THRESHOLD: 5,  // Reduced from 10
    AUTO_BLACKLIST_THRESHOLD: 3,      // Reduced from 10
    BLACKLIST_CLEANUP_INTERVAL: 24 * 60 * 60 * 1000, // 24 hours
    HONEYPOT_DELAY: 10000,            // Increased from 5000ms
  },

  // General Rate Limiting
  RATE_LIMITS: {
    GENERAL_REQUESTS_PER_MINUTE: 60,  // Reduced from 100
    API_REQUESTS_PER_MINUTE: 30,      // New limit for API endpoints
    BURST_LIMIT: 10,                  // Allow burst of 10 requests
  },
} as const;

// Type-safe access to limits
export type SecurityLimits = typeof SECURITY_LIMITS;