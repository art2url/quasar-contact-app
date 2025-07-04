// Chat entry for the chat list
export interface ChatEntry {
  id: string;
  name: string;
  lastMessage?: string;
  lastTs?: number;
  unread: number;
  online: boolean;
  avatar?: string;
}

// What a single message bubble looks like in the UI
export interface ChatMsg {
  id?: string; // Mongo _id (undefined while "pending")
  sender: 'You' | string; // "You" | partner alias
  text: string; // already-decrypted payload (or fallback)
  ts: number; // epoch-millis
  status?: 'pending' | 'sent' | 'delivered' | 'read';
  avatarUrl?: string; // future-use
  ct?: string; // raw cipher – kept only for my own bubbles
  editedAt?: number; // epoch ms (undefined = never edited)
  deletedAt?: number; // epoch ms when sender deleted it (tomb‑stone)
  readAt?: number; // epoch ms when partner read it
}

// How sent bubbles are memo-ised in the vault
export interface SentCacheEntry {
  id: string; // messageId OR "pending::<ts>"
  text: string; // plaintext
  ts: number; // epoch-millis
}
