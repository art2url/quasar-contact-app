/**
 * Input sanitization utilities for enhanced security
 */

import { SECURITY_LIMITS } from '../config/security-limits';

export class InputSanitizer {
  /**
   * Sanitize username input
   */
  static sanitizeUsername(username: string): string {
    if (!username || typeof username !== 'string') {
      throw new Error('Username is required and must be a string');
    }

    // Remove dangerous characters and trim
    const sanitized = username
      .trim()
      .replace(/[<>\"'&]/g, '') // Remove HTML/XSS chars
      .replace(/\s+/g, ' ')      // Normalize whitespace
      .slice(0, SECURITY_LIMITS.INPUT.MAX_USERNAME_LENGTH);

    if (sanitized.length < SECURITY_LIMITS.INPUT.MIN_USERNAME_LENGTH) {
      throw new Error(`Username must be at least ${SECURITY_LIMITS.INPUT.MIN_USERNAME_LENGTH} characters`);
    }

    return sanitized;
  }

  /**
   * Validate and sanitize email
   */
  static sanitizeEmail(email: string): string {
    if (!email || typeof email !== 'string') {
      throw new Error('Email is required and must be a string');
    }

    const sanitized = email.trim().toLowerCase();

    // Basic email validation
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(sanitized)) {
      throw new Error('Invalid email format');
    }

    if (sanitized.length > SECURITY_LIMITS.INPUT.MAX_EMAIL_LENGTH) {
      throw new Error('Email address too long');
    }

    return sanitized;
  }

  /**
   * Validate password strength
   */
  static validatePassword(password: string): string {
    if (!password || typeof password !== 'string') {
      throw new Error('Password is required and must be a string');
    }

    if (password.length < SECURITY_LIMITS.INPUT.MIN_PASSWORD_LENGTH) {
      throw new Error(`Password must be at least ${SECURITY_LIMITS.INPUT.MIN_PASSWORD_LENGTH} characters`);
    }

    if (password.length > SECURITY_LIMITS.INPUT.MAX_PASSWORD_LENGTH) {
      throw new Error('Password too long');
    }

    // Check for basic password strength
    const hasUpperCase = /[A-Z]/.test(password);
    const hasLowerCase = /[a-z]/.test(password);
    const hasNumbers = /\d/.test(password);
    const hasSpecialChar = /[!@#$%^&*(),.?":{}|<>]/.test(password);

    const strengthChecks = [hasUpperCase, hasLowerCase, hasNumbers, hasSpecialChar];
    const strengthScore = strengthChecks.filter(Boolean).length;

    if (strengthScore < 3) {
      throw new Error('Password must contain at least 3 of: uppercase, lowercase, numbers, special characters');
    }

    // Check for common patterns
    const commonPatterns = [
      /123456/, /password/, /qwerty/, /admin/, /letmein/, /welcome/,
      /monkey/, /dragon/, /password123/, /123123/,
    ];

    if (commonPatterns.some(pattern => pattern.test(password.toLowerCase()))) {
      throw new Error('Password contains common patterns and is not secure');
    }

    return password;
  }

  /**
   * Sanitize avatar URL
   */
  static sanitizeAvatarUrl(url: string): string {
    if (!url || typeof url !== 'string') {
      throw new Error('Avatar URL is required and must be a string');
    }

    const sanitized = url.trim();

    // Must be HTTPS
    if (!sanitized.startsWith('https://')) {
      throw new Error('Avatar URL must use HTTPS');
    }

    if (sanitized.length > SECURITY_LIMITS.INPUT.MAX_AVATAR_URL_LENGTH) {
      throw new Error('Avatar URL too long');
    }

    // Basic URL validation
    try {
      new URL(sanitized);
    } catch {
      throw new Error('Invalid URL format');
    }

    // Check for suspicious patterns
    const suspiciousPatterns = [
      /javascript:/i, /data:/i, /vbscript:/i, /onload=/i, /onerror=/i,
      /<script/i, /eval\(/i, /expression\(/i,
    ];

    if (suspiciousPatterns.some(pattern => pattern.test(sanitized))) {
      throw new Error('Avatar URL contains suspicious patterns');
    }

    return sanitized;
  }

  /**
   * Sanitize message content (for encrypted messages)
   */
  static sanitizeMessageContent(content: string): string {
    if (!content || typeof content !== 'string') {
      throw new Error('Message content is required and must be a string');
    }

    if (content.length > SECURITY_LIMITS.INPUT.MAX_MESSAGE_LENGTH) {
      throw new Error('Message too long');
    }

    // For encrypted messages, we mainly check length and basic type
    // The content is already encrypted on the client side
    return content.trim();
  }

  /**
   * Detect and block potential injection attempts
   */
  static detectInjectionAttempt(input: string): boolean {
    if (!input || typeof input !== 'string') {
      return false;
    }

    const injectionPatterns = [
      // SQL injection
      /(\b(union|select|insert|update|delete|drop|create|alter|exec|execute)\b)/i,
      /((\%27)|(\'))((\%6F)|o|(\%4F))((\%72)|r|(\%52))/i, // 'or
      /((\%3D)|(=))[^\n]*((\%27)|(\')|((\%3B)|(;)))/i,

      // XSS
      /<script[^>]*>.*?<\/script>/gi,
      /javascript:/gi,
      /vbscript:/gi,
      /onload\s*=/gi,
      /onerror\s*=/gi,

      // Command injection
      /(\||\;|\&|\$|\`)/,
      /((\%3C)|<)((\%69)|i|(\%49))((\%6D)|m|(\%4D))((\%67)|g|(\%47))/i, // <img

      // Path traversal
      /(\.\.\/|\.\.\\|%2e%2e%2f|%2e%2e%5c)/i,

      // LDAP injection
      /(\(\|\()|\(\&\()/,
    ];

    return injectionPatterns.some(pattern => pattern.test(input));
  }

  /**
   * Comprehensive input validation for API requests
   */
  static validateApiInput(data: Record<string, unknown>): void {
    // Check for suspicious keys
    const suspiciousKeys = [
      '__proto__', 'constructor', 'prototype', 'eval', 'function',
      'script', 'javascript', 'vbscript', 'onload', 'onerror',
    ];

    const checkObject = (obj: any, depth = 0): void => {
      if (depth > 10) {
        throw new Error('Object nesting too deep');
      }

      if (obj && typeof obj === 'object') {
        for (const key in obj) {
          if (suspiciousKeys.includes(key.toLowerCase())) {
            throw new Error(`Suspicious property name: ${key}`);
          }

          if (typeof obj[key] === 'string' && this.detectInjectionAttempt(obj[key])) {
            throw new Error(`Potential injection attempt detected in ${key}`);
          }

          if (typeof obj[key] === 'object') {
            checkObject(obj[key], depth + 1);
          }
        }
      }
    };

    checkObject(data);
  }
}