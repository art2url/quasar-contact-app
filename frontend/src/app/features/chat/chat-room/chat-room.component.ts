import {
  Component,
  ElementRef,
  ViewChild,
  AfterViewChecked,
  OnInit,
  OnDestroy,
  HostListener,
  AfterViewInit,
  Injectable,
  ChangeDetectorRef,
  NgZone,
} from '@angular/core';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import {
  HammerModule,
  HAMMER_GESTURE_CONFIG,
  HammerGestureConfig,
} from '@angular/platform-browser';
import { Subscription } from 'rxjs';
import * as Hammer from 'hammerjs';

import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ChatSessionService } from '@services/chat-session.service';
import { ChatMsg } from '@models/chat.model';
import { WebSocketService } from '@services/websocket.service';
import { LoadingService } from '@services/loading.service';
import { NotificationService } from '@services/notification.service';

// Import the cache info banner component
import { CacheInfoBannerComponent } from '@shared/components/cache-info-banner/cache-info-banner.component';

// Import updated date utilities
import {
  formatMessageTime,
  formatDateHeader,
  getStartOfDay,
} from '@utils/date.util';

// Interface for grouped messages
interface MessageGroup {
  date: string;
  dateTimestamp: number;
  messages: ChatMsg[];
}

// Custom Hammer configuration
@Injectable()
export class MyHammerConfig extends HammerGestureConfig {
  override overrides = {
    swipe: { direction: Hammer.DIRECTION_HORIZONTAL },
    pinch: { enable: false },
    rotate: { enable: false },
  };
}

