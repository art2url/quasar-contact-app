import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subscription } from 'rxjs';

import { WebSocketService } from '@services/websocket.service';
import { MessagesService } from '@services/messages.service';
import { UserService } from '@services/user.service';
import { CryptoService } from '@services/crypto.service';
import { VaultService } from '@services/vault.service';
import { toEpoch } from '@utils/date.util';
import { VAULT_KEYS } from '@services/vault.service';

/* shared domain types */
import { ChatMsg, SentCacheEntry } from '@models/chat.model';
import { ServerMessage } from '@models/api-response.model';
import {
  AckPayload,
  IncomingSocketMessage,
  MessageEditedEvent,
  MessageDeletedEvent,
  ReadPayload,
} from 'app/core/models/socket.model';

/**
 * Enhanced chat session service with better connection handling and fallback sync
 */
@Injectable()
export class ChatSessionService implements OnDestroy {
  /* ── public streams for the template ─────────────── */
  readonly theirUsername$ = new BehaviorSubject<string>('');
  readonly theirAvatar$ = new BehaviorSubject<string>('assets/images/avatars/01.svg');
  readonly messages$ = new BehaviorSubject<ChatMsg[]>([]);
  readonly keyLoading$ = new BehaviorSubject<boolean>(true);
  readonly keyMissing$ = new BehaviorSubject<boolean>(false);
  readonly connected$: Observable<boolean>;
  readonly partnerTyping$ = new BehaviorSubject<boolean>(false);
  readonly messagesLoading$ = new BehaviorSubject<boolean>(true);

  // Enhanced online status tracking
  public onlineStatus$!: BehaviorSubject<boolean>;
  private isPartnerOnline = false;

  /* ── misc ─────────────────────────────────────────── */
  private readonly meId = localStorage.getItem('userId')!;
  private subs = new Subscription();
  private theirPubKey: string | null = null;
  private roomId = '';
  private typingDebounce!: ReturnType<typeof setTimeout>;
  public partnerAvatar: string | undefined;

  // Initialization tracking
  private isInitialized = false;
  private isInitializing = false;

  // Message state management
  private pendingMessages = new Map<
    string,
    { timestamp: number; timeoutId: ReturnType<typeof setTimeout> }
  >();
  private tempMessages: ChatMsg[] = [];
  private loadingOperations = 0;

  // Enhanced connection monitoring
  private syncTimer: ReturnType<typeof setInterval> | null = null;
  private lastSyncTime = 0;
  private connectionLossDetected = false;
  private reconnectSyncInProgress = false;

  // Fallback sync mechanism
  private readonly SYNC_INTERVAL = 30000; // 30 seconds
  private readonly SYNC_ON_RECONNECT_DELAY = 2000; // 2 seconds after reconnect

  constructor(
    private ws: WebSocketService,
    private api: MessagesService,
    private users: UserService,
    private crypto: CryptoService,
    private vault: VaultService
  ) {
    this.connected$ = this.ws.isConnected$.asObservable();
    this.setupEventHandlers();
    this.startSyncMonitoring();
  }

  /**
   * Enhanced event handler setup with connection monitoring
   */
  private setupEventHandlers(): void {
    this.setupTypingHandler();
    this.setupMessageHandlers();
    this.setupConnectionHandlers();
  }

  /**
   * Setup connection monitoring for fallback sync
   */
  private setupConnectionHandlers(): void {
    // Monitor connection state changes
    this.subs.add(
      this.ws.isConnected$.subscribe(connected => {
        if (connected && this.connectionLossDetected) {
          console.log(
            '[ChatSession] Connection restored, scheduling sync and cleaning up stale messages'
          );
          this.connectionLossDetected = false;
          this.cleanupStalePendingMessages();
          this.scheduleReconnectSync();
        } else if (!connected) {
          console.log('[ChatSession] Connection lost, marking for sync');
          this.connectionLossDetected = true;
        }
      })
    );
  }

  /**
   * Setup message event handlers with better error handling
   */
  private setupMessageHandlers(): void {
    this.ws.onMessageEdited(this.messageEditedCb);
    this.ws.onMessageDeleted(this.messageDeletedCb);
    this.ws.onMessageSent(this.messageSentCb);
    this.ws.onMessageRead(this.messageReadCb);
  }

