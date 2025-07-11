import { Injectable } from '@angular/core';
import type { VaultService } from './vault.service';

@Injectable({ providedIn: 'root' })
export class CryptoService {
  private keyPair: CryptoKeyPair | null = null;

  // Add a property to directly access the private key
  private privateKey: CryptoKey | null = null;

  /* ═══════════ Key‑pair handling ═══════════ */

  /** Generate an RSA‑OAEP key pair and return the public key (SPKI) as Base64. */
  async generateKeyPair(): Promise<string> {
    this.keyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    );

    // Store the private key for direct access
    this.privateKey = this.keyPair.privateKey;

    const spki = await crypto.subtle.exportKey('spki', this.keyPair.publicKey);
    return this.arrayBufferToBase64(spki);
  }

  /** Export the private key (PKCS8) as Base64. */
  async exportPrivateKey(): Promise<ArrayBuffer> {
    if (!this.keyPair?.privateKey) throw new Error('No key pair generated');
    return await crypto.subtle.exportKey('pkcs8', this.keyPair.privateKey);
  }

  /** Export the current public key as Base64 string */
  async exportCurrentPublicKey(): Promise<string> {
    if (!this.keyPair?.publicKey) throw new Error('No key pair loaded');
    const spki = await crypto.subtle.exportKey('spki', this.keyPair.publicKey);
    return this.arrayBufferToBase64(spki);
  }

  /**
   * Import a private key from ArrayBuffer or Base64 string.
   * Returns the SHA‑256 fingerprint (hex pairs joined by `:`).
   */
  async importPrivateKey(key: ArrayBuffer | string): Promise<string /* fingerprint */> {
    let raw: ArrayBuffer;

    if (typeof key === 'string') {
      // Handle string input (PEM or base64)
      const clean = key
        .replace(/-----(BEGIN|END)[^]+?-----/g, '') // remove header/footer
        .replace(/\s+/g, ''); // remove all whitespace

      raw = this.base64ToArrayBuffer(clean);
    } else {
      // It's already an ArrayBuffer
      raw = key;
    }

    try {
      const privateKey = await crypto.subtle.importKey(
        'pkcs8',
        raw,
        { name: 'RSA-OAEP', hash: 'SHA-256' },
        true,
        ['decrypt']
      );

      // Store the private key for direct access
      this.privateKey = privateKey;

      // Try to derive the public key, but don't fail if it doesn't work
      let publicKey: CryptoKey;
      try {
        publicKey = await this.derivePublicKeyFromPrivate(privateKey);
      } catch (error) {
        console.warn('[CryptoService] Failed to derive public key, using private key for both:', error);
        // Use the private key as a fallback (this is mainly for the keyPair structure)
        publicKey = privateKey;
      }

      // Set up the key pair with both keys
      this.keyPair = { privateKey, publicKey };

      // Return the SHA-256 fingerprint
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
      return Array.from(hash)
        .map(b => b.toString(16).padStart(2, '0'))
        .join(':');
    } catch (err) {
      console.error('Failed to import private key:', err);
      throw new Error(
        `Failed to import private key: ${
          err instanceof Error ? err.message : String(err)
        }`
      );
    }
  }

  /**
   * Derive the public key from a private key
   */
  private async derivePublicKeyFromPrivate(privateKey: CryptoKey): Promise<CryptoKey> {
    // Export the private key to get the key material
    const privateKeyData = await crypto.subtle.exportKey('pkcs8', privateKey);
    
    // Create a temporary key pair to extract the public key
    const tempKeyPair = await crypto.subtle.generateKey(
      {
        name: 'RSA-OAEP',
        modulusLength: 2048,
        publicExponent: new Uint8Array([1, 0, 1]),
        hash: 'SHA-256',
      },
      true,
      ['encrypt', 'decrypt']
    );

    // Re-import the private key to get access to the algorithm parameters
    const reimportedPrivateKey = await crypto.subtle.importKey(
      'pkcs8',
      privateKeyData,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['decrypt']
    );

    // Use the jwk format to extract the public key components from the private key
    const jwkPrivateKey = await crypto.subtle.exportKey('jwk', reimportedPrivateKey);
    
    // Create a public key JWK from the private key JWK
    const jwkPublicKey = {
      kty: jwkPrivateKey.kty,
      use: jwkPrivateKey.use,
      key_ops: ['encrypt'],
      alg: jwkPrivateKey.alg,
      n: jwkPrivateKey.n,
      e: jwkPrivateKey.e,
    };

    // Import the public key
    const publicKey = await crypto.subtle.importKey(
      'jwk',
      jwkPublicKey,
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt']
    );

    return publicKey;
  }

  /* ═══════════ Encryption helpers ═══════════ */

  async encryptWithPublicKey(message: string, base64PublicKey: string): Promise<string> {
    /* ── 1. prepare peer's RSA key ───────────────────────── */
    const peerKey = await crypto.subtle.importKey(
      'spki',
      this.base64ToArrayBuffer(base64PublicKey),
      { name: 'RSA-OAEP', hash: 'SHA-256' },
      true,
      ['encrypt']
    );

    /* ── 2. generate a one-off AES-GCM key ───────────────── */
    const aesKey = await crypto.subtle.generateKey(
      { name: 'AES-GCM', length: 256 },
      true,
      ['encrypt', 'decrypt']
    );

    /* ── 3. encrypt the plaintext with AES-GCM ───────────── */
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipherBuf = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      aesKey,
      new TextEncoder().encode(message)
    );

    /* ── 4. wrap AES key with RSA-OAEP ───────────────────── */
    const rawAes = await crypto.subtle.exportKey('raw', aesKey);
    const wrappedKey = await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, peerKey, rawAes);

    /* ── 5. pack & base64-encode the payload ─────────────── */
    return btoa(
      JSON.stringify({
        k: this.buf2b64(wrappedKey), // RSA-encrypted AES key
        c: this.buf2b64(cipherBuf), // AES cipher
        iv: this.buf2b64(iv.buffer), // IV
      })
    );
  }

  // Track failed decryption attempts to prevent spam
  private decryptionFailureCount = new Map<
    string,
    { count: number; lastAttempt: number }
  >();
  private readonly MAX_LOGGED_FAILURES = 1; // Reduce spam
  private readonly FAILURE_RESET_TIME = 60000; // 1 minute

  async decryptMessage(cipherTextBase64: string): Promise<string> {
    // Use the direct privateKey property
    if (!this.privateKey) throw new Error('Missing private key');

    try {
      /* ── 1. unpack the envelope ──────────────────────────── */
      const { k, c, iv } = JSON.parse(atob(cipherTextBase64));

      /* ── 2. unwrap AES key with our RSA private key ──────── */
      const rawAes = await crypto.subtle.decrypt(
        { name: 'RSA-OAEP' },
        this.privateKey,
        this.b64ToBuf(k)
      ).catch(error => {
        // Silently re-throw RSA decryption errors - these are expected for old messages
        throw error;
      });
      const aesKey = await crypto.subtle.importKey(
        'raw',
        rawAes,
        { name: 'AES-GCM', length: 256 },
        false,
        ['decrypt']
      );

      /* ── 3. decrypt payload with AES-GCM ─────────────────── */
      const plainBuf = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: this.b64ToBuf(iv) },
        aesKey,
        this.b64ToBuf(c)
      );

      // Reset failure count on successful decryption
      const failureKey = this.getFailureKey(cipherTextBase64);
      this.decryptionFailureCount.delete(failureKey);

      return new TextDecoder().decode(plainBuf);
    } catch (error) {
      // Throttle error logging to prevent console spam
      this.logDecryptionError(cipherTextBase64, error);
      throw error;
    }
  }

  /**
   * Track decryption errors silently - no console logging since these are expected for old messages
   */
  private logDecryptionError(cipherTextBase64: string, _error: unknown): void {
    const failureKey = this.getFailureKey(cipherTextBase64);
    const now = Date.now();
    const existing = this.decryptionFailureCount.get(failureKey);

    if (!existing) {
      // First failure - track it silently
      this.decryptionFailureCount.set(failureKey, {
        count: 1,
        lastAttempt: now,
      });
      // No logging - these are expected decryption failures for old messages
    } else {
      // Check if we should reset the counter
      if (now - existing.lastAttempt > this.FAILURE_RESET_TIME) {
        this.decryptionFailureCount.set(failureKey, {
          count: 1,
          lastAttempt: now,
        });
        // No logging - silent tracking only
      } else {
        // Update the count silently
        existing.count++;
        existing.lastAttempt = now;
        // No logging - these errors are expected for messages encrypted with previous keys
      }
    }
  }

  /**
   * Generate a key for tracking decryption failures
   */
  private getFailureKey(cipherTextBase64: string): string {
    // Use a hash of the first 50 characters to avoid storing full cipher text
    return cipherTextBase64.substring(0, 50);
  }

  /* ═══════════ Utility helpers ═══════════ */

  private base64ToArrayBuffer(b64: string): ArrayBuffer {
    const bin = atob(b64);
    const len = bin.length;
    const bytes = new Uint8Array(len);
    for (let i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  private arrayBufferToBase64(buf: ArrayBuffer): string {
    const bytes = new Uint8Array(buf);
    let bin = '';
    bytes.forEach(b => (bin += String.fromCharCode(b)));
    return btoa(bin);
  }

  /* ──────────────────────────────────────────────────────── */
  private buf2b64(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  private b64ToBuf(b64: string): ArrayBuffer {
    const bin = atob(b64);
    return Uint8Array.from(bin, c => c.charCodeAt(0)).buffer;
  }

  // Check if private key is available
  hasPrivateKey(): boolean {
    return !!this.privateKey;
  }

  // Check if private key is available in vault (for persistent check across reloads)
  async hasPrivateKeyInVault(vault: VaultService, userId: string): Promise<boolean> {
    try {
      const { VAULT_KEYS } = await import('./vault.service');
      
      
      // Ensure vault is set up with user ID - USE READ-ONLY MODE to prevent automatic AES key generation
      await vault.setCurrentUser(userId, true); // true = read-only mode
      await vault.waitUntilReady();
      
      
      const privateKeyData = await vault.get(VAULT_KEYS.PRIVATE_KEY) as ArrayBuffer;
      const hasKey = !!privateKeyData;
      
      
      return hasKey;
    } catch (error) {
      console.error('🔑 [VAULT CHECK] Error (this is expected if vault/keys are missing):', error);
      // If vault fails to open in read-only mode, it means the AES key is missing
      // which indicates the vault is corrupted/missing, so no private key exists
      return false;
    }
  }

  // Clear private key state to force clean import
  clearPrivateKey(): void {
    this.privateKey = null;
    this.keyPair = null;
  }
}
