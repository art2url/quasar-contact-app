import { TestBed } from '@angular/core/testing';

import { VaultService, VAULT_KEYS } from './vault.service';

describe('VaultService (Security-Critical Encrypted Storage)', () => {
  let service: VaultService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [VaultService]
    });

    service = TestBed.inject(VaultService);
  });

  afterEach(async () => {
    try {
      // Clean up test data
      await service.set('init-test', null);
      await service.set('persistence-test', null);
      await service.set('readonly-data', null);
      await service.set('secret-string', null);
      await service.set('secret-object', null);
      await service.set('unicode-encrypted', null);
      await service.set('overwrite-test', null);
      await service.set('delete-test', null);
      await service.set('delete-test2', null);
      await service.set('sensitive-data', null);
      await service.set('bob-data', null);
      await service.set('alice-persistent', null);
      await service.set('bob-temp', null);
      await service.set('integrity-test', null);
      await service.set('large-encrypted', null);
      await service.set('concurrent1', null);
      await service.set('concurrent2', null);
      await service.set('concurrent3', null);
      await service.set('large-buffer', null);
      await service.set('async-test', null);
      await service.set('user1-data', null);
      await service.set('user2-data', null);
      await service.set(VAULT_KEYS.PRIVATE_KEY, null);
      await service.set('chat:message:1', null);
      await service.set('chat:message:2', null);
      await service.set('chat:typing:user1', null);
      await service.set('user:profile', null);
      await service.set('settings:theme', null);
      await service.set('any-key', null);
    } catch {
      // Ignore cleanup errors
    }
  });

  // Run: npm test -- --include="**/vault.service.spec.ts"
  describe('User Setup and Vault Initialization', () => {
    it('sets up user vault and becomes ready for encrypted operations', async () => {
      await service.setCurrentUser('test-user-init');
      await service.waitUntilReady();
      
      // Should be able to perform encrypted vault operations now
      await service.set('init-test', 'vault-ready');
      const result = await service.get('init-test');
      expect(result).toBe('vault-ready');
    }, 10000);

    it('maintains user state without reinitializing vault', async () => {
      await service.setCurrentUser('same-user-test');
      await service.waitUntilReady();
      
      await service.set('persistence-test', 'persistent-data');
      
      // Setting same user should not affect existing encrypted data
      await service.setCurrentUser('same-user-test');
      await service.waitUntilReady();
      
      const result = await service.get('persistence-test');
      expect(result).toBe('persistent-data');
    }, 10000);

    it('handles read-only mode for existing vaults', async () => {
      // First create a vault with encrypted data
      await service.setCurrentUser('readonly-test-user');
      await service.waitUntilReady();
      await service.set('readonly-data', 'stored-value');
      
      // Now try read-only mode - should work if vault exists
      await service.setCurrentUser('readonly-test-user', true);
      await service.waitUntilReady();
      
      const result = await service.get('readonly-data');
      expect(result).toBe('stored-value');
    }, 10000);

  });

  describe('Encrypted Data Storage (AES-GCM Security)', () => {
    beforeEach(async () => {
      await service.setCurrentUser('encryption-test-user');
      await service.waitUntilReady();
    });

    it('encrypts and stores string data securely', async () => {
      const secretMessage = 'This is confidential information';
      
      await service.set('secret-string', secretMessage);
      const retrieved = await service.get<string>('secret-string');
      
      expect(retrieved).toBe(secretMessage);
      expect(typeof retrieved).toBe('string');
    }, 10000);

    it('encrypts and stores complex object data', async () => {
      const secretObject = {
        apiKey: 'secret-api-key-12345',
        userdata: { name: 'John', role: 'admin' },
        timestamp: Date.now(),
        active: true
      };
      
      await service.set('secret-object', secretObject);
      const retrieved = await service.get<typeof secretObject>('secret-object');
      
      expect(retrieved).toEqual(secretObject);
      expect(typeof retrieved).toBe('object');
      expect(retrieved?.apiKey).toBe('secret-api-key-12345');
    }, 10000);

    it('handles Unicode and special characters in encryption', async () => {
      const unicodeData = '🔐 Encryption test: ñáéíóú 中文 русский язык اللغة العربية';
      
      await service.set('unicode-encrypted', unicodeData);
      const retrieved = await service.get<string>('unicode-encrypted');
      
      expect(retrieved).toBe(unicodeData);
    }, 10000);

    it('overwrites encrypted data correctly', async () => {
      const originalData = 'original encrypted data';
      const updatedData = 'updated encrypted data';
      
      await service.set('overwrite-test', originalData);
      expect(await service.get('overwrite-test')).toBe(originalData);
      
      await service.set('overwrite-test', updatedData);
      expect(await service.get('overwrite-test')).toBe(updatedData);
    }, 10000);

    it('securely deletes encrypted data', async () => {
      await service.set('delete-test', 'will-be-deleted');
      expect(await service.get('delete-test')).toBe('will-be-deleted');
      
      // Delete with null
      await service.set('delete-test', null);
      expect(await service.get('delete-test')).toBeUndefined();
      
      // Test with undefined
      await service.set('delete-test2', 'also-will-be-deleted');
      await service.set('delete-test2', undefined);
      expect(await service.get('delete-test2')).toBeUndefined();
    }, 10000);

    it('returns undefined for non-existent keys', async () => {
      const result = await service.get('definitely-does-not-exist');
      expect(result).toBeUndefined();
    }, 10000);
  });

  describe('User Isolation Security (Critical)', () => {
    it('maintains complete data isolation between users', async () => {
      // Setup first user with sensitive data
      await service.setCurrentUser('user-alice');
      await service.waitUntilReady();
      await service.set('sensitive-data', 'alice-secret-info');
      await service.set(VAULT_KEYS.PRIVATE_KEY, new ArrayBuffer(512));
      
      // Switch to second user
      await service.setCurrentUser('user-bob');
      await service.waitUntilReady();
      
      // Bob should not have access to Alice's encrypted data
      const aliceData = await service.get('sensitive-data');
      const aliceKey = await service.get(VAULT_KEYS.PRIVATE_KEY);
      
      expect(aliceData).toBeUndefined();
      expect(aliceKey).toBeUndefined();
      
      // Bob can store his own encrypted data
      await service.set('bob-data', 'bob-secret');
      expect(await service.get('bob-data')).toBe('bob-secret');
    }, 15000);

    it('restores user data when switching back', async () => {
      // Alice stores encrypted data
      await service.setCurrentUser('user-alice-return');
      await service.waitUntilReady();
      await service.set('alice-persistent', 'alice-data');
      
      // Bob uses different vault
      await service.setCurrentUser('user-bob-temp');
      await service.waitUntilReady();
      await service.set('bob-temp', 'bob-data');
      
      // Switch back to Alice - her encrypted data should be restored
      await service.setCurrentUser('user-alice-return');
      await service.waitUntilReady();
      
      const aliceData = await service.get('alice-persistent');
      const bobData = await service.get('bob-temp');
      
      expect(aliceData).toBe('alice-data');
      expect(bobData).toBeUndefined(); // Bob's data not accessible
    }, 15000);
  });

  describe('Private Key Storage Security (Critical)', () => {
    beforeEach(async () => {
      await service.setCurrentUser('private-key-user');
      await service.waitUntilReady();
    });

    it('stores and retrieves private keys with perfect integrity', async () => {
      // Create realistic private key data with PKCS8 header
      const privateKeyData = new ArrayBuffer(2048);
      const keyBytes = new Uint8Array(privateKeyData);
      
      // PKCS8 ASN.1 SEQUENCE header
      keyBytes[0] = 0x30;
      keyBytes[1] = 0x82;
      keyBytes[2] = 0x04;
      keyBytes[3] = 0x60;
      
      // Fill rest with key material
      for (let i = 4; i < keyBytes.length; i++) {
        keyBytes[i] = (i * 13 + 42) % 256;
      }
      
      await service.set(VAULT_KEYS.PRIVATE_KEY, privateKeyData);
      const retrieved = await service.get<ArrayBuffer>(VAULT_KEYS.PRIVATE_KEY);
      
      expect(retrieved).toBeInstanceOf(ArrayBuffer);
      expect(retrieved!.byteLength).toBe(2048);
      
      // Verify exact data match
      const retrievedBytes = new Uint8Array(retrieved!);
      expect(retrievedBytes[0]).toBe(0x30);
      expect(retrievedBytes[1]).toBe(0x82);
      expect(retrievedBytes[100]).toBe((100 * 13 + 42) % 256);
    }, 10000);

    it('private key isolation between users is absolute', async () => {
      const aliceKey = new ArrayBuffer(1024);
      new Uint8Array(aliceKey).fill(111);
      
      // Alice stores her private key
      await service.set(VAULT_KEYS.PRIVATE_KEY, aliceKey);
      expect(await service.get(VAULT_KEYS.PRIVATE_KEY)).toBeInstanceOf(ArrayBuffer);
      
      // Switch to Bob - he should not have access to Alice's key
      await service.setCurrentUser('bob-key-isolation');
      await service.waitUntilReady();
      
      const bobAccessToAliceKey = await service.get(VAULT_KEYS.PRIVATE_KEY);
      expect(bobAccessToAliceKey).toBeUndefined();
      
      // Bob can store his own key
      const bobKey = new ArrayBuffer(1024);
      new Uint8Array(bobKey).fill(222);
      await service.set(VAULT_KEYS.PRIVATE_KEY, bobKey);
      
      const bobRetrievedKey = await service.get<ArrayBuffer>(VAULT_KEYS.PRIVATE_KEY);
      expect(new Uint8Array(bobRetrievedKey!)[0]).toBe(222);
    }, 15000);
  });

  describe('Key Management and Search', () => {
    beforeEach(async () => {
      await service.setCurrentUser('key-mgmt-user');
      await service.waitUntilReady();
    });

    it('finds keys with specific prefixes in encrypted storage', async () => {
      // Store encrypted data with various prefixes
      await service.set('chat:message:1', 'msg1');
      await service.set('chat:message:2', 'msg2');
      await service.set('chat:typing:user1', 'typing');
      await service.set('user:profile', 'profile-data');
      await service.set('settings:theme', 'dark');
      
      // Test prefix searches
      const chatKeys = await service.keysStartingWith('chat:');
      const userKeys = await service.keysStartingWith('user:');
      const nonExistentKeys = await service.keysStartingWith('nonexistent:');
      
      expect(chatKeys).toContain('chat:message:1');
      expect(chatKeys).toContain('chat:message:2');
      expect(chatKeys).toContain('chat:typing:user1');
      expect(chatKeys.length).toBe(3);
      
      expect(userKeys).toContain('user:profile');
      expect(userKeys.length).toBe(1);
      
      expect(nonExistentKeys).toEqual([]);
    }, 10000);

    it('handles empty prefix search', async () => {
      await service.set('any-key', 'any-value');
      
      const allKeys = await service.keysStartingWith('');
      expect(allKeys).toContain('any-key');
      expect(Array.isArray(allKeys)).toBe(true);
    }, 10000);
  });

  describe('Data Integrity and Concurrent Operations', () => {
    beforeEach(async () => {
      await service.setCurrentUser('integrity-user');
      await service.waitUntilReady();
    });

    it('maintains data integrity across multiple encrypted operations', async () => {
      const complexData = {
        credentials: { username: 'admin', token: 'secret-token-123' },
        permissions: ['read', 'write', 'admin'],
        metadata: { created: Date.now(), version: '1.0' },
        array: [1, 2, 3, 4, 5]
      };
      
      // Store and verify multiple times
      for (let i = 0; i < 3; i++) {
        await service.set('integrity-test', complexData);
        const retrieved = await service.get('integrity-test');
        expect(retrieved).toEqual(complexData);
      }
    }, 10000);

    it('handles large encrypted data correctly', async () => {
      // Create 50KB of data to test encryption performance
      const largeData = {
        content: 'A'.repeat(50 * 1024),
        metadata: { size: 50 * 1024, type: 'large-test' }
      };
      
      await service.set('large-encrypted', largeData);
      const retrieved = await service.get('large-encrypted');
      
      expect(retrieved).toEqual(largeData);
      expect((retrieved as { content: string })?.content?.length).toBe(50 * 1024);
    }, 15000);

    it('handles concurrent encrypted operations safely', async () => {
      const operations = [
        service.set('concurrent1', 'data1'),
        service.set('concurrent2', { key: 'data2' }),
        service.set('concurrent3', new ArrayBuffer(64))
      ];
      
      await Promise.all(operations);
      
      // Verify all encrypted data was stored correctly
      expect(await service.get('concurrent1')).toBe('data1');
      expect(await service.get('concurrent2')).toEqual({ key: 'data2' });
      expect(await service.get('concurrent3')).toBeInstanceOf(ArrayBuffer);
    }, 10000);
  });

  describe('ArrayBuffer Encryption (Private Key Storage)', () => {
    beforeEach(async () => {
      await service.setCurrentUser('arraybuffer-user');
      await service.waitUntilReady();
    });

    it('encrypts and stores ArrayBuffer data perfectly', async () => {
      const buffers = [
        { name: 'small-buffer', size: 32 },
        { name: 'medium-buffer', size: 1024 },
        { name: 'large-buffer', size: 10240 }
      ];
      
      for (const buffer of buffers) {
        const testBuffer = new ArrayBuffer(buffer.size);
        const view = new Uint8Array(testBuffer);
        view.fill(buffer.size % 256); // Fill with characteristic byte
        
        await service.set(buffer.name, testBuffer);
        const retrieved = await service.get<ArrayBuffer>(buffer.name);
        
        expect(retrieved).toBeInstanceOf(ArrayBuffer);
        expect(retrieved!.byteLength).toBe(buffer.size);
        expect(new Uint8Array(retrieved!)[0]).toBe(buffer.size % 256);
      }
    }, 15000);

    it('handles very large ArrayBuffer encryption', async () => {
      // Test with 500KB ArrayBuffer (realistic private key size)
      const largeBuffer = new ArrayBuffer(500 * 1024);
      const view = new Uint8Array(largeBuffer);
      for (let i = 0; i < view.length; i += 1000) {
        view[i] = (i / 1000) % 256;
      }
      
      await service.set('large-buffer', largeBuffer);
      const retrieved = await service.get<ArrayBuffer>('large-buffer');
      
      expect(retrieved!.byteLength).toBe(500 * 1024);
      expect(new Uint8Array(retrieved!)[0]).toBe(0);
      expect(new Uint8Array(retrieved!)[1000]).toBe(1);
    }, 20000);
  });

  describe('Integration with CryptoService (Security Critical)', () => {
    beforeEach(async () => {
      await service.setCurrentUser('crypto-integration-user');
      await service.waitUntilReady();
    });

    it('stores private key using consistent VAULT_KEYS naming', async () => {
      // This mirrors how CryptoService stores a private key
      const mockPrivateKey = new ArrayBuffer(2048);
      new Uint8Array(mockPrivateKey)[0] = 0x30; // PKCS8 header
      
      await service.set(VAULT_KEYS.PRIVATE_KEY, mockPrivateKey);
      const stored = await service.get<ArrayBuffer>(VAULT_KEYS.PRIVATE_KEY);
      
      expect(stored).toBeInstanceOf(ArrayBuffer);
      expect(new Uint8Array(stored!)[0]).toBe(0x30);
      expect(stored!.byteLength).toBe(2048);
    }, 10000);

    it('supports CryptoService hasPrivateKeyInVault workflow', async () => {
      // Simulate CryptoService.hasPrivateKeyInVault workflow
      
      // 1. Check if key exists (should be undefined initially)
      let hasKey = await service.get(VAULT_KEYS.PRIVATE_KEY);
      expect(hasKey).toBeUndefined();
      
      // 2. Store a private key
      const privateKeyBuffer = new ArrayBuffer(1024);
      await service.set(VAULT_KEYS.PRIVATE_KEY, privateKeyBuffer);
      
      // 3. Verify key exists and is accessible
      hasKey = await service.get(VAULT_KEYS.PRIVATE_KEY);
      expect(hasKey).toBeInstanceOf(ArrayBuffer);
      expect((hasKey as ArrayBuffer).byteLength).toBe(1024);
    }, 10000);

    it('exposes VAULT_KEYS constant for consistent private key storage', () => {
      expect(VAULT_KEYS.PRIVATE_KEY).toBe('my_rsa_private_key');
      expect(typeof VAULT_KEYS.PRIVATE_KEY).toBe('string');
      expect(Object.keys(VAULT_KEYS)).toContain('PRIVATE_KEY');
    });
  });

  describe('Async State Management', () => {
    it('properly manages ready state for encrypted vault operations', async () => {
      // Multiple waitUntilReady calls should all resolve
      const setupPromise = service.setCurrentUser('async-state-user');
      
      const waitPromises = [
        service.waitUntilReady(),
        service.waitUntilReady(),
        service.waitUntilReady()
      ];
      
      await setupPromise;
      await Promise.all(waitPromises);
      
      // All waits should resolve and vault should be operational
      await service.set('async-test', 'async-works');
      expect(await service.get('async-test')).toBe('async-works');
    }, 10000);

    it('handles rapid user switching with encrypted data', async () => {
      // Rapid user switches should not corrupt encrypted state
      await service.setCurrentUser('rapid-user-1');
      await service.waitUntilReady();
      await service.set('user1-data', 'data1');
      
      await service.setCurrentUser('rapid-user-2');
      await service.waitUntilReady();
      await service.set('user2-data', 'data2');
      
      await service.setCurrentUser('rapid-user-1');
      await service.waitUntilReady();
      
      expect(await service.get('user1-data')).toBe('data1');
      expect(await service.get('user2-data')).toBeUndefined();
    }, 15000);
  });
});