  /**
   * Enhanced message sent callback with fallback sync
   */
  private readonly messageSentCb = async ({ messageId, timestamp }: AckPayload) => {
    console.log(
      '[ChatSession] Message sent ack received for:',
      messageId,
      'at timestamp:',
      timestamp
    );

    try {
      // Always try to update pending messages, even during loading
      const success = await this.updatePendingMessage(messageId, timestamp);
      if (!success) {
        console.warn(
          '[ChatSession] Failed to update pending message, scheduling sync. MessageId:',
          messageId
        );
        this.scheduleFallbackSync();
      } else {
        console.log(
          '[ChatSession] Successfully updated pending message to sent/delivered:',
          messageId
        );
      }

      // Always update vault storage
      await this.updateVaultForSentMessage(messageId, timestamp);
      this.markPreviousMessagesAsRead();
    } catch (error) {
      console.error('[ChatSession] Error processing message sent ack:', error);
      this.scheduleFallbackSync();
    }
  };

  /**
   * Handle read receipts from the recipient
   */
  private readonly messageReadCb = async ({ messageId }: ReadPayload) => {
    console.log('[ChatSession] Message read receipt received for:', messageId);

    try {
      const messages = this.messages$.value;
      const messageIndex = messages.findIndex(m => m.id === messageId);

      if (messageIndex === -1) {
        console.warn('[ChatSession] Message not found for read receipt:', messageId);
        return;
      }

      const message = messages[messageIndex];
      if (message.sender !== 'You') {
        // Only update status for our own messages
        return;
      }

      // Update message status to read
      const updatedMessage: ChatMsg = {
        ...message,
        status: 'read',
        readAt: Date.now(),
      };

      const updatedMessages = [
        ...messages.slice(0, messageIndex),
        updatedMessage,
        ...messages.slice(messageIndex + 1),
      ];

      this.messages$.next(updatedMessages);
      console.log('[ChatSession] Updated message status to read:', messageId);
    } catch (error) {
      console.error('[ChatSession] Error processing read receipt:', error);
    }
  };

  /**
   * Update pending message with better error handling and proper message matching
   */
  private async updatePendingMessage(
    messageId: string,
    timestamp: string | number
  ): Promise<boolean> {
    const list = this.messages$.value;
    const serverTimestamp = +new Date(timestamp);

    // Find the pending message that best matches this acknowledgment
    // Strategy: Find the oldest pending message (FIFO order)
    let bestMatchIdx = -1;
    let oldestPendingTime = Number.MAX_SAFE_INTEGER;

    for (let i = 0; i < list.length; i++) {
      const msg = list[i];
      if (msg.status === 'pending' && !msg.id && msg.ts < oldestPendingTime) {
        bestMatchIdx = i;
        oldestPendingTime = msg.ts;
      }
    }

    if (bestMatchIdx === -1) {
      console.warn('[ChatSession] No pending message found for ack:', messageId);
      return false;
    }

    const pendingMessage = list[bestMatchIdx];
    const isUserOnline = this.ws.isUserOnline(this.roomId);
    const newStatus = isUserOnline ? 'delivered' : 'sent';

    const patched: ChatMsg = {
      ...pendingMessage,
      id: messageId,
      ts: serverTimestamp,
      status: newStatus,
    };

    // Clean up the pending message timeout using the original timestamp
    const pendingKey = `pending::${pendingMessage.ts}`;
    const pendingInfo = this.pendingMessages.get(pendingKey);
    if (pendingInfo) {
      clearTimeout(pendingInfo.timeoutId);
      this.pendingMessages.delete(pendingKey);
      console.log(
        '[ChatSession] Successfully acknowledged message, cleared timeout:',
        messageId
      );
    }

    // Update messages list
    this.messages$.next([
      ...list.slice(0, bestMatchIdx),
      patched,
      ...list.slice(bestMatchIdx + 1),
    ]);

    console.log(
      `[ChatSession] Message updated successfully: ${messageId} -> status: ${newStatus}`
    );

    // Update vault storage
    await this.updateVaultForSentMessage(messageId, timestamp, patched.text);
    return true;
  }

