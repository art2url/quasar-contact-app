import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription } from 'rxjs';

import { MatFormFieldModule } from '@angular/material/form-field';
import { MatInputModule } from '@angular/material/input';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { environment } from '@environments/environment';

import { toEpoch, getRelativeTime } from '@utils/date.util';

import { UserService } from '@services/user.service';
import { WebSocketService } from '@services/websocket.service';
import { MessagesService } from '@services/messages.service';
import { CryptoService } from '@services/crypto.service';
import { VaultService } from '@services/vault.service';
import { LoadingService } from '@services/loading.service';
import { AuthService } from '@services/auth.service';
import { NotificationService } from '@services/notification.service';

import { UserSummary } from '@models/user.model';
import { ChatEntry } from '@models/chat.model';
import { AckPayload, IncomingSocketMessage } from '@models/socket.model';

@Component({
  selector: 'app-chat-list',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatFormFieldModule,
    MatInputModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './chat-list.component.html',
  styleUrls: ['./chat-list.component.css'],
})
export class ChatListComponent implements OnInit, OnDestroy {
  // Public properties
  chats: ChatEntry[] = [];
  searchTerm = '';
  searchResults: UserSummary[] = [];
  chatLoadingFinished = false;
  isLoadingChats = false;
  showBackButton = false;

  // Add sorting control to prevent bouncing
  private sortingInProgress = false;
  private pendingSortOperations = 0;
  private lastSortTime = 0;
  private readonly SORT_DEBOUNCE_MS = 300;

  // Private properties
  private subs = new Subscription();
  private readonly me = localStorage.getItem('userId')!;

  constructor(
    private http: HttpClient,
    public ws: WebSocketService,
    private api: MessagesService,
    private users: UserService,
    private crypto: CryptoService,
    private vault: VaultService,
    private router: Router,
    private loadingService: LoadingService,
    public authService: AuthService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private notificationService: NotificationService,
    private location: Location
  ) {}

  ngOnInit() {
    console.log('=== ChatList ngOnInit START ===');

    // Determine if back button should be shown
    this.checkBackButtonVisibility();

    // Set up event handlers
    this.setupEventHandlers();

    // Load chats immediately - no delays, no complex logic
    this.loadChatsNow();

    // FIXED: Set up WebSocket handlers for online status updates
    this.setupWebSocketHandlers();

    // NEW: Subscribe to notification updates
    this.setupNotificationHandlers();

    console.log('=== ChatList ngOnInit END ===');
  }

  /**
   * Determine if the back button should be visible
   * Hide it if user came directly from login or has no navigation history
   */
  private checkBackButtonVisibility(): void {
    // Check if there's meaningful navigation history
    // If history length is 1, user likely came directly from login
    if (window.history.length > 1) {
      // Also check if the current navigation wasn't from an auth page
      const navigation = this.router.getCurrentNavigation();
      const previousUrl = navigation?.previousNavigation?.finalUrl?.toString();

      // Show back button if there's history and user didn't come from auth pages
      this.showBackButton = !previousUrl?.includes('/auth/');
    } else {
      this.showBackButton = false;
    }

    console.log('[ChatList] Back button visibility:', this.showBackButton);
  }

  /**
   * Set up notification handlers to update chat badges
   */
  private setupNotificationHandlers(): void {
    console.log('[ChatList] Setting up notification handlers');

    this.subs.add(
      this.notificationService.chatNotifications$.subscribe(notifications => {
        console.log('[ChatList] Chat notifications updated:', notifications);

        // Update unread counts for existing chats
        notifications.forEach(notification => {
          const chat = this.chats.find(c => c.id === notification.userId);
          if (chat) {
            const oldUnread = chat.unread;
            chat.unread = notification.unreadCount;

            if (oldUnread !== chat.unread) {
              console.log(
                `[ChatList] Updated unread count for ${chat.name}: ${oldUnread} -> ${chat.unread}`
              );
            }
          }
        });

        // Clear unread counts for chats not in notifications
        this.chats.forEach(chat => {
          const hasNotification = notifications.some(n => n.userId === chat.id);
          if (!hasNotification && chat.unread > 0) {
            console.log(`[ChatList] Clearing unread count for ${chat.name}`);
            chat.unread = 0;
          }
        });
      })
    );
  }

  private setupEventHandlers(): void {
    this.ws.onReceiveMessage(this.handleIncomingMessage);
    this.ws.onMessageSent(this.handleMessageSent);
  }

