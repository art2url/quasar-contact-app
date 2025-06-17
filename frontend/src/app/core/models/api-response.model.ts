// Generic { message: string } wrapper many endpoints return
export interface StandardResponse {
  message: string;
}

// Response from POST /rooms/dm
export interface DmRoomResponse {
  roomId: string;
}

// Response from GET /api/keys/:userId
export interface KeyBundleResponse {
  publicKeyBundle: string;
  username: string;
  avatarUrl: string;
}

// Response from GET /messages/history/:id
export interface MessageHistoryResponse {
  messages: ServerMessage[];
}

// Response from GET /messages/overview
export interface MessageOverview {
  peerId: string;
  lastText: string;
  unread: number;
}

// Response from GET /messages/last/:id
export interface LastMessageResponse {
  messageId: string;
  ciphertext: string;
  timestamp: string;
}

// Server message model
export interface ServerMessage {
  _id: string;
  senderId: string;
  ciphertext: string;
  createdAt: string;
  editedAt?: string;
  deleted?: boolean;
  deletedAt?: string;
  read?: boolean;
  avatarUrl?: string;
}

// Backward-compatibility type
export type HistoryItem = ServerMessage;
