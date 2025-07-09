import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { BehaviorSubject, Subject, Subscription, debounceTime, filter } from 'rxjs';
import { Router, NavigationEnd } from '@angular/router';

import { WebSocketService } from './websocket.service';
import { MessagesService } from './messages.service';

import { IncomingSocketMessage } from '@models/socket.model';
import { MessageOverview } from '@models/api-response.model';

export interface ChatNotification {
  userId: string;
  username?: string;
  unreadCount: number;
  lastMessage?: string;
  avatarUrl?: string;
}

@Injectable({
  providedIn: 'root',
})
export class NotificationService implements OnDestroy {
  // Public observables for components to subscribe to
  public readonly totalUnread$ = new BehaviorSubject<number>(0);
  public readonly chatNotifications$ = new BehaviorSubject<ChatNotification[]>([]);

  private subs = new Subscription();
  private refresh$ = new Subject<void>();
  private notificationsMap = new Map<string, ChatNotification>();

  // Add immediate update mechanism for badge resets
  private immediateUpdate$ = new Subject<void>();
  
  // Rate limiting for loadNotifications
  private lastLoadTime = 0;

  constructor(
    private ws: WebSocketService,
    private messages: MessagesService,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    // Handle incoming messages
    this.ws.onReceiveMessage(this.handleIncomingMessage);

    // Handle message read events
    this.ws.onMessageRead(() => {
      this.refresh$.next();
    });

    // Enhanced debounced refresh with immediate update support
    this.subs.add(
      this.refresh$.pipe(debounceTime(1000)).subscribe(() => this.loadNotifications())
    );

    // Add immediate update stream for badge resets
    this.subs.add(
      this.immediateUpdate$
        .pipe(debounceTime(500)) // Increased from 100ms to 500ms to reduce API calls
        .subscribe(() => this.loadNotifications())
    );

    // Refresh on navigation to chat-related pages
    this.subs.add(
      this.router.events
        .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
        .subscribe(e => {
          if (e.url === '/chat' || e.url.startsWith('/chat-room/')) {
            this.loadNotifications();
          }
        })
    );

    // Handle WebSocket reconnections
    this.subs.add(
      this.ws.isConnected$.subscribe(connected => {
        if (connected) {
          // When reconnected, refresh notifications
          setTimeout(() => this.loadNotifications(), 1000);
        }
      })
    );

    // Enhanced custom event listeners for immediate mobile badge updates
    this.setupCustomEventListeners();

    // Initial load
    this.loadNotifications();
  }

  /**
   * Enhanced custom event listeners for immediate mobile badge updates
   */
  private setupCustomEventListeners(): void {
    // Listen for messages read in chat rooms
    const messagesReadHandler = (event: CustomEvent) => {
      const { count, roomId } = event.detail;

      // Use immediate update for faster badge reset
      this.ngZone.run(() => {
        this.markUserMessagesAsRead(roomId);
        // Trigger immediate update instead of regular refresh
        this.immediateUpdate$.next();
      });
    };

    // Listen for chat room entry events
    const chatRoomEnteredHandler = (event: CustomEvent) => {
      const { roomId } = event.detail;

      // Use immediate update for faster badge reset
      this.ngZone.run(() => {
        this.markUserMessagesAsRead(roomId);
        // Trigger immediate update instead of regular refresh
        this.immediateUpdate$.next();
      });
    };

    window.addEventListener('messages-read', messagesReadHandler as EventListener);

    window.addEventListener('chat-room-entered', chatRoomEnteredHandler as EventListener);

    // Clean up event listeners on destroy
    this.subs.add({
      unsubscribe: () => {
        window.removeEventListener('messages-read', messagesReadHandler as EventListener);
        window.removeEventListener(
          'chat-room-entered',
          chatRoomEnteredHandler as EventListener
        );
      },
    });
  }

