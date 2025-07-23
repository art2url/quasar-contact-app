import { Injectable, NgZone } from '@angular/core';
import { Subscription } from 'rxjs';
import { ChatSessionService } from '@services/chat-session.service';
import { WebSocketService } from '@services/websocket.service';
import { NotificationService } from '@services/notification.service';
import { ChatMessageService } from './chat-message.service';
import { ChatScrollService } from './chat-scroll.service';
import { ChatUiStateService } from './chat-ui-state.service';
import { ChatTypingService } from './chat-typing.service';
import { ChatMsg } from '@models/chat.model';

@Injectable({
  providedIn: 'root'
})
export class ChatEventHandlerService {
  private subs = new Subscription();
  private onlineStatusCallback?: (isOnline: boolean) => void;

  constructor(
    private chat: ChatSessionService,
    private ws: WebSocketService,
    private notificationService: NotificationService,
    private chatMessageService: ChatMessageService,
    private chatScrollService: ChatScrollService,
    private chatUiStateService: ChatUiStateService,
    private chatTypingService: ChatTypingService,
    private ngZone: NgZone
  ) {}

  /**
   * Set online status callback
   */
  setOnlineStatusCallback(callback: (isOnline: boolean) => void): void {
    this.onlineStatusCallback = callback;
  }

  /**
   * Initialize all chat event subscriptions
   */
  initializeEventHandlers(receiverId: string, messageContainer: HTMLElement): void {
    this.setupMessageSubscriptions(messageContainer);
    this.setupTypingSubscription();
    this.setupConnectionSubscription();
    this.setupOnlineStatusTracking(receiverId);
    this.setupKeyStatusSubscriptions();
    this.setupReadReceiptHandling();
  }

  /**
   * Set up message-related subscriptions
   */
  private setupMessageSubscriptions(messageContainer: HTMLElement): void {
    // Subscribe to loading state
    this.subs.add(
      this.chat.messagesLoading$.subscribe(loading => {
        this.chatUiStateService.setLoadingMessages(loading);

        if (!loading && messageContainer) {
          this.chatScrollService.handleInitialScroll(messageContainer);
        }
      })
    );

    // Subscribe to message updates
    this.subs.add(
      this.chat.messages$.subscribe(messages => {
        this.chatUiStateService.checkForCacheIssues(messages);
        this.chatMessageService.groupMessagesByDate(messages);

        if (!this.chatUiStateService.getCurrentLoadingState()) {
          this.handleMessagesUpdate(messages, messageContainer);
        }
      })
    );
  }

  /**
   * Handle messages updates with intelligent scrolling
   */
  private handleMessagesUpdate(messages: ChatMsg[], messageContainer: HTMLElement): void {
    const scrollState = this.chatScrollService.getCurrentScrollState();
    const newMessageCount = this.chatMessageService.handleNewMessages(messages, scrollState.isUserAtBottom);
    
    if (newMessageCount > 0) {
      this.chatScrollService.handleNewMessages(messageContainer, newMessageCount);
    }
  }

  /**
   * Set up typing indicator subscription
   */
  private setupTypingSubscription(): void {
    this.subs.add(
      this.chat.partnerTyping$.subscribe(() => {
        this.ngZone.run(() => {
          // Typing state is handled by component template binding
          this.ngZone.runOutsideAngular(() => {
            requestAnimationFrame(() => {
              this.ngZone.run(() => {
                // Update typing indicator position when typing state changes
                this.chatTypingService.updateTypingIndicatorPosition();
              });
            });
          });
        });
      })
    );
  }

  /**
   * Set up connection status subscription
   */
  private setupConnectionSubscription(): void {
    this.subs.add(
      this.ws.isConnected$.subscribe(() => {
        // Connection status changed - handled by template
      })
    );
  }

  /**
   * Enhanced partner online status tracking
   */
  private setupOnlineStatusTracking(receiverId: string): void {
    // Subscribe to main online users list
    this.subs.add(
      this.ws.onlineUsers$.subscribe(onlineUsers => {
        const isOnline = Array.isArray(onlineUsers) ? onlineUsers.includes(receiverId) : false;
        if (this.onlineStatusCallback) {
          this.onlineStatusCallback(isOnline);
        }
      })
    );

    // Subscribe to individual user online events
    this.subs.add(
      this.ws.userOnline$.subscribe(userId => {
        if (userId === receiverId && this.onlineStatusCallback) {
          this.onlineStatusCallback(true);
        }
      })
    );

    // Subscribe to individual user offline events
    this.subs.add(
      this.ws.userOffline$.subscribe(userId => {
        if (userId === receiverId && this.onlineStatusCallback) {
          this.onlineStatusCallback(false);
        }
      })
    );

    // Handle WebSocket disconnection
    this.subs.add(
      this.ws.isConnected$.subscribe(connected => {
        if (!connected && this.onlineStatusCallback) {
          this.onlineStatusCallback(false);
        } else if (connected && this.onlineStatusCallback) {
          // When reconnected, check current status
          const currentStatus = this.ws.isUserOnline(receiverId);
          this.onlineStatusCallback(currentStatus);
        }
      })
    );

    // Set initial status
    const initialStatus = this.ws.isUserOnline(receiverId);
    if (this.onlineStatusCallback) {
      this.onlineStatusCallback(initialStatus);
    }
  }

  /**
   * Set up key status subscriptions
   */
  private setupKeyStatusSubscriptions(): void {
    this.subs.add(
      this.chat.keyLoading$.subscribe(() => {
        // Key loading state changed
      })
    );

    this.subs.add(
      this.chat.myPrivateKeyMissing$.subscribe(missing => {
        if (missing === true && !this.chat.keyLoading$.value) {
          if (!this.chat.isArtificialKeyMissingState) {
            this.chat.ensureKeysMissingFlagSet();
          }
        }
      })
    );
  }

  /**
   * Set up read receipt handling
   */
  private setupReadReceiptHandling(): void {
    this.subs.add(
      this.chat.messages$.subscribe({
        next: msgs => {
          if (!this.chatUiStateService.getCurrentLoadingState()) {
            const unreadFromPartner = this.chatMessageService.getUnreadFromPartner(msgs);

            if (unreadFromPartner.length > 0) {
              unreadFromPartner.forEach(m => {
                this.ws.markMessageRead(m.id!);
                this.chatMessageService.markAsReported(m.id!);
              });
            }
          }
        },
        error: err => console.error('Error in messages subscription:', err),
      })
    );
  }

  /**
   * Handle scroll events
   */
  handleScroll(container: HTMLElement): boolean {
    if (!container || this.chatUiStateService.getCurrentLoadingState()) return false;

    const scrollData = this.chatScrollService.handleScrollEvent(container);
    
    // Reset new messages counter if user scrolled to bottom
    if (scrollData.isNearBottom) {
      this.chatMessageService.resetNewMessagesCount();
    }

    // Return whether should mark as read
    if (scrollData.isNearBottom && !this.chatUiStateService.getCurrentReadStatus()) {
      this.chatUiStateService.setMarkedMessagesAsRead(true);
      return true;
    }
    
    return false;
  }

  /**
   * Mark messages as read when visible
   */
  markMessagesAsReadWhenVisible(receiverId: string): void {
    this.notificationService.markUserMessagesAsRead(receiverId);
  }

  /**
   * Cleanup subscriptions
   */
  cleanup(): void {
    this.subs.unsubscribe();
    this.subs = new Subscription();
  }
}