  /**
   * Update vault storage for sent message
   */
  private async updateVaultForSentMessage(
    messageId: string,
    timestamp: string | number,
    text?: string
  ): Promise<void> {
    try {
      // If no text provided, try to find it from the pending message that was just acknowledged
      if (!text) {
        const messages = this.messages$.value;
        const message = messages.find(m => m.id === messageId);
        if (message) {
          text = message.text;
        }
      }

      if (!text) {
        console.warn(
          `[ChatSession] No text found for message ${messageId}, skipping vault update`
        );
        return;
      }

      const serverTimestamp = +new Date(timestamp);
      const cacheEntry: SentCacheEntry = {
        id: messageId,
        text: text,
        ts: serverTimestamp,
      };

      console.log(
        `[ChatSession] Storing vault entry for ${messageId} with text: "${text.substring(
          0,
          20
        )}..."`
      );

      // Store with multiple keys for better retrieval
      await this.vault.set(this.key(messageId), cacheEntry);
      await this.vault.set(this.key(`server::${serverTimestamp}`), cacheEntry);

      console.log(
        `[ChatSession] Successfully updated vault storage for message: ${messageId}`
      );
    } catch (err) {
      console.error('[ChatSession] Error updating vault storage:', err);
    }
  }

  /**
   * Enhanced typing handler with connection awareness
   */
  private setupTypingHandler(): void {
    console.log('[ChatSession] Setting up typing indicator subscription');

    this.subs.add(
      this.ws.typing$.subscribe(({ fromUserId }) => {
        if (fromUserId !== this.roomId) return;

        // Only show typing if we have a good connection
        if (this.ws.isConnected()) {
          this.partnerTyping$.next(true);

          if (this.typingDebounce) clearTimeout(this.typingDebounce);
          this.typingDebounce = setTimeout(() => {
            this.partnerTyping$.next(false);
          }, 2000);
        }
      })
    );
  }

  /**
   * Start periodic sync monitoring
   */
  private startSyncMonitoring(): void {
    this.syncTimer = setInterval(() => {
      if (this.roomId && this.ws.isConnected()) {
        const timeSinceLastSync = Date.now() - this.lastSyncTime;

        // Sync if it's been too long since last sync
        if (timeSinceLastSync > this.SYNC_INTERVAL) {
          console.log('[ChatSession] Periodic sync check');
          this.scheduleFallbackSync();
        }
      }
    }, this.SYNC_INTERVAL);
  }

  /**
   * Schedule a fallback sync to ensure consistency
   */
  private scheduleFallbackSync(): void {
    if (this.reconnectSyncInProgress) return;

    console.log('[ChatSession] Scheduling fallback message sync');

    setTimeout(() => {
      this.performFallbackSync();
    }, 1000);
  }

  /**
   * Schedule sync after reconnection
   */
  private scheduleReconnectSync(): void {
    if (this.reconnectSyncInProgress) return;

    console.log('[ChatSession] Scheduling reconnect sync');

    setTimeout(() => {
      this.performReconnectSync();
    }, this.SYNC_ON_RECONNECT_DELAY);
  }

