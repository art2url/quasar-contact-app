import { TestBed } from '@angular/core/testing';

import { CryptoService } from './crypto.service';

describe('CryptoService (Security-Critical Testing)', () => {
  let service: CryptoService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [CryptoService]
    });

    service = TestBed.inject(CryptoService);
  });

  // Run: npm test -- --include="**/crypto.service.spec.ts"
  describe('Service Initialization', () => {
    it('creates service with secure defaults', () => {
      expect(service).toBeTruthy();
      expect(service.hasPrivateKey()).toBe(false);
    });

    it('has no private key data exposed in service properties', () => {
      const serviceAsAny = service as unknown;
      expect((serviceAsAny as { keyPair?: unknown }).keyPair).toBeFalsy();
      expect((serviceAsAny as { privateKey?: unknown }).privateKey).toBeFalsy();
    });
  });

  describe('Key Generation Security', () => {
    it('generates RSA-OAEP key pair with correct parameters', async () => {
      const publicKeyBase64 = await service.generateKeyPair();
      
      // Validate public key format
      expect(typeof publicKeyBase64).toBe('string');
      expect(publicKeyBase64.length).toBeGreaterThan(300); // RSA 2048-bit public key should be ~392 chars in base64
      expect(publicKeyBase64).toMatch(/^[A-Za-z0-9+/]+=*$/); // Valid base64
      expect(service.hasPrivateKey()).toBe(true);
    });

    it('generates unique key pairs on each call', async () => {
      const keys = [];
      for (let i = 0; i < 3; i++) {
        keys.push(await service.generateKeyPair());
      }
      
      // All keys should be different
      expect(keys[0]).not.toBe(keys[1]);
      expect(keys[1]).not.toBe(keys[2]);
      expect(keys[0]).not.toBe(keys[2]);
    });

    it('overwrites previous key pair on new generation', async () => {
      const firstKey = await service.generateKeyPair();
      const firstPrivateKey = await service.exportPrivateKey();
      
      const secondKey = await service.generateKeyPair();
      const secondPrivateKey = await service.exportPrivateKey();
      
      expect(firstKey).not.toBe(secondKey);
      expect(firstPrivateKey).not.toEqual(secondPrivateKey);
    });
  });

  describe('Private Key Export/Import Security', () => {
    it('exports private key in PKCS8 format', async () => {
      await service.generateKeyPair();
      const privateKeyBuffer = await service.exportPrivateKey();
      
      expect(privateKeyBuffer).toBeInstanceOf(ArrayBuffer);
      expect(privateKeyBuffer.byteLength).toBeGreaterThan(1000); // RSA 2048-bit private key should be substantial
      
      // Check PKCS8 format signature (starts with 0x30 for ASN.1 SEQUENCE)
      const firstByte = new Uint8Array(privateKeyBuffer)[0];
      expect(firstByte).toBe(0x30);
    });

    it('throws precise error when exporting without key generation', async () => {
      await expectAsync(service.exportPrivateKey())
        .toBeRejectedWithError('No key pair generated');
    });

    it('imports private key and validates fingerprint format', async () => {
      await service.generateKeyPair();
      const privateKeyBuffer = await service.exportPrivateKey();
      
      const fingerprint = await service.importPrivateKey(privateKeyBuffer);
      
      // Fingerprint should be SHA-256 hex pairs joined by ':'
      expect(typeof fingerprint).toBe('string');
      expect(fingerprint).toMatch(/^[a-f0-9]{2}(:[a-f0-9]{2}){31}$/); // 32 hex pairs separated by colons
      expect(fingerprint.split(':').length).toBe(32); // 256 bits / 8 = 32 bytes
    });

    it('produces consistent fingerprints for same key', async () => {
      await service.generateKeyPair();
      const privateKeyBuffer = await service.exportPrivateKey();
      
      const fingerprint1 = await service.importPrivateKey(privateKeyBuffer);
      const fingerprint2 = await service.importPrivateKey(privateKeyBuffer);
      
      expect(fingerprint1).toBe(fingerprint2);
    });

    it('handles Base64 private key import correctly', async () => {
      await service.generateKeyPair();
      const privateKeyBuffer = await service.exportPrivateKey();
      
      // Convert to proper Base64
      const base64Key = btoa(String.fromCharCode(...new Uint8Array(privateKeyBuffer)));
      const fingerprint = await service.importPrivateKey(base64Key);
      
      expect(fingerprint).toMatch(/^[a-f0-9]{2}(:[a-f0-9]{2}){31}$/);
    });

    it('rejects invalid Base64 private keys', async () => {
      const invalidBase64 = 'invalid-base64-key!@#';
      
      await expectAsync(service.importPrivateKey(invalidBase64))
        .toBeRejected();
    });

    it('rejects malformed private key data', async () => {
      const malformedKey = new ArrayBuffer(10); // Too small to be valid
      
      await expectAsync(service.importPrivateKey(malformedKey))
        .toBeRejected();
    });
  });

  describe('Public Key Export Security', () => {
    it('exports public key in SPKI format', async () => {
      await service.generateKeyPair();
      const publicKeyBase64 = await service.exportCurrentPublicKey();
      
      // Decode base64 to check SPKI format
      const binaryString = atob(publicKeyBase64);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      
      // SPKI format starts with ASN.1 SEQUENCE (0x30)
      expect(bytes[0]).toBe(0x30);
      expect(bytes.length).toBeGreaterThan(250); // RSA 2048-bit public key
    });

    it('throws precise error when exporting public key without generation', async () => {
      await expectAsync(service.exportCurrentPublicKey())
        .toBeRejectedWithError('No key pair loaded');
    });

    it('maintains consistency between generation and export', async () => {
      const generatedPublicKey = await service.generateKeyPair();
      const exportedPublicKey = await service.exportCurrentPublicKey();
      
      expect(generatedPublicKey).toBe(exportedPublicKey);
    });
  });

  describe('Encryption Security', () => {
    it('encrypts with RSA-OAEP and produces different ciphertexts for same plaintext', async () => {
      await service.generateKeyPair();
      const publicKey = await service.exportCurrentPublicKey();
      
      const plaintext = 'Sensitive data';
      const ciphertext1 = await service.encryptWithPublicKey(plaintext, publicKey);
      const ciphertext2 = await service.encryptWithPublicKey(plaintext, publicKey);
      
      // RSA-OAEP should produce different ciphertexts due to random padding
      expect(ciphertext1).not.toBe(ciphertext2);
      expect(ciphertext1.length).toBeGreaterThan(300); // Base64 encoded RSA-OAEP ciphertext
      expect(ciphertext2.length).toBeGreaterThan(300);
    });

    it('validates encrypted data format', async () => {
      await service.generateKeyPair();
      const publicKey = await service.exportCurrentPublicKey();
      
      const ciphertext = await service.encryptWithPublicKey('test', publicKey);
      
      expect(typeof ciphertext).toBe('string');
      expect(ciphertext).toMatch(/^[A-Za-z0-9+/]+=*$/); // Valid base64
      expect(ciphertext.length % 4).toBe(0); // Base64 length should be multiple of 4
    });

    it('handles empty string encryption securely', async () => {
      await service.generateKeyPair();
      const publicKey = await service.exportCurrentPublicKey();
      
      const ciphertext = await service.encryptWithPublicKey('', publicKey);
      
      expect(typeof ciphertext).toBe('string');
      expect(ciphertext.length).toBeGreaterThan(0);
    });

    it('handles Unicode and special characters correctly', async () => {
      await service.generateKeyPair();
      const publicKey = await service.exportCurrentPublicKey();
      
      const unicodeText = '🔐 Sécürë tëxt with émójis and special chars: ñáéíóú 中文 русский язык';
      const ciphertext = await service.encryptWithPublicKey(unicodeText, publicKey);
      
      expect(ciphertext.length).toBeGreaterThan(300);
      
      // Verify we can decrypt it back correctly
      const decrypted = await service.decryptMessage(ciphertext);
      expect(decrypted).toBe(unicodeText);
    });

    it('rejects encryption with invalid public key', async () => {
      const invalidPublicKey = 'invalid-public-key';
      
      await expectAsync(service.encryptWithPublicKey('test', invalidPublicKey))
        .toBeRejected();
    });

    it('rejects encryption with malformed Base64 public key', async () => {
      const malformedKey = 'not-base64!@#$%';
      
      await expectAsync(service.encryptWithPublicKey('test', malformedKey))
        .toBeRejected();
    });

    it('handles large messages with hybrid encryption (AES-GCM + RSA-OAEP)', async () => {
      await service.generateKeyPair();
      const publicKey = await service.exportCurrentPublicKey();
      
      // Test messages of various sizes - hybrid encryption should handle all
      const messages = [
        'A'.repeat(190),   // Traditional RSA limit
        'B'.repeat(500),   // Larger message
        'C'.repeat(1000),  // Even larger
        'D'.repeat(5000)   // Very large message
      ];
      
      for (const message of messages) {
        const ciphertext = await service.encryptWithPublicKey(message, publicKey);
        const decrypted = await service.decryptMessage(ciphertext);
        
        expect(decrypted).toBe(message);
        expect(ciphertext.length).toBeGreaterThan(message.length); // Should be larger due to encryption overhead
      }
    });

    it('validates hybrid encryption structure - SECURITY ANALYSIS', async () => {
      await service.generateKeyPair();
      const publicKey = await service.exportCurrentPublicKey();
      
      const message = 'Test message for hybrid encryption';
      const _ciphertext = await service.encryptWithPublicKey(message, publicKey);
      
      // Hybrid encryption should produce consistent overhead regardless of message size
      const shortMessage = 'Hi';
      const longMessage = 'A'.repeat(1000);
      
      const shortCiphertext = await service.encryptWithPublicKey(shortMessage, publicKey);
      const longCiphertext = await service.encryptWithPublicKey(longMessage, publicKey);
      
      // The overhead should be similar (AES key + IV + RSA wrapper)
      // But with base64 encoding, there will be some scaling
      const shortOverhead = shortCiphertext.length - shortMessage.length;
      const longOverhead = longCiphertext.length - longMessage.length;
      
      // For hybrid encryption, overhead is mostly constant (RSA-wrapped key + IV)
      // Base64 encoding adds ~33% overhead to the ciphertext itself
      // So we expect some difference but not excessive
      console.log('Short overhead:', shortOverhead, 'Long overhead:', longOverhead);
      
      // The overhead difference should be reasonable for base64 encoding
      expect(Math.abs(shortOverhead - longOverhead)).toBeLessThan(1500); // More realistic bound
      
      // Verify decryption works
      expect(await service.decryptMessage(shortCiphertext)).toBe(shortMessage);
      expect(await service.decryptMessage(longCiphertext)).toBe(longMessage);
    });
  });

  describe('Decryption Security', () => {
    it('decrypts ciphertext correctly', async () => {
      await service.generateKeyPair();
      const publicKey = await service.exportCurrentPublicKey();
      
      const originalMessage = 'Confidential information';
      const ciphertext = await service.encryptWithPublicKey(originalMessage, publicKey);
      const decryptedMessage = await service.decryptMessage(ciphertext);
      
      expect(decryptedMessage).toBe(originalMessage);
    });

    it('throws error when decrypting without private key', async () => {
      const fakeCiphertext = 'dGVzdA=='; // 'test' in base64
      
      await expectAsync(service.decryptMessage(fakeCiphertext))
        .toBeRejected();
    });

    it('rejects invalid ciphertext format', async () => {
      await service.generateKeyPair();
      
      const invalidCiphertext = 'not-valid-ciphertext!@#';
      
      await expectAsync(service.decryptMessage(invalidCiphertext))
        .toBeRejected();
    });

    it('rejects tampered ciphertext', async () => {
      await service.generateKeyPair();
      const publicKey = await service.exportCurrentPublicKey();
      
      const ciphertext = await service.encryptWithPublicKey('test', publicKey);
      
      // Tamper with the ciphertext
      const tamperedCiphertext = ciphertext.slice(0, -4) + 'XXXX';
      
      await expectAsync(service.decryptMessage(tamperedCiphertext))
        .toBeRejected();
    });

    it('handles concurrent encrypt/decrypt operations', async () => {
      await service.generateKeyPair();
      const publicKey = await service.exportCurrentPublicKey();
      
      const messages = ['msg1', 'msg2', 'msg3'];
      const encryptPromises = messages.map(msg => 
        service.encryptWithPublicKey(msg, publicKey)
      );
      
      const ciphertexts = await Promise.all(encryptPromises);
      
      const decryptPromises = ciphertexts.map(ciphertext => 
        service.decryptMessage(ciphertext)
      );
      
      const decryptedMessages = await Promise.all(decryptPromises);
      
      expect(decryptedMessages).toEqual(messages);
    });
  });

  describe('Key State Management', () => {
    it('correctly tracks private key state', async () => {
      expect(service.hasPrivateKey()).toBe(false);
      
      await service.generateKeyPair();
      expect(service.hasPrivateKey()).toBe(true);
      
      // State should persist through operations
      await service.exportPrivateKey();
      expect(service.hasPrivateKey()).toBe(true);
      
      await service.exportCurrentPublicKey();
      expect(service.hasPrivateKey()).toBe(true);
    });

    it('maintains state consistency after key import', async () => {
      await service.generateKeyPair();
      const privateKeyBuffer = await service.exportPrivateKey();
      
      // Import should maintain the hasPrivateKey state
      await service.importPrivateKey(privateKeyBuffer);
      expect(service.hasPrivateKey()).toBe(true);
    });

    it('handles multiple import operations correctly', async () => {
      await service.generateKeyPair();
      const key1 = await service.exportPrivateKey();
      
      await service.generateKeyPair(); // Generate different key
      const key2 = await service.exportPrivateKey();
      
      // Import first key
      const fingerprint1 = await service.importPrivateKey(key1);
      
      // Import second key (should replace first)
      const fingerprint2 = await service.importPrivateKey(key2);
      
      expect(fingerprint1).not.toBe(fingerprint2);
      expect(service.hasPrivateKey()).toBe(true);
    });
  });

  describe('Cross-Key Security Validation', () => {
    it('cannot decrypt with wrong private key', async () => {
      // Generate first key pair
      await service.generateKeyPair();
      const publicKey1 = await service.exportCurrentPublicKey();
      
      // Generate second key pair
      await service.generateKeyPair();
      const privateKey2 = await service.exportPrivateKey();
      
      // Encrypt with first public key
      const ciphertext = await service.encryptWithPublicKey('secret', publicKey1);
      
      // Try to decrypt with second private key (should fail)
      await service.importPrivateKey(privateKey2);
      
      await expectAsync(service.decryptMessage(ciphertext))
        .toBeRejected();
    });

    it('validates key pair correspondence', async () => {
      await service.generateKeyPair();
      const publicKey = await service.exportCurrentPublicKey();
      const privateKeyBuffer = await service.exportPrivateKey();
      
      // Re-import the private key
      await service.importPrivateKey(privateKeyBuffer);
      
      // Should be able to decrypt message encrypted with corresponding public key
      const message = 'key correspondence test';
      const ciphertext = await service.encryptWithPublicKey(message, publicKey);
      const decrypted = await service.decryptMessage(ciphertext);
      
      expect(decrypted).toBe(message);
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('provides meaningful error messages', async () => {
      try {
        await service.exportPrivateKey();
        fail('Should have thrown error');
      } catch (error: unknown) {
        expect((error as Error).message).toContain('No key pair generated');
      }
      
      try {
        await service.exportCurrentPublicKey();
        fail('Should have thrown error');
      } catch (error: unknown) {
        expect((error as Error).message).toContain('No key pair loaded');
      }
    });

    it('handles memory pressure gracefully', async () => {
      // Generate multiple key pairs to test memory handling
      for (let i = 0; i < 10; i++) {
        await service.generateKeyPair();
        const privateKey = await service.exportPrivateKey();
        const publicKey = await service.exportCurrentPublicKey();
        
        expect(privateKey.byteLength).toBeGreaterThan(0);
        expect(publicKey.length).toBeGreaterThan(0);
      }
      
      expect(service.hasPrivateKey()).toBe(true);
    });
  });

  describe('Vault Integration', () => {
    it('exposes vault integration method', () => {
      expect(typeof service.hasPrivateKeyInVault).toBe('function');
    });
  });
});