@Component({
  selector: 'app-chat-room',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    HammerModule,
    CacheInfoBannerComponent,
  ],
  providers: [
    ChatSessionService,
    {
      provide: HAMMER_GESTURE_CONFIG,
      useClass: MyHammerConfig,
    },
  ],
  templateUrl: './chat-room.component.html',
  styleUrls: ['./chat-room.component.css'],
})
export class ChatRoomComponent
  implements OnInit, AfterViewChecked, AfterViewInit, OnDestroy
{
  @ViewChild('messageContainer') private messageContainer!: ElementRef;
  private subs = new Subscription();
  @ViewChild('messageInput') private messageInput!: ElementRef;
  @ViewChild('editInput') private editInput!: ElementRef;

  // More reliable swipe detection for mobile
  @HostListener('swiperight')
  onSwipeRight() {
    console.log('Swipe right detected, navigating to chat list');
    this.navigateToList();
  }

  receiverId!: string;
  newMessage = '';
  partnerAvatar?: string;

  // Better online status tracking
  isPartnerOnline = false;

  editing: ChatMsg | null = null;
  editDraft = '';

  // Just use a single property for typing indicator state
  isPartnerTyping = false;

  // Better avatar handling with fallback
  myAvatar = localStorage.getItem('myAvatar') || 'assets/images/avatars/01.svg';

  private reported = new Set<string>();

  // Add initialization tracking
  private isInitialized = false;

  // Track if we should show the cache info banner
  showCacheInfoBanner = false;

  // New scroll management properties with scroll direction tracking
  private isUserAtBottom = true;
  private shouldAutoScroll = true;
  showScrollToBottomButton = false;
  newMessagesCount = 0;
  private lastMessageCount = 0;
  private scrollTimeout: NodeJS.Timeout | null = null;
  private lastScrollTop = 0; // ADDED: Track scroll direction

  // Grouped messages for date separation
  messageGroups: MessageGroup[] = [];

  // Loading state tracking
  isLoadingMessages = true;
  private hasInitiallyScrolled = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public chat: ChatSessionService,
    private ws: WebSocketService,
    private loadingService: LoadingService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private notificationService: NotificationService
  ) {}

  @HostListener('window:resize')
  onResize() {
    if (this.isUserAtBottom) {
      this.scrollToBottom(false);
    }
  }

  async ngOnInit(): Promise<void> {
    console.log('[ChatRoom] Component initializing');
    this.receiverId = this.route.snapshot.paramMap.get('id')!;
    console.log('[ChatRoom] Chat room ID:', this.receiverId);

    if (!this.receiverId) {
      console.error('[ChatRoom] No receiverId found in URL');
      this.navigateToList();
      return;
    }

    // Emit chat room entered event for header badge updates
    this.emitChatRoomEnteredEvent();

    // Debug notification state
    console.log('[ChatRoom] Debugging notification state after entering room');
    setTimeout(() => {
      this.notificationService.debugCurrentState();
    }, 500);

    // Initialize once only
    try {
      await this.initializeOnce();
    } catch (error) {
      console.error('[ChatRoom] Initialization failed:', error);
      this.loadingService.hide('init-error');
      this.navigateToList();
    }
  }

  /**
   * Emit event when entering chat room for immediate header updates
   */
  /**
   * Emit event when entering chat room for immediate header updates
   */
  private emitChatRoomEnteredEvent(): void {
    console.log(
      '[ChatRoom] Emitting chat room entered event for room:',
      this.receiverId
    );

    // Directly call NotificationService to ensure badge is cleared immediately
    console.log(
      '[ChatRoom] Directly calling NotificationService to mark messages as read'
    );
    this.notificationService.markUserMessagesAsRead(this.receiverId);

    // Multiple immediate badge reset triggers for better reliability
    const emitEvent = () => {
      window.dispatchEvent(
        new CustomEvent('chat-room-entered', {
          detail: { roomId: this.receiverId },
        })
      );

      window.dispatchEvent(
        new CustomEvent('messages-read', {
          detail: { count: 0, roomId: this.receiverId },
        })
      );
    };

    // Emit immediately
    emitEvent();

    // Emit again after short delays to ensure all services receive the event
    setTimeout(emitEvent, 100);
    setTimeout(emitEvent, 250);
    setTimeout(emitEvent, 500);

    // Force immediate notification refresh
    setTimeout(() => {
      this.notificationService.refreshNotificationsImmediate();
    }, 50);
  }

  /**
   * Single initialization method that prevents multiple calls
   */
  private async initializeOnce(): Promise<void> {
    if (this.isInitialized) {
      console.log('[ChatRoom] Already initialized, skipping');
      return;
    }

    console.log('[ChatRoom] Starting one-time initialization');
    this.loadingService.show('chat-room-init');

    try {
      // Initialize chat session ONCE
      await this.chat.init(this.receiverId);
      console.log('[ChatRoom] Chat session initialized successfully');

      // Subscribe to loading state first
      this.subs.add(
        this.chat.messagesLoading$.subscribe((loading) => {
          console.log('[ChatRoom] Messages loading state:', loading);
          this.isLoadingMessages = loading;

          // Only allow autoscroll after initial loading is complete
          if (!loading && !this.hasInitiallyScrolled) {
            console.log(
              '[ChatRoom] Initial loading complete, enabling autoscroll'
            );
            this.hasInitiallyScrolled = true;
            this.shouldAutoScroll = true;

            // Scroll to bottom after a brief delay to ensure DOM is updated
            setTimeout(() => {
              this.scrollToBottom(true);
            }, 100);
          }
        })
      );

      // Subscribe to message updates ONCE
      this.subs.add(
        this.chat.messages$.subscribe((messages) => {
          console.log('[ChatRoom] Messages updated, count:', messages.length);

          // Check if we should show the cache info banner
          this.checkForCacheIssues(messages);

          // Group messages by date
          this.groupMessagesByDate(messages);

          // Only handle message updates if not in loading state
          if (!this.isLoadingMessages) {
            this.handleMessagesUpdate(messages);
          }
        })
      );

      // Set up typing indicator subscription ONCE
      this.setupTypingIndicatorSubscription();

      // Set up connection status subscription ONCE
      this.subs.add(
        this.ws.isConnected$.subscribe((connected) => {
          console.log('[ChatRoom] WebSocket connection status:', connected);
        })
      );

      // Enhanced partner online status tracking
      this.setupOnlineStatusTracking();

      // Get partner's avatar ONCE
      this.subs.add(
        this.chat.theirAvatar$.subscribe((avatar) => {
          console.log('[ChatRoom] Partner avatar updated:', avatar);
          this.partnerAvatar = avatar;
        })
      );

      /* Enhanced auto-mark messages as read and update header counter */
      this.subs.add(
        this.chat.messages$.subscribe({
          next: (msgs) => {
            // Only process read receipts if not loading
            if (!this.isLoadingMessages) {
              // Mark unread messages from partner as read
              const unreadFromPartner = msgs.filter(
                (m) =>
                  m.sender !== 'You' &&
                  !m.readAt &&
                  m.id &&
                  !this.reported.has(m.id)
              );

              if (unreadFromPartner.length > 0) {
                console.log(
                  '[ChatRoom] Marking',
                  unreadFromPartner.length,
                  'messages as read'
                );

                unreadFromPartner.forEach((m) => {
                  this.ws.markMessageRead(m.id!);
                  this.reported.add(m.id!);
                });

                // Enhanced header counter update with immediate effect
                console.log(
                  '[ChatRoom] Emitting messages-read event for',
                  unreadFromPartner.length,
                  'messages'
                );

                // Emit event to header and notification service immediately
                window.dispatchEvent(
                  new CustomEvent('messages-read', {
                    detail: {
                      count: unreadFromPartner.length,
                      roomId: this.receiverId,
                    },
                  })
                );

                //  Emit multiple times to ensure all services receive the event
                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent('messages-read', {
                      detail: {
                        count: 0, // This triggers a refresh
                        roomId: this.receiverId,
                      },
                    })
                  );
                }, 500);

                setTimeout(() => {
                  window.dispatchEvent(
                    new CustomEvent('messages-read', {
                      detail: {
                        count: 0, // This triggers a refresh
                        roomId: this.receiverId,
                      },
                    })
                  );
                }, 1000);
              }
            }
          },
          error: (err) => console.error('Error in messages subscription:', err),
        })
      );

      this.isInitialized = true;
      console.log('[ChatRoom] Initialization completed successfully');
    } finally {
      this.loadingService.hide('chat-room-init');
    }
  }

  /**
   * Group messages by date for better organization
   */
  private groupMessagesByDate(messages: ChatMsg[]): void {
    const groups: MessageGroup[] = [];
    let currentGroup: MessageGroup | null = null;

    messages.forEach((message) => {
      const messageTimestamp = message.ts;
      const dayStart = getStartOfDay(messageTimestamp);

      // If this is a new day or first message, create a new group
      if (!currentGroup || currentGroup.dateTimestamp !== dayStart) {
        currentGroup = {
          date: formatDateHeader(messageTimestamp),
          dateTimestamp: dayStart,
          messages: [],
        };
        groups.push(currentGroup);
      }

      // Add message to current group
      currentGroup.messages.push(message);
    });

    this.messageGroups = groups;
    console.log(
      '[ChatRoom] Grouped messages into',
      groups.length,
      'date groups'
    );
  }

  /**
   * Handle messages updates with intelligent scrolling (only when not loading)
   */
  private handleMessagesUpdate(messages: ChatMsg[]): void {
    if (this.isLoadingMessages) {
      console.log(
        '[ChatRoom] Skipping message update handling - still loading'
      );
      return;
    }

    const currentMessageCount = messages.length;
    const hasNewMessages = currentMessageCount > this.lastMessageCount;

    if (hasNewMessages) {
      const newMessageCount = currentMessageCount - this.lastMessageCount;

      // If user is not at bottom, increment new messages counter
      if (!this.isUserAtBottom && this.lastMessageCount > 0) {
        this.newMessagesCount += newMessageCount;
        this.showScrollToBottomButton = true;
        console.log(
          '[ChatRoom] New messages while scrolled up:',
          newMessageCount
        );
      } else {
        // User is at bottom, reset counter and auto-scroll
        this.newMessagesCount = 0;
        this.shouldAutoScroll = true;
        setTimeout(() => this.scrollToBottom(true), 0);
      }
    }

    this.lastMessageCount = currentMessageCount;
  }

  /**
   * Enhanced partner online status tracking
   */
  private setupOnlineStatusTracking(): void {
    console.log(
      '[ChatRoom] Setting up enhanced online status tracking for partner:',
      this.receiverId
    );

    // Subscribe to main online users list
    this.subs.add(
      this.ws.onlineUsers$.subscribe((onlineUsers) => {
        const wasOnline = this.isPartnerOnline;
        this.isPartnerOnline = Array.isArray(onlineUsers)
          ? onlineUsers.includes(this.receiverId)
          : false;

        if (wasOnline !== this.isPartnerOnline) {
          console.log(
            `[ChatRoom] Partner ${this.receiverId} status changed: ${wasOnline} -> ${this.isPartnerOnline}`
          );
        }
      })
    );

    // Subscribe to individual user online events
    this.subs.add(
      this.ws.userOnline$.subscribe((userId) => {
        if (userId === this.receiverId) {
          console.log(`[ChatRoom] Partner ${this.receiverId} came online`);
          this.isPartnerOnline = true;
        }
      })
    );

    // Subscribe to individual user offline events
    this.subs.add(
      this.ws.userOffline$.subscribe((userId) => {
        if (userId === this.receiverId) {
          console.log(`[ChatRoom] Partner ${this.receiverId} went offline`);
          this.isPartnerOnline = false;
        }
      })
    );

    // Handle WebSocket disconnection
    this.subs.add(
      this.ws.isConnected$.subscribe((connected) => {
        if (!connected) {
          console.log(
            '[ChatRoom] WebSocket disconnected, marking partner as offline'
          );
          this.isPartnerOnline = false;
        } else {
          // When reconnected, check current status
          const currentStatus = this.ws.isUserOnline(this.receiverId);
          console.log(
            `[ChatRoom] WebSocket reconnected, partner status: ${currentStatus}`
          );
          this.isPartnerOnline = currentStatus;
        }
      })
    );

    // Set initial status
    this.isPartnerOnline = this.ws.isUserOnline(this.receiverId);
    console.log(`[ChatRoom] Initial partner status: ${this.isPartnerOnline}`);
  }

  /**
   * Set up subscription to typing indicator with proper change detection
   */
  private setupTypingIndicatorSubscription(): void {
    console.log('[ChatRoom] Setting up typing indicator subscription');

    this.subs.add(
      this.chat.partnerTyping$.subscribe((isTyping) => {
        console.log('[ChatRoom] Partner typing status changed:', isTyping);

        // Use NgZone to ensure Angular detects the change
        this.ngZone.run(() => {
          this.isPartnerTyping = isTyping;
          console.log(
            '[ChatRoom] Updated isPartnerTyping to:',
            this.isPartnerTyping
          );
        });
      })
    );
  }

  /* Improved typing event sender with throttling */
  private typingThrottle: ReturnType<typeof setTimeout> | null = null;
  private lastTypingEvent = 0;
  private readonly TYPING_THROTTLE = 1000; // ms

  onUserTyping(): void {
    const now = Date.now();

    // Only send typing event if enough time has passed since last one
    if (now - this.lastTypingEvent > this.TYPING_THROTTLE) {
      this.lastTypingEvent = now;

      console.log('[ChatRoom] User typing, sending indicator');
      this.chat.sendTyping();

      // Clear any existing throttle
      if (this.typingThrottle) {
        clearTimeout(this.typingThrottle);
      }

      // Set throttle to prevent sending too many events
      this.typingThrottle = setTimeout(() => {
        this.typingThrottle = null;
      }, this.TYPING_THROTTLE);
    }
  }

  ngAfterViewInit() {
    // Set up input event listeners for typing detection
    setTimeout(() => {
      if (this.messageInput?.nativeElement) {
        console.log(
          '[ChatRoom] Setting up input listeners for typing detection'
        );

        // Use more reliable input events to detect typing
        this.messageInput.nativeElement.addEventListener(
          'input',
          this.handleTyping.bind(this)
        );
        this.messageInput.nativeElement.addEventListener(
          'keydown',
          this.handleKeydown.bind(this)
        );
      }
    }, 100);

    // Set up scroll listener for intelligent scrolling
    this.setupScrollListener();
  }

  /**
   * Set up scroll listener to track user position
   */
  private setupScrollListener(): void {
    setTimeout(() => {
      if (this.messageContainer?.nativeElement) {
        console.log('[ChatRoom] Setting up scroll listener');

        this.messageContainer.nativeElement.addEventListener(
          'scroll',
          this.handleScroll.bind(this),
          { passive: true }
        );
      }
    }, 200);
  }

  /**
   * Enhanced scroll detection with direction tracking for better button visibility
   */
  private handleScroll(): void {
    if (!this.messageContainer?.nativeElement || this.isLoadingMessages) return;

    const container = this.messageContainer.nativeElement;
    const scrollTop = container.scrollTop;
    const scrollHeight = container.scrollHeight;
    const clientHeight = container.clientHeight;

    // Track scroll direction for more responsive button behavior
    const scrollDirection = scrollTop > this.lastScrollTop ? 'down' : 'up';
    this.lastScrollTop = scrollTop;

    // More intelligent detection
    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);
    const isNearBottom = distanceFromBottom <= 50; // Within 50px of bottom

    // Show button when:
    // 1. User scrolled up and is more than 100px from bottom, OR
    // 2. There are new messages and user is not at bottom
    const shouldShowButton =
      (scrollDirection === 'up' && distanceFromBottom > 100) ||
      (this.newMessagesCount > 0 && !isNearBottom) ||
      (!isNearBottom && this.lastMessageCount > 5); // Show if not at bottom with enough messages

    // console.log('[ChatRoom] Scroll info:', {
    //   direction: scrollDirection,
    //   distanceFromBottom,
    //   shouldShowButton,
    //   newMessages: this.newMessagesCount,
    // });

    // Update user position
    this.isUserAtBottom = isNearBottom;

    // Show/hide scroll to bottom button
    this.showScrollToBottomButton = shouldShowButton;

    // Reset new messages counter if user scrolled to bottom
    if (isNearBottom && this.newMessagesCount > 0) {
      this.newMessagesCount = 0;
    }
  }

  private handleTyping(): void {
    const now = Date.now();

    // Only send typing event if enough time has passed
    if (now - this.lastTypingEvent > this.TYPING_THROTTLE) {
      this.lastTypingEvent = now;
      console.log('[ChatRoom] User typing, sending indicator');

      // Send typing event to chat session
      this.chat.sendTyping();
    }
  }

  private handleKeydown(event: KeyboardEvent): void {
    // Send typing indicator on most keystrokes, but not on special keys
    if (
      !event.ctrlKey &&
      !event.metaKey &&
      event.key !== 'Enter' &&
      event.key !== 'Tab' &&
      event.key !== 'Escape'
    ) {
      this.handleTyping();
    }
  }

  // Only auto-scroll after initial loading is complete
  ngAfterViewChecked() {
    // Only auto-scroll if conditions are met and not loading
    if (
      this.shouldAutoScroll &&
      this.isUserAtBottom &&
      !this.isLoadingMessages
    ) {
      this.scrollToBottom(false);
      this.shouldAutoScroll = false;
    }
  }

  // For normal text input
  onKeydownEnter(event: Event): void {
    const kbdEvent = event as KeyboardEvent;
    if (kbdEvent.ctrlKey || kbdEvent.metaKey) {
      return;
    }

    event.preventDefault();
    this.send();
  }

  onKeydownCtrlEnter(event: Event): void {
    event.preventDefault();
    this.newMessage = this.newMessage + '\n';
  }

  onKeydownMetaEnter(event: Event): void {
    event.preventDefault();
    this.newMessage = this.newMessage + '\n';
  }

  // For edit mode
  onKeydownEnterEdit(event: Event): void {
    const kbdEvent = event as KeyboardEvent;
    if (kbdEvent.ctrlKey || kbdEvent.metaKey) {
      return;
    }

    event.preventDefault();
    this.confirmEdit();
  }

  onKeydownCtrlEnterEdit(event: Event): void {
    event.preventDefault();
    this.editDraft = this.editDraft + '\n';
  }

  onKeydownMetaEnterEdit(event: Event): void {
    event.preventDefault();
    this.editDraft = this.editDraft + '\n';
  }

  send(): void {
    console.log('[ChatRoom] Send button clicked');

    if (!this.newMessage || !this.newMessage.trim()) {
      console.log('[ChatRoom] Empty message, not sending');
      return;
    }

    console.log('[ChatRoom] Sending message:', this.newMessage);

    // Store message content before sending
    const messageContent = this.newMessage;

    // Clear input immediately for better UX
    this.newMessage = '';

    // Auto resize the textarea
    if (this.messageInput?.nativeElement) {
      this.messageInput.nativeElement.value = '';
      this.autoResizeTextarea(this.messageInput.nativeElement);
    }

    // Auto-scroll to bottom when user sends message
    this.isUserAtBottom = true;
    this.shouldAutoScroll = true;
    this.newMessagesCount = 0;
    this.showScrollToBottomButton = false;

    // Send message
    this.chat
      .send('', messageContent)
      .then(() => {
        console.log('[ChatRoom] Message sent successfully');

        // Re-focus the input after sending
        setTimeout(() => {
          if (this.messageInput?.nativeElement) {
            this.messageInput.nativeElement.focus();
          }
        }, 0);

        // Scroll to bottom after sending
        setTimeout(() => this.scrollToBottom(true), 0);
      })
      .catch((error) => {
        console.error('[ChatRoom] Error sending message:', error);

        // Handle send failure - potentially restore the message
        this.newMessage = messageContent;
      });
  }

  onType(): void {
    console.log('[ChatRoom] onType called');
    this.handleTyping();

    // Auto-resize the textarea
    if (this.messageInput?.nativeElement) {
      this.autoResizeTextarea(this.messageInput.nativeElement);
    }
  }

  autoResizeTextarea(textarea: HTMLTextAreaElement) {
    // Reset height to auto to get the correct scrollHeight
    textarea.style.height = 'auto';

    // Set new height based on scrollHeight (with a max height)
    const newHeight = Math.min(textarea.scrollHeight, 100);
    textarea.style.height = `${newHeight}px`;
  }

  trackByTs(_: number, m: { ts: number }) {
    return m.ts;
  }

  /**
   * Track function for message groups
   */
  trackByDate(_: number, group: MessageGroup): number {
    return group.dateTimestamp;
  }

  /**
   * Format message timestamp for display using updated utility
   */
  formatMessageTime(timestamp: number): string {
    return formatMessageTime(timestamp);
  }

  /**
   * Get full timestamp for tooltip
   */
  getFullTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  /**
   * Get avatar URL for a message with proper fallback
   */
  getMessageAvatar(message: ChatMsg): string {
    // For messages sent by me, use my avatar
    if (message.sender === 'You') {
      return (
        message.avatarUrl || this.myAvatar || 'assets/images/avatars/01.svg'
      );
    }

    // For messages from partner, use their avatar
    return (
      message.avatarUrl || this.partnerAvatar || 'assets/images/avatars/01.svg'
    );
  }

  /**
   * Get partner's avatar with fallback
   */
  getPartnerAvatar(): string {
    return this.partnerAvatar || 'assets/images/avatars/01.svg';
  }

  /**
   * Handle broken avatar images
   */
  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    console.warn('[ChatRoom] Avatar failed to load:', img.src);
    img.src = 'assets/images/avatars/01.svg';
  }

  /**
   * Handle message avatar errors
   */
  onMessageAvatarError(event: Event, message: ChatMsg): void {
    const img = event.target as HTMLImageElement;
    console.warn('[ChatRoom] Message avatar failed to load:', img.src);

    // Set fallback based on message sender
    if (message.sender === 'You') {
      img.src = this.myAvatar;
    } else {
      img.src = this.getPartnerAvatar();
    }
  }

  /**
   * Check if we should show the cache info banner
   */
  private checkForCacheIssues(messages: ChatMsg[]): void {
    // Don't show if user has already dismissed it
    if (localStorage.getItem('cacheInfoDismissed') === 'true') {
      return;
    }

    // Check if there are any messages sent by me that show cache-related text
    const hasUnreadableSentMessages = messages.some(
      (m) =>
        m.sender === 'You' &&
        (m.text.includes('💬 Message sent') ||
          m.text.includes('🔒 Encrypted message'))
    );

    if (hasUnreadableSentMessages && !this.showCacheInfoBanner) {
      console.log(
        '[ChatRoom] Detected unreadable sent messages, showing info banner'
      );
      this.showCacheInfoBanner = true;
    }
  }

  /**
   * Check if a message is unreadable (cached message that can't be decrypted)
   */
  isMessageUnreadable(message: ChatMsg): boolean {
    if (message.sender !== 'You') return false;

    return (
      message.text.includes('💬 Message sent') ||
      message.text.includes('🔒 Encrypted message (sent by you)')
    );
  }

  /**
   * Check if a message can be edited/deleted
   */
  canEditMessage(message: ChatMsg): boolean {
    return (
      message.sender === 'You' &&
      !message.deletedAt &&
      !this.isMessageUnreadable(message)
    );
  }

  /**
   * Scroll to bottom button handler
   */
  scrollToBottomClick(): void {
    console.log('[ChatRoom] Scroll to bottom button clicked');
    this.isUserAtBottom = true;
    this.shouldAutoScroll = true;
    this.newMessagesCount = 0;
    this.showScrollToBottomButton = false;
    this.scrollToBottom(true);

    // Update header counter since we're now at bottom
    window.dispatchEvent(
      new CustomEvent('messages-read', {
        detail: { count: this.newMessagesCount, roomId: this.receiverId },
      })
    );
  }

  /**
   * Navigate back to chat list with explicit handling for mobile
   */
  navigateToList(event?: Event): void {
    if (event) {
      event.preventDefault();
    }

    this.loadingService.show('navigation');

    // Use timeout to ensure the navigation happens after current event cycle
    setTimeout(() => {
      this.router
        .navigate(['/chat'])
        .then(() => {
          console.log('Successfully navigated to chat list');
          this.loadingService.hide('navigation');
        })
        .catch((err) => {
          console.error('Navigation to chat list failed:', err);
          this.loadingService.hide('navigation');

          // Fallback for stubborn mobile browsers
          window.location.href = '/chat';
        });
    }, 50);
  }

  /**
   * Improved scroll to bottom with smooth scrolling option
   */
  private scrollToBottom(smooth = false) {
    try {
      const el = this.messageContainer?.nativeElement;
      if (el) {
        if (smooth) {
          el.scrollTo({
            top: el.scrollHeight,
            behavior: 'smooth',
          });
        } else {
          el.scrollTop = el.scrollHeight;
        }

        // Clear any pending scroll timeout
        if (this.scrollTimeout) {
          clearTimeout(this.scrollTimeout);
          this.scrollTimeout = null;
        }
      }
    } catch (error) {
      console.error('Error scrolling to bottom:', error);
    }
  }

  beginEdit(m: ChatMsg) {
    // Check if message can be edited
    if (!this.canEditMessage(m)) {
      console.log('[ChatRoom] Cannot edit unreadable message');
      alert('Cannot edit this message - original text is no longer available.');
      return;
    }

    this.editing = m;
    this.editDraft = m.text;

    // Focus edit input after a short delay
    setTimeout(() => {
      if (this.editInput?.nativeElement) {
        this.editInput.nativeElement.focus();
        this.autoResizeTextarea(this.editInput.nativeElement);
      }
    }, 0);
  }

  cancelEdit() {
    this.editing = null;
    this.editDraft = '';

    // Re-focus the main input
    setTimeout(() => {
      if (this.messageInput?.nativeElement) {
        this.messageInput.nativeElement.focus();
      }
    }, 0);
  }

  async confirmEdit() {
    if (!this.editing || !this.editDraft.trim()) return;

    await this.chat.editMessage(this.editing.id!, this.editDraft.trim());
    this.cancelEdit();
  }

  delete(m: ChatMsg) {
    if (!m.id) return;

    // Check if message can be deleted
    if (!this.canEditMessage(m)) {
      console.log('[ChatRoom] Cannot delete unreadable message');
      alert(
        'Cannot delete this message - original text is no longer available.'
      );
      return;
    }

    // Use Material Dialog or a custom confirmation
    if (confirm('Delete this message for everyone?')) {
      this.chat.deleteMessage(m.id);
    }
  }

  ngOnDestroy() {
    console.log('[ChatRoom] Component destroying, cleaning up resources');

    // Remove event listeners from input element
    if (this.messageInput?.nativeElement) {
      this.messageInput.nativeElement.removeEventListener(
        'input',
        this.handleTyping
      );
      this.messageInput.nativeElement.removeEventListener(
        'keydown',
        this.handleKeydown
      );
    }

    // Remove scroll listener
    if (this.messageContainer?.nativeElement) {
      this.messageContainer.nativeElement.removeEventListener(
        'scroll',
        this.handleScroll
      );
    }

    // Cleanup subscriptions
    this.subs.unsubscribe();

    // Clear typing throttle
    if (this.typingThrottle) {
      clearTimeout(this.typingThrottle);
    }

    // Clear scroll timeout
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
    }

    try {
      if (this.chat) {
        // Any specific cleanup needed
      }
    } catch (error) {
      console.warn('[ChatRoom] Error during cleanup:', error);
    }
  }
}