  /**
   * Perform fallback sync by re-fetching recent messages
   */
  private async performFallbackSync(): Promise<void> {
    if (!this.roomId || this.reconnectSyncInProgress) return;

    try {
      console.log('[ChatSession] Performing fallback sync');
      this.reconnectSyncInProgress = true;

      // Get current messages for comparison
      const currentMessages = this.messages$.value;
      const lastMessageTime =
        currentMessages.length > 0 ? Math.max(...currentMessages.map(m => m.ts)) : 0;

      // Fetch recent messages from server
      this.api.getMessageHistory(this.roomId).subscribe({
        next: async response => {
          const serverMessages = response.messages || [];
          let hasUpdates = false;

          for (const serverMsg of serverMessages) {
            const serverTimestamp = toEpoch(serverMsg.createdAt);

            // Check if message already exists (by ID or by content+timestamp for pending messages)
            const existingMsg = currentMessages.find(
              m =>
                m.id === serverMsg._id ||
                (m.status === 'pending' && Math.abs(m.ts - serverTimestamp) <= 5000)
            );
            if (existingMsg) {
              // If existing message is pending and we got server confirmation, update it
              if (existingMsg.status === 'pending' && !existingMsg.id) {
                const msgIndex = currentMessages.indexOf(existingMsg);
                if (msgIndex !== -1) {
                  const fromMe = serverMsg.senderId.toString() === this.meId;
                  currentMessages[msgIndex] = {
                    ...existingMsg,
                    id: serverMsg._id,
                    ts: serverTimestamp,
                    status: fromMe ? (serverMsg.read ? 'read' : 'sent') : undefined,
                    readAt: serverMsg.read ? toEpoch(serverMsg.createdAt) : undefined,
                  };
                  hasUpdates = true;
                  console.log(
                    '[ChatSession] Updated pending message with server data:',
                    serverMsg._id
                  );
                }
              }
              continue;
            }

            // Only process messages newer than our last known message
            if (serverTimestamp <= lastMessageTime) continue;

            // This is a new message we missed
            console.log('[ChatSession] Found missed message:', serverMsg._id);
            hasUpdates = true;

            const fromMe = serverMsg.senderId.toString() === this.meId;
            const sender = fromMe ? 'You' : (this.theirUsername$.value || 'Unknown User');

            let text: string;
            if (serverMsg.deleted) {
              text = '⋯ message deleted ⋯';
            } else if (fromMe) {
              text = await this.findCachedMessageText(serverMsg);
            } else {
              text = await this.tryDecrypt(serverMsg.ciphertext);
              // Mark as read since we're catching up
              if (!serverMsg.read) {
                this.ws.markMessageRead(serverMsg._id);
              }
            }

            const newMessage: ChatMsg = {
              id: serverMsg._id,
              sender,
              text,
              ts: serverTimestamp,
              status: fromMe ? (serverMsg.read ? 'read' : 'sent') : undefined,
              avatarUrl: this.getMessageAvatar(serverMsg, fromMe),
              editedAt: serverMsg.editedAt ? toEpoch(serverMsg.editedAt) : undefined,
              deletedAt: serverMsg.deleted ? toEpoch(serverMsg.deletedAt!) : undefined,
              readAt: serverMsg.read ? toEpoch(serverMsg.createdAt) : undefined,
            };

            currentMessages.push(newMessage);
          }

          if (hasUpdates) {
            // Sort messages and update
            currentMessages.sort((a, b) => a.ts - b.ts);
            this.messages$.next([...currentMessages]);
            console.log('[ChatSession] Applied fallback sync updates');
          }

          this.lastSyncTime = Date.now();
        },
        error: err => {
          console.error('[ChatSession] Fallback sync failed:', err);
        },
        complete: () => {
          this.reconnectSyncInProgress = false;
        },
      });
    } catch (error) {
      console.error('[ChatSession] Error in fallback sync:', error);
      this.reconnectSyncInProgress = false;
    }
  }

  /**
   * Perform sync after reconnection
   */
  private async performReconnectSync(): Promise<void> {
    console.log('[ChatSession] Performing reconnect sync');
    await this.performFallbackSync();
  }

  /**
   * Get appropriate avatar for message
   */
  private getMessageAvatar(serverMsg: ServerMessage, fromMe: boolean): string {
    if (fromMe) {
      return localStorage.getItem('myAvatar') || 'assets/images/avatars/01.svg';
    } else {
      return serverMsg.avatarUrl && serverMsg.avatarUrl.trim()
        ? serverMsg.avatarUrl
        : this.partnerAvatar || 'assets/images/avatars/01.svg';
    }
  }

  /* ═════ existing methods enhanced ═══════════════════ */

  async editMessage(id: string, newText: string) {
    // Optimistic update
    const list = this.messages$.value;
    const idx = list.findIndex(m => m.id === id);
    if (idx !== -1) {
      const patched: ChatMsg = {
        ...list[idx],
        text: newText,
        editedAt: Date.now(),
      };
      this.messages$.next([...list.slice(0, idx), patched, ...list.slice(idx + 1)]);

      await this.vault.set(this.key(id), {
        id,
        text: newText,
        ts: patched.ts,
      });
    }

    // Send to server
    try {
      let ct: string;
      if (this.theirPubKey && this.theirPubKey.trim()) {
        ct = await this.crypto.encryptWithPublicKey(newText, this.theirPubKey);
      } else {
        console.warn('[ChatSession] Editing unencrypted message - partner has no public key');
        ct = newText;
      }
      this.ws.sendEditMessage(id, ct, localStorage.getItem('myAvatar') ?? undefined);
    } catch (error) {
      console.error('[ChatSession] Failed to send edit message:', error);
      this.scheduleFallbackSync();
    }
  }

