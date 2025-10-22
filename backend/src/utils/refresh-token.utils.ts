import * as crypto from 'crypto';
import { prisma } from '../services/database.service';

/**
 * Refresh Token Utilities
 *
 * Implements secure refresh token mechanism:
 * - Access tokens (JWT): 24h expiry, stored in httpOnly cookie
 * - Refresh tokens: 30d expiry, stored in database and httpOnly cookie
 * - Refresh tokens are single-use (rotated on each refresh)
 * - Old tokens are automatically cleaned up
 */

// Refresh token expiry: 30 days
const REFRESH_TOKEN_EXPIRY_MS = 30 * 24 * 60 * 60 * 1000;

/**
 * Generate a cryptographically secure refresh token
 */
export function generateRefreshToken(): string {
  return crypto.randomBytes(64).toString('hex');
}

/**
 * Create and store a refresh token for a user
 */
export async function createRefreshToken(userId: string): Promise<string> {
  const token = generateRefreshToken();
  const expiresAt = new Date(Date.now() + REFRESH_TOKEN_EXPIRY_MS);

  await prisma.refreshToken.create({
    data: {
      userId,
      token,
      expiresAt,
    },
  });

  return token;
}

/**
 * Validate and retrieve user ID from refresh token
 * Returns null if token is invalid or expired
 * NOTE: This function does NOT consume the token. Use validateAndConsumeRefreshToken for token rotation.
 */
export async function validateRefreshToken(token: string): Promise<string | null> {
  if (!token) {
    return null;
  }

  const refreshToken = await prisma.refreshToken.findUnique({
    where: { token },
    select: {
      userId: true,
      expiresAt: true,
    },
  });

  if (!refreshToken) {
    return null;
  }

  // Check if token is expired
  if (refreshToken.expiresAt < new Date()) {
    // Clean up expired token
    await prisma.refreshToken.delete({ where: { token } });
    return null;
  }

  // Update last used timestamp
  await prisma.refreshToken.update({
    where: { token },
    data: { lastUsed: new Date() },
  });

  return refreshToken.userId;
}

/**
 * Atomically validate and consume a refresh token
 * This prevents race conditions where the same token could be used multiple times
 * Returns userId if valid, null if invalid/expired, throws if already consumed
 */
export async function validateAndConsumeRefreshToken(token: string): Promise<string | null> {
  if (!token) {
    return null;
  }

  try {
    return await prisma.$transaction(async (tx) => {
      // Find and lock the token
      const refreshToken = await tx.refreshToken.findUnique({
        where: { token },
        select: {
          userId: true,
          expiresAt: true,
        },
      });

      if (!refreshToken) {
        return null;
      }

      // Check if token is expired
      if (refreshToken.expiresAt < new Date()) {
        // Clean up expired token
        await tx.refreshToken.delete({ where: { token } });
        return null;
      }

      // Atomically delete token to prevent reuse
      const deleted = await tx.refreshToken.deleteMany({
        where: { token },
      });

      // If token was already deleted by another request, this is a race condition attack
      if (deleted.count === 0) {
        throw new Error('REFRESH_TOKEN_ALREADY_USED');
      }

      return refreshToken.userId;
    }, {
      isolationLevel: 'Serializable', // Prevent phantom reads and race conditions
    });
  } catch (error) {
    // Re-throw known errors
    if (error instanceof Error && error.message === 'REFRESH_TOKEN_ALREADY_USED') {
      throw error;
    }
    // Log and re-throw unexpected errors
    console.error('[Refresh Token Validation Error]', error);
    throw error;
  }
}

/**
 * Rotate refresh token (delete old, create new)
 * This implements token rotation for enhanced security
 * @deprecated Use validateAndConsumeRefreshToken instead for atomic token rotation
 */
export async function rotateRefreshToken(oldToken: string, userId: string): Promise<string> {
  // Delete old token
  await prisma.refreshToken.delete({ where: { token: oldToken } }).catch(() => {
    // Ignore errors if token doesn't exist
  });

  // Create new token
  return createRefreshToken(userId);
}

/**
 * Revoke a specific refresh token (used on logout)
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  await prisma.refreshToken.delete({ where: { token } }).catch(() => {
    // Ignore errors if token doesn't exist
  });
}

/**
 * Revoke all refresh tokens for a user (used on password change, account compromise)
 */
export async function revokeAllUserRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.deleteMany({
    where: { userId },
  });
}

/**
 * Clean up expired refresh tokens (should be run periodically)
 */
export async function cleanupExpiredTokens(): Promise<number> {
  const result = await prisma.refreshToken.deleteMany({
    where: {
      expiresAt: {
        lt: new Date(),
      },
    },
  });

  return result.count;
}

/**
 * Get refresh token expiry time in milliseconds
 */
export function getRefreshTokenExpiry(): number {
  return REFRESH_TOKEN_EXPIRY_MS;
}
