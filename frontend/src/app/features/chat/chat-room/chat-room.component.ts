import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Injectable,
  NgZone,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  HAMMER_GESTURE_CONFIG,
  HammerGestureConfig,
  HammerModule,
} from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import * as Hammer from 'hammerjs';
import { Subscription, timer } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { ChatMsg } from '@models/chat.model';
import { ChatSessionService } from '@services/chat-session.service';
import { LoadingService } from '@services/loading.service';
import { NotificationService } from '@services/notification.service';
import { WebSocketService } from '@services/websocket.service';
import { MobileChatLayoutService } from '@services/mobile-chat-layout.service';
import { ThemeService } from '@services/theme.service';

// Import the cache info banner component
import { CacheInfoBannerComponent } from '@shared/components/cache-info-banner/cache-info-banner.component';
import { EmojiPickerComponent } from '@shared/components/emoji-picker/emoji-picker.component';
import {
  CompressedImage,
  ImageAttachmentComponent,
} from '@shared/components/image-attachment/image-attachment.component';

// Import updated date utilities
import { formatDateHeader, formatMessageTime, getStartOfDay } from '@utils/date.util';

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
    EmojiPickerComponent,
    ImageAttachmentComponent,
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

  // Track if messages have been marked as read to avoid duplicate calls
  private hasMarkedMessagesAsRead = false;

  // New scroll management properties with scroll direction tracking
  private isUserAtBottom = true;
  private shouldAutoScroll = true;
  showScrollToBottomButton = false;
  newMessagesCount = 0;
  private lastMessageCount = 0;
  private scrollTimeout: NodeJS.Timeout | null = null;

  // Grouped messages for date separation
  messageGroups: MessageGroup[] = [];

  // Loading state tracking
  isLoadingMessages = true;
  private hasInitiallyScrolled = false;

  // Flags for Angular hook-based operations (instead of setTimeout)
  private needsSecondaryEventEmit = false;
  private needsNotificationRefresh = false;

  // Image attachment state
  attachedImage: CompressedImage | null = null;

  constructor(
    private route: ActivatedRoute,
    private router: Router,
    public chat: ChatSessionService,
    private ws: WebSocketService,
    private loadingService: LoadingService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private notificationService: NotificationService,
    private mobileChatLayoutService: MobileChatLayoutService,
    private themeService: ThemeService
  ) {}

  @HostListener('window:resize')
  onResize() {
    if (this.isUserAtBottom) {
      this.scrollToBottom(false);
    }
    // Update typing indicator position on resize
    this.updateTypingIndicatorPosition();
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
    
    // Set body background for mobile to prevent black overscroll
    if (window.innerWidth <= 599) {
      // Set initial background
      this.updateMobileBodyBackground();
      
      // Subscribe to theme changes and update background
      this.subs.add(
        this.themeService.theme$.subscribe(() => {
          this.updateMobileBodyBackground();
        })
      );
      
      // Block overall page scroll in mobile - only allow chat-window to scroll
      document.documentElement.style.overflow = 'hidden';
      document.body.style.overflow = 'hidden';
      document.documentElement.style.height = '100vh';
      document.body.style.height = '100vh';
      
      // Add scroll event listeners to redirect scroll to chat-window
      this.addScrollRedirectListeners();
    }

    // Initialize mobile layout service for dynamic height calculations
    this.mobileChatLayoutService.forceUpdate();

    // Reset the flag for this chat room
    this.hasMarkedMessagesAsRead = false;

    this.receiverId = this.route.snapshot.paramMap.get('id')!;

    if (!this.receiverId) {
      this.navigateToList();
      return;
    }

    // Emit chat room entered event for header badge updates
    this.emitChatRoomEnteredEvent();

    // Initialize once only
    try {
      await this.initializeOnce();
    } catch {
      this.loadingService.hide();
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
    // Don't mark messages as read immediately - wait until messages are loaded and visible
    // Just emit the chat room entered event for now
    const emitEvent = () => {
      window.dispatchEvent(
        new CustomEvent('chat-room-entered', {
          detail: { roomId: this.receiverId },
        })
      );
    };

    // Emit immediately
    emitEvent();
  }

  /**
   * Mark messages as read when they are actually loaded and visible to the user
   */
  private markMessagesAsReadWhenVisible(): void {
    // Mark messages as read in the notification service
    this.notificationService.markUserMessagesAsRead(this.receiverId);

    // Don't emit custom events - they cause duplicate markUserMessagesAsRead calls
    // The notification service handles the state updates directly
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

            // Scroll to bottom after ensuring layout is calculated
            this.ngZone.runOutsideAngular(() => {
              // Use multiple requestAnimationFrame calls to ensure layout is complete
              requestAnimationFrame(() => {
                // Force layout update before scrolling
                this.mobileChatLayoutService.forceUpdate();
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    this.ngZone.run(() => {
                      this.scrollToBottom(true);
                    });
                  });
                });
              });
            });

            // Don't mark messages as read just because they loaded
            // Only mark as read when user actually sees them (after scroll)
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
        this.ws.isConnected$.subscribe(() => {
          // Connection status changed
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
        this.chat.keyLoading$.subscribe(() => {
          // Key loading state changed
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
            this.cdr.detectChanges();
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

                // Messages are now handled directly without custom events
              }
            }
          },
          error: err => console.error('Error in messages subscription:', err),
        })
      );

      this.isInitialized = true;
    } finally {
      this.loadingService.hide();
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
        
        // Check if we should actually auto-scroll based on user's position
        const container = this.messageContainer?.nativeElement;
        if (container && this.mobileChatLayoutService.shouldAutoScroll(container)) {
          this.ngZone.runOutsideAngular(() => {
            requestAnimationFrame(() => {
              this.ngZone.run(() => {
                this.scrollToBottom(true);
              });
            });
          });
        }
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
          // Partner online status changed
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
          // Update positioning when typing indicator state changes
          this.updateTypingIndicatorPosition();
        });
      })
    );
  }

  /* Improved typing event sender with throttling */
  private typingThrottle: Subscription | null = null;
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
        this.typingThrottle.unsubscribe();
      }

      // Set throttle to prevent sending too many events
      this.typingThrottle = timer(this.TYPING_THROTTLE).subscribe(() => {
        this.typingThrottle = null;
      });
    }
  }

  ngAfterViewInit() {
    // Set up input event listeners for typing detection
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
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
      });
    });

    // Set up scroll listener for intelligent scrolling
    this.setupScrollListener();

    // Handle delayed operations using Angular hook instead of setTimeout
    this.handleDelayedOperations();
    
    // Initialize typing indicator position
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.ngZone.run(() => {
            this.updateTypingIndicatorPosition();
          });
        });
      });
    });
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
          // Messages are now handled directly without custom events
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
  }

  /**
   * Set up scroll listener to track user position
   */
  private setupScrollListener(): void {
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        if (this.messageContainer?.nativeElement) {
          this.messageContainer.nativeElement.addEventListener(
            'scroll',
            this.handleScroll.bind(this),
            { passive: true }
          );
        }
      });
    });
  }

  /**
   * Enhanced scroll detection with stricter button visibility rules
   */
  private handleScroll(): void {
    if (!this.messageContainer?.nativeElement || this.isLoadingMessages) return;

    const container = this.messageContainer.nativeElement;
    
    // Use mobile layout service for accurate scroll detection
    const distanceFromBottom = this.mobileChatLayoutService.getDistanceFromBottom(container);
    const isNearBottom = this.mobileChatLayoutService.isUserAtActualBottom(container);

    // FIXED: Show button ONLY when user scrolls up significantly
    const shouldShowButton = distanceFromBottom > 100; // Temporarily easier to trigger for testing

    // Update user position
    this.isUserAtBottom = isNearBottom;

    // Show/hide scroll to bottom button
    this.showScrollToBottomButton = shouldShowButton;

    // Reset new messages counter if user scrolled to bottom
    if (isNearBottom && this.newMessagesCount > 0) {
      this.newMessagesCount = 0;
    }

    // Mark messages as read when user manually scrolls to bottom
    if (isNearBottom && !this.hasMarkedMessagesAsRead) {
      this.hasMarkedMessagesAsRead = true; // Set immediately to prevent multiple calls
      // Use requestAnimationFrame chain to ensure user actually sees the messages
      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            requestAnimationFrame(() => {
              this.ngZone.run(() => {
                this.markMessagesAsReadWhenVisible();
              });
            });
          });
        });
      });
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
      // Check if we should actually auto-scroll based on user's position
      const container = this.messageContainer?.nativeElement;
      if (container && this.mobileChatLayoutService.shouldAutoScroll(container)) {
        this.scrollToBottom(false);
      }
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
    // Allow sending if there's either text content or an image attachment
    if ((!this.newMessage || !this.newMessage.trim()) && !this.attachedImage) {
      return;
    }

    // Store message content before sending
    const messageContent = this.newMessage || '';
    const imageAttachment = this.attachedImage;

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

    // TODO: Handle image attachment properly through the chat service
    // For now, we'll send the message and handle the image separately

    // Send message
    this.chat
      .send('', messageContent, imageAttachment || undefined)
      .then(() => {
        // Clear attachment after successful send
        if (imageAttachment) {
          URL.revokeObjectURL(imageAttachment.preview);
          this.attachedImage = null;
        }

        // Re-focus the input after sending
        this.ngZone.runOutsideAngular(() => {
          requestAnimationFrame(() => {
            if (this.messageInput?.nativeElement) {
              this.messageInput.nativeElement.focus();
            }
          });
        });

        // Scroll to bottom after sending
        this.ngZone.runOutsideAngular(() => {
          requestAnimationFrame(() => {
            this.ngZone.run(() => {
              this.scrollToBottom(true);
            });
          });
        });
      })
      .catch(error => {
        console.error('[ChatRoom] Error sending message:', error);

        // Handle send failure - potentially restore the message
        this.newMessage = messageContent;
        this.attachedImage = imageAttachment;
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
    // If textarea is empty, keep single row
    if (!textarea.value.trim()) {
      textarea.style.height = '';
      textarea.rows = 1;
      this.updateTypingIndicatorPosition();
      return;
    }

    // Use scrollHeight to determine if content actually overflows
    textarea.style.height = 'auto';
    textarea.rows = 1;
    
    const style = window.getComputedStyle(textarea);
    const lineHeight = parseInt(style.lineHeight) || parseInt(style.fontSize) * 1.2;
    const padding = parseInt(style.paddingTop) + parseInt(style.paddingBottom);
    const border = parseInt(style.borderTopWidth) + parseInt(style.borderBottomWidth);
    
    // Calculate single row height
    const singleRowHeight = lineHeight + padding + border;
    const currentScrollHeight = textarea.scrollHeight;
    
    // Only expand if content is actually overflowing (with small tolerance)
    if (currentScrollHeight > singleRowHeight + 2) {
      // Calculate how many rows we actually need based on scroll height
      const rowsNeeded = Math.min(Math.ceil(currentScrollHeight / lineHeight) - 1, 4);
      textarea.rows = Math.max(1, rowsNeeded);
    } else {
      // Content fits in current row, keep single row
      textarea.rows = 1;
    }
    
    // Clear any manual height
    textarea.style.height = '';
    
    // Update typing indicator position after resize
    this.updateTypingIndicatorPosition();
    
    // Force mobile layout service to recalculate chat-window height
    this.mobileChatLayoutService.forceUpdate();
    // Also manually trigger a recalculation to ensure immediate update
    this.updateChatWindowHeight();
    
    // Auto-scroll to keep last message visible when textarea expands
    this.autoScrollOnTextareaResize();
  }

  private updateChatWindowHeight() {
    // Get current chat-form height
    const chatForm = document.querySelector('.chat-form') as HTMLElement;
    if (chatForm) {
      const chatFormHeight = chatForm.offsetHeight;
      // Update the CSS variable directly
      document.documentElement.style.setProperty('--chat-form-height', `${chatFormHeight}px`);
    }
  }

  private autoScrollOnTextareaResize() {
    // Only auto-scroll if user was already at or near the bottom
    if (this.isUserAtBottom && this.messageContainer?.nativeElement) {
      // Use Angular's change detection cycle instead of setTimeout
      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => {
          this.ngZone.run(() => {
            this.scrollToBottom(false);
          });
        });
      });
    }
  }

  private updateTypingIndicatorPosition() {
    // Force update of mobile layout metrics
    this.mobileChatLayoutService.forceUpdate();
    
    // Keep desktop positioning logic for backwards compatibility
    const chatForm = document.querySelector('.chat-form') as HTMLElement;
    if (chatForm && window.innerWidth > 599) {
      const chatFormHeight = chatForm.offsetHeight;
      const typingIndicatorHeight = 35; // Desktop typing indicator height
      const spacing = 15; // More spacing for desktop
      document.documentElement.style.setProperty(
        '--scroll-button-bottom-desktop', 
        `calc(${chatFormHeight + typingIndicatorHeight + spacing}px)`
      );
    }
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
    this.scrollToBottom(true, true); // Mark as read when user explicitly scrolls

    // Messages are now handled directly without custom events
  }

  /**
   * Navigate back to chat list with explicit handling for mobile
   */
  navigateToList(event?: Event): void {
    if (event) {
      event.preventDefault();
    }

    this.loadingService.show('navigation');

    // Use requestAnimationFrame to ensure the navigation happens after current event cycle
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        this.ngZone.run(() => {
          this.router
            .navigate(['/chat'])
            .then(() => {
              this.loadingService.hide();
            })
            .catch(err => {
              console.error('Navigation to chat list failed:', err);
              this.loadingService.hide();

              // Fallback for stubborn mobile browsers
              window.location.href = '/chat';
            });
        });
      });
    });
  }

  /**
   * Improved scroll to bottom with smooth scrolling option
   */
  private scrollToBottom(smooth = false, markAsRead = false) {
    try {
      const el = this.messageContainer?.nativeElement;
      if (el) {
        // Use the mobile layout service for proper scroll handling
        this.mobileChatLayoutService.scrollToBottomWithLayout(el, smooth);

        // Clear any pending scroll timeout
        if (this.scrollTimeout) {
          clearTimeout(this.scrollTimeout);
          this.scrollTimeout = null;
        }

        // Only mark messages as read if explicitly requested (user action)
        if (markAsRead && !this.hasMarkedMessagesAsRead) {
          this.hasMarkedMessagesAsRead = true; // Set immediately to prevent multiple calls
          // Use requestAnimationFrame chain to wait for scroll to complete
          this.ngZone.runOutsideAngular(() => {
            requestAnimationFrame(() => {
              requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                  this.ngZone.run(() => {
                    this.markMessagesAsReadWhenVisible();
                  });
                });
              });
            });
          });
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

    // Focus edit input after view update
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        if (this.editInput?.nativeElement) {
          this.editInput.nativeElement.focus();
          this.autoResizeTextarea(this.editInput.nativeElement);
        }
      });
    });
  }

  cancelEdit() {
    this.editing = null;
    this.editDraft = '';

    // Re-focus the main input
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        if (this.messageInput?.nativeElement) {
          this.messageInput.nativeElement.focus();
        }
      });
    });
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
    if (
      confirm(
        'Your encryption keys are missing. This will generate new keys, but you will lose access to previous messages. Continue?'
      )
    ) {
      try {
        await this.chat.regenerateKeys();
      } catch (error) {
        console.error('[ChatRoom] Failed to regenerate keys:', error);
        alert(
          'Failed to regenerate encryption keys. Please try again or contact support.'
        );
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

  /**
   * Updates the mobile body background to match the current theme
   */
  private updateMobileBodyBackground(): void {
    const cardBg = getComputedStyle(document.documentElement).getPropertyValue('--card-background').trim();
    const defaultBg = this.themeService.isDarkTheme() ? '#0c2524' : '#fafafa';
    document.body.style.backgroundColor = cardBg || defaultBg;
  }

  ngOnDestroy() {
    document.body.classList.remove('chat-room-page');
    
    // Reset body background and clear mobile layout CSS variables
    if (window.innerWidth <= 599) {
      document.body.style.backgroundColor = '';
      
      // Restore overall page scroll
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.documentElement.style.height = '';
      document.body.style.height = '';
      
      // Remove scroll redirect listeners
      this.removeScrollRedirectListeners();
      
      // Clean up mobile layout CSS variables
      const root = document.documentElement;
      root.style.removeProperty('--chat-window-height');
      root.style.removeProperty('--scroll-button-bottom');
      root.style.removeProperty('--typing-indicator-bottom');
      root.style.removeProperty('--attachment-preview-bottom');
      root.style.removeProperty('--viewport-height');
      root.style.removeProperty('--chat-form-height');
    }

    // Reset the flag for next visit
    this.hasMarkedMessagesAsRead = false;

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
      this.typingThrottle.unsubscribe();
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
   * Handle chat input focus - re-check partner key status
   */
  private handleChatInputFocus(): void {
    this.chat.manuallyCheckKeyStatus();
  }

  /**
   * Handle emoji selection from picker
   */
  onEmojiSelected(emoji: string): void {
    if (this.editing) {
      this.editDraft += emoji;
    } else {
      this.newMessage += emoji;
    }

    // Auto-resize the textarea after adding emoji
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        if (this.editing && this.editInput?.nativeElement) {
          this.autoResizeTextarea(this.editInput.nativeElement);
        } else if (this.messageInput?.nativeElement) {
          this.autoResizeTextarea(this.messageInput.nativeElement);
        }
      });
    });
  }

  onImageSelected(compressedImage: CompressedImage): void {
    // Store the image for sending
    this.attachedImage = compressedImage;

    // Add placeholder text to show attachment
    const imageText = this.getTruncatedFilename(compressedImage.file.name);

    if (this.editing) {
      this.editDraft = imageText;
    } else {
      this.newMessage = imageText;
    }

    // Auto-resize textarea
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        if (this.editing && this.editInput?.nativeElement) {
          this.autoResizeTextarea(this.editInput.nativeElement);
        } else if (this.messageInput?.nativeElement) {
          this.autoResizeTextarea(this.messageInput.nativeElement);
        }
      });
    });
  }

  removeAttachedImage(): void {
    if (this.attachedImage) {
      URL.revokeObjectURL(this.attachedImage.preview);
      this.attachedImage = null;
      this.newMessage = '';
    }
  }

  getTruncatedFilename(filename: string): string {
    if (filename.length <= 14) {
      return filename;
    }
    return filename.substring(0, 18) + '...';
  }

  getDisplayText(text: string, hasImage?: boolean): string {
    // If this is an image message (has image and text looks like a filename)
    if (
      hasImage &&
      text &&
      (text.includes('.jpg') ||
        text.includes('.jpeg') ||
        text.includes('.png') ||
        text.includes('.gif') ||
        text.includes('.webp'))
    ) {
      // Remove "compressed_" prefix if present and truncate
      const cleanText = text.startsWith('compressed_') ? text.substring(11) : text;
      return this.getTruncatedFilename(cleanText);
    }
    return text;
  }

  /**
   * Format message text by replacing emojis with Material icons for system messages
   */
  formatMessageText(text: string): string {
    // Replace emoji-based system messages with text-only versions
    if (text === '🔒 Encrypted message (from partner)') {
      return 'Encrypted message (from partner)';
    }
    if (text.includes('🔒 Encrypted message (sent by you)')) {
      return text.replace('🔒 Encrypted message (sent by you)', 'Encrypted message (sent by you)');
    }
    if (text.includes('💬 Message sent')) {
      return text.replace('💬 Message sent', 'Message sent');
    }
    if (text === '⋯ message deleted ⋯') {
      return 'Message deleted';
    }
    return text;
  }

  /**
   * Check if message is a system message that needs special icon treatment
   */
  isSystemMessage(text: string): boolean {
    return text === '🔒 Encrypted message (from partner)' ||
           text.includes('🔒 Encrypted message (sent by you)') ||
           text.includes('💬 Message sent') ||
           text === '⋯ message deleted ⋯';
  }

  /**
   * Get the appropriate icon for system messages
   */
  getSystemMessageIcon(text: string): string {
    if (text === '⋯ message deleted ⋯') {
      return 'delete';
    }
    return 'lock';
  }

  openImageModal(imageUrl: string): void {
    // Convert data URL to blob URL for security
    if (imageUrl.startsWith('data:')) {
      try {
        // Convert data URL to blob
        const arr = imageUrl.split(',');
        const mime = arr[0].match(/:(.*?);/)?.[1];
        const bstr = atob(arr[1]);
        let n = bstr.length;
        const u8arr = new Uint8Array(n);
        while (n--) {
          u8arr[n] = bstr.charCodeAt(n);
        }
        const blob = new Blob([u8arr], { type: mime });

        // Create blob URL and open it
        const blobUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = blobUrl;
        link.target = '_blank';
        link.rel = 'noopener noreferrer';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up blob URL after a delay
        this.ngZone.runOutsideAngular(() => {
          // Use requestAnimationFrame for better performance than setTimeout
          let frameCount = 0;
          const cleanup = () => {
            frameCount++;
            if (frameCount < 60) { // Approximately 1 second at 60fps
              requestAnimationFrame(cleanup);
            } else {
              URL.revokeObjectURL(blobUrl);
            }
          };
          requestAnimationFrame(cleanup);
        });
      } catch (error) {
        console.error('Error opening image:', error);
      }
    } else {
      // Regular URL
      const link = document.createElement('a');
      link.href = imageUrl;
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  }

  /**
   * Add scroll event listeners to prevent scrolling on header, chat-header, and chat-form
   */
  private addScrollRedirectListeners(): void {
    // Target elements that should have scrolling disabled
    const targetSelectors = [
      'app-header',
      '.header', 
      '.chat-header',
      '.chat-form'
    ];

    targetSelectors.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        element.addEventListener('wheel', this.preventScroll, { passive: false });
        element.addEventListener('touchmove', this.preventTouchScroll, { passive: false });
      }
    });
  }

  /**
   * Remove scroll event listeners
   */
  private removeScrollRedirectListeners(): void {
    const targetSelectors = [
      'app-header',
      '.header', 
      '.chat-header',
      '.chat-form'
    ];

    targetSelectors.forEach(selector => {
      const element = document.querySelector(selector);
      if (element) {
        element.removeEventListener('wheel', this.preventScroll);
        element.removeEventListener('touchmove', this.preventTouchScroll);
      }
    });
  }

  /**
   * Prevent wheel scroll events on specific elements
   */
  private preventScroll = (event: Event): void => {
    // Don't prevent scroll if it's happening inside emoji picker
    const target = event.target as HTMLElement;
    if (target.closest('.emoji-picker')) {
      return;
    }
    event.preventDefault();
  }

  /**
   * Prevent touch scroll events but allow other touch interactions
   */
  private preventTouchScroll = (event: Event): void => {
    const touchEvent = event as TouchEvent;
    
    // Don't prevent scroll if it's happening inside emoji picker
    const target = touchEvent.target as HTMLElement;
    if (target.closest('.emoji-picker')) {
      return;
    }
    
    // Only prevent if this is a scroll gesture (not tap/click)
    if (touchEvent.touches.length === 1) {
      const touch = touchEvent.touches[0];
      if (this.lastTouchY !== undefined) {
        const deltaY = Math.abs(this.lastTouchY - touch.clientY);
        // Only prevent if there's significant vertical movement (scrolling)
        if (deltaY > 5) {
          event.preventDefault();
        }
      }
      this.lastTouchY = touch.clientY;
    }
  }

  private lastTouchY: number | undefined;
}