  async init(roomId: string): Promise<void> {
    if (this.isInitialized && this.roomId === roomId) {
      console.log('[ChatSession] Already initialized for room:', roomId);
      return;
    }

    if (this.isInitializing) {
      console.log('[ChatSession] Already initializing, skipping');
      return;
    }

    this.isInitializing = true;
    this.roomId = roomId;
    console.log('[ChatSession] Initializing session for room:', roomId);

    this.messagesLoading$.next(true);
    this.loadingOperations = 0;
    this.tempMessages = [];

    try {
      // Import private key
      if (!this.crypto.hasPrivateKey()) {
        console.log('[ChatSession] Loading private key from vault');
        await this.vault.waitUntilReady();

        const privateKeyData = await this.vault.get<ArrayBuffer>(VAULT_KEYS.PRIVATE_KEY);
        if (!privateKeyData) {
          console.error('[ChatSession] Private key not found in vault');
          this.keyMissing$.next(true);
          throw new Error('Private key not found in vault');
        }

        await this.crypto.importPrivateKey(privateKeyData);
        console.log('[ChatSession] Successfully imported private key');
      }

      // Remove existing listeners
      if (this.isInitialized) {
        this.ws.offReceiveMessage(this.incomingCb);
      }

      // Get partner's public key
      this.users.getPublicKey(roomId).subscribe({
        next: ({ publicKeyBundle, username, avatarUrl, hasPublicKey }) => {
          console.log('[ChatSession] Received partner data for:', username);
          
          // Always set username and avatar, regardless of public key status
          this.theirUsername$.next(username);
          const partnerAvatar =
            avatarUrl && avatarUrl.trim() ? avatarUrl : 'assets/images/avatars/01.svg';
          this.theirAvatar$.next(partnerAvatar);
          this.partnerAvatar = partnerAvatar;
          
          // Only set public key if user has one
          if (hasPublicKey && publicKeyBundle) {
            console.log('[ChatSession] Partner has public key, encryption enabled');
            this.theirPubKey = publicKeyBundle;
            this.keyLoading$.next(false);
            this.keyMissing$.next(false);
          } else {
            console.log('[ChatSession] Partner has no public key, encryption disabled');
            this.theirPubKey = null;
            this.keyLoading$.next(false);
            this.keyMissing$.next(true);
          }
        },
        error: err => {
          console.error('[ChatSession] Failed to get partner data:', err);
          // Set generic fallback username if API call fails completely
          this.theirUsername$.next('Unknown User');
          this.keyMissing$.next(true);
          this.keyLoading$.next(false);
        },
      });

      // Register for real-time messages
      this.ws.onReceiveMessage(this.incomingCb);

      // Load message history
      this.startLoadingOperation();
      this.loadMessageHistory();

      this.isInitialized = true;
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Load message history with better error handling
   */
  private loadMessageHistory(): void {
    this.api.getMessageHistory(this.roomId).subscribe({
      next: async res => {
        console.log('[ChatSession] Loading message history, count:', res.messages.length);
        const historyMessages: ChatMsg[] = [];

        for (const m of res.messages) {
          const fromMe = m.senderId.toString() === this.meId;
          const sender = fromMe ? 'You' : (this.theirUsername$.value || 'Unknown User');

          let status: 'pending' | 'sent' | 'read' | undefined = undefined;
          if (fromMe) {
            status = m.read ? 'read' : 'sent';
          }

          let text: string;
          if (m.deleted) {
            text = '⋯ message deleted ⋯';
          } else if (fromMe) {
            text = await this.findCachedMessageText(m);
          } else {
            text = await this.tryDecrypt(m.ciphertext);
            if (!m.read) {
              this.ws.markMessageRead(m._id);
            }
          }

          historyMessages.push({
            id: m._id,
            sender,
            text,
            ts: toEpoch(m.createdAt),
            status,
            avatarUrl: this.getMessageAvatar(m, fromMe),
            editedAt: m.editedAt ? toEpoch(m.editedAt) : undefined,
            deletedAt: m.deleted ? toEpoch(m.deletedAt!) : undefined,
            readAt: m.read ? toEpoch(m.createdAt) : undefined,
          });
        }

        this.tempMessages.push(...historyMessages);
        this.finishLoadingOperation();
        this.lastSyncTime = Date.now();
      },
      error: err => {
        console.error('[ChatSession] Error loading history:', err);
        this.finishLoadingOperation();
      },
    });
  }

  /**
   * Enhanced send method with better error handling
   */
  async send(_: string, plain: string): Promise<void> {
    if (!plain?.trim() || !this.roomId) {
      console.log('[ChatSession] Invalid send parameters');
      return;
    }

    if (!this.ws.isConnected()) {
      console.warn(
        '[ChatSession] Cannot send - socket disconnected, message will not be sent'
      );
      // Don't add message to UI if we can't send it
      // This prevents showing messages that will never be delivered
      return;
    }

    try {
      const ts = Date.now();
      const myAvatar = localStorage.getItem('myAvatar') || 'assets/images/avatars/01.svg';

      this.markPreviousMessagesAsRead();

      // Add pending message
      const pendingMessage: ChatMsg = {
        sender: 'You',
        text: plain,
        ts,
        status: 'pending',
        avatarUrl: myAvatar,
      };

      const pendingKey = `pending::${ts}`;

      // Add pending message with timeout tracking
      const timeoutId = setTimeout(() => {
        if (this.pendingMessages.has(pendingKey)) {
          console.warn(
            '[ChatSession] Message ack timeout after 30s, but keeping message visible'
          );
          // Don't remove the message from UI, just mark it as potentially failed
          // The fallback sync will handle recovery
          this.pendingMessages.delete(pendingKey);
        }
      }, 30000); // 30 second timeout (increased from 10s)

      this.pendingMessages.set(pendingKey, { timestamp: ts, timeoutId });
      this.push(pendingMessage);

      // Encrypt and send (if partner has public key)
      let ct: string;
      if (this.theirPubKey && this.theirPubKey.trim()) {
        ct = await this.crypto.encryptWithPublicKey(plain, this.theirPubKey);
      } else {
        // Send as plain text if no encryption available
        console.warn('[ChatSession] Sending unencrypted message - partner has no public key');
        ct = plain;
      }

      const pendingCacheEntry = {
        id: pendingKey,
        text: plain,
        ts,
      };

      await this.vault.set(this.key(pendingKey), pendingCacheEntry);
      console.log(
        `[ChatSession] Stored pending message in vault with key: ${this.key(
          pendingKey
        )}, text: "${plain}"`
      );

      this.ws.sendMessage(this.roomId, ct, myAvatar);
    } catch (error) {
      console.error('[ChatSession] Error sending message:', error);
    }
  }

  /**
   * Clean up stale pending messages that never received acknowledgment
   * NOTE: This method is now more conservative and doesn't remove messages from UI
   */
  private cleanupStalePendingMessage(pendingKey: string): void {
    // Only remove from tracking, don't remove from UI
    // Let fallback sync handle message recovery instead
    const pendingInfo = this.pendingMessages.get(pendingKey);
    if (pendingInfo) {
      clearTimeout(pendingInfo.timeoutId);
      this.pendingMessages.delete(pendingKey);
      console.log(
        '[ChatSession] Removed pending message from tracking (message kept in UI)'
      );
    }
  }

  /**
   * Clean up all stale pending messages when connection is restored
   * NOTE: More conservative cleanup that preserves messages in UI
   */
  private cleanupStalePendingMessages(): void {
    if (this.pendingMessages.size === 0) return;

    console.log(
      '[ChatSession] Cleaning up stale pending message tracking:',
      this.pendingMessages.size
    );

    // Clear timeouts and tracking, but keep messages in UI
    // Let fallback sync determine what actually needs to be done
    this.pendingMessages.forEach(pendingInfo => {
      clearTimeout(pendingInfo.timeoutId);
    });

    this.pendingMessages.clear();
    console.log('[ChatSession] Cleared pending message tracking (messages kept in UI)');
  }

  private startLoadingOperation(): void {
    this.loadingOperations++;
  }

  private finishLoadingOperation(): void {
    this.loadingOperations--;

    if (this.loadingOperations <= 0) {
      this.tempMessages.sort((a, b) => a.ts - b.ts);
      this.messages$.next([...this.tempMessages]);
      this.messagesLoading$.next(false);
      this.tempMessages = [];
    }
  }

  // Enhanced message callbacks with better error handling
  private readonly messageEditedCb = async (m: MessageEditedEvent) => {
    if (!m?.messageId) return;

    try {
      const list = this.messages$.value;
      const idx = list.findIndex(x => x.id === m.messageId);
      if (idx === -1) return;

      const plain =
        list[idx].sender === 'You' ? list[idx].text : await this.tryDecrypt(m.ciphertext);

      const patched: ChatMsg = {
        ...list[idx],
        text: plain,
        editedAt: m.editedAt ? +new Date(m.editedAt) : Date.now(),
        avatarUrl: m.avatarUrl ?? list[idx].avatarUrl,
      };

      await this.vault.set(this.key(m.messageId), {
        id: m.messageId,
        text: plain,
        ts: patched.ts,
      });

      this.messages$.next([...list.slice(0, idx), patched, ...list.slice(idx + 1)]);
    } catch (error) {
      console.error('[ChatSession] Error handling message edit:', error);
      this.scheduleFallbackSync();
    }
  };

  private readonly messageDeletedCb = (d: MessageDeletedEvent) => {
    try {
      const list = this.messages$.value;
      const idx = list.findIndex(m => m.id === d.messageId);
      if (idx === -1) return;

      const patched: ChatMsg = {
        ...list[idx],
        text: '⋯ message deleted ⋯',
        ct: undefined,
        status: undefined,
        editedAt: undefined,
        deletedAt: +new Date(d.deletedAt),
      };

      this.messages$.next([...list.slice(0, idx), patched, ...list.slice(idx + 1)]);
    } catch (error) {
      console.error('[ChatSession] Error handling message delete:', error);
      this.scheduleFallbackSync();
    }
  };

  // Enhanced incoming message handler
  private readonly incomingCb = async (m: IncomingSocketMessage) => {
    if (m.fromUserId !== this.roomId) return;

    try {
      const decryptedText = await this.tryDecrypt(m.ciphertext);
      const messageAvatar = m.avatarUrl?.trim()
        ? m.avatarUrl
        : this.partnerAvatar || 'assets/images/avatars/01.svg';

      const newMessage: ChatMsg = {
        id: m.messageId,
        sender: m.fromUsername,
        text: decryptedText,
        ts: toEpoch(m.timestamp),
        avatarUrl: messageAvatar,
        readAt: Date.now(),
      };

      this.ws.markMessageRead(m.messageId);
      this.push(newMessage);
      this.partnerTyping$.next(false);

      if (this.typingDebounce) {
        clearTimeout(this.typingDebounce);
      }
    } catch (error) {
      console.error('[ChatSession] Failed to process incoming message:', error);
    }
  };

  sendTyping(): void {
    if (!this.roomId || !this.ws.isConnected()) return;
    this.ws.sendTyping(this.roomId);
  }

  async deleteMessage(id: string) {
    const list = this.messages$.value;
    const idx = list.findIndex(m => m.id === id);
    if (idx !== -1) {
      const tomb: ChatMsg = {
        ...list[idx],
        text: '⋯ message deleted ⋯',
        editedAt: undefined,
        deletedAt: Date.now(),
        status: undefined,
        ct: undefined,
      };
      this.messages$.next([...list.slice(0, idx), tomb, ...list.slice(idx + 1)]);
    }

    await this.vault.set(this.key(id), null);
    this.ws.sendDeleteMessage(id);
  }

  // Track failed ciphertext to avoid repeated decryption attempts
  private failedDecryptions = new Set<string>();

  private async tryDecrypt(ct: string): Promise<string> {
    // Check if we've already failed to decrypt this ciphertext
    if (this.failedDecryptions.has(ct)) {
      return '🔒 Encrypted message (from partner)';
    }

    try {
      return await this.crypto.decryptMessage(ct);
    } catch {
      // Mark this ciphertext as failed to avoid retrying
      this.failedDecryptions.add(ct);

      // Clean up old failed entries periodically (keep last 100)
      if (this.failedDecryptions.size > 100) {
        const entries = Array.from(this.failedDecryptions);
        this.failedDecryptions.clear();
        // Keep the most recent 50 entries
        entries.slice(-50).forEach(entry => this.failedDecryptions.add(entry));
      }

      return '🔒 Encrypted message (from partner)';
    }
  }

  private push(m: ChatMsg) {
    const list = [...this.messages$.value];
    list.push(m);
    list.sort((a, b) => (a.ts || 0) - (b.ts || 0));
    this.messages$.next(list);
  }

  private key(suffix: string) {
    return `sent_${this.meId}_${this.roomId}/${suffix}`;
  }

  private markPreviousMessagesAsRead(): void {
    const messages = this.messages$.value;
    let hasChanges = false;

    const updatedMessages = messages.map(msg => {
      if (msg.sender !== 'You' && !msg.readAt && msg.id) {
        this.ws.markMessageRead(msg.id);
        hasChanges = true;
        return { ...msg, readAt: Date.now() };
      }
      return msg;
    });

    if (hasChanges) {
      this.messages$.next(updatedMessages);
    }
  }

  private async findCachedMessageText(m: ServerMessage): Promise<string> {
    const messageId = m._id;
    const serverTimestamp = toEpoch(m.createdAt);

    console.log(
      `[ChatSession] Looking for cached text for message ${messageId}, server timestamp: ${serverTimestamp}`
    );

    // Try various lookup strategies
    const strategies = [
      this.key(messageId),
      this.key(`server::${serverTimestamp}`),
      this.key(`pending::${serverTimestamp}`),
    ];

    for (const key of strategies) {
      const cached = await this.vault.get<SentCacheEntry>(key);
      if (cached && cached.text) {
        console.log(`[ChatSession] Found cached text for ${messageId} with key: ${key}`);
        return cached.text;
      }
    }

    console.log(
      `[ChatSession] No exact match found, trying fuzzy match for ${messageId}`
    );

    // Fuzzy match for pending messages with expanded time window
    const keys = await this.vault.keysStartingWith(this.key('pending::'));
    console.log(`[ChatSession] Found ${keys.length} pending keys for fuzzy matching`);

    for (const key of keys) {
      const match = key.match(/pending::(\d+)$/);
      if (match) {
        const pendingTs = parseInt(match[1]);
        const timeDiff = Math.abs(pendingTs - serverTimestamp);
        if (timeDiff <= 10000) {
          // Increased from 5 seconds to 10 seconds
          const cached = await this.vault.get<SentCacheEntry>(key);
          if (cached && cached.text) {
            console.log(
              `[ChatSession] Found fuzzy match for ${messageId} with pending key: ${key}, time diff: ${timeDiff}ms`
            );
            // Update vault with proper keys
            await this.vault.set(this.key(messageId), cached);
            await this.vault.set(key, null);
            return cached.text;
          }
        }
      }
    }

    console.warn(
      `[ChatSession] No cached text found for message ${messageId}, using fallback`
    );
    return this.getTimeAgoMessage(serverTimestamp);
  }

  private getTimeAgoMessage(timestamp: number): string {
    const messageAge = Date.now() - timestamp;
    const minutes = Math.floor(messageAge / (1000 * 60));
    const hours = Math.floor(messageAge / (1000 * 60 * 60));
    const days = Math.floor(messageAge / (1000 * 60 * 60 * 24));

    if (days > 0) {
      return `💬 Message sent ${days} day${days !== 1 ? 's' : ''} ago`;
    } else if (hours > 0) {
      return `💬 Message sent ${hours} hour${hours !== 1 ? 's' : ''} ago`;
    } else if (minutes > 30) {
      return `💬 Message sent recently`;
    } else {
      return `💬 Message sent moments ago`;
    }
  }

  /**
   * Get current partner online status
   */
  getPartnerOnlineStatus(): boolean {
    return this.isPartnerOnline;
  }

  ngOnDestroy() {
    console.log('[ChatSession] Service cleanup');

    // Stop sync monitoring
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    this.subs.unsubscribe();
    this.ws.offMessageEdited(this.messageEditedCb);
    this.ws.offReceiveMessage(this.incomingCb);
    this.ws.offMessageDeleted(this.messageDeletedCb);
    this.ws.offMessageRead(this.messageReadCb);
    clearTimeout(this.typingDebounce);

    this.isInitialized = false;
    this.isInitializing = false;

    // Clean up pending message timeouts
    this.pendingMessages.forEach(pendingInfo => {
      clearTimeout(pendingInfo.timeoutId);
    });
    this.pendingMessages.clear();

    this.loadingOperations = 0;
    this.tempMessages = [];
    this.failedDecryptions.clear();
  }
}
