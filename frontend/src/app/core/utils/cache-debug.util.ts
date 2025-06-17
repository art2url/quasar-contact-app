// Debug utility for message cache issues
import { VaultService } from '@services/vault.service';

export class CacheDebugUtil {
  constructor(private vault: VaultService) {}

  /**
   * List all cache keys for a specific user and room
   */
  async listCacheKeys(userId: string, roomId: string): Promise<string[]> {
    const prefix = `sent_${userId}_${roomId}/`;
    const keys = await this.vault.keysStartingWith(prefix);

    console.log(
      `[CacheDebug] Found ${keys.length} cache keys for ${userId} -> ${roomId}:`
    );
    keys.forEach((key) => {
      console.log(`[CacheDebug]   - ${key}`);
    });

    return keys;
  }

  /**
   * Inspect a specific cache entry
   */
  async inspectCacheEntry(key: string): Promise<unknown> {
    const entry = await this.vault.get(key);
    console.log(`[CacheDebug] Cache entry '${key}':`, entry);
    return entry;
  }

  /**
   * Test timestamp parsing for debugging
   */
  testTimestampParsing(timestamps: (string | number | Date | unknown)[]): void {
    console.log('[CacheDebug] Testing timestamp parsing:');

    timestamps.forEach((ts) => {
      const result = this.parseTimestamp(ts);
      console.log(
        `[CacheDebug]   ${ts} (${typeof ts}) -> ${result} ${
          isNaN(result) ? '❌' : '✅'
        }`
      );
    });
  }

  private parseTimestamp(ts: string | number | Date | unknown): number {
    if (typeof ts === 'string') {
      // Try ISO string first
      let parsed = Date.parse(ts);
      if (!isNaN(parsed)) return parsed;

      // Try as number string
      parsed = parseInt(ts, 10);
      if (!isNaN(parsed)) return parsed;

      // Try as float string
      parsed = parseFloat(ts);
      return parsed;
    }

    if (typeof ts === 'number') {
      return ts;
    }

    if (ts instanceof Date) {
      return ts.getTime();
    }

    return NaN;
  }

  /**
   * Clear all cache entries for a user/room (use carefully!)
   */
  async clearCache(userId: string, roomId: string): Promise<void> {
    const prefix = `sent_${userId}_${roomId}/`;
    const keys = await this.vault.keysStartingWith(prefix);

    console.log(`[CacheDebug] Clearing ${keys.length} cache entries...`);

    for (const key of keys) {
      await this.vault.set(key, null);
    }

    console.log('[CacheDebug] Cache cleared');
  }
}

// Usage example (can be called from browser console):
// Add this to your component for debugging:
/*
async debugCache() {
  const debugUtil = new CacheDebugUtil(this.vault);
  const userId = localStorage.getItem('userId')!;
  const roomId = this.roomId; // or get from route
  
  await debugUtil.listCacheKeys(userId, roomId);
  
  // Test some timestamp parsing
  debugUtil.testTimestampParsing([
    '2024-01-25T10:30:00.000Z',
    '1748169410157',
    1748169410157,
    new Date(),
    'invalid'
  ]);
}
*/