  /**
   * Enhanced WebSocket handlers for better online status tracking with debugging
   */
  private setupWebSocketHandlers(): void {
    console.log('[ChatList] Setting up enhanced WebSocket handlers for online status');

    // Subscribe to the main online users list with better debugging
    this.subs.add(
      this.ws.onlineUsers$.subscribe(onlineUsers => {
        console.log('[ChatList] Online users list updated:', onlineUsers);
        this.applyOnlineStatus(onlineUsers);
      })
    );

    // Subscribe to individual user online events with debugging
    this.subs.add(
      this.ws.userOnline$.subscribe(userId => {
        console.log('[ChatList] User came online:', userId);
        const chat = this.chats.find(c => c.id === userId);
        if (chat && !chat.online) {
          console.log(`[ChatList] Marking ${chat.name} as online`);
          chat.online = true;
          this.cdr.detectChanges();
        }
      })
    );

    // Subscribe to individual user offline events with debugging
    this.subs.add(
      this.ws.userOffline$.subscribe(userId => {
        console.log('[ChatList] User went offline:', userId);
        const chat = this.chats.find(c => c.id === userId);
        if (chat && chat.online) {
          console.log(`[ChatList] Marking ${chat.name} as offline`);
          chat.online = false;
          this.cdr.detectChanges();
        }
      })
    );

    // Handle WebSocket connection status changes with debugging
    this.subs.add(
      this.ws.isConnected$.subscribe(connected => {
        console.log('[ChatList] WebSocket connection status:', connected);
        if (!connected) {
          // When disconnected, mark all users as offline
          console.log('[ChatList] WebSocket disconnected, marking all users as offline');
          this.chats.forEach(chat => {
            chat.online = false;
          });
          this.cdr.detectChanges();
        } else {
          // When reconnected, get fresh online status
          console.log('[ChatList] WebSocket reconnected, requesting fresh online status');

          // Wait a moment for the connection to stabilize
          setTimeout(() => {
            const currentOnlineUsers = this.ws.getCurrentOnlineUsers();
            console.log(
              '[ChatList] Applying online status after reconnect:',
              currentOnlineUsers
            );
            this.applyOnlineStatus(currentOnlineUsers);

            // Also debug the WebSocket state
            this.ws.debugOnlineStatus();
          }, 1000);
        }
      })
    );
  }

  /**
   * Improved online status application with better logging and immediate updates
   */
  private applyOnlineStatus(onlineUsers: string[]): void {
    if (!Array.isArray(onlineUsers)) {
      console.log('[ChatList] Invalid online users data:', onlineUsers);
      return;
    }

    if (!this.chats.length) {
      console.log('[ChatList] No chats to apply online status to');
      return;
    }

    console.log('[ChatList] Applying online status:', {
      onlineUsers,
      chatsCount: this.chats.length,
    });

    let changesDetected = false;

    this.chats.forEach(chat => {
      const wasOnline = chat.online;
      const isOnline = onlineUsers.includes(chat.id);

      if (wasOnline !== isOnline) {
        console.log(
          `[ChatList] Status change for ${chat.name} (${chat.id}): ${wasOnline} -> ${isOnline}`
        );
        chat.online = isOnline;
        changesDetected = true;
      }
    });

    if (changesDetected) {
      console.log(
        '[ChatList] Online status changes detected, triggering change detection'
      );
      // Force change detection
      this.cdr.detectChanges();
    } else {
      console.log('[ChatList] No online status changes detected');
    }
  }

  // Simple, direct method to load chats
  private loadChatsNow(): void {
    console.log('=== loadChatsNow CALLED ===');

    if (this.isLoadingChats) {
      console.log('Already loading, skipping');
      return;
    }

    this.isLoadingChats = true;
    this.chatLoadingFinished = false;

    // Load from API
    this.http.get<UserSummary[]>(`${environment.apiUrl}/rooms/my-dms`).subscribe({
      next: response => {
        console.log('=== API Response received ===', response);

        const chatEntries: ChatEntry[] = [];
        const chatsList = Array.isArray(response)
          ? response
          : response && typeof response === 'object' && '_id' in response
            ? [response as UserSummary]
            : [];

        for (const chat of chatsList) {
          if (chat && chat._id) {
            chatEntries.push({
              id: chat._id,
              name: chat.username || 'Unknown User',
              avatar: chat.avatarUrl || 'assets/images/avatars/01.svg',
              unread: 0,
              online: false,
            });
          }
        }

        this.chats = chatEntries;
        this.isLoadingChats = false;
        this.chatLoadingFinished = true;
        console.log('=== Chats updated ===', this.chats.length);

        // Load previews and apply status in batched operation
        this.loadAllMessagePreviewsBatched();
      },
      error: error => {
        console.error('Failed to load chats:', error);
        this.isLoadingChats = false;
        this.chatLoadingFinished = true;

        // Try fallback
        this.tryFallback();
      },
    });
  }