  private handleIncomingMessage = (message: IncomingSocketMessage): void => {
    const currentPath = this.router.url;
    const isInSenderChat = currentPath === `/chat-room/${message.fromUserId}`;

    if (!isInSenderChat) {
      // Use NgZone for proper mobile change detection
      this.ngZone.run(() => {
        // User is not currently viewing this chat, increment unread count
        this.incrementUnreadForUser(message.fromUserId, message.fromUsername);
      });
    }

    // Always refresh to get accurate counts from server
    this.refresh$.next();
  };

  private incrementUnreadForUser(userId: string, username?: string): void {
    const existing = this.notificationsMap.get(userId);

    if (existing) {
      existing.unreadCount++;
    } else {
      this.notificationsMap.set(userId, {
        userId,
        username,
        unreadCount: 1,
      });
    }

    this.updateStreams();
  }

  public loadNotifications(): void {
    // Check if we should load notifications (JWT is now in HttpOnly cookies)
    const userId = localStorage.getItem('userId');
    if (!localStorage.getItem('username') || !userId) {
      return;
    }

    // Rate limiting: prevent more than 1 call per 2 seconds
    const now = Date.now();
    if (this.lastLoadTime && (now - this.lastLoadTime < 2000)) {
      console.log('[NotificationService] Rate limiting: skipping loadNotifications call');
      return;
    }
    this.lastLoadTime = now;

    this.messages.getOverviews().subscribe({
      next: (overviews: MessageOverview[]) => {
        // Use NgZone for proper mobile change detection
        this.ngZone.run(() => {
          // Clear current notifications
          this.notificationsMap.clear();

          // Process each overview
          overviews.forEach(overview => {
            if (overview.unread > 0) {
              this.notificationsMap.set(overview.peerId, {
                userId: overview.peerId,
                unreadCount: overview.unread,
                lastMessage: overview.lastText,
              });
            }
          });

          // Final notifications processed
          this.updateStreams();
        });
      },
      error: (error: unknown) => {
        console.error('[NotificationService] Failed to load notifications:', error);
      },
    });
  }

  private updateStreams(): void {
    const notifications = Array.from(this.notificationsMap.values());
    const totalUnread = notifications.reduce((sum, n) => sum + n.unreadCount, 0);

    // Ensure change detection happens properly on mobile
    this.ngZone.run(() => {
      this.chatNotifications$.next(notifications);
      this.totalUnread$.next(totalUnread);
    });
  }

  /**
   * Enhanced mark messages as read with immediate effect and better logging
   * This should be called when user opens a chat room
   */
  public markUserMessagesAsRead(userId: string): void {
    // Use NgZone for proper mobile change detection
    this.ngZone.run(() => {
      // Check if user had notifications before clearing
      const hadNotifications = this.notificationsMap.has(userId);
      const previousCount = this.notificationsMap.get(userId)?.unreadCount || 0;

      // Remove from local state immediately
      this.notificationsMap.delete(userId);

      if (hadNotifications) {
        this.updateStreams();
      }
    });

    // Use immediate update for faster badge reset, then regular refresh for server sync
    setTimeout(() => {
      this.immediateUpdate$.next();
    }, 50);

    // Also trigger regular refresh after a longer delay to ensure server state is updated
    setTimeout(() => {
      this.refresh$.next();
    }, 500);
  }

  /**
   * Get unread count for a specific user
   */
  public getUnreadCountForUser(userId: string): number {
    return this.notificationsMap.get(userId)?.unreadCount || 0;
  }

  /**
   * Force refresh notifications from server
   */
  public refreshNotifications(): void {
    this.loadNotifications();
  }

  /**
   * Enhanced refresh with immediate update option
   */
  public refreshNotificationsImmediate(): void {
    this.immediateUpdate$.next();
  }

  /**
   * Debug method to check current state
   */
  public debugCurrentState(): void {
    // Debug method - intentionally empty after console log removal
  }

  /**
   * Clear all notifications (for logout, etc.)
   */
  public clearAllNotifications(): void {
    // Use NgZone for proper mobile change detection
    this.ngZone.run(() => {
      this.notificationsMap.clear();
      this.updateStreams();
    });
  }

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.refresh$.complete();
    this.immediateUpdate$.complete(); // Clean up immediate update stream
    this.ws.offReceiveMessage(this.handleIncomingMessage);
  }
}