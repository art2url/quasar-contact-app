import crypto from 'crypto';

// Use a key derived from environment variables for token encryption
const ENCRYPTION_KEY = crypto.scryptSync(
  process.env.TOKEN_ENCRYPTION_SECRET || process.env.JWT_SECRET || 'fallback-encryption-key',
  'reset-token-salt',
  32,
);

const ALGORITHM = 'aes-256-cbc';

/**
 * Encrypt a password reset token for email transmission
 * @param token - The raw reset token to encrypt
 * @returns Encrypted token with IV (URL-safe base64)
 */
export function encryptResetToken(token: string): string {
  const iv = crypto.randomBytes(16); // 16 bytes for CBC
  const cipher = crypto.createCipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
  
  let encrypted = cipher.update(token, 'utf8', 'hex');
  encrypted += cipher.final('hex');
  
  // Combine IV + encrypted data
  const combined = `${iv.toString('hex')}:${encrypted}`;
  
  // Return URL-safe base64
  return Buffer.from(combined)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=/g, '');
}

/**
 * Decrypt a password reset token from email URL
 * @param encryptedToken - The encrypted token from URL (URL-safe base64)
 * @returns Decrypted raw token
 */
export function decryptResetToken(encryptedToken: string): string {
  try {
    // Convert from URL-safe base64
    const base64 = encryptedToken
      .replace(/-/g, '+')
      .replace(/_/g, '/');
    
    // Add padding if needed
    const padding = '='.repeat((4 - base64.length % 4) % 4);
    const combined = Buffer.from(base64 + padding, 'base64').toString();
    
    // Split IV and encrypted data
    const [ivHex, encrypted] = combined.split(':');
    if (!ivHex || !encrypted) {
      throw new Error('Invalid format');
    }
    
    const iv = Buffer.from(ivHex, 'hex');
    const decipher = crypto.createDecipheriv(ALGORITHM, ENCRYPTION_KEY, iv);
    
    let decrypted = decipher.update(encrypted, 'hex', 'utf8');
    decrypted += decipher.final('utf8');
    
    return decrypted;
  } catch (error) {
    throw new Error('Invalid or corrupted encrypted token');
  }
}

/**
 * Validate that an encrypted token has the correct format
 * @param encryptedToken - The encrypted token to validate
 * @returns True if format is valid
 */
export function isValidEncryptedTokenFormat(encryptedToken: string): boolean {
  // Check URL-safe base64 format and approximate length
  const urlSafeBase64Regex = /^[A-Za-z0-9_-]+$/;
  return urlSafeBase64Regex.test(encryptedToken) && encryptedToken.length >= 64;
}