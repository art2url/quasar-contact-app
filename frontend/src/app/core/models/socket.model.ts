// Chat message pushed by the server
export interface IncomingSocketMessage {
  fromUserId: string;
  messageId: string;
  fromUsername: string;
  ciphertext: string;
  timestamp: string; // ISO
  avatarUrl?: string;
}

// Typing indicator
export interface TypingPayload {
  fromUserId: string;
}

// Read receipt
export interface ReadPayload {
  messageId: string;
}

// Delete notification
export interface DeletePayload {
  messageId: string;
  deletedAt: string | number;
}

// Edit notification
export interface EditPayload {
  messageId: string;
  ciphertext: string;
  editedAt: string | number;
  avatarUrl?: string;
}

export interface AckPayload {
  messageId: string;
  timestamp: string | number;
}

// Backward-compat
export type MessageDeletedEvent = DeletePayload;
export type MessageEditedEvent = EditPayload;
