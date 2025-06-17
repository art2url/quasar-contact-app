import { Injectable } from '@angular/core';

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

  /**
   * Import a private key from ArrayBuffer or Base64 string.
   * Returns the SHA‑256 fingerprint (hex pairs joined by `:`).
   */
  async importPrivateKey(
    key: ArrayBuffer | string
  ): Promise<string /* fingerprint */> {
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

      if (!this.keyPair) {
        this.keyPair = { privateKey, publicKey: null! };
      } else {
        this.keyPair.privateKey = privateKey;
      }

      // Return the SHA-256 fingerprint
      const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', raw));
      return Array.from(hash)
        .map((b) => b.toString(16).padStart(2, '0'))
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

  /* ═══════════ Encryption helpers ═══════════ */

  async encryptWithPublicKey(
    message: string,
    base64PublicKey: string
  ): Promise<string> {
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
    const wrappedKey = await crypto.subtle.encrypt(
      { name: 'RSA-OAEP' },
      peerKey,
      rawAes
    );

    /* ── 5. pack & base64-encode the payload ─────────────── */
    return btoa(
      JSON.stringify({
        k: this.buf2b64(wrappedKey), // RSA-encrypted AES key
        c: this.buf2b64(cipherBuf), // AES cipher
        iv: this.buf2b64(iv.buffer), // IV
      })
    );
  }

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
      );
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
      return new TextDecoder().decode(plainBuf);
    } catch (error) {
      console.error('Decryption error:', error);
      throw error;
    }
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
    bytes.forEach((b) => (bin += String.fromCharCode(b)));
    return btoa(bin);
  }

  /* ──────────────────────────────────────────────────────── */
  private buf2b64(buf: ArrayBuffer): string {
    return btoa(String.fromCharCode(...new Uint8Array(buf)));
  }

  private b64ToBuf(b64: string): ArrayBuffer {
    const bin = atob(b64);
    return Uint8Array.from(bin, (c) => c.charCodeAt(0)).buffer;
  }

  // Check if private key is available
  hasPrivateKey(): boolean {
    return !!this.privateKey;
  }
}
