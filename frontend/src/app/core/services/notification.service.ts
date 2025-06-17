import { Injectable, OnDestroy, NgZone } from '@angular/core';
import {
  BehaviorSubject,
  Subject,
  Subscription,
  debounceTime,
  filter,
} from 'rxjs';
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
  public readonly chatNotifications$ = new BehaviorSubject<ChatNotification[]>(
    []
  );

  private subs = new Subscription();
  private refresh$ = new Subject<void>();
  private notificationsMap = new Map<string, ChatNotification>();

  // Add immediate update mechanism for badge resets
  private immediateUpdate$ = new Subject<void>();

  constructor(
    private ws: WebSocketService,
    private messages: MessagesService,
    private router: Router,
    private ngZone: NgZone
  ) {
    this.setupEventHandlers();
  }

  private setupEventHandlers(): void {
    console.log('[NotificationService] Setting up event handlers');

    // Handle incoming messages
    this.ws.onReceiveMessage(this.handleIncomingMessage);

    // Handle message read events
    this.ws.onMessageRead(() => {
      console.log('[NotificationService] Message read event received');
      this.refresh$.next();
    });

    // Enhanced debounced refresh with immediate update support
    this.subs.add(
      this.refresh$
        .pipe(debounceTime(400))
        .subscribe(() => this.loadNotifications())
    );

    // Add immediate update stream for badge resets
    this.subs.add(
      this.immediateUpdate$
        .pipe(debounceTime(100)) // Short debounce for immediate feel
        .subscribe(() => this.loadNotifications())
    );

    // Refresh on navigation to chat-related pages
    this.subs.add(
      this.router.events
        .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
        .subscribe((e) => {
          if (e.url === '/chat' || e.url.startsWith('/chat-room/')) {
            this.loadNotifications();
          }
        })
    );

    // Handle WebSocket reconnections
    this.subs.add(
      this.ws.isConnected$.subscribe((connected) => {
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
      console.log('[NotificationService] Messages read event received:', {
        count,
        roomId,
      });

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
      console.log(
        '[NotificationService] Chat room entered event received:',
        roomId
      );

      // Use immediate update for faster badge reset
      this.ngZone.run(() => {
        this.markUserMessagesAsRead(roomId);
        // Trigger immediate update instead of regular refresh
        this.immediateUpdate$.next();
      });
    };

    window.addEventListener(
      'messages-read',
      messagesReadHandler as EventListener
    );

    window.addEventListener(
      'chat-room-entered',
      chatRoomEnteredHandler as EventListener
    );

    // Clean up event listeners on destroy
    this.subs.add({
      unsubscribe: () => {
        window.removeEventListener(
          'messages-read',
          messagesReadHandler as EventListener
        );
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

    console.log('[NotificationService] Incoming message:', {
      from: message.fromUserId,
      currentPath,
      isInSenderChat,
    });

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
    console.log('[NotificationService] Loading notifications from API');

    // Check if we should load notifications
    const token = localStorage.getItem('token');
    if (!token) {
      console.log(
        '[NotificationService] No token found, skipping notification load'
      );
      return;
    }

    this.messages.getOverviews().subscribe({
      next: (overviews: MessageOverview[]) => {
        console.log('[NotificationService] Received overviews:', overviews);

        // Use NgZone for proper mobile change detection
        this.ngZone.run(() => {
          // Clear current notifications
          this.notificationsMap.clear();

          // Process each overview
          overviews.forEach((overview) => {
            if (overview.unread > 0) {
              console.log(
                `[NotificationService] Adding notification for user ${overview.peerId}: ${overview.unread} unread`
              );
              this.notificationsMap.set(overview.peerId, {
                userId: overview.peerId,
                unreadCount: overview.unread,
                lastMessage: overview.lastText,
              });
            }
          });

          console.log(
            '[NotificationService] Final notifications after processing:',
            Array.from(this.notificationsMap.keys())
          );
          this.updateStreams();
        });
      },
      error: (error) => {
        console.error(
          '[NotificationService] Failed to load notifications:',
          error
        );
      },
    });
  }

  private updateStreams(): void {
    const notifications = Array.from(this.notificationsMap.values());
    const totalUnread = notifications.reduce(
      (sum, n) => sum + n.unreadCount,
      0
    );

    console.log('[NotificationService] Updating streams:', {
      totalUnread,
      notifications: notifications.length,
      notificationMap: Array.from(this.notificationsMap.keys()),
    });

    // Ensure change detection happens properly on mobile
    this.ngZone.run(() => {
      this.chatNotifications$.next(notifications);
      this.totalUnread$.next(totalUnread);
      console.log('[NotificationService] Badge count updated to:', totalUnread);
    });
  }

  /**
   * Enhanced mark messages as read with immediate effect and better logging
   * This should be called when user opens a chat room
   */
  public markUserMessagesAsRead(userId: string): void {
    console.log(
      '[NotificationService] Marking messages as read for user:',
      userId
    );

    // Use NgZone for proper mobile change detection
    this.ngZone.run(() => {
      // Check if user had notifications before clearing
      const hadNotifications = this.notificationsMap.has(userId);
      const previousCount = this.notificationsMap.get(userId)?.unreadCount || 0;

      // Remove from local state immediately
      this.notificationsMap.delete(userId);

      if (hadNotifications) {
        console.log(
          `[NotificationService] Cleared ${previousCount} notifications for user ${userId}`
        );
        this.updateStreams();
        console.log(
          '[NotificationService] Immediately updated badge for mobile'
        );
      } else {
        console.log(
          `[NotificationService] No notifications found for user ${userId}`
        );
      }
    });

    // Use immediate update for faster badge reset, then regular refresh for server sync
    setTimeout(() => {
      console.log(
        '[NotificationService] Triggering immediate update after marking messages read'
      );
      this.immediateUpdate$.next();
    }, 50);

    // Also trigger regular refresh after a longer delay to ensure server state is updated
    setTimeout(() => {
      console.log(
        '[NotificationService] Refreshing from server after marking messages read'
      );
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
    console.log('[NotificationService] Force refreshing notifications');
    this.loadNotifications();
  }

  /**
   * Enhanced refresh with immediate update option
   */
  public refreshNotificationsImmediate(): void {
    console.log(
      '[NotificationService] Force refreshing notifications (immediate)'
    );
    this.immediateUpdate$.next();
  }

  /**
   * Debug method to check current state
   */
  public debugCurrentState(): void {
    console.log('[NotificationService] Current state:', {
      notificationsMapSize: this.notificationsMap.size,
      notificationsMap: Array.from(this.notificationsMap.entries()),
      currentTotalUnread: this.totalUnread$.value,
    });
  }

  /**
   * Clear all notifications (for logout, etc.)
   */
  public clearAllNotifications(): void {
    console.log('[NotificationService] Clearing all notifications');

    // Use NgZone for proper mobile change detection
    this.ngZone.run(() => {
      this.notificationsMap.clear();
      this.updateStreams();
    });
  }

  ngOnDestroy(): void {
    console.log('[NotificationService] Service destroying');
    this.subs.unsubscribe();
    this.refresh$.complete();
    this.immediateUpdate$.complete(); // Clean up immediate update stream
    this.ws.offReceiveMessage(this.handleIncomingMessage);
  }
}
