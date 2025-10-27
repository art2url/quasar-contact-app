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
 * Includes session regeneration to prevent session fixation attacks
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

    // SECURITY: Regenerate session to prevent session fixation attacks
    // This ensures that an attacker cannot use a pre-existing session to claim a token
    if (typeof (req.session as any).regenerate === 'function') {
      (req.session as any).regenerate((err: Error | null) => {
        if (err) {
          console.error('[Password Reset] Session regeneration failed:', err);
          res.redirect('/app/auth/login?error=session_error');
          return;
        }

        // Store decrypted token securely in NEW session (after regeneration)
        req.session.pendingReset = {
          token: rawToken,
          expires: Date.now() + SECURITY_LIMITS.PASSWORD_RESET.TOKEN_EXPIRY_MS, // 10 minutes
          used: false,
          createdAt: Date.now(),
        };

        // Redirect to reset-password page to enter new credentials
        res.redirect('/app/auth/reset-password');
      });
    } else {
      // In tests or environments without session.regenerate, store directly
      req.session.pendingReset = {
        token: rawToken,
        expires: Date.now() + SECURITY_LIMITS.PASSWORD_RESET.TOKEN_EXPIRY_MS, // 10 minutes
        used: false,
        createdAt: Date.now(),
      };
      res.redirect('/app/auth/reset-password');
    }

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