  private tryFallback(): void {
    console.log('=== Trying fallback method ===');

    this.users.listMyDms().subscribe({
      next: chats => {
        if (chats && chats.length > 0) {
          this.chats = chats.map(u => ({
            id: u._id,
            name: u.username || 'Unknown User',
            avatar: u.avatarUrl || 'assets/images/avatars/01.svg',
            unread: 0, // Will be updated by notification service
            online: false, // Will be updated by online status handler
          }));

          console.log('=== Fallback successful ===', this.chats.length);

          // Load previews and apply status in batched operation
          this.loadAllMessagePreviewsBatched();
        }
      },
      error: error => {
        console.error('=== Fallback failed ===', error);
      },
    });
  }

  /**
   * Load all message previews in batched operation to prevent multiple sorts
   */
  private async loadAllMessagePreviewsBatched(): Promise<void> {
    console.log('[ChatList] Loading message previews in batched operation');

    // Set sorting in progress to prevent intermediate sorts
    this.sortingInProgress = true;
    this.pendingSortOperations = this.chats.length;

    // Load all previews concurrently
    const previewPromises = this.chats.map(chat => this.loadMessagePreview(chat));

    try {
      await Promise.all(previewPromises);
      console.log('[ChatList] All message previews loaded');
    } catch (error) {
      console.error('[ChatList] Error loading some message previews:', error);
    }

    // Apply online status after all previews are loaded
    const currentOnlineUsers = this.ws.getCurrentOnlineUsers();
    console.log('[ChatList] Applying initial online status:', currentOnlineUsers);
    this.applyOnlineStatus(currentOnlineUsers);

    // Trigger notification service to update badge counts
    this.notificationService.refreshNotifications();

    // Perform final sort once all data is loaded
    this.sortingInProgress = false;
    this.performFinalSort();
  }

  /**
   * Updated to work with batched loading
   */
  private async loadMessagePreview(chat: ChatEntry): Promise<void> {
    try {
      const response = await firstValueFrom(this.api.getMessageHistory(chat.id));

      if (!response?.messages?.length) {
        this.decrementPendingOperations();
        return;
      }

      const lastMessage = response.messages[response.messages.length - 1];
      if (!lastMessage) {
        this.decrementPendingOperations();
        return;
      }

      if (lastMessage.deleted) {
        chat.lastMessage = '⋯ message deleted ⋯';
      } else if (lastMessage.senderId === this.me) {
        const messageKey = `sent_${this.me}_${chat.id}/${lastMessage._id || ''}`;
        const tsKey = `sent_${this.me}_${chat.id}/pending::${+new Date(
          lastMessage.createdAt
        )}`;

        chat.lastMessage =
          (await this.vault.get<{ text: string }>(messageKey))?.text ||
          (await this.vault.get<{ text: string }>(tsKey))?.text ||
          'You: ...';
      } else {
        try {
          if (this.crypto.hasPrivateKey()) {
            chat.lastMessage = await this.crypto.decryptMessage(lastMessage.ciphertext);
          } else {
            chat.lastMessage = '🔒 Encrypted message';
          }
        } catch {
          chat.lastMessage = '🔒 Encrypted message';
        }
      }

      chat.lastTs = toEpoch(lastMessage.createdAt);
      this.decrementPendingOperations();
    } catch (_e) {
      console.error('Error processing message preview:', _e);
      this.decrementPendingOperations();
    }
  }

  /**
   * Track pending operations and trigger final sort when all complete
   */
  private decrementPendingOperations(): void {
    this.pendingSortOperations--;

    if (this.pendingSortOperations <= 0 && !this.sortingInProgress) {
      this.performFinalSort();
    }
  }

  /**
   * Debounced sorting to prevent bouncing
   */
  private performFinalSort(): void {
    const now = Date.now();

    // Debounce rapid sort calls
    if (now - this.lastSortTime < this.SORT_DEBOUNCE_MS) {
      setTimeout(() => this.performFinalSort(), this.SORT_DEBOUNCE_MS);
      return;
    }

    this.lastSortTime = now;

    console.log('[ChatList] Performing final sort of chats');
    this.chats.sort((a, b) => (b.lastTs || 0) - (a.lastTs || 0));

    // Force change detection after final sort
    this.cdr.detectChanges();
  }

  // Simplified incoming message handler - let NotificationService handle badge logic
  private handleIncomingMessage = async (message: IncomingSocketMessage) => {
    const chat = this.chats.find(c => c.id === message.fromUserId);
    if (!chat) return;

    try {
      if (this.crypto.hasPrivateKey()) {
        chat.lastMessage = await this.crypto.decryptMessage(message.ciphertext);
      } else {
        chat.lastMessage = 'New message...';
      }
    } catch {
      chat.lastMessage = 'New message...';
    }

    chat.lastTs = toEpoch(message.timestamp);

    // NOTE: Unread count is now managed by NotificationService
    // The badge will be updated through the notification subscription

    // Use debounced sort for new messages
    this.debouncedSort();
  };

