import type { Request, Response } from 'express';
import { SECURITY_LIMITS } from '../config/security-limits';
import { decryptResetToken, isValidEncryptedTokenFormat } from './encryption.utils';

export interface PendingResetSession {
  token: string;
  expires: number;
  used: boolean;
  createdAt: number;
}

/**
 * Process an encrypted password reset token from URL and store in session
 * @param req - Express request object
 * @param res - Express response object
 * @param encryptedToken - The encrypted token from URL query parameter
 * @returns True if token was processed successfully, false otherwise
 */
export function processPasswordResetToken(
  req: Request,
  res: Response,
  encryptedToken: string,
): boolean {
  if (!encryptedToken || typeof encryptedToken !== 'string') {
    res.redirect('/app/auth/login?error=invalid_link');
    return false;
  }

  try {
    // Validate encrypted token format
    if (!isValidEncryptedTokenFormat(encryptedToken)) {
      console.warn('[Password Reset] Invalid encrypted token format');
      res.redirect('/app/auth/login?error=invalid_link');
      return false;
    }

    // Decrypt the token
    const rawToken = decryptResetToken(encryptedToken);

    // Store decrypted token securely in session
    req.session.pendingReset = {
      token: rawToken,
      expires: Date.now() + SECURITY_LIMITS.PASSWORD_RESET.TOKEN_EXPIRY_MS, // 10 minutes
      used: false,
      createdAt: Date.now(),
    };

    // Redirect without token in URL for security
    res.redirect('/app/?reset=1');
    return true;
  } catch (error) {
    console.error('[Password Reset] Token decryption failed:', error);
    res.redirect('/app/auth/login?error=invalid_link');
    return false;
  }
}

/**
 * Validate and retrieve a pending reset token from session
 * @param req - Express request object
 * @returns The pending reset session data if valid, null otherwise
 */
export function getPendingResetFromSession(req: Request): PendingResetSession | null {
  const pendingReset = req.session.pendingReset;

  if (!pendingReset) {
    return null;
  }

  // Check if token is expired
  if (pendingReset.expires < Date.now()) {
    // Clean up expired session
    delete req.session.pendingReset;
    return null;
  }

  // Check if token was already used
  if (pendingReset.used) {
    return null;
  }

  return pendingReset;
}

/**
 * Mark a pending reset token as used
 * @param req - Express request object
 */
export function markResetTokenAsUsed(req: Request): void {
  if (req.session.pendingReset) {
    req.session.pendingReset.used = true;
  }
}

/**
 * Clear pending reset session data
 * @param req - Express request object
 */
export function clearPendingResetSession(req: Request): void {
  delete req.session.pendingReset;
}