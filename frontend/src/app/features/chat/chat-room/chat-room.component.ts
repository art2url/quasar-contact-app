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
  ViewEncapsulation,
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
import { formatMessageTime, formatDateHeader, getStartOfDay } from '@utils/date.util';

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
  encapsulation: ViewEncapsulation.None,
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
  
  // Flags for Angular hook-based operations (instead of setTimeout)
  private needsSecondaryEventEmit = false;
  private needsNotificationRefresh = false;
  private needsDebugState = false;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public chat: ChatSessionService,
    private ws: WebSocketService,
    private loadingService: LoadingService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private notificationService: NotificationService
  ) {
    // Expose debug methods globally for testing
    (window as any).debugFixMutualBlocking = () => this.debugFixMutualBlocking();
    (window as any).debugClearAllMissingFlags = () => this.debugClearAllMissingFlags();
    (window as any).debugRegeneratePublicKey = () => this.debugRegeneratePublicKey();
  }

  @HostListener('window:resize')
  onResize() {
    if (this.isUserAtBottom) {
      this.scrollToBottom(false);
    }
  }

  @HostListener('window:focus')
  onWindowFocus() {
    // When user returns to the app, check if partner key status changed
    this.chat.manuallyCheckKeyStatus();
  }

  @HostListener('window:visibilitychange')
  onVisibilityChange() {
    // When tab becomes visible again, check for key changes
    if (!document.hidden) {
      this.chat.manuallyCheckKeyStatus();
    }
  }

  async ngOnInit(): Promise<void> {
    document.body.classList.add('chat-room-page');

    this.receiverId = this.route.snapshot.paramMap.get('id')!;

    if (!this.receiverId) {
      this.navigateToList();
      return;
    }

    // Emit chat room entered event for header badge updates
    this.emitChatRoomEnteredEvent();

    // Debug notification state (set flag for Angular hook)
    this.needsDebugState = true;

    // Initialize once only
    try {
      await this.initializeOnce();
    } catch (error) {
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
    // Directly call NotificationService to ensure badge is cleared immediately
    this.notificationService.markUserMessagesAsRead(this.receiverId);

    // Emit events immediately
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
    
    // Set flags for Angular hooks to handle delayed operations
    this.needsSecondaryEventEmit = true;
    this.needsNotificationRefresh = true;
  }

  /**
   * Single initialization method that prevents multiple calls
   */
  private async initializeOnce(): Promise<void> {
    if (this.isInitialized) {
      return;
    }

    this.loadingService.show('chat-room-init');

    try {
      // Initialize chat session ONCE
      await this.chat.init(this.receiverId);
      

      // Subscribe to loading state first
      this.subs.add(
        this.chat.messagesLoading$.subscribe(loading => {
          this.isLoadingMessages = loading;

          // Only allow autoscroll after initial loading is complete
          if (!loading && !this.hasInitiallyScrolled) {
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
        this.chat.messages$.subscribe(messages => {
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
        this.ws.isConnected$.subscribe(connected => {
        })
      );

      // Enhanced partner online status tracking
      this.setupOnlineStatusTracking();

      // Get partner's avatar ONCE
      this.subs.add(
        this.chat.theirAvatar$.subscribe(avatar => {
          this.partnerAvatar = avatar;
        })
      );

      // DEBUG: Monitor observable states for recovery UI debugging
      this.subs.add(
        this.chat.keyLoading$.subscribe(loading => {
        })
      );
      
      this.subs.add(
        this.chat.myPrivateKeyMissing$.subscribe(missing => {
          if (missing === true && !this.chat.keyLoading$.value) {
            // Only mark keys as missing if this is genuine key loss, not artificial blocking
            if (!this.chat.isArtificialKeyMissingState) {
              this.chat.ensureKeysMissingFlagSet();
            }
            
            // Force change detection
            setTimeout(() => this.cdr.detectChanges(), 0);
          }
        })
      );

      /* Enhanced auto-mark messages as read and update header counter */
      this.subs.add(
        this.chat.messages$.subscribe({
          next: msgs => {
            // Only process read receipts if not loading
            if (!this.isLoadingMessages) {
              // Mark unread messages from partner as read
              const unreadFromPartner = msgs.filter(
                m => m.sender !== 'You' && !m.readAt && m.id && !this.reported.has(m.id)
              );

              if (unreadFromPartner.length > 0) {

                unreadFromPartner.forEach(m => {
                  this.ws.markMessageRead(m.id!);
                  this.reported.add(m.id!);
                });

                // Enhanced header counter update with immediate effect

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
          error: err => console.error('Error in messages subscription:', err),
        })
      );

      this.isInitialized = true;
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

    messages.forEach(message => {
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
  }

  /**
   * Handle messages updates with intelligent scrolling (only when not loading)
   */
  private handleMessagesUpdate(messages: ChatMsg[]): void {
    if (this.isLoadingMessages) {
      return;
    }

    const currentMessageCount = messages.length;
    const hasNewMessages = currentMessageCount > this.lastMessageCount;

    if (hasNewMessages) {
      const newMessageCount = currentMessageCount - this.lastMessageCount;

      // If user is not at bottom, increment new messages counter
      if (!this.isUserAtBottom && this.lastMessageCount > 0) {
        this.newMessagesCount += newMessageCount;
        // REMOVED: this.showScrollToBottomButton = true;
        // Let handleScroll method control button visibility based on scroll position
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

    // Subscribe to main online users list
    this.subs.add(
      this.ws.onlineUsers$.subscribe(onlineUsers => {
        const wasOnline = this.isPartnerOnline;
        this.isPartnerOnline = Array.isArray(onlineUsers)
          ? onlineUsers.includes(this.receiverId)
          : false;

        if (wasOnline !== this.isPartnerOnline) {
        }
      })
    );

    // Subscribe to individual user online events
    this.subs.add(
      this.ws.userOnline$.subscribe(userId => {
        if (userId === this.receiverId) {
          this.isPartnerOnline = true;
        }
      })
    );

    // Subscribe to individual user offline events
    this.subs.add(
      this.ws.userOffline$.subscribe(userId => {
        if (userId === this.receiverId) {
          this.isPartnerOnline = false;
        }
      })
    );

    // Handle WebSocket disconnection
    this.subs.add(
      this.ws.isConnected$.subscribe(connected => {
        if (!connected) {
          this.isPartnerOnline = false;
        } else {
          // When reconnected, check current status
          const currentStatus = this.ws.isUserOnline(this.receiverId);
          this.isPartnerOnline = currentStatus;
        }
      })
    );

    // Set initial status
    this.isPartnerOnline = this.ws.isUserOnline(this.receiverId);
  }

  /**
   * Set up subscription to typing indicator with proper change detection
   */
  private setupTypingIndicatorSubscription(): void {
    this.subs.add(
      this.chat.partnerTyping$.subscribe(isTyping => {
        // Use NgZone to ensure Angular detects the change
        this.ngZone.run(() => {
          this.isPartnerTyping = isTyping;
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
        // Use more reliable input events to detect typing
        this.messageInput.nativeElement.addEventListener(
          'input',
          this.handleTyping.bind(this)
        );
        this.messageInput.nativeElement.addEventListener(
          'keydown',
          this.handleKeydown.bind(this)
        );
        
        // Re-check partner key status when user focuses on chat input
        this.messageInput.nativeElement.addEventListener(
          'focus',
          this.handleChatInputFocus.bind(this)
        );
      }
    }, 100);

    // Set up scroll listener for intelligent scrolling
    this.setupScrollListener();
    
    // Handle delayed operations using Angular hook instead of setTimeout
    this.handleDelayedOperations();
  }
  
  /**
   * Handle delayed operations using Angular lifecycle instead of setTimeout
   */
  private handleDelayedOperations(): void {
    // Secondary event emit (replaces setTimeout(emitEvent, 300))
    if (this.needsSecondaryEventEmit) {
      this.ngZone.runOutsideAngular(() => {
        // Use requestAnimationFrame for better performance than setTimeout
        requestAnimationFrame(() => {
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
        });
      });
      this.needsSecondaryEventEmit = false;
    }
    
    // Notification refresh (replaces setTimeout for notification refresh)
    if (this.needsNotificationRefresh) {
      this.ngZone.runOutsideAngular(() => {
        // Use requestAnimationFrame chain for delayed execution
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.ngZone.run(() => {
              this.notificationService.refreshNotificationsImmediate();
            });
          });
        });
      });
      this.needsNotificationRefresh = false;
    }
    
    // Debug state (replaces setTimeout for debug state)
    if (this.needsDebugState) {
      this.ngZone.runOutsideAngular(() => {
        // Use requestAnimationFrame chain for delayed execution
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              this.ngZone.run(() => {
                this.notificationService.debugCurrentState();
              });
            });
          });
        });
      });
      this.needsDebugState = false;
    }
  }

  /**
   * Set up scroll listener to track user position
   */
  private setupScrollListener(): void {
    setTimeout(() => {
      if (this.messageContainer?.nativeElement) {
        this.messageContainer.nativeElement.addEventListener(
          'scroll',
          this.handleScroll.bind(this),
          { passive: true }
        );
      }
    }, 200);
  }

  /**
   * Enhanced scroll detection with stricter button visibility rules
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

    // FIXED: Show button ONLY when user scrolls up significantly
    const shouldShowButton = scrollDirection === 'up' && distanceFromBottom > 150;

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
    if (this.shouldAutoScroll && this.isUserAtBottom && !this.isLoadingMessages) {
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
    if (!this.newMessage || !this.newMessage.trim()) {
      return;
    }

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
        // Re-focus the input after sending
        setTimeout(() => {
          if (this.messageInput?.nativeElement) {
            this.messageInput.nativeElement.focus();
          }
        }, 0);

        // Scroll to bottom after sending
        setTimeout(() => this.scrollToBottom(true), 0);
      })
      .catch(error => {
        console.error('[ChatRoom] Error sending message:', error);

        // Handle send failure - potentially restore the message
        this.newMessage = messageContent;
      });
  }

  onType(): void {
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
      return message.avatarUrl || this.myAvatar || 'assets/images/avatars/01.svg';
    }

    // For messages from partner, use their avatar
    return message.avatarUrl || this.partnerAvatar || 'assets/images/avatars/01.svg';
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
    img.src = 'assets/images/avatars/01.svg';
  }

  /**
   * Handle message avatar errors
   */
  onMessageAvatarError(event: Event, message: ChatMsg): void {
    const img = event.target as HTMLImageElement;

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
      m =>
        m.sender === 'You' &&
        (m.text.includes('💬 Message sent') || m.text.includes('🔒 Encrypted message'))
    );

    if (hasUnreadableSentMessages && !this.showCacheInfoBanner) {
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
   * Check if a message is encrypted (from partner)
   *
   * NOTE: This uses text matching which can have false positives if users
   * type the exact encrypted message text. For 100% accuracy, backend should
   * provide explicit encryption status flags.
   */
  isMessageEncrypted(message: ChatMsg): boolean {
    if (message.sender === 'You') return false;

    // Check for exact encrypted message text
    // Most users won't type this exact system message, so risk is minimal
    const isEncryptedText = message.text === '🔒 Encrypted message (from partner)';

    return isEncryptedText;

    // TODO: Replace with proper backend flag when available:
    // return message.decryptionFailed === true;
  }

  /**
   * Check if a message can be edited/deleted
   */
  canEditMessage(message: ChatMsg): boolean {
    return (
      message.sender === 'You' && !message.deletedAt && !this.isMessageUnreadable(message)
    );
  }

  /**
   * Scroll to bottom button handler
   */
  scrollToBottomClick(): void {
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
          this.loadingService.hide('navigation');
        })
        .catch(err => {
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
      alert('Cannot delete this message - original text is no longer available.');
      return;
    }

    // Use Material Dialog or a custom confirmation
    if (confirm('Delete this message for everyone?')) {
      this.chat.deleteMessage(m.id);
    }
  }



  /**
   * Handle private key regeneration when user's own key is missing
   */
  async regenerateEncryptionKeys(): Promise<void> {
    if (confirm('Your encryption keys are missing. This will generate new keys, but you will lose access to previous messages. Continue?')) {
      try {
        await this.chat.regenerateKeys();
      } catch (error) {
        console.error('[ChatRoom] Failed to regenerate keys:', error);
        alert('Failed to regenerate encryption keys. Please try again or contact support.');
      }
    }
  }

  /**
   * Reload the page when partner regenerates keys
   */
  reloadPage(): void {
    window.location.reload();
  }

  /**
   * Manually check for updated partner keys
   */
  checkPartnerKeyStatus(): void {
    // Use the new event-driven approach
    this.chat.manuallyCheckKeyStatus();
  }

  /**
   * Debug method to test partner key recovery notification
   */
  debugTestPartnerKeyRecovery(): void {
  }

  /**
   * DEBUG METHOD: Force current user to lose their keys for testing
   */
  debugForceKeyLoss(): void {
    this.chat.debugForceKeyLoss();
  }

  /**
   * DEBUG METHOD: Clear artificial blocking state for testing
   */
  debugClearBlocking(): void {
    this.chat.debugClearArtificialBlocking();
  }

  /**
   * Debug method to test WebSocket connection and handlers
   */
  debugTestWebSocket(): void {
    // Test if we can call WebSocket methods
    try {
      this.ws.debugOnlineStatus();
    } catch (error) {
      console.error('[ChatRoom] WebSocket debug error:', error);
    }
  }

  /**
   * Debug method to show room info
   */
  debugShowRoomInfo(): void {
    this.chat.debugShowRoomInfo();
  }


  /**
   * Check if chat is blocked due to various key issues
   */
  isChatBlocked(): boolean {
    // Check if we're loading messages
    if (this.isLoadingMessages) {
      return true;
    }
    
    // Check if WE have missing private keys (our own recovery UI is visible)
    const myPrivateKeyMissing = this.chat.myPrivateKeyMissing$.value;
    if (myPrivateKeyMissing) {
      return true;
    }
    
    // Check if partner's key is missing
    const keyMissing = this.chat.keyMissing$.value;
    if (keyMissing) {
      return true;
    }
    
    // Check if partner has regenerated keys and we need to reload
    const partnerKeyRegenerated = this.chat.showPartnerKeyRegeneratedNotification$.value;
    if (partnerKeyRegenerated) {
      return true;
    }
    
    // Chat not blocked - all checks passed
    
    return false;
  }

  /**
   * Get appropriate placeholder text for chat input
   */
  getChatInputPlaceholder(): string {
    if (this.isLoadingMessages) {
      return 'Loading messages...';
    }
    
    // Check if WE have missing private keys first
    const myPrivateKeyMissing = this.chat.myPrivateKeyMissing$.value;
    if (myPrivateKeyMissing) {
      // Check if this is due to partner losing keys
      const artificialState = this.chat.artificialKeyMissingState;
      if (artificialState) {
        const username = this.chat.theirUsername$.value || 'Your contact';
        return `Chat blocked - ${username} has lost their keys and must regenerate them`;
      } else {
        return 'Cannot send messages - you need to regenerate your encryption keys';
      }
    }
    
    const partnerKeyRegenerated = this.chat.showPartnerKeyRegeneratedNotification$.value;
    if (partnerKeyRegenerated) {
      const username = this.chat.theirUsername$.value || 'your contact';
      return `Chat blocked - ${username} is recovering their keys. Refresh to check status.`;
    }
    
    const keyMissing = this.chat.keyMissing$.value;
    if (keyMissing) {
      const username = this.chat.theirUsername$.value || 'Your contact';
      return `Cannot send messages - ${username} needs to set up encryption`;
    }
    
    return 'Type a message...';
  }

  ngOnDestroy() {
    document.body.classList.remove('chat-room-page');

    // Remove event listeners from input element
    if (this.messageInput?.nativeElement) {
      this.messageInput.nativeElement.removeEventListener('input', this.handleTyping);
      this.messageInput.nativeElement.removeEventListener('keydown', this.handleKeydown);
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

  /**
   * DEBUG METHOD: Fix mutual blocking issue
   */
  debugFixMutualBlocking(): void {
    console.log('[ChatRoom] DEBUG: Fixing mutual blocking issue...');
    this.chat.debugFixBothUsersKeyFlags();
  }

  /**
   * DEBUG METHOD: Emergency cleanup - clear ALL isKeyMissing flags
   */
  debugClearAllMissingFlags(): void {
    console.log('[ChatRoom] DEBUG: Emergency cleanup - clearing all isKeyMissing flags...');
    this.chat.debugClearAllMissingFlags();
    
    // Force page reload after a delay to get clean state
    setTimeout(() => {
      window.location.reload();
    }, 2000);
  }

  /**
   * DEBUG METHOD: Regenerate public key from existing private key
   */
  async debugRegeneratePublicKey(): Promise<void> {
    console.log('[ChatRoom] DEBUG: Regenerating public key from existing private key...');
    await this.chat.debugRegeneratePublicKey();
  }

  /**
   * Handle chat input focus - re-check partner key status
   */
  private handleChatInputFocus(): void {
    console.log('[ChatRoom] Chat input focused - re-checking partner key status');
    this.chat.manuallyCheckKeyStatus();
  }
}
