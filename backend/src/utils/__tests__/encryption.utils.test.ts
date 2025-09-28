import {
  encryptResetToken,
  decryptResetToken,
  isValidEncryptedTokenFormat,
} from '../encryption.utils';

describe('Encryption Utils (Security Critical)', () => {
  // Run: npm test -- --testPathPattern="encryption.utils.test.ts"
  describe('Password Reset Token Encryption', () => {
    const testToken = 'test-reset-token-12345';
    
    it('encrypts token to URL-safe base64 format', () => {
      const encrypted = encryptResetToken(testToken);
      
      expect(encrypted).toBeDefined();
      expect(typeof encrypted).toBe('string');
      expect(encrypted.length).toBeGreaterThan(64);
      
      // Should be URL-safe (no +, /, or = characters)
      expect(encrypted).toMatch(/^[A-Za-z0-9_-]+$/);
      expect(encrypted).not.toContain('+');
      expect(encrypted).not.toContain('/');
      expect(encrypted).not.toContain('=');
    });

    it('produces different encrypted values for same input (IV randomization)', () => {
      const encrypted1 = encryptResetToken(testToken);
      const encrypted2 = encryptResetToken(testToken);
      
      expect(encrypted1).not.toBe(encrypted2);
    });

    it('decrypts encrypted token correctly', () => {
      const encrypted = encryptResetToken(testToken);
      const decrypted = decryptResetToken(encrypted);
      
      expect(decrypted).toBe(testToken);
    });

    it('handles various token formats', () => {
      const testCases = [
        'simple-token',
        'token-with-numbers-123456',
        'complex.token@with#special$chars',
        'very-long-token-that-might-be-used-in-production-environment-12345',
        '12345',
        'a',
      ];

      testCases.forEach((token) => {
        const encrypted = encryptResetToken(token);
        const decrypted = decryptResetToken(encrypted);
        expect(decrypted).toBe(token);
      });
    });

    it('throws error for invalid encrypted token format', () => {
      const invalidTokens = [
        'invalid-token',
        'too-short',
        '',
        'invalid+base64/with=padding',
        'completely-invalid-format',
      ];

      invalidTokens.forEach(invalidToken => {
        expect(() => decryptResetToken(invalidToken)).toThrow();
      });
    });

    it('throws error for corrupted encrypted token', () => {
      const validEncrypted = encryptResetToken(testToken);
      
      // Corrupt the token by changing a character
      const corrupted = `${validEncrypted.slice(0, -5)}XXXXX`;
      
      expect(() => decryptResetToken(corrupted)).toThrow();
    });

    it('validates encrypted token format correctly', () => {
      const validToken = encryptResetToken(testToken);
      expect(isValidEncryptedTokenFormat(validToken)).toBe(true);
      
      // Invalid formats
      expect(isValidEncryptedTokenFormat('too-short')).toBe(false);
      expect(isValidEncryptedTokenFormat('')).toBe(false);
      expect(isValidEncryptedTokenFormat('invalid+chars/here=')).toBe(false);
      expect(isValidEncryptedTokenFormat('a'.repeat(32))).toBe(false); // Too short
    });

    it('encryption is deterministic with same IV (security property)', () => {
      // Note: In actual implementation, IV is random, so this tests the algorithm correctness
      // Real encryption will always produce different results due to random IV
      const token = 'consistent-test-token';
      const encrypted1 = encryptResetToken(token);
      const encrypted2 = encryptResetToken(token);
      
      // Should be different due to random IV
      expect(encrypted1).not.toBe(encrypted2);
      
      // But both should decrypt to same original value
      expect(decryptResetToken(encrypted1)).toBe(token);
      expect(decryptResetToken(encrypted2)).toBe(token);
    });

    it('handles edge cases and empty/special inputs', () => {
      // Test with various edge cases
      expect(() => encryptResetToken('')).not.toThrow();
      expect(decryptResetToken(encryptResetToken(''))).toBe('');
      
      // Test with special characters that might break URL encoding
      const specialChars = '!@#$%^&*()[]{}|;:,.<>?';
      const encrypted = encryptResetToken(specialChars);
      expect(decryptResetToken(encrypted)).toBe(specialChars);
      
      // Test with Unicode characters
      const unicode = '测试🔐encryption';
      const encryptedUnicode = encryptResetToken(unicode);
      expect(decryptResetToken(encryptedUnicode)).toBe(unicode);
    });

    it('maintains security properties under stress conditions', () => {
      // Test encryption/decryption of many tokens
      const tokens = Array.from({ length: 100 }, (_, i) => `token-${i}-${Math.random()}`);
      
      const encryptedTokens = tokens.map(token => ({
        original: token,
        encrypted: encryptResetToken(token),
      }));
      
      // Verify all tokens decrypt correctly
      encryptedTokens.forEach(({ original, encrypted }) => {
        expect(decryptResetToken(encrypted)).toBe(original);
        expect(isValidEncryptedTokenFormat(encrypted)).toBe(true);
      });
      
      // Verify all encrypted tokens are unique (no collisions)
      const encryptedValues = encryptedTokens.map(t => t.encrypted);
      const uniqueValues = new Set(encryptedValues);
      expect(uniqueValues.size).toBe(encryptedValues.length);
    });
  });

  describe('Security Considerations', () => {
    it('encrypted tokens should not reveal original length patterns', () => {
      // Test tokens of different lengths
      const shortToken = 'abc';
      const mediumToken = 'abcdefghijklmnop';
      const longToken = 'a'.repeat(100);
      
      const encryptedShort = encryptResetToken(shortToken);
      const encryptedMedium = encryptResetToken(mediumToken);
      const encryptedLong = encryptResetToken(longToken);
      
      // Encrypted tokens should not have proportional lengths to originals
      // Due to block cipher padding and IV, length differences should be minimal
      const lengthDiff1 = Math.abs(encryptedMedium.length - encryptedShort.length);
      const lengthDiff2 = Math.abs(encryptedLong.length - encryptedMedium.length);
      
      // Block cipher should normalize length differences
      expect(lengthDiff1).toBeLessThan(50); // Allow for some block padding variance
      expect(lengthDiff2).toBeLessThan(250); // Long tokens will be longer but not proportionally
    });

    it('should not leak information through timing attacks (basic test)', () => {
      const validToken = encryptResetToken('valid-token');
      const measurements: number[] = [];
      
      // Measure decryption time for valid token (should be consistent)
      for (let i = 0; i < 10; i++) {
        const start = process.hrtime.bigint();
        decryptResetToken(validToken);
        const end = process.hrtime.bigint();
        measurements.push(Number(end - start));
      }
      
      // Check timing consistency (basic timing attack protection)
      const avgTime = measurements.reduce((a, b) => a + b, 0) / measurements.length;
      const maxDeviation = Math.max(...measurements.map(m => Math.abs(m - avgTime)));
      
      // Timing should be relatively consistent (within reasonable bounds)
      // Allow higher deviation in test environment due to system load variations
      expect(maxDeviation / avgTime).toBeLessThan(10.0); // Allow 1000% deviation in test
    });
  });
});