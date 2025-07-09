import { Injectable } from '@angular/core';
import { BehaviorSubject, filter, firstValueFrom, map, take } from 'rxjs';

const STORE = 'kv';
const KEY_ID = 'aes-key';

// Use consistent key name throughout app
export const VAULT_KEYS = {
  PRIVATE_KEY: 'my_rsa_private_key', // Single consistent name
} as const;

interface BlobRecord {
  iv: number[];
  data: number[];
}

// Interface for serializable data
interface SerializableData {
  type: 'string' | 'object' | 'arraybuffer';
  data: string | object | number[];
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((res, rej) => {
    tx.oncomplete = () => res();
    tx.onabort = () => rej(tx.error);
    tx.onerror = () => rej(tx.error);
  });
}

@Injectable({ providedIn: 'root' })
export class VaultService {
  private userId: string | null = null;
  private db: IDBDatabase | null = null;
  private aesKey!: CryptoKey;
  private ready$ = new BehaviorSubject<boolean>(false);

  async setCurrentUser(uid: string, readOnly = false): Promise<void> {
    if (uid === this.userId && this.ready$.value) return;
    this.userId = uid;
    this.ready$.next(false);
    await this.open(readOnly);
    this.ready$.next(true);
  }

  async waitUntilReady(): Promise<void> {
    await firstValueFrom(
      this.ready$.pipe(
        filter((v): v is true => v),
        take(1),
        map(() => void 0)
      )
    );
  }

  async set(objKey: string, value: unknown): Promise<void> {
    await this.waitUntilReady();

    if (value === null || value === undefined) {
      const tx = await this.safeTx('readwrite');
      tx.objectStore(STORE).delete(objKey);
      await txDone(tx);
      return;
    }

    // Properly serialize different data types
    const serializable = this.prepareForSerialization(value);
    const payload = JSON.stringify(serializable);

    const iv = crypto.getRandomValues(new Uint8Array(12));
    const cipher = await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv },
      this.aesKey,
      new TextEncoder().encode(payload)
    );

    const rec: BlobRecord = {
      iv: Array.from(iv),
      data: Array.from(new Uint8Array(cipher)),
    };
    const tx = await this.safeTx('readwrite');
    tx.objectStore(STORE).put(rec, objKey);
    await txDone(tx);
  }

  async get<T>(objKey: string): Promise<T | undefined> {
    await this.waitUntilReady();
    const tx = await this.safeTx('readonly');
    const req = tx.objectStore(STORE).get(objKey);
    const rec = await new Promise<BlobRecord | undefined>(r => {
      req.onsuccess = () => r(req.result as BlobRecord | undefined);
      req.onerror = () => r(undefined);
    });
    if (!rec) return undefined;

    try {
      const plain = await crypto.subtle.decrypt(
        { name: 'AES-GCM', iv: new Uint8Array(rec.iv) },
        this.aesKey,
        new Uint8Array(rec.data)
      );

      const serializable = JSON.parse(
        new TextDecoder().decode(plain)
      ) as SerializableData;

      // Properly deserialize different data types
      return this.restoreFromSerialization(serializable) as T;
    } catch (err) {
      console.warn('[Vault] decrypt failed – probably stale key, ignoring.', err);
      return undefined;
    }
  }

  async keysStartingWith(prefix: string): Promise<string[]> {
    await this.waitUntilReady();
    const tx = await this.safeTx('readonly');
    const out: string[] = [];
    const cur = tx.objectStore(STORE).openKeyCursor();
    return new Promise(res => {
      cur.onsuccess = () => {
        const c = cur.result;
        if (!c) return res(out);
        if ((c.key as string).startsWith(prefix)) out.push(c.key as string);
        c.continue();
      };
    });
  }

  // Prepare data for JSON serialization
  private prepareForSerialization(value: unknown): SerializableData {
    if (value instanceof ArrayBuffer) {
      return {
        type: 'arraybuffer',
        data: Array.from(new Uint8Array(value)),
      };
    } else if (typeof value === 'string') {
      return {
        type: 'string',
        data: value,
      };
    } else {
      return {
        type: 'object',
        data: value as object,
      };
    }
  }

  // Restore data from serialized format
  private restoreFromSerialization(serializable: SerializableData): unknown {
    switch (serializable.type) {
      case 'arraybuffer':
        return new Uint8Array(serializable.data as number[]).buffer;
      case 'string':
        return serializable.data as string;
      case 'object':
      default:
        return serializable.data;
    }
  }

  private async open(readOnly = false): Promise<void> {
    if (!this.userId) throw new Error('VaultService: userId not set');
    const DB = `quasarVault-${this.userId}`;

    this.db = await new Promise<IDBDatabase>((resolve, reject) => {
      const req = indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => {
        req.result.onversionchange = () => {
          req.result.close();
          this.db = null;
        };
        resolve(req.result);
      };
      req.onerror = () => reject(req.error);
    });

    const keyReq = this.db.transaction(STORE).objectStore(STORE).get(KEY_ID);
    const raw = await new Promise<number[] | undefined>(res => {
      keyReq.onsuccess = () => res(keyReq.result as number[] | undefined);
      keyReq.onerror = () => res(undefined);
    });

    if (raw) {
      this.aesKey = await crypto.subtle.importKey(
        'raw',
        new Uint8Array(raw),
        'AES-GCM',
        true,
        ['encrypt', 'decrypt']
      );
    } else {
      if (readOnly) {
        throw new Error('Vault AES key missing - read-only mode');
      } else {
        this.aesKey = await crypto.subtle.generateKey(
          { name: 'AES-GCM', length: 256 },
          true,
          ['encrypt', 'decrypt']
        );
        const exported = await crypto.subtle.exportKey('raw', this.aesKey);

        const tx = this.db.transaction(STORE, 'readwrite');
        tx.objectStore(STORE).put(Array.from(new Uint8Array(exported)), KEY_ID);
        await txDone(tx);
      }
    }
  }

  private async safeTx(mode: IDBTransactionMode): Promise<IDBTransaction> {
    try {
      if (!this.db) {
        throw new Error('DB handle not available');
      }
      return this.db.transaction(STORE, mode);
    } catch (e: unknown) {
      const error = e as Error;
      if ((error?.name === 'InvalidStateError' || !this.db) && this.userId) {
        await this.open(false);
        return this.db!.transaction(STORE, mode);
      }
      throw e;
    }
  }

  // Temporary debugging method
  async debugVaultContents(): Promise<void> {
    if (!this.userId) {
      return;
    }


    try {
      // List all keys
      const allKeys = await this.keysStartingWith('');

      // Check specifically for private key
      const privateKey = await this.get<ArrayBuffer>(VAULT_KEYS.PRIVATE_KEY);

      // Test storing and retrieving a simple value
      const testValue = new Uint8Array([1, 2, 3, 4, 5]).buffer;
      await this.set('test_arraybuffer', testValue);
      const retrieved = await this.get<ArrayBuffer>('test_arraybuffer');


      // Clean up test
      await this.set('test_arraybuffer', null);
    } catch (error) {
      console.error('[Vault Debug] Error:', error);
    }
  }
}
