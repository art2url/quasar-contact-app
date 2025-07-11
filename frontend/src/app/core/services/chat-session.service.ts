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
import { ServerMessage, KeyBundleResponse, MessageHistoryResponse } from '@models/api-response.model';
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
  
  // Global flag to prevent multiple instances from marking keys as missing
  private static keysMissingAlreadyMarked = false;

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
  private keyStatusCache = new Map<string, { result: KeyBundleResponse; timestamp: number }>();
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
          this.connectionLossDetected = false;
          this.cleanupStalePendingMessages();
          this.scheduleReconnectSync();
          
          // Re-fetch partner's public key in case they regenerated while we were disconnected
          if (this.roomId) {
            this.refetchPartnerKeyOnReconnect();
          }
        } else if (!connected) {
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
    this.ws.onKeyRegenerated(this.keyRegeneratedCb);
    // Removed: Partner key recovery notifications now handled via database flag
  }

  /**
   * Enhanced message sent callback with fallback sync
   */
  private readonly messageSentCb = async ({ messageId, timestamp }: AckPayload) => {

    try {
      // Always try to update pending messages, even during loading
      const success = await this.updatePendingMessage(messageId, timestamp);
      if (!success) {
        console.error(
          '[ChatSession] Failed to update pending message, scheduling sync. MessageId:',
          messageId
        );
        this.scheduleFallbackSync();
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

    try {
      const messages = this.messages$.value;
      const messageIndex = messages.findIndex(m => m.id === messageId);

      if (messageIndex === -1) {
        console.error('[ChatSession] Message not found for read receipt:', messageId);
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
    } catch (error) {
      console.error('[ChatSession] Error processing read receipt:', error);
    }
  };

  private readonly keyRegeneratedCb = async (payload: KeyRegeneratedPayload) => {
    
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
    
    
    this.users.getPublicKey(this.roomId).subscribe({
      next: ({ publicKeyBundle, username, avatarUrl, hasPublicKey, isKeyMissing }) => {
        
        // Check if partner has a different public key than what we have cached
        const currentKey = this.theirPubKey;
        const newKey = publicKeyBundle;
        
        if (hasPublicKey && newKey && currentKey !== newKey) {
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
          
        } else if (isKeyMissing) {
          this.theirPubKey = null;
          this.keyLoading$.next(false);
          this.keyMissing$.next(false);
          this.myPrivateKeyMissing$.next(true);
          this.artificialKeyMissingState = true;
        } else if (!hasPublicKey) {
          this.theirPubKey = null;
          this.keyLoading$.next(false);
          this.keyMissing$.next(true);
        }
      },
      error: err => {
        console.error('[ChatSession] Failed to check partner key after reconnection:', err);
        // For 404 errors, don't block the chat
        if (err.status === 404) {
          console.log('[ChatSession] Partner key not found on reconnect (404), allowing chat to continue');
          this.keyMissing$.next(false);
        }
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
      console.error('[ChatSession] Max attempts reached for fetching partner key, showing notification');
      this.showPartnerKeyRegeneratedNotification$.next(true);
      return;
    }
    
    const delay = baseDelay * Math.pow(1.5, attempt);
    
    setTimeout(() => {
      this.fetchAndUpdatePartnerKey(userId, attempt);
    }, delay);
  }

  /**
   * Fetch and update partner's public key after key regeneration
   */
  public fetchAndUpdatePartnerKey(userId: string, attempt = 0): void {
    
    this.users.getPublicKey(userId).subscribe({
      next: ({ publicKeyBundle, username, avatarUrl, hasPublicKey }) => {
        
        if (hasPublicKey && publicKeyBundle) {
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
          
        } else {
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
        
        // For 404 errors, this is normal - user may not have public key yet
        if (err.status === 404) {
          console.log('[ChatSession] Partner basic info not found (404), using fallback values');
        }
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
      console.error('[ChatSession] No pending message found for ack:', messageId);
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
    }

    // Update messages list
    this.messages$.next([
      ...list.slice(0, bestMatchIdx),
      patched,
      ...list.slice(bestMatchIdx + 1),
    ]);


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
        console.error(
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


      // Store with multiple keys for better retrieval
      await this.vault.set(this.key(messageId), cacheEntry);
      await this.vault.set(this.key(`server::${serverTimestamp}`), cacheEntry);

    } catch (err) {
      console.error('[ChatSession] Error updating vault storage:', err);
    }
  }

  /**
   * Enhanced typing handler with connection awareness
   */
  private setupTypingHandler(): void {

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


    setTimeout(() => {
      this.performFallbackSync();
    }, 1000);
  }

  /**
   * Schedule sync after reconnection
   */
  private scheduleReconnectSync(): void {
    if (this.reconnectSyncInProgress) return;


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
      return;
    }

    try {
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
                }
              }
              continue;
            }

            // Only process messages newer than our last known message
            if (serverTimestamp <= lastMessageTime) continue;

            // This is a new message we missed
            hasUpdates = true;

            const fromMe = serverMsg.senderId.toString() === this.meId;
            const sender = fromMe ? 'You' : (this.theirUsername$.value || 'Unknown User');

            let text: string;
            if (serverMsg.deleted) {
              text = '⋯ message deleted ⋯';
            } else if (fromMe) {
              text = await this.findCachedMessageText(serverMsg);
            } else {
              text = await this.tryDecrypt(serverMsg.ciphertext, serverMsg.senderId);
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
      
      // Ensure we have username even for already initialized sessions
      if (!this.theirUsername$.value || this.theirUsername$.value === 'Unknown User') {
        this.fetchPartnerBasicInfo(roomId);
      }
      
      // Removed: Recovery UI monitoring now handled via database flag
      
      // Only reset key state if we're not in artificial state
      if (!this.artificialKeyMissingState) {
        const hasPrivateKeyInVault = await this.crypto.hasPrivateKeyInVault(this.vault, this.meId);
        const wasKeyMissing = this.myPrivateKeyMissing$.value;
        const isKeyMissing = !hasPrivateKeyInVault;
        
        // Key state check (early return path)
        
        // For already initialized sessions, if keys are missing, try automatic generation for new users
        if (isKeyMissing) {
          const hasMessageHistory = await this.checkIfUserHasMessageHistory();
          if (!hasMessageHistory) {
            // Set loading state to prevent error UI from showing during key generation
            this.keyLoading$.next(true);
            this.myPrivateKeyMissing$.next(false);
            this.isGeneratingKeysForNewUser = true;
            
            try {
              await this.generateKeysForNewUser();
              this.myPrivateKeyMissing$.next(false);
              this.keyLoading$.next(false);
              this.isGeneratingKeysForNewUser = false;
            } catch (error) {
              console.error('[ChatSession] Automatic key generation failed in early return path:', error);
              this.myPrivateKeyMissing$.next(true);
              this.keyLoading$.next(false);
              this.isGeneratingKeysForNewUser = false;
            }
          } else {
            this.myPrivateKeyMissing$.next(true);
          }
        } else {
          this.myPrivateKeyMissing$.next(false);
        }
        
        // If key just became missing and it's not artificial, start monitoring
        if (isKeyMissing && !wasKeyMissing && !this.artificialKeyMissingState) {
          // Key just became missing - should start monitoring
        }
      }
      
      // Removed: Recovery UI monitoring now handled via database flag
      
      return;
    }

    if (this.isInitializing) {
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
    
    // Key state check (main initialization)
    
    // Don't set myPrivateKeyMissing$ to true yet - we'll try automatic key generation first
    // Only set it to true if key generation fails
    this.myPrivateKeyMissing$.next(false);

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
      } catch (error) {
        // Vault unavailable in read-only mode - this means either:
        // 1. New user (no vault exists yet) - should auto-generate keys
        // 2. Corrupted vault (AES key missing) - user needs key recovery
        console.log('[ChatSession] Vault unavailable in read-only mode:', error);
        
        // Check if this is truly a new user by looking at message history
        const hasMessageHistory = await this.checkIfUserHasMessageHistory();
        
        console.log(`[ChatSession] New user check: hasMessageHistory=${hasMessageHistory}, roomId=${this.roomId}`);
        
        if (!hasMessageHistory) {
          // This is a new user with no message history - automatically generate keys
          console.log('[ChatSession] 🔑 Detected new user - starting automatic key generation');
          
          this.isGeneratingKeysForNewUser = true;
          
          try {
            await this.generateKeysForNewUser();
            
            // Continue with normal initialization flow
            await this.vault.setCurrentUser(this.meId, false); // false = write mode
            await this.vault.waitUntilReady();
            privateKeyData = await this.vault.get<ArrayBuffer>(VAULT_KEYS.PRIVATE_KEY);
            
            // Import the newly generated private key
            await this.crypto.importPrivateKey(privateKeyData!);
            
            
            // Continue with normal flow (don't return here)
            // Note: keyLoading$ will be set to false in the partner key retrieval callback
            // This ensures the error UI never shows during automatic key generation
          } catch (keyGenError) {
            console.error('[ChatSession] ❌ Failed to generate keys for new user:', keyGenError);
            console.error('[ChatSession] ❌ Key generation error details:', {
              error: keyGenError,
              roomId: this.roomId,
              userId: this.meId,
              hasPrivateKey: this.crypto.hasPrivateKey(),
              isGeneratingKeysForNewUser: this.isGeneratingKeysForNewUser
            });
            this.isGeneratingKeysForNewUser = false;
            // Fall back to marking keys as missing
            await this.markKeysAsMissingAndComplete();
            return;
          }
        } else {
          // Existing user with message history - needs key recovery
          console.log('[ChatSession] 🔐 Detected existing user with message history - showing key recovery UI');
          await this.markKeysAsMissingAndComplete();
          return;
        }
      }
      
      if (!privateKeyData) {
        // Private key not found in vault - this shouldn't happen if we got here
        // but handle it gracefully by marking as missing
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
            this.theirPubKey = null;
            this.keyLoading$.next(false);
            this.keyMissing$.next(false);
            this.myPrivateKeyMissing$.next(true);
            this.artificialKeyMissingState = true;
          } else if (hasPublicKey && publicKeyBundle) {
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
              
              // Check partner status now that key generation is complete
              this.checkPartnerKeyStatusOnDemand('key_generation_complete');
            }
          } else {
            this.theirPubKey = null;
            this.keyLoading$.next(false);
            this.keyMissing$.next(true);
          }
        },
        error: err => {
          console.error('[ChatSession] Failed to get partner data:', err);
          // Set generic fallback username if API call fails completely
          this.theirUsername$.next('Unknown User');
          this.keyLoading$.next(false);
          
          // Only set keyMissing if this is specifically about missing keys
          // For 404 errors, we should allow the chat to continue without blocking
          if (err.status === 404) {
            console.log('[ChatSession] Partner public key not found (404), allowing chat to continue');
            this.keyMissing$.next(false);
          } else {
            // For other errors, set keyMissing to true
            this.keyMissing$.next(true);
          }
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
      
      // Fix any incorrect key states from previous bugs
      this.checkOwnKeyStatus();
      
      // IMPORTANT: Force partner key status check after initialization is complete
      // This ensures that on page reload, we detect if partner has missing keys
      this.schedulePostInitializationCheck();
    } finally {
      this.isInitialized = true;
      this.isInitializing = false;
    }
  }

  /**
   * Load message history with better error handling
   */
  private loadMessageHistory(): void {
    // Don't load message history if keys are missing
    if (this.myPrivateKeyMissing$.value) {
      this.messagesLoading$.next(false);
      return;
    }

    this.api.getMessageHistory(this.roomId).subscribe({
      next: async res => {
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
            text = await this.tryDecrypt(m.ciphertext, m.senderId);
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
      return;
    }

    if (!this.ws.isConnected()) {
      console.error(
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
          console.error(
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


    // Clear timeouts and tracking, but keep messages in UI
    // Let fallback sync determine what actually needs to be done
    this.pendingMessages.forEach(pendingInfo => {
      clearTimeout(pendingInfo.timeoutId);
    });

    this.pendingMessages.clear();
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
        list[idx].sender === 'You' ? list[idx].text : await this.tryDecrypt(m.ciphertext, this.roomId);

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
      const decryptedText = await this.tryDecrypt(m.ciphertext, m.fromUserId);
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

  private async tryDecrypt(ct: string, senderId?: string): Promise<string> {
    // Check if we've already failed to decrypt this ciphertext
    if (this.failedDecryptions.has(ct)) {
      // Check if this is a message from the current user (indicating old key)
      const currentUserId = localStorage.getItem('userId');
      if (senderId === currentUserId) {
        return '🔐 Message encrypted with previous keys (unreadable after key regeneration)';
      } else {
        return '🔒 Encrypted message (from partner)';
      }
    }

    try {
      return await this.crypto.decryptMessage(ct);
    } catch (error) {
      // Mark this ciphertext as failed to avoid retrying
      this.failedDecryptions.add(ct);
      // Failed to decrypt message - likely encrypted with previous keys after key regeneration

      // Clean up old failed entries periodically (keep last 100)
      if (this.failedDecryptions.size > 100) {
        const entries = Array.from(this.failedDecryptions);
        this.failedDecryptions.clear();
        // Keep the most recent 50 entries
        entries.slice(-50).forEach(entry => this.failedDecryptions.add(entry));
      }

      // Check if this is a message from the current user (indicating old key)
      const currentUserId = localStorage.getItem('userId');
      if (senderId === currentUserId) {
        return '🔐 Message encrypted with previous keys (unreadable after key regeneration)';
      } else {
        return '🔒 Encrypted message (from partner)';
      }
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
          return cached.text;
        }
      } catch (error) {
        vaultFailureCount++;
        console.log('[ChatSession] Vault failure during cache retrieval:', error);
      }
    }
    
    // If we had multiple vault failures, this indicates corruption
    if (vaultFailureCount > 0) {
      this.detectVaultCorruption();
    }


    // Fuzzy match for pending messages with expanded time window
    const keys = await this.vault.keysStartingWith(this.key('pending::'));

    for (const key of keys) {
      const match = key.match(/pending::(\d+)$/);
      if (match) {
        const pendingTs = parseInt(match[1]);
        const timeDiff = Math.abs(pendingTs - serverTimestamp);
        if (timeDiff <= 10000) {
          // Increased from 5 seconds to 10 seconds
          const cached = await this.vault.get<SentCacheEntry>(key);
          if (cached && cached.text) {
            // Update vault with proper keys
            await this.vault.set(this.key(messageId), cached);
            await this.vault.set(key, null);
            return cached.text;
          }
        }
      }
    }

    // No cached text found - using fallback message (this is expected for old messages after key regeneration)
    
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
   * This method fixes users who were incorrectly marked as having missing keys
   */
  private checkOwnKeyStatus(): void {
    this.users.getPublicKey(this.meId).subscribe({
      next: (response) => {
        console.log('[ChatSession] checkOwnKeyStatus response:', response);
        
        // Case 1: Server shows we have valid keys but we're in artificial blocking state
        if (response.hasPublicKey && !response.isKeyMissing && this.artificialKeyMissingState) {
          console.log('[ChatSession] Clearing artificial blocking state - user has valid keys');
          this.artificialKeyMissingState = false;
          this.myPrivateKeyMissing$.next(false);
          this.keyLoading$.next(false);
          this.keyMissing$.next(false);
        }
        
        // Case 2: Server shows we have valid keys but we're somehow showing missing key UI
        if (response.hasPublicKey && !response.isKeyMissing && this.myPrivateKeyMissing$.value) {
          console.log('[ChatSession] Detected incorrectly marked user - fixing state');
          
          // Check if we have a valid private key locally
          if (this.crypto.hasPrivateKey()) {
            console.log('[ChatSession] User has valid private key, clearing all blocking states');
            this.artificialKeyMissingState = false;
            this.myPrivateKeyMissing$.next(false);
            this.keyLoading$.next(false);
            this.keyMissing$.next(false);
          } else {
            console.log('[ChatSession] User missing private key but has public key - need key recovery');
            // User needs to recover their private key but isn't in artificial blocking
            this.artificialKeyMissingState = false;
            this.myPrivateKeyMissing$.next(true);
            this.keyMissing$.next(false);
          }
        }
        
        // Case 3: Server correctly shows we have missing keys
        if (response.isKeyMissing && !this.myPrivateKeyMissing$.value) {
          console.log('[ChatSession] Server correctly shows missing keys - updating UI');
          this.myPrivateKeyMissing$.next(true);
          this.keyMissing$.next(true);
          this.artificialKeyMissingState = false;
        }
        
        // Case 4: Server incorrectly shows missing keys but we have valid keys
        if (response.isKeyMissing && this.crypto.hasPrivateKey()) {
          console.log('[ChatSession] Server incorrectly shows missing keys - will reset database flag');
          this.resetDatabaseKeyFlag();
        }
      },
      error: (error) => {
        if (error.message && error.message.includes('Rate limited')) {
          console.log('[ChatSession] Rate limited when checking own key status');
        } else {
          console.error('[ChatSession] Error checking own key status:', error);
        }
      }
    });
  }

  /**
   * Check partner key status only when needed (event-driven)
   */
  private checkPartnerKeyStatusOnDemand(reason = 'manual'): void {
    if (!this.roomId) {
      return;
    }
    
    const now = Date.now();
    const cacheKey = `partner_${this.roomId}`;
    const cached = this.keyStatusCache.get(cacheKey);
    
    // Use cached result if available and not expired
    if (cached && (now - cached.timestamp) < this.KEY_STATUS_CACHE_TTL) {
      this.processPartnerKeyStatusResponse(cached.result);
      return;
    }
    
    // Avoid duplicate requests within short time window
    if (now - this.lastKeyStatusCheck < 5000) {
      return;
    }
    
    this.lastKeyStatusCheck = now;
    
    this.users.getPublicKey(this.roomId).subscribe({
      next: (response) => {
        
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
  private processPartnerKeyStatusResponse(response: KeyBundleResponse): void {
    console.log('[ChatSession] 🔍 Processing partner key status:', {
      partnerUserId: this.roomId,
      partnerHasPublicKey: response.hasPublicKey,
      partnerIsKeyMissing: response.isKeyMissing,
      myHasPrivateKey: this.crypto.hasPrivateKey(),
      myPrivateKeyMissing: this.myPrivateKeyMissing$.value,
      currentArtificialState: this.artificialKeyMissingState
    });
    
    if (response.isKeyMissing) {
      console.log('[ChatSession] 🚫 Partner has lost their keys');
      
      // Partner has lost their keys - show blocking UI only if:
      // 1. We have our own valid keys (crypto.hasPrivateKey())
      // 2. We're not already in artificial blocking state
      // 3. We're not already showing our own key recovery UI (myPrivateKeyMissing is false)
      if (this.crypto.hasPrivateKey() && !this.artificialKeyMissingState && !this.myPrivateKeyMissing$.value) {
        console.log('[ChatSession] 🚫 Setting artificial blocking state - partner key issue');
        
        // IMPORTANT: Set artificial state FIRST before triggering UI changes
        // This prevents race condition where ensureKeysMissingFlagSet is called before artificialKeyMissingState is set
        this.artificialKeyMissingState = true; // This shows "Partner Key Issue" message
        
        // This creates an artificial "missing key" state to block the UI
        // The user's keys are fine, but we simulate missing keys to show partner blocking
        this.theirPubKey = null;
        this.keyLoading$.next(false);
        this.keyMissing$.next(false);
        this.myPrivateKeyMissing$.next(true); // This triggers the blocking UI (after artificial state is set)
        
        console.log('[ChatSession] ✅ Artificial blocking state set - user should see "Chat Blocked - Partner Key Issue"');
      } else {
        // If we don't have our own keys OR we're already showing our own key recovery UI,
        // don't change the state - the user should see their own key recovery UI, not partner blocking
        console.log('[ChatSession] ⚠️ Partner keys missing, but user has own key issues or already showing recovery UI - keeping current state');
      }
    } else if (response.hasPublicKey && !response.isKeyMissing) {
      console.log('[ChatSession] ✅ Partner has valid keys - clearing any blocking states');
      
      // Partner has valid keys and is not marked as missing - normal chat
      
      // Check if partner has a different public key than what we have cached
      const currentKey = this.theirPubKey;
      const newKey = response.publicKeyBundle;
      
      if (newKey && currentKey !== newKey) {
        console.log('[ChatSession] 🔄 Partner has new public key - updating');
        this.theirPubKey = newKey;
      }
      
      // Clear blocking states and enable normal chat
      this.keyLoading$.next(false);
      this.keyMissing$.next(false);
      this.theirPubKey = response.publicKeyBundle;
      
      // Only clear artificial blocking state if we were in artificial mode
      if (this.artificialKeyMissingState) {
        console.log('[ChatSession] 🔓 Clearing artificial blocking state - partner fixed their keys');
        this.artificialKeyMissingState = false;
        this.myPrivateKeyMissing$.next(false);
      }
      
      console.log('[ChatSession] ✅ Normal chat enabled - partner has valid keys');
    }
  }

  /**
   * Set up event-driven key status monitoring
   */
  private setupEventDrivenKeyStatusMonitoring(): void {
    
    // Listen for WebSocket events that indicate key changes
    this.setupKeyStatusWebSocketListeners();
    
    // Check partner key status once at initialization
    this.checkPartnerKeyStatusOnDemand('initialization');
  }
  
  /**
   * Schedule a post-initialization check to ensure partner key status is properly evaluated
   */
  private schedulePostInitializationCheck(): void {
    // Use requestAnimationFrame for proper timing without arbitrary delays
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        if (this.roomId) {
          console.log('[ChatSession] 🔄 Post-initialization partner key check');
          // Clear any cached results to force a fresh check
          this.keyStatusCache.clear();
          this.lastKeyStatusCheck = 0;
          this.checkPartnerKeyStatusOnDemand('post_initialization');
        }
      });
    });
  }
  
  /**
   * Set up WebSocket listeners for key status changes
   */
  private setupKeyStatusWebSocketListeners(): void {
    // Listen for key regeneration events
    this.ws.onKeyRegenerated(() => {
      // Clear cache and check status
      this.clearKeyStatusCache();
      this.checkPartnerKeyStatusOnDemand('key_regenerated');
    });
    
    // Listen for connection events (partner might have regenerated keys while offline)
    this.subs.add(
      this.ws.isConnected$.subscribe(connected => {
        if (connected) {
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
  }
  
  /**
   * Manually trigger key status check (for UI buttons, etc.)
   */
  public manuallyCheckKeyStatus(): void {
    this.clearKeyStatusCache();
    this.checkPartnerKeyStatusOnDemand('manual_trigger');
  }

  /**
   * Debug method to show current room info
   */
  debugShowRoomInfo(): void {
    
    // Test partner key status immediately
    if (this.roomId) {
      this.checkPartnerKeyStatusOnDemand('debug_test');
    }
  }

  /**
   * DEBUG METHOD: Manually force current user to lose their keys for testing
   * This simulates key loss and triggers the missing key flow
   */
  async debugForceKeyLoss(): Promise<void> {
    console.log('[ChatSession] 🔥 DEBUG: Forcing key loss for testing');
    console.log('[ChatSession] 🔥 Before key loss - User state:', {
      hasPrivateKey: this.crypto.hasPrivateKey(),
      myPrivateKeyMissing: this.myPrivateKeyMissing$.value,
      artificialKeyMissingState: this.artificialKeyMissingState,
      userId: this.meId,
      roomId: this.roomId
    });
    
    try {
      // 1. Clear private key from vault (public key is stored in database)
      console.log('[ChatSession] 🔥 Step 1: Clearing private key from vault');
      await this.vault.setCurrentUser(this.meId, false); // write mode
      await this.vault.waitUntilReady();
      await this.vault.set(VAULT_KEYS.PRIVATE_KEY, null);
      
      // 2. Clear crypto service memory
      console.log('[ChatSession] 🔥 Step 2: Clearing crypto service memory');
      this.crypto.clearPrivateKey();
      
      // 3. Mark keys as missing in database (only if not already marked)
      if (ChatSessionService.keysMissingAlreadyMarked) {
        console.log('[ChatSession] ⚠️ Keys already marked as missing by another instance');
      } else {
        console.log('[ChatSession] 🔥 Step 3: Marking keys as missing in database using protected method');
        // Use the protected method to ensure database flag is only set for real key loss
        this.ensureKeysMissingFlagSet();
      }
      
      // 4. Update UI state to show missing keys (always do this)
      console.log('[ChatSession] 🔥 Step 4: Updating UI state to show missing keys');
      this.artificialKeyMissingState = false; // This is REAL key loss, not artificial blocking
      this.keyLoading$.next(false);
      this.keyMissing$.next(true);
      this.myPrivateKeyMissing$.next(true);
      
      console.log('[ChatSession] 🔥 After key loss - User state:', {
        hasPrivateKey: this.crypto.hasPrivateKey(),
        myPrivateKeyMissing: this.myPrivateKeyMissing$.value,
        artificialKeyMissingState: this.artificialKeyMissingState,
        keyMissing: this.keyMissing$.value
      });
      
      console.log('[ChatSession] 🔥 Key loss simulation completed - user should now see "Generate New Keys" button');
      
    } catch (error) {
      console.error('[ChatSession] ❌ Error during key loss simulation:', error);
    }
  }

  /**
   * RESET METHOD: Reset database flag for users with valid keys
   * This fixes the bug where all users were marked as having missing keys
   */
  async resetDatabaseKeyFlag(): Promise<void> {
    console.log('[ChatSession] RESET: Attempting to reset database key flag for user with valid keys');
    
    try {
      // First, ensure vault is available and try to load private key
      await this.vault.setCurrentUser(this.meId, false);
      await this.vault.waitUntilReady();
      
      const privateKeyData = await this.vault.get<ArrayBuffer>(VAULT_KEYS.PRIVATE_KEY);
      if (privateKeyData) {
        console.log('[ChatSession] RESET: Found valid private key in vault, uploading to server');
        
        // Clear any existing key and import from vault
        this.crypto.clearPrivateKey();
        await this.crypto.importPrivateKey(privateKeyData);
        
        // Verify the key was imported correctly
        if (!this.crypto.hasPrivateKey()) {
          throw new Error('Failed to import private key from vault');
        }
        
        // Export the public key from the imported private key
        const publicKeyB64 = await this.crypto.exportCurrentPublicKey();
        await firstValueFrom(this.users.uploadPublicKey(publicKeyB64));
        
        console.log('[ChatSession] RESET: Successfully uploaded public key, user should now have isKeyMissing=false');
        
        // Clear any artificial blocking states
        this.artificialKeyMissingState = false;
        this.myPrivateKeyMissing$.next(false);
        this.keyLoading$.next(false);
        this.keyMissing$.next(false);
        
      } else {
        console.log('[ChatSession] RESET: No private key found in vault - user actually has missing keys');
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
    this.artificialKeyMissingState = false;
    this.myPrivateKeyMissing$.next(false);
    this.keyLoading$.next(false);
    this.keyMissing$.next(false);
    
    // Re-check actual key status
    this.checkOwnKeyStatus();
    if (this.roomId) {
      this.checkPartnerKeyStatusOnDemand('debug_force_reset');
    }
    
  }

  /**
   * DEBUG METHOD: Manually clear artificial blocking state for testing
   */
  debugClearArtificialBlocking(): void {
    
    if (this.artificialKeyMissingState) {
      this.artificialKeyMissingState = false;
      this.myPrivateKeyMissing$.next(false);
      this.keyLoading$.next(false);
      this.keyMissing$.next(false);
    }
  }

  /**
   * DEBUG METHOD: Emergency cleanup - clear ALL isKeyMissing flags
   */
  debugClearAllMissingFlags(): void {
    console.log('[ChatSession] DEBUG: Emergency cleanup - clearing all isKeyMissing flags...');
    this.users.clearAllMissingFlags().subscribe({
      next: (response) => {
        console.log('[ChatSession] DEBUG: Successfully cleared all missing flags:', response);
      },
      error: (error) => console.error('[ChatSession] DEBUG: Failed to clear all missing flags:', error)
    });
  }

  /**
   * DEBUG METHOD: Regenerate public key from existing private key
   */
  async debugRegeneratePublicKey(): Promise<void> {
    console.log('[ChatSession] DEBUG: Regenerating public key from existing private key...');
    
    try {
      // Check if we have a private key
      if (!this.crypto.hasPrivateKey()) {
        console.log('[ChatSession] DEBUG: No private key found, cannot regenerate public key');
        return;
      }
      
      // Export the current public key
      const publicKeyB64 = await this.crypto.exportCurrentPublicKey();
      console.log('[ChatSession] DEBUG: Exported public key:', publicKeyB64.substring(0, 50) + '...');
      
      // Upload to server
      const response = await firstValueFrom(this.users.uploadPublicKey(publicKeyB64));
      console.log('[ChatSession] DEBUG: Successfully uploaded public key:', response);
      
      // Re-check key status
      this.checkOwnKeyStatus();
      if (this.roomId) {
        this.checkPartnerKeyStatusOnDemand('debug_regenerate_public_key');
      }
      
    } catch (error) {
      console.error('[ChatSession] DEBUG: Failed to regenerate public key:', error);
    }
  }

  /**
   * DEBUG METHOD: Fix both users' database key missing flags
   */
  debugFixBothUsersKeyFlags(): void {
    console.log('[ChatSession] DEBUG: Fixing both users key missing flags');
    
    // First, fix all inconsistent states globally
    this.users.fixInconsistentKeyStates().subscribe({
      next: () => {
        console.log('[ChatSession] DEBUG: Fixed all inconsistent key states globally');
        
        // Then clear my own database flag specifically
        this.users.debugClearKeysMissingFlag().subscribe({
          next: () => {
            console.log('[ChatSession] DEBUG: Cleared my own key missing flag');
            // Clear my artificial blocking state
            this.artificialKeyMissingState = false;
            this.myPrivateKeyMissing$.next(false);
            this.keyLoading$.next(false);
            this.keyMissing$.next(false);
            
            // Force re-check key statuses
            this.checkOwnKeyStatus();
            if (this.roomId) {
              this.checkPartnerKeyStatusOnDemand('debug_fix_both_users');
            }
          },
          error: (error) => console.error('[ChatSession] DEBUG: Failed to clear my key missing flag:', error)
        });
      },
      error: (error) => {
        console.error('[ChatSession] DEBUG: Failed to fix inconsistent key states:', error);
        // Continue with individual flag clearing even if global fix fails
        this.users.debugClearKeysMissingFlag().subscribe({
          next: () => {
            console.log('[ChatSession] DEBUG: Cleared my own key missing flag');
            this.artificialKeyMissingState = false;
            this.myPrivateKeyMissing$.next(false);
            this.keyLoading$.next(false);
            this.keyMissing$.next(false);
            
            this.checkOwnKeyStatus();
            if (this.roomId) {
              this.checkPartnerKeyStatusOnDemand('debug_fix_both_users');
            }
          },
          error: (error) => console.error('[ChatSession] DEBUG: Failed to clear my key missing flag:', error)
        });
      }
    });
  }


  /**
   * Ensure database flag is set when keys are missing
   * This can be called as a fallback to ensure partners get notified
   * IMPORTANT: Only mark keys as missing for REAL key loss, not artificial blocking
   */
  ensureKeysMissingFlagSet(): void {
    // DETAILED LOGGING: Track exact state when this method is called
    console.log('[ChatSession] 🔍 ensureKeysMissingFlagSet called with state:', {
      myPrivateKeyMissing: this.myPrivateKeyMissing$.value,
      artificialKeyMissingState: this.artificialKeyMissingState,
      hasPrivateKey: this.crypto.hasPrivateKey(),
      userId: this.meId,
      roomId: this.roomId,
      willMarkMissing: this.myPrivateKeyMissing$.value && !this.artificialKeyMissingState
    });
    
    // ADDITIONAL PROTECTION: Double-check artificial state to prevent race conditions
    if (this.artificialKeyMissingState) {
      console.log('[ChatSession] 🛡️ PROTECTION: Preventing database flag setting due to artificial blocking state');
      return;
    }
    
    // Only mark keys as missing if this is real key loss (not artificial blocking due to partner issues)
    if (this.myPrivateKeyMissing$.value && !this.artificialKeyMissingState) {
      console.log('[ChatSession] 🚨 MARKING KEYS AS MISSING IN DATABASE - this should only happen for real key loss');
      this.users.markKeysAsMissing().subscribe({
        next: () => {
          console.log('[ChatSession] ✅ Successfully marked keys as missing in database');
        },
        error: (error) => console.error('[ChatSession] ❌ Failed to set database flag for missing keys:', error)
      });
    } else if (this.myPrivateKeyMissing$.value && this.artificialKeyMissingState) {
      console.log('[ChatSession] ⚠️ Skipping key marking - this is artificial blocking due to partner key issues');
    } else if (!this.myPrivateKeyMissing$.value) {
      console.log('[ChatSession] ⚠️ Skipping key marking - myPrivateKeyMissing is false');
    } else {
      console.log('[ChatSession] ⚠️ Skipping key marking - unknown condition');
    }
  }

  /**
   * Regenerate encryption keys when private key is missing
   * This helps users recover from vault corruption or browser data loss
   */
  async regenerateKeys(): Promise<void> {
    try {
      this.isRegeneratingKeys = true; // Set flag to prevent stored notification processing
      
      // Removed: Recovery UI monitoring now handled via database flag
      
      this.keyLoading$.next(true);
      this.keyMissing$.next(false);
      this.myPrivateKeyMissing$.next(false);
      this.artificialKeyMissingState = false; // Clear artificial state

      // Open vault in WRITE mode for key regeneration (may have been opened in read-only mode previously)
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


      // Upload new public key to server
      const response = await firstValueFrom(this.users.uploadPublicKey(publicKeyB64));
      if (!response?.message) {
        throw new Error('Failed to upload public key to server');
      }

      // Fix any inconsistent database states that might have been caused by mutual blocking
      try {
        await firstValueFrom(this.users.fixInconsistentKeyStates());
        console.log('[ChatSession] Fixed inconsistent key states in database');
      } catch (fixError) {
        console.warn('[ChatSession] Failed to fix inconsistent key states:', fixError);
        // Don't fail the entire regeneration process if this cleanup fails
      }


      // Notify partner about key regeneration
      if (this.roomId) {
        this.ws.notifyKeyRegenerated(this.roomId);
      }

      // Clear old undecryptable messages since they were encrypted with the old key
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
        await this.init(this.roomId);
      }
      
      this.isRegeneratingKeys = false; // Clear flag after successful regeneration

      // Refresh the page after successful key generation to ensure clean state
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
   * Check if user has any message history (to distinguish new users from existing users)
   */
  private async checkIfUserHasMessageHistory(): Promise<boolean> {
    try {
      console.log(`[ChatSession] 📝 Checking message history for roomId: ${this.roomId}`);
      
      // Check if user has any sent or received messages in this room
      const response = await new Promise<MessageHistoryResponse>((resolve, reject) => {
        this.api.getMessageHistory(this.roomId).subscribe({
          next: (response) => resolve(response),
          error: (error) => reject(error)
        });
      });
      
      const hasMessages = response.messages && response.messages.length > 0;
      const messageCount = response.messages ? response.messages.length : 0;
      
      console.log(`[ChatSession] 📝 Message history check result: hasMessages=${hasMessages}, messageCount=${messageCount}`);
      
      return hasMessages;
    } catch (error) {
      console.error('[ChatSession] Error checking message history:', error);
      // If we can't check message history, assume user has history to be safe
      // This prevents accidental key generation for existing users
      console.log('[ChatSession] 📝 Defaulting to hasMessageHistory=true due to error (safer for existing users)');
      return true;
    }
  }

  /**
   * Generate keys for a new user automatically
   */
  private async generateKeysForNewUser(): Promise<void> {
    
    try {
      console.log('[ChatSession] 🔑 Starting automatic key generation for new user');
      
      // Generate new key pair
      console.log('[ChatSession] 🔑 Step 1: Generating key pair');
      const publicKeyBase64 = await this.crypto.generateKeyPair();
      
      // Export private key for vault storage
      console.log('[ChatSession] 🔑 Step 2: Exporting private key');
      const privateKeyBuffer = await this.crypto.exportPrivateKey();
      
      // Setup vault for new user (this will create the vault and AES key)
      console.log('[ChatSession] 🔑 Step 3: Setting up vault');
      await this.vault.setCurrentUser(this.meId, false); // false = write mode
      await this.vault.waitUntilReady();
      
      // Store private key in vault
      console.log('[ChatSession] 🔑 Step 4: Storing private key in vault');
      await this.vault.set(VAULT_KEYS.PRIVATE_KEY, privateKeyBuffer);
      
      // Upload public key to server
      console.log('[ChatSession] 🔑 Step 5: Uploading public key to server');
      await new Promise<void>((resolve, reject) => {
        this.users.uploadPublicKey(publicKeyBase64).subscribe({
          next: () => {
            console.log('[ChatSession] ✅ Public key uploaded successfully');
            resolve();
          },
          error: (error) => {
            console.error('[ChatSession] ❌ Failed to upload public key to server:', error);
            reject(new Error(`Failed to upload public key: ${error.message || error}`));
          }
        });
      });
      
      console.log('[ChatSession] ✅ Automatic key generation completed successfully');
      
    } catch (error) {
      console.error('[ChatSession] ❌ Automatic key generation failed:', error);
      throw error;
    }
  }

  /**
   * Mark keys as missing and complete initialization
   */
  private async markKeysAsMissingAndComplete(): Promise<void> {
    console.log('[ChatSession] 🔥 markKeysAsMissingAndComplete called for user:', this.meId);
    console.log('[ChatSession] 🔥 Stack trace:', new Error().stack);
    
    // Set the UI state first
    this.keyLoading$.next(false);
    this.keyMissing$.next(true);
    this.myPrivateKeyMissing$.next(true);
    
    // IMPORTANT: Set artificial state to false - this is real key recovery, not partner blocking
    this.artificialKeyMissingState = false;
    
    // IMPORTANT: Clear messages loading state and complete initialization
    this.messagesLoading$.next(false);
    this.isInitialized = true;
    
    // Use the protected method to ensure database flag is only set for real key loss
    this.ensureKeysMissingFlagSet();
  }
}