  // Handle sent message acknowledgment
  private handleMessageSent = async (ack: AckPayload) => {
    const currentRoomId = location.pathname.split('/').pop();
    const chat = this.chats.find(c => c.id === currentRoomId);
    if (!chat) return;

    const vaultKey = `sent_${this.me}_${currentRoomId}/${ack.messageId}`;
    const record = await this.vault.get<{ text: string }>(vaultKey);

    chat.lastMessage = record?.text || 'You: ...';
    chat.lastTs = toEpoch(ack.timestamp);

    // Use debounced sort for sent messages
    this.debouncedSort();
  };

  private sortTimeout: ReturnType<typeof setTimeout> | null = null;

  private debouncedSort(): void {
    if (this.sortTimeout) {
      clearTimeout(this.sortTimeout);
    }

    this.sortTimeout = setTimeout(() => {
      this.performFinalSort();
    }, 100);
  }

  /**
   * Format chat timestamp using enhanced date utilities
   */
  formatChatTime(timestamp: number | undefined): string {
    if (!timestamp) return '';

    // For chat list, use relative time format
    return getRelativeTime(timestamp);
  }

  // Public methods
  public reloadChats(): void {
    console.log('=== Manual reload triggered ===');
    this.chats = [];
    this.chatLoadingFinished = false;
    this.sortingInProgress = false;
    this.pendingSortOperations = 0;

    this.loadChatsNow();
  }

  public onSearch(query: string): void {
    this.searchTerm = query;

    if (!query || query.trim().length === 0) {
      this.searchResults = [];
      return;
    }

    this.http.get<UserSummary[]>(`${environment.apiUrl}/users`).subscribe({
      next: users => {
        this.searchResults = users.filter(
          u => u.username.toLowerCase() === query.toLowerCase() && u._id !== this.me
        );
      },
      error: err => {
        console.error('Search error:', err);
        this.searchResults = [];
      },
    });
  }

  public clearSearch(): void {
    this.searchTerm = '';
    this.searchResults = [];
  }

  public async startChat(user: UserSummary): Promise<void> {
    try {
      this.loadingService.show('starting-chat');

      const existingChat = this.chats.find(chat => chat.id === user._id);
      if (existingChat) {
        // Mark messages as read when opening existing chat
        console.log(
          '[ChatList] Opening existing chat, marking messages as read:',
          user._id
        );
        this.notificationService.markUserMessagesAsRead(user._id);
        this.clearSearch();

        await this.router.navigate(['/chat-room', existingChat.id]);
        this.loadingService.hide('starting-chat');
        return;
      }

      await firstValueFrom(this.users.createDm(user._id));

      this.chats.unshift({
        id: user._id,
        name: user.username,
        avatar: user.avatarUrl,
        unread: 0,
        online: this.ws.isUserOnline(user._id),
      });

      this.clearSearch();
      await this.router.navigate(['/chat-room', user._id]);
    } catch (error) {
      console.error('Error starting chat:', error);
    } finally {
      this.loadingService.hide('starting-chat');
    }
  }

  public navigateToChatRoom(chatId: string, event: Event): void {
    event.preventDefault();

    // Mark messages as read when navigating to chat room
    console.log('[ChatList] Navigating to chat room, marking messages as read:', chatId);
    this.notificationService.markUserMessagesAsRead(chatId);

    this.router.navigate(['/chat-room', chatId]);
  }

  public findNewContact(): void {
    this.searchTerm = ' ';
    setTimeout(() => {
      this.searchTerm = '';
      const searchInput = document.querySelector('input[matInput]') as HTMLInputElement;
      if (searchInput) searchInput.focus();
    }, 100);
  }

  public trackByChatId(index: number, chat: ChatEntry): string {
    return chat.id;
  }

  public getCurrentTime(): string {
    return new Date().toLocaleTimeString();
  }

  public forceRefresh(): void {
    console.log('=== Force refresh triggered ===');
    this.notificationService.refreshNotifications();
  }

  /**
   * Navigate back or fallback to previous route
   */
  public goBack(): void {
    if (window.history.length > 1) {
      this.location.back();
    } else {
      // Fallback - shouldn't happen since button should be hidden
      this.router.navigate(['/']);
    }
  }

  ngOnDestroy() {
    console.log('[ChatList] Component destroying');

    // Clear timeouts
    if (this.sortTimeout) {
      clearTimeout(this.sortTimeout);
      this.sortTimeout = null;
    }

    this.subs.unsubscribe();
    this.ws.offReceiveMessage(this.handleIncomingMessage);
    this.ws.offMessageSent(this.handleMessageSent);
  }
}
