import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { CommonModule, Location } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { RouterModule, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { firstValueFrom, Subscription, Subject, timer } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

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
import { NotificationService, ChatNotification } from '@services/notification.service';
import { ScrollService } from '@services/scroll.service';

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
  isRateLimited = false;
  showBackButton = false;

  // Add sorting control to prevent bouncing
  private sortingInProgress = false;
  private pendingSortOperations = 0;

  // Private properties
  private subs = new Subscription();
  private readonly me = localStorage.getItem('userId')!;
  private pendingNotifications: ChatNotification[] = [];
  
  // RxJS subjects for debouncing
  private sortSubject = new Subject<void>();
  private destroy$ = new Subject<void>();

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
    private notificationService: NotificationService,
    private location: Location,
    private ngZone: NgZone,
    private scrollService: ScrollService
  ) {}

  ngOnInit() {
    // IMPORTANT: Always scroll to top when chat-list loads
    // This prevents the page from staying at bottom position when navigating back from chat-room
    this.scrollService.scrollToTop();

    // Determine if back button should be shown
    this.checkBackButtonVisibility();

    // Set up event handlers
    this.setupEventHandlers();

    // Set up debounced sorting
    this.setupDebouncedSorting();

    // Load chats immediately - no delays, no complex logic
    this.loadChatsNow();

    // FIXED: Set up WebSocket handlers for online status updates
    this.setupWebSocketHandlers();

    // NEW: Subscribe to notification updates
    this.setupNotificationHandlers();

    // Router event handling removed - notification service handles refresh automatically
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
  }

  /**
   * Set up notification handlers to update chat badges
   */
  private setupNotificationHandlers(): void {
    this.subs.add(
      this.notificationService.chatNotifications$.subscribe(notifications => {
        // If chats haven't loaded yet, store notifications for later application
        if (this.chats.length === 0) {
          this.pendingNotifications = notifications;
          return;
        }

        // Update unread counts for existing chats
        notifications.forEach(notification => {
          const chat = this.chats.find(c => c.id === notification.userId);
          if (chat) {
            chat.unread = notification.unreadCount;
          }
        });

        // Only clear unread counts if we have a valid notifications array with actual data
        // Don't clear if notifications is empty (might be due to rate limiting or timing issues)
        if (notifications.length > 0) {
          this.chats.forEach(chat => {
            const hasNotification = notifications.some(n => n.userId === chat.id);
            if (!hasNotification && chat.unread > 0) {
              chat.unread = 0;
            }
          });
        }
        // Preserve existing unread counts when notifications are empty
      })
    );
  }

  /**
   * Set up debounced sorting using RxJS operators
   */
  private setupDebouncedSorting(): void {
    this.subs.add(
      this.sortSubject.pipe(
        debounceTime(100),
        takeUntil(this.destroy$)
      ).subscribe(() => {
        this.performFinalSort();
      })
    );
  }

  /**
   * Apply pending notifications that arrived before chats were loaded
   */
  private applyPendingNotifications(): void {
    if (this.pendingNotifications.length > 0) {
      this.pendingNotifications.forEach(notification => {
        const chat = this.chats.find(c => c.id === notification.userId);
        if (chat) {
          chat.unread = notification.unreadCount;
        }
      });
      
      // Clear pending notifications
      this.pendingNotifications = [];
    }
  }

  // Router event handling removed - notification service handles refresh automatically after marking messages as read

  private setupEventHandlers(): void {
    this.ws.onReceiveMessage(this.handleIncomingMessage);
    this.ws.onMessageSent(this.handleMessageSent);
  }

  /**
   * Enhanced WebSocket handlers for better online status tracking with debugging
   */
  private setupWebSocketHandlers(): void {
    // Subscribe to the main online users list
    this.subs.add(
      this.ws.onlineUsers$.subscribe(onlineUsers => {
        this.applyOnlineStatus(onlineUsers);
      })
    );

    // Subscribe to individual user online events
    this.subs.add(
      this.ws.userOnline$.subscribe(userId => {
        const chat = this.chats.find(c => c.id === userId);
        if (chat && !chat.online) {
          chat.online = true;
          this.cdr.detectChanges();
        }
      })
    );

    // Subscribe to individual user offline events
    this.subs.add(
      this.ws.userOffline$.subscribe(userId => {
        const chat = this.chats.find(c => c.id === userId);
        if (chat && chat.online) {
          chat.online = false;
          this.cdr.detectChanges();
        }
      })
    );

    // Handle WebSocket connection status changes
    this.subs.add(
      this.ws.isConnected$.subscribe(connected => {
        if (!connected) {
          // When disconnected, mark all users as offline
          this.chats.forEach(chat => {
            chat.online = false;
          });
          this.cdr.detectChanges();
        } else {
          // When reconnected, get fresh online status
          // Use timer to wait for connection stabilization
          this.subs.add(
            timer(1000).subscribe(() => {
              const currentOnlineUsers = this.ws.getCurrentOnlineUsers();
              this.applyOnlineStatus(currentOnlineUsers);
              this.ws.debugOnlineStatus();
            })
          );
        }
      })
    );
  }

  /**
   * Improved online status application with better logging and immediate updates
   */
  private applyOnlineStatus(onlineUsers: string[]): void {
    if (!Array.isArray(onlineUsers)) {
      return;
    }

    if (!this.chats.length) {
      return;
    }

    let changesDetected = false;

    this.chats.forEach(chat => {
      const wasOnline = chat.online;
      const isOnline = onlineUsers.includes(chat.id);

      if (wasOnline !== isOnline) {
        chat.online = isOnline;
        changesDetected = true;
      }
    });

    if (changesDetected) {
      // Force change detection
      this.cdr.detectChanges();
    }
  }

  // Simple, direct method to load chats
  private loadChatsNow(): void {
    if (this.isLoadingChats) {
      return;
    }

    this.isLoadingChats = true;
    this.chatLoadingFinished = false;

    // Load from API
    this.http.get<UserSummary[]>(`${environment.apiUrl}/rooms/my-dms`).subscribe({
      next: response => {
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

        // Apply any pending notifications that arrived before chats were loaded
        this.applyPendingNotifications();

        // Load previews and apply status in batched operation
        this.loadAllMessagePreviewsBatched();
      },
      error: error => {
        console.error('Failed to load chats:', error);
        this.isLoadingChats = false;

        // Check if it's a rate limiting error
        // The auth interceptor converts 429 to a generic Error with specific message
        if (error.status === 429 || (error.message && error.message.includes('Rate limited'))) {
          this.isRateLimited = true;
        }
        
        // Always finish loading to show appropriate state
        this.chatLoadingFinished = true;
        
        // Try fallback for all errors
        this.tryFallback();
      },
    });
  }

  private tryFallback(): void {
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

          // Reset rate limiting state on success
          this.isRateLimited = false;
          this.chatLoadingFinished = true;
          this.isLoadingChats = false;

          // Apply any pending notifications that arrived before chats were loaded
          this.applyPendingNotifications();

          // Load previews and apply status in batched operation
          this.loadAllMessagePreviewsBatched();
        }
      },
      error: error => {
        console.error('Fallback failed:', error);
        
        // Check if fallback also hit rate limiting
        if (error.status === 429 || (error.message && error.message.includes('Rate limited'))) {
          this.isRateLimited = true;
        }
        
        // If fallback also fails, show the empty state
        this.chatLoadingFinished = true;
        this.isLoadingChats = false;
      },
    });
  }

  /**
   * Load all message previews in batched operation to prevent multiple sorts
   */
  private async loadAllMessagePreviewsBatched(): Promise<void> {
    // Set sorting in progress to prevent intermediate sorts
    this.sortingInProgress = true;
    this.pendingSortOperations = this.chats.length;

    // Load all previews concurrently
    const previewPromises = this.chats.map(chat => this.loadMessagePreview(chat));

    try {
      await Promise.all(previewPromises);
    } catch (error) {
      console.error('Error loading some message previews:', error);
    }

    // Apply online status after all previews are loaded
    const currentOnlineUsers = this.ws.getCurrentOnlineUsers();
    this.applyOnlineStatus(currentOnlineUsers);

    // Don't trigger immediate refresh to avoid rate limiting
    // The notification service will handle updates through WebSocket events

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
   * Perform final sort without debouncing (debouncing is handled by RxJS)
   */
  private performFinalSort(): void {
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

  private debouncedSort(): void {
    this.sortSubject.next();
  }

  /**
   * Format chat timestamp using enhanced date utilities
   */
  formatChatTime(timestamp: number | undefined): string {
    if (!timestamp) return '';

    // For chat list, use relative time format
    return getRelativeTime(timestamp);
  }

  /**
   * Parse and display last message properly for image messages
   */
  getDisplayMessage(lastMessage: string | undefined): string {
    if (!lastMessage) return '— no messages yet —';
    
    // Check if it's a JSON payload from image message
    if (lastMessage.startsWith('{"text":') && lastMessage.includes('imageData')) {
      try {
        const parsed = JSON.parse(lastMessage);
        if (parsed.hasImage) {
          return parsed.text ? `📷 ${parsed.text}` : '📷 Image';
        }
        return parsed.text || '— no messages yet —';
      } catch {
        // If parsing fails, return as-is
        return lastMessage;
      }
    }
    
    return lastMessage;
  }

  // Public methods
  public reloadChats(): void {
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
        // Don't mark messages as read here - let the chat room component handle it
        // when the user actually sees the messages
        this.clearSearch();

        await this.router.navigate(['/chat-room', existingChat.id]);
        this.loadingService.hide();
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
      this.loadingService.hide();
    }
  }

  public navigateToChatRoom(chatId: string, event: Event): void {
    event.preventDefault();

    // Don't mark messages as read here - let the chat room component handle it
    // when the user actually sees the messages
    this.router.navigate(['/chat-room', chatId]);
  }

  public findNewContact(): void {
    this.searchTerm = ' ';
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.searchTerm = '';
        const searchInput = document.querySelector('input[matInput]') as HTMLInputElement;
        if (searchInput) searchInput.focus();
      });
    });
  }

  public trackByChatId(_index: number, chat: ChatEntry): string {
    return chat.id;
  }

  public getCurrentTime(): string {
    return new Date().toLocaleTimeString();
  }

  public forceRefresh(): void {
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
    // Trigger completion of all subscriptions
    this.destroy$.next();
    this.destroy$.complete();

    // Complete the sort subject
    this.sortSubject.complete();

    // Unsubscribe from all subscriptions
    this.subs.unsubscribe();
    
    // Remove WebSocket event handlers
    this.ws.offReceiveMessage(this.handleIncomingMessage);
    this.ws.offMessageSent(this.handleMessageSent);
  }
}
