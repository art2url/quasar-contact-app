import { Injectable, OnDestroy } from '@angular/core';
import { BehaviorSubject, Observable, Subscription, firstValueFrom } from 'rxjs';

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
  KeyRegeneratedPayload,
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
  readonly myPrivateKeyMissing$ = new BehaviorSubject<boolean>(false);
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

  // Track if myPrivateKeyMissing was set artificially due to partner issues
  public artificialKeyMissingState = false;
  
  // Getter for artificial state access
  get isArtificialKeyMissingState(): boolean {
    return this.artificialKeyMissingState;
  }
  
  // Getter for automatic key generation state
  get isGeneratingKeysAutomatically(): boolean {
    return this.isGeneratingKeysForNewUser;
  }
  
  // Track if we're in the middle of key regeneration to avoid processing stored notifications
  private isRegeneratingKeys = false;

  // Event-driven key status management
  private lastKeyStatusCheck = 0;
  private keyStatusCache = new Map<string, { result: any; timestamp: number }>();
  private readonly KEY_STATUS_CACHE_TTL = 300000; // 5 minutes cache
  
  // Track automatic key generation to prevent error UI during the process
  private isGeneratingKeysForNewUser = false;

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
    
    // Setup event handlers IMMEDIATELY in constructor to ensure they're ready
    this.setupEventHandlers();
    this.startSyncMonitoring();
    
    // Constructor completed
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
          
          // Re-fetch partner's public key in case they regenerated while we were disconnected
          if (this.roomId) {
            console.log('[ChatSession] Re-fetching partner public key after reconnection');
            this.refetchPartnerKeyOnReconnect();
          }
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
    console.log('[ChatSession] Setting up message handlers including partner key recovery');
    this.ws.onMessageEdited(this.messageEditedCb);
    this.ws.onMessageDeleted(this.messageDeletedCb);
    this.ws.onMessageSent(this.messageSentCb);
    this.ws.onMessageRead(this.messageReadCb);
    this.ws.onKeyRegenerated(this.keyRegeneratedCb);
    // Removed: Partner key recovery notifications now handled via database flag
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

  private readonly keyRegeneratedCb = async (payload: KeyRegeneratedPayload) => {
    console.log('[ChatSession] Partner has regenerated their keys:', payload.fromUsername);
    console.log('[ChatSession] Need to fetch new public key for:', payload.fromUserId);
    
    // Clear the old public key immediately to block chat
    this.theirPubKey = null;
    this.keyLoading$.next(true);
    this.keyMissing$.next(true);
    
    // Reset User 2's apparent missing key state since User 1 is regenerating (only if it was artificial)
    if (this.artificialKeyMissingState) {
      this.myPrivateKeyMissing$.next(false);
      this.artificialKeyMissingState = false;
      
      // Removed: Recovery UI monitoring now handled via database flag
    }
    
    // Try to fetch the new public key automatically with retries
    this.retryFetchPartnerKey(payload.fromUserId, 0);
  };

  // Removed: Partner key recovery notifications now handled via database flag

  // Add observable for partner key regeneration notification
  public readonly showPartnerKeyRegeneratedNotification$ = new BehaviorSubject<boolean>(false);

  // Removed: Recovery UI monitoring now handled via database flag

  dismissPartnerKeyRegeneratedNotification(): void {
    this.showPartnerKeyRegeneratedNotification$.next(false);
  }

  // Removed: Recovery UI monitoring now handled via database flag

  // Removed: Recovery UI monitoring now handled via database flag

  // Removed: Recovery UI monitoring now handled via database flag

  // Removed: Recovery UI monitoring now handled via database flag

  /**
   * Re-fetch partner's public key after reconnection
   * This ensures we have the latest key if they regenerated while disconnected
   */
  private refetchPartnerKeyOnReconnect(): void {
    if (!this.roomId) return;
    
    console.log('[ChatSession] Checking if partner key needs updating after reconnection');
    
    this.users.getPublicKey(this.roomId).subscribe({
      next: ({ publicKeyBundle, username, avatarUrl, hasPublicKey, isKeyMissing }) => {
        console.log('[ChatSession] Reconnection key check - hasPublicKey:', hasPublicKey, 'isKeyMissing:', isKeyMissing);
        
        // Check if partner has a different public key than what we have cached
        const currentKey = this.theirPubKey;
        const newKey = publicKeyBundle;
        
        if (hasPublicKey && newKey && currentKey !== newKey) {
          console.log('[ChatSession] Partner has new public key after reconnection, updating');
          this.theirPubKey = newKey;
          this.keyLoading$.next(false);
          this.keyMissing$.next(false);
          
          // Clear artificial blocking state if partner now has keys
          if (this.artificialKeyMissingState) {
            this.myPrivateKeyMissing$.next(false);
            this.artificialKeyMissingState = false;
          }
          
          // Update partner info
          this.theirUsername$.next(username);
          const partnerAvatar = avatarUrl && avatarUrl.trim() ? avatarUrl : 'assets/images/avatars/01.svg';
          this.theirAvatar$.next(partnerAvatar);
          this.partnerAvatar = partnerAvatar;
          
          console.log('[ChatSession] Updated to new partner public key after reconnection');
        } else if (isKeyMissing) {
          console.log('[ChatSession] Partner keys are missing after reconnection - showing blocking UI');
          this.theirPubKey = null;
          this.keyLoading$.next(false);
          this.keyMissing$.next(false);
          this.myPrivateKeyMissing$.next(true);
          this.artificialKeyMissingState = true;
        } else if (!hasPublicKey) {
          console.log('[ChatSession] Partner still has no public key after reconnection');
          this.theirPubKey = null;
          this.keyLoading$.next(false);
          this.keyMissing$.next(true);
        } else {
          console.log('[ChatSession] Partner key unchanged after reconnection');
        }
      },
      error: err => {
        console.error('[ChatSession] Failed to check partner key after reconnection:', err);
      }
    });
  }

  /**
   * Retry fetching partner's key with exponential backoff
   */
  private retryFetchPartnerKey(userId: string, attempt: number): void {
    const maxAttempts = 5;
    const baseDelay = 2000; // 2 seconds
    
    if (attempt >= maxAttempts) {
      console.warn('[ChatSession] Max attempts reached for fetching partner key, showing notification');
      this.showPartnerKeyRegeneratedNotification$.next(true);
      return;
    }
    
    const delay = baseDelay * Math.pow(1.5, attempt);
    console.log(`[ChatSession] Attempting to fetch partner key (attempt ${attempt + 1}/${maxAttempts}) in ${delay}ms`);
    
    setTimeout(() => {
      this.fetchAndUpdatePartnerKey(userId, attempt);
    }, delay);
  }

  /**
   * Fetch and update partner's public key after key regeneration
   */
  public fetchAndUpdatePartnerKey(userId: string, attempt = 0): void {
    console.log(`[ChatSession] Fetching updated public key for: ${userId} (attempt ${attempt + 1})`);
    
    this.users.getPublicKey(userId).subscribe({
      next: ({ publicKeyBundle, username, avatarUrl, hasPublicKey }) => {
        console.log('[ChatSession] Received updated encryption data for:', username, 'hasKey:', hasPublicKey);
        
        if (hasPublicKey && publicKeyBundle) {
          console.log('[ChatSession] Partner has new public key, updating encryption');
          this.theirPubKey = publicKeyBundle;
          this.keyLoading$.next(false);
          this.keyMissing$.next(false);
          
          // Reset User 2's apparent missing key state since partner now has keys (only if it was artificial)
          if (this.artificialKeyMissingState) {
            this.myPrivateKeyMissing$.next(false);
            this.artificialKeyMissingState = false;
            
            // Removed: Recovery UI monitoring now handled via database flag
          }
          
          // Update partner info
          this.theirUsername$.next(username);
          const partnerAvatar = avatarUrl && avatarUrl.trim() ? avatarUrl : 'assets/images/avatars/01.svg';
          this.theirAvatar$.next(partnerAvatar);
          this.partnerAvatar = partnerAvatar;
          
          // Hide the regeneration notification since we have the new key
          this.showPartnerKeyRegeneratedNotification$.next(false);
          
          console.log('[ChatSession] Successfully updated to new public key, chat unblocked');
        } else {
          console.log('[ChatSession] Partner still has no public key, retrying...');
          // Retry if the partner hasn't uploaded their key yet
          this.retryFetchPartnerKey(userId, attempt + 1);
        }
      },
      error: err => {
        console.error(`[ChatSession] Failed to fetch updated partner key (attempt ${attempt + 1}):`, err);
        // Retry on error as well
        this.retryFetchPartnerKey(userId, attempt + 1);
      },
    });
  }

  /**
   * Fetch partner's basic info (username and avatar) immediately, regardless of key status
   */
  private fetchPartnerBasicInfo(roomId: string): void {
    this.users.getPublicKey(roomId).subscribe({
      next: ({ username, avatarUrl }) => {
        console.log('[ChatSession] Fetched partner basic info:', username);
        
        // Set username and avatar immediately
        this.theirUsername$.next(username || 'Unknown User');
        const partnerAvatar = avatarUrl && avatarUrl.trim() ? avatarUrl : 'assets/images/avatars/01.svg';
        this.theirAvatar$.next(partnerAvatar);
        this.partnerAvatar = partnerAvatar;
      },
      error: err => {
        console.error('[ChatSession] Failed to get partner basic info:', err);
        // Set fallback username
        this.theirUsername$.next('Unknown User');
        this.theirAvatar$.next('assets/images/avatars/01.svg');
      },
    });
  }

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

    // Don't sync messages if keys are missing
    if (this.myPrivateKeyMissing$.value) {
      console.log('[ChatSession] Skipping fallback sync - private key is missing');
      return;
    }

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
    if (!this.theirPubKey) {
      console.log('[ChatSession] Cannot edit - partner has no encryption key');
      return;
    }

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
      const ct = await this.crypto.encryptWithPublicKey(newText, this.theirPubKey);
      this.ws.sendEditMessage(id, ct, localStorage.getItem('myAvatar') ?? undefined);
    } catch (error) {
      console.error('[ChatSession] Failed to send edit message:', error);
      this.scheduleFallbackSync();
    }
  }

  async init(roomId: string): Promise<void> {
    if (this.isInitialized && this.roomId === roomId) {
      console.log('[ChatSession] Already initialized for room:', roomId);
      
      // Ensure we have username even for already initialized sessions
      if (!this.theirUsername$.value || this.theirUsername$.value === 'Unknown User') {
        this.fetchPartnerBasicInfo(roomId);
      }
      
      // Removed: Recovery UI monitoring now handled via database flag
      
      // Only reset key state if we're not in artificial state
      if (!this.artificialKeyMissingState) {
        console.log('[ChatSession] Not in artificial state, checking actual vault state');
        const hasPrivateKeyInVault = await this.crypto.hasPrivateKeyInVault(this.vault, this.meId);
        const wasKeyMissing = this.myPrivateKeyMissing$.value;
        const isKeyMissing = !hasPrivateKeyInVault;
        
        // Key state check (early return path)
        console.log('[ChatSession] hasPrivateKeyInVault:', hasPrivateKeyInVault);
        console.log('[ChatSession] wasKeyMissing:', wasKeyMissing);
        console.log('[ChatSession] isKeyMissing:', isKeyMissing);
        console.log('[ChatSession] artificialKeyMissingState:', this.artificialKeyMissingState);
        
        // For already initialized sessions, if keys are missing, try automatic generation for new users
        if (isKeyMissing) {
          const hasAnyVaultData = await this.checkForAnyVaultData();
          if (!hasAnyVaultData) {
            console.log('[ChatSession] 🆕 Already initialized session - NEW USER detected, attempting automatic key generation');
            // Set loading state to prevent error UI from showing during key generation
            this.keyLoading$.next(true);
            this.myPrivateKeyMissing$.next(false);
            this.isGeneratingKeysForNewUser = true;
            
            try {
              await this.generateKeysForNewUser();
              this.myPrivateKeyMissing$.next(false);
              this.keyLoading$.next(false);
              this.isGeneratingKeysForNewUser = false;
              console.log('[ChatSession] Automatic key generation successful in early return path');
            } catch (error) {
              console.error('[ChatSession] Automatic key generation failed in early return path:', error);
              this.myPrivateKeyMissing$.next(true);
              this.keyLoading$.next(false);
              this.isGeneratingKeysForNewUser = false;
            }
          } else {
            console.log('[ChatSession] 🔑 EXISTING USER with corrupted vault in early return - showing recovery UI');
            this.myPrivateKeyMissing$.next(true);
          }
        } else {
          this.myPrivateKeyMissing$.next(false);
        }
        
        // If key just became missing and it's not artificial, start monitoring
        if (isKeyMissing && !wasKeyMissing && !this.artificialKeyMissingState) {
          // Key just became missing - should start monitoring
        }
      } else {
        console.log('[ChatSession] In artificial state, preserving partner key loss UI');
      }
      
      // Removed: Recovery UI monitoring now handled via database flag
      
      return;
    }

    if (this.isInitializing) {
      console.log('[ChatSession] Already initializing, skipping');
      return;
    }

    this.isInitializing = true;
    this.roomId = roomId;

    // Fetch username immediately, regardless of key status
    this.fetchPartnerBasicInfo(roomId);

    // Reset all key states at start
    this.keyLoading$.next(true);
    this.keyMissing$.next(false);
    
    // Check if we have a private key in vault before setting the missing state
    const hasPrivateKeyInVault = await this.crypto.hasPrivateKeyInVault(this.vault, this.meId);
    const isKeyMissing = !hasPrivateKeyInVault;
    
    // Key state check (main initialization)
    console.log('[ChatSession] hasPrivateKeyInVault:', hasPrivateKeyInVault);
    console.log('[ChatSession] isKeyMissing:', isKeyMissing);
    console.log('[ChatSession] artificialKeyMissingState:', this.artificialKeyMissingState);
    
    // Don't set myPrivateKeyMissing$ to true yet - we'll try automatic key generation first
    // Only set it to true if key generation fails
    this.myPrivateKeyMissing$.next(false);
    
    if (isKeyMissing) {
      console.log('[ChatSession] *** PRIVATE KEY IS MISSING - WILL TRY AUTOMATIC KEY GENERATION ***');
    }

    this.messagesLoading$.next(true);
    this.loadingOperations = 0;
    this.tempMessages = [];

    try {
      // Starting key import process
      // Import private key - always validate vault data even if key exists in memory
      // First check if vault exists in read-only mode to avoid auto-generating AES keys
      let privateKeyData: ArrayBuffer | undefined;
      
      try {
        // Try to open vault in read-only mode first
        await this.vault.setCurrentUser(this.meId, true); // true = read-only
        await this.vault.waitUntilReady();
        privateKeyData = await this.vault.get<ArrayBuffer>(VAULT_KEYS.PRIVATE_KEY);
      } catch {
        // Vault unavailable in read-only mode - this means either:
        // 1. New user (no vault exists yet) - should auto-generate keys
        // 2. Corrupted vault (AES key missing) - user needs key recovery
        console.log('[ChatSession] Vault unavailable in read-only mode - checking if new user or corrupted vault');
        
        // Check if this is truly a new user by looking for any vault data
        const hasAnyVaultData = await this.checkForAnyVaultData();
        
        if (!hasAnyVaultData) {
          // This is a new user - automatically generate keys
          console.log('[ChatSession] 🆕 NEW USER detected - automatically generating encryption keys');
          console.log('[ChatSession] No vault database exists - this is a fresh user');
          console.log('[ChatSession] Keeping keyLoading$ = true during automatic key generation');
          
          this.isGeneratingKeysForNewUser = true;
          
          try {
            await this.generateKeysForNewUser();
            console.log('[ChatSession] Successfully generated keys for new user');
            
            // Continue with normal initialization flow
            await this.vault.setCurrentUser(this.meId, false); // false = write mode
            await this.vault.waitUntilReady();
            privateKeyData = await this.vault.get<ArrayBuffer>(VAULT_KEYS.PRIVATE_KEY);
            
            // Import the newly generated private key
            await this.crypto.importPrivateKey(privateKeyData!);
            
            console.log('[ChatSession] New user key generation completed successfully');
            console.log('[ChatSession] keyLoading$ will remain true until partner key retrieval completes');
            
            // Continue with normal flow (don't return here)
            // Note: keyLoading$ will be set to false in the partner key retrieval callback
            // This ensures the error UI never shows during automatic key generation
          } catch (keyGenError) {
            console.error('[ChatSession] Failed to generate keys for new user:', keyGenError);
            this.isGeneratingKeysForNewUser = false;
            // Fall back to marking keys as missing
            await this.markKeysAsMissingAndComplete();
            return;
          }
        } else {
          // Corrupted vault - existing user needs key recovery
          console.log('[ChatSession] 🔑 EXISTING USER with corrupted vault detected - showing recovery UI');
          console.log('[ChatSession] This user has vault data but keys are corrupted/missing');
          await this.markKeysAsMissingAndComplete();
          return;
        }
      }
      
      if (!privateKeyData) {
        // Private key not found in vault - this shouldn't happen if we got here
        // but handle it gracefully by marking as missing
        console.log('[ChatSession] Private key not found in vault - marking as missing in database');
        await this.markKeysAsMissingAndComplete();
        return;
      }
      
      // If we got here, vault exists and has data - now open in write mode for normal operations
      await this.vault.setCurrentUser(this.meId, false); // false = write mode
      await this.vault.waitUntilReady();

      // Always try to validate the private key by importing it (even if one exists in memory)
      try {
        // Clear any existing corrupted key first to ensure clean import
        this.crypto.clearPrivateKey();
        
        await this.crypto.importPrivateKey(privateKeyData);
      } catch (importError) {
        console.error('[ChatSession] Failed to import private key, triggering recovery:', importError);
        
        // Clear the corrupted key from vault and memory
        await this.vault.set(VAULT_KEYS.PRIVATE_KEY, null);
        this.crypto.clearPrivateKey();
        
        // Mark keys as missing in database and complete initialization
        console.log('[ChatSession] Corrupted key detected - marking as missing in database');
        await this.markKeysAsMissingAndComplete();
        return;
      }

      // Remove existing listeners
      if (this.isInitialized) {
        this.ws.offReceiveMessage(this.incomingCb);
      }

      // Get partner's public key
      this.users.getPublicKey(roomId).subscribe({
        next: ({ publicKeyBundle, username, avatarUrl, hasPublicKey, isKeyMissing }) => {
          console.log('[ChatSession] Received partner encryption data for:', username);
          console.log('[ChatSession] Partner key status - hasPublicKey:', hasPublicKey, 'isKeyMissing:', isKeyMissing);
          
          // Update username and avatar if not already set (fallback)
          if (!this.theirUsername$.value || this.theirUsername$.value === 'Unknown User') {
            this.theirUsername$.next(username);
            const partnerAvatar =
              avatarUrl && avatarUrl.trim() ? avatarUrl : 'assets/images/avatars/01.svg';
            this.theirAvatar$.next(partnerAvatar);
            this.partnerAvatar = partnerAvatar;
          }
          
          // Check if partner lost their keys first
          if (isKeyMissing) {
            console.log('[ChatSession] Partner keys are missing during initial load - showing blocking UI');
            this.theirPubKey = null;
            this.keyLoading$.next(false);
            this.keyMissing$.next(false);
            this.myPrivateKeyMissing$.next(true);
            this.artificialKeyMissingState = true;
          } else if (hasPublicKey && publicKeyBundle) {
            console.log('[ChatSession] Partner has public key, encryption enabled');
            this.theirPubKey = publicKeyBundle;
            this.keyLoading$.next(false);
            this.keyMissing$.next(false);
            // Clear artificial state if partner now has keys
            if (this.artificialKeyMissingState) {
              this.myPrivateKeyMissing$.next(false);
              this.artificialKeyMissingState = false;
            }
            // For normal users (including new users), ensure myPrivateKeyMissing$ is false
            // since we successfully imported the private key
            if (!this.artificialKeyMissingState) {
              this.myPrivateKeyMissing$.next(false);
            }
            
            // Reset automatic key generation flag when partner key retrieval completes
            if (this.isGeneratingKeysForNewUser) {
              this.isGeneratingKeysForNewUser = false;
              console.log('[ChatSession] Automatic key generation completed - new user setup finished');
              
              // Check partner status now that key generation is complete
              this.checkPartnerKeyStatusOnDemand('key_generation_complete');
            }
          } else {
            console.log('[ChatSession] Partner has no public key, encryption required');
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
      
      // Removed: Recovery UI monitoring now handled via database flag
      
      // Removed: Custom event listener now handled via database flag
      
      // Set up event-driven key status monitoring
      this.setupEventDrivenKeyStatusMonitoring();
    } finally {
      this.isInitializing = false;
    }
  }

  /**
   * Load message history with better error handling
   */
  private loadMessageHistory(): void {
    // Don't load message history if keys are missing
    if (this.myPrivateKeyMissing$.value) {
      console.log('[ChatSession] Skipping message history load - private key is missing');
      this.messagesLoading$.next(false);
      return;
    }

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
    if (!plain?.trim() || !this.roomId || !this.theirPubKey) {
      console.log('[ChatSession] Cannot send - missing parameters or partner encryption key');
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

      // Encrypt and send - encryption is required
      const ct = await this.crypto.encryptWithPublicKey(plain, this.theirPubKey);

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
  
  // Track vault corruption detection
  private vaultCorruptionDetected = false;

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

  /**
   * Detect vault corruption and force recovery UI
   * Only trigger if private key is genuinely missing/corrupted
   */
  private detectVaultCorruption(): void {
    if (this.vaultCorruptionDetected) return;
    
    // Don't trigger vault corruption if we successfully have a private key
    if (this.crypto.hasPrivateKey()) {
      return;
    }
    
    console.log('[ChatSession] Vault corruption detected - forcing recovery UI');
    this.vaultCorruptionDetected = true;
    
    // Force recovery state
    this.keyLoading$.next(false);
    this.keyMissing$.next(false); // Set to false so partner error doesn't show
    this.myPrivateKeyMissing$.next(true); // This triggers the recovery UI
    
    // Recovery UI should now be visible
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

    let vaultFailureCount = 0;
    for (const key of strategies) {
      try {
        const cached = await this.vault.get<SentCacheEntry>(key);
        if (cached && cached.text) {
          console.log(`[ChatSession] Found cached text for ${messageId} with key: ${key}`);
          return cached.text;
        }
      } catch (error) {
        vaultFailureCount++;
        console.log(`[ChatSession] Vault get failed for key ${key}:`, error);
      }
    }
    
    // If we had multiple vault failures, this indicates corruption
    if (vaultFailureCount > 0) {
      console.log(`[ChatSession] Detected ${vaultFailureCount} vault failures - triggering recovery detection`);
      this.detectVaultCorruption();
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
    
    // If we can't find cached text and we're seeing vault errors, trigger recovery
    this.detectVaultCorruption();
    
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

  // Removed: Custom event listener for WebSocket notifications now handled via database flag

  // Removed: Partner key recovery notifications now handled via database flag

  // Removed: Debug trigger now handled via database flag

  /**
   * Check our own key status to ensure we're not incorrectly showing artificial blocking
   */
  private checkOwnKeyStatus(): void {
    this.users.getPublicKey(this.meId).subscribe({
      next: (response) => {
        console.log('[ChatSession] Own key status:', response.username, 'isKeyMissing:', response.isKeyMissing, 'hasPublicKey:', response.hasPublicKey);
        
        // If we have valid keys and we're in artificial blocking state, clear it
        if (response.hasPublicKey && !response.isKeyMissing && this.artificialKeyMissingState) {
          console.log('[ChatSession] Our own keys are valid but we are in artificial blocking - clearing it');
          this.artificialKeyMissingState = false;
          this.myPrivateKeyMissing$.next(false);
          this.keyLoading$.next(false);
          this.keyMissing$.next(false);
        }
        
        // AGGRESSIVE FIX: If we have valid keys, ensure we're not showing missing key UI
        if (response.hasPublicKey && !response.isKeyMissing) {
          // Force clear all blocking states if our own keys are valid AND we have a working private key
          if (this.myPrivateKeyMissing$.value && this.artificialKeyMissingState && this.crypto.hasPrivateKey()) {
            console.log('[ChatSession] FORCE CLEARING: We have valid keys in database and memory, clearing all blocking states');
            this.artificialKeyMissingState = false;
            this.myPrivateKeyMissing$.next(false);
            this.keyLoading$.next(false);
            this.keyMissing$.next(false);
          } else if (this.myPrivateKeyMissing$.value && !this.artificialKeyMissingState && !this.crypto.hasPrivateKey()) {
            console.log('[ChatSession] Database says keys valid but we have no private key in memory - keeping recovery UI');
            // Keep the recovery UI since we actually need to recover our private key
          }
        }
        
        // If our keys are actually missing, ensure UI reflects this
        if (response.isKeyMissing && !this.myPrivateKeyMissing$.value) {
          console.log('[ChatSession] Our own keys are missing according to database - updating UI');
          this.myPrivateKeyMissing$.next(true);
          this.keyMissing$.next(true);
        }
      },
      error: (error) => {
        if (error.message && error.message.includes('Rate limited')) {
          console.log('[ChatSession] Rate limited checking own key status - will retry later');
        } else {
          console.error('[ChatSession] Error checking own key status:', error);
        }
      }
    });
  }

  /**
   * Check partner key status only when needed (event-driven)
   */
  private checkPartnerKeyStatusOnDemand(reason: string = 'manual'): void {
    if (!this.roomId) {
      return;
    }
    
    const now = Date.now();
    const cacheKey = `partner_${this.roomId}`;
    const cached = this.keyStatusCache.get(cacheKey);
    
    // Use cached result if available and not expired
    if (cached && (now - cached.timestamp) < this.KEY_STATUS_CACHE_TTL) {
      console.log(`[ChatSession] Using cached partner key status (${reason}):`, cached.result);
      this.processPartnerKeyStatusResponse(cached.result);
      return;
    }
    
    // Avoid duplicate requests within short time window
    if (now - this.lastKeyStatusCheck < 5000) {
      console.log(`[ChatSession] Skipping partner key status check - recent check performed (${reason})`);
      return;
    }
    
    console.log(`[ChatSession] Checking partner key status on demand (${reason}):`, this.roomId);
    this.lastKeyStatusCheck = now;
    
    this.users.getPublicKey(this.roomId).subscribe({
      next: (response) => {
        console.log(`[ChatSession] Partner key status response (${reason}):`, response);
        
        // Cache the result
        this.keyStatusCache.set(cacheKey, {
          result: response,
          timestamp: now
        });
        
        this.processPartnerKeyStatusResponse(response);
      },
      error: (error) => {
        console.error(`[ChatSession] Error checking partner key status (${reason}):`, error);
        // Don't spam on errors - just log and continue
      }
    });
  }
  
  /**
   * Process partner key status response (extracted from polling logic)
   */
  private processPartnerKeyStatusResponse(response: any): void {
    if (response.isKeyMissing) {
      console.log('[ChatSession] Partner keys are missing - checking if we should show blocking UI');
      
      // CRITICAL: Only show partner blocking if we have our own valid keys
      if (this.crypto.hasPrivateKey() && !this.myPrivateKeyMissing$.value) {
        console.log('[ChatSession] We have valid keys, partner is missing keys - showing partner blocking UI');
        this.theirPubKey = null;
        this.keyLoading$.next(false);
        this.keyMissing$.next(false);
        this.myPrivateKeyMissing$.next(true);
        this.artificialKeyMissingState = true;
        console.log('[ChatSession] Blocking UI activated for partner key loss');
      } else {
        console.log('[ChatSession] We have missing keys ourselves - NOT showing partner blocking');
        console.log('[ChatSession] Current state: hasPrivateKey=', this.crypto.hasPrivateKey(), 'myPrivateKeyMissing=', this.myPrivateKeyMissing$.value);
      }
    } else if (response.hasPublicKey && !response.isKeyMissing) {
      // Partner has valid keys and is not marked as missing - normal chat
      
      // Check if partner has a different public key than what we have cached
      const currentKey = this.theirPubKey;
      const newKey = response.publicKeyBundle;
      
      if (newKey && currentKey !== newKey) {
        console.log('[ChatSession] Partner has new public key detected, updating');
        this.theirPubKey = newKey;
        console.log('[ChatSession] Updated to new partner public key');
      }
      
      if (this.artificialKeyMissingState) {
        console.log('[ChatSession] Partner keys restored - clearing blocking UI');
        console.log('[ChatSession] Partner status: hasPublicKey=', response.hasPublicKey, 'isKeyMissing=', response.isKeyMissing);
        this.artificialKeyMissingState = false;
        this.myPrivateKeyMissing$.next(false);
        this.keyLoading$.next(false);
        this.keyMissing$.next(false);
        this.theirPubKey = response.publicKeyBundle;
        console.log('[ChatSession] Artificial blocking state cleared - chat unblocked');
      }
    }
  }

  /**
   * Set up event-driven key status monitoring
   */
  private setupEventDrivenKeyStatusMonitoring(): void {
    console.log('[ChatSession] Setting up event-driven key status monitoring');
    
    // Listen for WebSocket events that indicate key changes
    this.setupKeyStatusWebSocketListeners();
    
    // Check partner key status once at initialization
    this.checkPartnerKeyStatusOnDemand('initialization');
  }
  
  /**
   * Set up WebSocket listeners for key status changes
   */
  private setupKeyStatusWebSocketListeners(): void {
    // Listen for key regeneration events
    this.ws.onKeyRegenerated((payload) => {
      console.log('[ChatSession] Key regenerated event received:', payload);
      
      // Clear cache and check status
      this.clearKeyStatusCache();
      this.checkPartnerKeyStatusOnDemand('key_regenerated');
    });
    
    // Listen for connection events (partner might have regenerated keys while offline)
    this.subs.add(
      this.ws.isConnected$.subscribe(connected => {
        if (connected) {
          console.log('[ChatSession] WebSocket connected - checking if partner keys changed');
          this.checkPartnerKeyStatusOnDemand('connection_restored');
        }
      })
    );
  }
  
  /**
   * Clear key status cache
   */
  private clearKeyStatusCache(): void {
    this.keyStatusCache.clear();
    console.log('[ChatSession] Key status cache cleared');
  }
  
  /**
   * Manually trigger key status check (for UI buttons, etc.)
   */
  public manuallyCheckKeyStatus(): void {
    console.log('[ChatSession] Manual key status check requested');
    this.clearKeyStatusCache();
    this.checkPartnerKeyStatusOnDemand('manual_trigger');
  }

  /**
   * Debug method to show current room info
   */
  debugShowRoomInfo(): void {
    console.log('=== [ChatSession] Room Debug Info ===');
    console.log('[ChatSession] Current roomId:', this.roomId);
    console.log('[ChatSession] Partner username:', this.theirUsername$.value);
    console.log('[ChatSession] Is initialized:', this.isInitialized);
    console.log('[ChatSession] My user ID:', this.meId);
    console.log('[ChatSession] artificialKeyMissingState:', this.artificialKeyMissingState);
    
    // Test partner key status immediately
    if (this.roomId) {
      console.log('[ChatSession] === TESTING PARTNER KEY STATUS ===');
      this.checkPartnerKeyStatusOnDemand('debug_test');
    }
  }

  /**
   * DEBUG METHOD: Manually force current user to lose their keys for testing
   * This simulates key loss and triggers the missing key flow
   */
  async debugForceKeyLoss(): Promise<void> {
    console.log('[ChatSession] DEBUG: Forcing key loss for testing...');
    
    try {
      // 1. Clear private key from vault (public key is stored in database)
      await this.vault.setCurrentUser(this.meId, false); // write mode
      await this.vault.waitUntilReady();
      await this.vault.set(VAULT_KEYS.PRIVATE_KEY, null);
      console.log('[ChatSession] DEBUG: Cleared private key from vault');
      
      // 2. Mark keys as missing in database
      console.log('[ChatSession] DEBUG: Calling markKeysAsMissing API...');
      this.users.markKeysAsMissing().subscribe({
        next: (response) => {
          console.log('[ChatSession] DEBUG: Successfully marked keys as missing in database');
          console.log('[ChatSession] DEBUG: API response:', response);
          
          // 3. Update UI state to show missing keys
          this.keyLoading$.next(false);
          this.keyMissing$.next(true);
          this.myPrivateKeyMissing$.next(true);
          
          console.log('[ChatSession] DEBUG: Key loss simulation complete!');
          console.log('[ChatSession] DEBUG: User should now see "Your encryption keys are missing"');
          console.log('[ChatSession] DEBUG: Database should now show isKeyMissing=true for this user');
        },
        error: (error) => {
          console.error('[ChatSession] DEBUG: Failed to mark keys as missing:', error);
          console.error('[ChatSession] DEBUG: Error details:', error);
          
          // Still update UI state even if API call failed
          this.keyLoading$.next(false);
          this.keyMissing$.next(true);
          this.myPrivateKeyMissing$.next(true);
        }
      });
      
    } catch (error) {
      console.error('[ChatSession] DEBUG: Error during key loss simulation:', error);
    }
  }

  /**
   * RESET METHOD: Reset database flag for users with valid keys
   * This fixes the bug where all users were marked as having missing keys
   */
  async resetDatabaseKeyFlag(): Promise<void> {
    console.log('[ChatSession] RESET: Checking if we should reset database key flag');
    
    try {
      // First, ensure vault is available and try to load private key
      await this.vault.setCurrentUser(this.meId, false);
      await this.vault.waitUntilReady();
      
      const privateKeyData = await this.vault.get<ArrayBuffer>(VAULT_KEYS.PRIVATE_KEY);
      if (privateKeyData) {
        console.log('[ChatSession] RESET: Found private key in vault, importing it');
        
        // Clear any existing key and import from vault
        this.crypto.clearPrivateKey();
        await this.crypto.importPrivateKey(privateKeyData);
        
        console.log('[ChatSession] RESET: Successfully imported private key, exporting public key');
        const publicKeyB64 = await this.crypto.exportCurrentPublicKey();
        await firstValueFrom(this.users.uploadPublicKey(publicKeyB64));
        
        console.log('[ChatSession] RESET: Successfully reset database flag - keys marked as available');
        
        // Clear any artificial blocking states
        this.artificialKeyMissingState = false;
        this.myPrivateKeyMissing$.next(false);
        this.keyLoading$.next(false);
        this.keyMissing$.next(false);
        
      } else {
        console.log('[ChatSession] RESET: No private key found in vault - user genuinely has missing keys');
      }
      
    } catch (error) {
      console.error('[ChatSession] RESET: Failed to reset database flag:', error);
    }
  }

  /**
   * RESET METHOD: Force clear all artificial blocking states
   * Use this to recover from stuck blocking UI
   */
  forceResetBlockingState(): void {
    console.log('[ChatSession] FORCE RESET: Clearing all blocking states');
    this.artificialKeyMissingState = false;
    this.myPrivateKeyMissing$.next(false);
    this.keyLoading$.next(false);
    this.keyMissing$.next(false);
    
    // Re-check actual key status
    this.checkOwnKeyStatus();
    if (this.roomId) {
      this.checkPartnerKeyStatusOnDemand('debug_force_reset');
    }
    
    console.log('[ChatSession] FORCE RESET: Complete - checking actual key status');
  }

  /**
   * DEBUG METHOD: Manually clear artificial blocking state for testing
   */
  debugClearArtificialBlocking(): void {
    console.log('[ChatSession] DEBUG: Clearing artificial blocking state...');
    console.log('[ChatSession] DEBUG: Current artificialKeyMissingState:', this.artificialKeyMissingState);
    
    if (this.artificialKeyMissingState) {
      this.artificialKeyMissingState = false;
      this.myPrivateKeyMissing$.next(false);
      this.keyLoading$.next(false);
      this.keyMissing$.next(false);
      console.log('[ChatSession] DEBUG: Artificial blocking state cleared manually');
    } else {
      console.log('[ChatSession] DEBUG: No artificial blocking state to clear');
    }
  }


  /**
   * Ensure database flag is set when keys are missing
   * This can be called as a fallback to ensure partners get notified
   */
  ensureKeysMissingFlagSet(): void {
    if (this.myPrivateKeyMissing$.value) {
      console.log('[ChatSession] Ensuring database flag is set for missing keys');
      this.users.markKeysAsMissing().subscribe({
        next: () => console.log('[ChatSession] Database flag confirmed - keys marked as missing'),
        error: (error) => console.error('[ChatSession] Failed to set database flag for missing keys:', error)
      });
    }
  }

  /**
   * Regenerate encryption keys when private key is missing
   * This helps users recover from vault corruption or browser data loss
   */
  async regenerateKeys(): Promise<void> {
    try {
      console.log('[ChatSession] Regenerating encryption keys');
      this.isRegeneratingKeys = true; // Set flag to prevent stored notification processing
      
      // Removed: Recovery UI monitoring now handled via database flag
      
      this.keyLoading$.next(true);
      this.keyMissing$.next(false);
      this.myPrivateKeyMissing$.next(false);
      this.artificialKeyMissingState = false; // Clear artificial state

      // Open vault in WRITE mode for key regeneration (may have been opened in read-only mode previously)
      console.log('[ChatSession] Opening vault in write mode for key regeneration');
      await this.vault.setCurrentUser(this.meId, false); // false = write mode
      await this.vault.waitUntilReady();

      // Clear any existing keys
      await this.vault.set(VAULT_KEYS.PRIVATE_KEY, null);

      // Generate new key pair
      const publicKeyB64 = await this.crypto.generateKeyPair();
      const privateKeyBuffer = await this.crypto.exportPrivateKey();

      // Store new private key in vault
      await this.vault.set(VAULT_KEYS.PRIVATE_KEY, privateKeyBuffer);

      // Verify storage worked
      const storedKey = await this.vault.get<ArrayBuffer>(VAULT_KEYS.PRIVATE_KEY);
      if (!storedKey || !(storedKey instanceof ArrayBuffer)) {
        throw new Error('Failed to store new private key');
      }

      console.log('[ChatSession] New private key stored successfully');

      // Upload new public key to server
      const response = await firstValueFrom(this.users.uploadPublicKey(publicKeyB64));
      if (!response?.message) {
        throw new Error('Failed to upload public key to server');
      }

      console.log('[ChatSession] New public key uploaded successfully');

      // Notify partner about key regeneration
      if (this.roomId) {
        console.log('[ChatSession] Notifying partner about key regeneration');
        this.ws.notifyKeyRegenerated(this.roomId);
      }

      // Clear old undecryptable messages since they were encrypted with the old key
      console.log('[ChatSession] Clearing old message cache - old messages are no longer decryptable');
      this.messages$.next([]);
      this.tempMessages = [];
      
      // Clear any pending message operations
      this.pendingMessages.forEach(pendingInfo => {
        clearTimeout(pendingInfo.timeoutId);
      });
      this.pendingMessages.clear();

      // Reset states
      this.keyLoading$.next(false);
      this.keyMissing$.next(false);
      this.myPrivateKeyMissing$.next(false);

      // Try to re-initialize chat session
      if (this.roomId) {
        console.log('[ChatSession] Re-initializing chat session with new keys');
        await this.init(this.roomId);
      }
      
      this.isRegeneratingKeys = false; // Clear flag after successful regeneration

      // Refresh the page after successful key generation to ensure clean state
      console.log('[ChatSession] Keys regenerated successfully, refreshing page in 2 seconds...');
      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error) {
      console.error('[ChatSession] Failed to regenerate keys:', error);
      this.isRegeneratingKeys = false; // Clear flag on error
      this.keyLoading$.next(false);
      this.keyMissing$.next(true);
      this.myPrivateKeyMissing$.next(true);
      throw error;
    }
  }

  ngOnDestroy() {
    console.log('[ChatSession] Service cleanup');

    // Stop sync monitoring
    if (this.syncTimer) {
      clearInterval(this.syncTimer);
      this.syncTimer = null;
    }

    // Removed: Recovery UI monitoring now handled via database flag

    this.subs.unsubscribe();
    this.ws.offMessageEdited(this.messageEditedCb);
    this.ws.offReceiveMessage(this.incomingCb);
    this.ws.offMessageDeleted(this.messageDeletedCb);
    this.ws.offMessageRead(this.messageReadCb);
    this.ws.offKeyRegenerated(this.keyRegeneratedCb);
    // Removed: Partner key recovery handlers now handled via database flag
    clearTimeout(this.typingDebounce);

    // Clean up key status cache
    this.clearKeyStatusCache();

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

  /**
   * Check if user has any vault data (to distinguish new users from corrupted vaults)
   */
  private async checkForAnyVaultData(): Promise<boolean> {
    try {
      // Check if IndexedDB database exists for this user
      const dbName = `vault_${this.meId}`;
      const databases = await indexedDB.databases();
      const hasVaultDb = databases.some(db => db.name === dbName);
      
      console.log('[ChatSession] Vault database exists:', hasVaultDb);
      return hasVaultDb;
    } catch (error) {
      console.error('[ChatSession] Error checking vault data:', error);
      // If we can't check, assume it's a new user to be safe
      return false;
    }
  }

  /**
   * Generate keys for a new user automatically
   */
  private async generateKeysForNewUser(): Promise<void> {
    console.log('[ChatSession] Starting automatic key generation for new user');
    
    try {
      // Generate new key pair
      const publicKeyBase64 = await this.crypto.generateKeyPair();
      console.log('[ChatSession] ✅ Generated new key pair');
      
      // Export private key for vault storage
      const privateKeyBuffer = await this.crypto.exportPrivateKey();
      console.log('[ChatSession] ✅ Exported private key for vault storage');
      
      // Setup vault for new user (this will create the vault and AES key)
      await this.vault.setCurrentUser(this.meId, false); // false = write mode
      await this.vault.waitUntilReady();
      console.log('[ChatSession] ✅ Vault initialized for new user');
      
      // Store private key in vault
      await this.vault.set(VAULT_KEYS.PRIVATE_KEY, privateKeyBuffer);
      console.log('[ChatSession] ✅ Private key stored in vault');
      
      // Upload public key to server
      await new Promise<void>((resolve, reject) => {
        this.users.uploadPublicKey(publicKeyBase64).subscribe({
          next: (response) => {
            console.log('[ChatSession] ✅ Public key uploaded to server:', response);
            resolve();
          },
          error: (error) => {
            console.error('[ChatSession] ❌ Failed to upload public key to server:', error);
            reject(new Error(`Failed to upload public key: ${error.message || error}`));
          }
        });
      });
      
      console.log('[ChatSession] 🎉 Automatic key generation completed successfully for new user');
    } catch (error) {
      console.error('[ChatSession] ❌ Automatic key generation failed:', error);
      throw error;
    }
  }

  /**
   * Mark keys as missing and complete initialization
   */
  private async markKeysAsMissingAndComplete(): Promise<void> {
    this.users.markKeysAsMissing().subscribe({
      next: () => console.log('[ChatSession] Successfully marked keys as missing in database'),
      error: (error) => console.error('[ChatSession] Failed to mark keys as missing:', error)
    });
    
    this.keyLoading$.next(false);
    this.keyMissing$.next(true);
    this.myPrivateKeyMissing$.next(true);
    
    // IMPORTANT: Clear messages loading state and complete initialization
    this.messagesLoading$.next(false);
    this.isInitialized = true;
  }
}
