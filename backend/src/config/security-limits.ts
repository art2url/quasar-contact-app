/**
 * Security limits and configurations
 *
 * Centralizes security-related constants to ensure consistency across the application
 * and make it easier to adjust security settings.
 */

export const SECURITY_LIMITS = {
  // Input Validation
  INPUT: {
    MAX_USERNAME_LENGTH: 50,
    MIN_USERNAME_LENGTH: 3,
    MAX_PASSWORD_LENGTH: 128,
    MIN_PASSWORD_LENGTH: 8,
    MAX_EMAIL_LENGTH: 254,
    MAX_AVATAR_URL_LENGTH: 500,
    MAX_MESSAGE_LENGTH: 10000,
  },

  // Authentication
  AUTH: {
    JWT_EXPIRY: '24h',                // Access token expiry (24h with 30d refresh tokens)
    BCRYPT_ROUNDS: 10,                // Salt rounds for password hashing
  },

  // Password Reset
  PASSWORD_RESET: {
    TOKEN_EXPIRY_MS: 10 * 60 * 1000,      // 10 minutes - token validity duration
    SESSION_MAX_AGE_MS: 10 * 60 * 1000,   // 10 minutes - session cookie max age (matches token expiry)
    RATE_LIMIT_WINDOW_MS: 5 * 60 * 1000,  // 5 minutes - minimum time between reset requests per user
  },

  // Bot Protection
  BOT_PROTECTION: {
    AUTO_BLACKLIST_THRESHOLD: 10,         // Auto-blacklist IP after this many suspicious attempts
    HONEYPOT_DELAY_MS: 5000,              // 5 seconds - delay response to waste bot's time
    SUSPICIOUS_ACTIVITY_CLEANUP_MS: 3600000, // 1 hour - cleanup interval for suspicious activity tracking
  },

  // Rate Limiting (for bot-blocker.ts)
  RATE_LIMITS: {
    GENERAL_REQUESTS: 10,                 // General requests allowed
    GENERAL_WINDOW_SECONDS: 60,           // Per 60 seconds
    BRUTE_FORCE_REQUESTS: 5,              // Stricter limit for suspicious paths
    BRUTE_FORCE_WINDOW_SECONDS: 300,      // Per 5 minutes
  },
} as const;

// Type-safe access to limits
export type SecurityLimits = typeof SECURITY_LIMITS;
