import { Injectable, NgZone } from '@angular/core';
import { Subject, Subscription } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ChatSessionService } from '@services/chat-session.service';
import { LoadingService } from '@services/loading.service';
import { ThemeService } from '@services/theme.service';
import { WebSocketService } from '@services/websocket.service';
import { MobileChatLayoutService } from './mobile-chat-layout.service';
import { ChatMsg } from '@models/chat.model';
import { CompressedImage } from '@shared/components/image-attachment/image-attachment.component';
import { formatMessageTime, formatDateHeader, getStartOfDay } from '@utils/date.util';

// Import all specialized services
import { ChatMessageService, MessageGroup } from './chat-message.service';
import { ChatScrollService } from './chat-scroll.service';
import { ChatTypingService } from './chat-typing.service';
import { ChatUiStateService } from './chat-ui-state.service';
import { ChatEventHandlerService } from './chat-event-handler.service';
import { ChatLifecycleService } from './chat-lifecycle.service';

@Injectable()
export class ChatRoomFacadeService {
  private subs = new Subscription();
  private editInputElement?: HTMLElement;
  private messageInputElement?: HTMLTextAreaElement;

  // Component state
  receiverId = '';
  partnerAvatar = '';
  isPartnerOnline = false;
  isPartnerTyping = false;
  myAvatar = localStorage.getItem('myAvatar') || 'assets/images/avatars/01.svg';

  // Template properties
  messageGroups: MessageGroup[] = [];
  newMessage = '';
  editing: ChatMsg | null = null;
  editDraft = '';
  attachedImage: CompressedImage | null = null;
  isLoadingMessages = true;
  showCacheInfoBanner = false;
  newMessagesCount = 0;
  showScrollToBottomButton = false;

  // Original component state that was missing
  private reported = new Set<string>();
  private isInitialized = false;
  private isUserAtBottom = true;
  private lastMessageCount = 0;
  private scrollTimeout: ReturnType<typeof setTimeout> | null = null;
  private hasInitiallyScrolled = false;
  private typingStateSubject = new Subject<void>();
  private destroy$ = new Subject<void>();
  private changeDetectionCallback?: () => void;

  constructor(
    public chat: ChatSessionService,
    private ws: WebSocketService,
    private loadingService: LoadingService,
    private mobileChatLayoutService: MobileChatLayoutService,
    private themeService: ThemeService,
    private ngZone: NgZone,
    private chatMessageService: ChatMessageService,
    private chatScrollService: ChatScrollService,
    private chatTypingService: ChatTypingService,
    private chatUiStateService: ChatUiStateService,
    private chatEventHandlerService: ChatEventHandlerService,
    private chatLifecycleService: ChatLifecycleService
  ) {}

  /**
   * Initialize the entire chat room with full original logic
   */
  async initialize(receiverId?: string): Promise<void> {
    // Reset all state when initializing with a new receiverId
    if (receiverId && receiverId !== this.receiverId) {
      this.resetState();
      this.receiverId = receiverId;
    } else if (receiverId) {
      this.receiverId = receiverId;
    }
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
    }

    // Initialize mobile layout service for dynamic height calculations
    this.initializeMobileLayout();

    // Reset the flag for this chat room

    if (!this.receiverId) {
      console.error('No receiverId provided to facade initialize');
      return;
    }

    // Emit chat room entered event for header badge updates
    this.emitChatRoomEnteredEvent();

    // Set up typing state debouncing to prevent memory leaks
    this.setupTypingStateDebouncing();

    // Initialize once only
    try {
      await this.initializeOnce();

      // Subscribe to service states for reactive updates
      this.subscribeToServiceStates();
    } catch {
      this.loadingService.hide();
      this.navigateToList();
    }
  }

  /**
   * Reset all state for new chat room
   */
  private resetState(): void {
    // Clean up existing subscriptions
    this.cleanup();

    // Reset all component state
    this.receiverId = '';
    this.partnerAvatar = '';
    this.isPartnerOnline = false;
    this.isPartnerTyping = false;
    this.messageGroups = [];
    this.newMessage = '';
    this.editing = null;
    this.editDraft = '';
    this.attachedImage = null;
    this.isLoadingMessages = true;
    this.showCacheInfoBanner = false;
    this.newMessagesCount = 0;
    this.showScrollToBottomButton = false;

    // Reset private state
    this.reported.clear();
    this.isInitialized = false;
    this.isUserAtBottom = true;
    this.lastMessageCount = 0;
    this.hasInitiallyScrolled = false;

    // Clear any timeouts
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }

    // Reset all service states
    this.chatMessageService.reset();
    this.chatScrollService.reset();
    this.chatUiStateService.reset();

    // Create new subscription container
    this.subs = new Subscription();
  }

  /**
   * Set change detection callback
   */
  setChangeDetectionCallback(callback: () => void): void {
    this.changeDetectionCallback = callback;
  }

  /**
   * Initialize view after DOM is ready
   */
  initializeView(
    messageContainer: HTMLElement,
    messageInput: HTMLElement,
    editInput?: HTMLElement
  ): void {
    this.editInputElement = editInput;
    this.messageInputElement = messageInput as HTMLTextAreaElement;

    // Set up online status callback
    this.chatEventHandlerService.setOnlineStatusCallback(
      this.updatePartnerOnlineStatus.bind(this)
    );

    this.chatEventHandlerService.initializeEventHandlers(
      this.receiverId,
      messageContainer
    );
    this.chatScrollService.setupScrollListener(messageContainer);
    this.chatTypingService.setupInputListeners(
      messageInput,
      this.handleTyping.bind(this),
      this.handleKeydown.bind(this),
      this.handleChatInputFocus.bind(this)
    );
    this.chatTypingService.updateTypingIndicatorPosition();
  }

  /**
   * Handle view checked lifecycle
   */
  handleViewChecked(messageContainer: HTMLElement): void {
    this.chatScrollService.shouldAutoScrollInViewChecked(
      messageContainer,
      this.chatUiStateService.getCurrentLoadingState()
    );
  }

  /**
   * Handle component destruction
   */
  cleanup(messageContainer?: HTMLElement, messageInput?: HTMLElement): void {
    this.chatLifecycleService.cleanup();
    this.chatTypingService.cleanup(messageInput);
    this.chatScrollService.cleanup(messageContainer);
    this.chatMessageService.reset();
    this.chatUiStateService.reset();
    this.subs.unsubscribe();
  }

  // Event handlers
  onResize(messageContainer?: HTMLElement): void {
    if (messageContainer) {
      const scrollState = this.chatScrollService.getCurrentScrollState();
      if (scrollState.isUserAtBottom) {
        this.chatScrollService.scrollToBottom(messageContainer, false);
      }
    }
    this.chatTypingService.updateTypingIndicatorPosition();
  }

  onWindowFocus(): void {
    this.chat.manuallyCheckKeyStatus();
  }

  onVisibilityChange(): void {
    if (!document.hidden) {
      this.chat.manuallyCheckKeyStatus();
    }
  }

  /**
   * Update partner online status
   */
  updatePartnerOnlineStatus(isOnline: boolean): void {
    this.isPartnerOnline = isOnline;
  }

  handleScroll(messageContainer: HTMLElement): void {
    const shouldMarkAsRead = this.chatEventHandlerService.handleScroll(messageContainer);

    if (shouldMarkAsRead) {
      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.ngZone.run(() => {
              this.chatEventHandlerService.markMessagesAsReadWhenVisible(this.receiverId);
            });
          });
        });
      });
    }
  }

  // Input handlers
  onType(messageInput: HTMLElement): void {
    this.handleTyping();
    this.chatUiStateService.setNewMessage(this.newMessage);

    const messageContainer = document.querySelector('.chat-window') as HTMLElement;
    
    // Use JavaScript-based auto-resize on all devices for consistent 3-row limit
    this.chatTypingService.autoResizeTextarea(
      messageInput as HTMLTextAreaElement,
      () => {
        if (messageContainer) {
          this.chatScrollService.autoScrollOnTextareaResize(messageContainer);
        }
      }
    );
  }

  onTypeEdit(editInput: HTMLElement): void {
    this.chatUiStateService.setEditDraft(this.editDraft);

    const messageContainer = document.querySelector('.chat-window') as HTMLElement;
    
    // Use JavaScript-based auto-resize for edit textarea too
    this.chatTypingService.autoResizeTextarea(
      editInput as HTMLTextAreaElement,
      () => {
        if (messageContainer) {
          this.chatScrollService.autoScrollOnTextareaResize(messageContainer);
        }
        this.chatTypingService.updateChatWindowHeight();
        this.chatTypingService.updateTypingIndicatorPosition();
      }
    );
  }

  onKeydownEnter(event: Event): void {
    const kbdEvent = event as KeyboardEvent;
    if (kbdEvent.ctrlKey || kbdEvent.metaKey) return;
    event.preventDefault();
    this.send();
  }

  onKeydownCtrlEnter(event: Event): void {
    event.preventDefault();
    this.newMessage = this.newMessage + '\n';
    this.chatUiStateService.setNewMessage(this.newMessage);
  }

  onKeydownMetaEnter(event: Event): void {
    event.preventDefault();
    this.newMessage = this.newMessage + '\n';
    this.chatUiStateService.setNewMessage(this.newMessage);
  }

  onKeydownEnterEdit(event: Event): void {
    const kbdEvent = event as KeyboardEvent;
    if (kbdEvent.ctrlKey || kbdEvent.metaKey) return;
    event.preventDefault();
    this.confirmEdit();
  }

  onKeydownCtrlEnterEdit(event: Event): void {
    event.preventDefault();
    this.editDraft = this.editDraft + '\n';
    this.chatUiStateService.setEditDraft(this.editDraft);
  }

  onKeydownMetaEnterEdit(event: Event): void {
    event.preventDefault();
    this.editDraft = this.editDraft + '\n';
    this.chatUiStateService.setEditDraft(this.editDraft);
  }

  // Message actions
  send(): void {
    const { content, image } = this.chatUiStateService.prepareMessageForSending();

    if ((!content || !content.trim()) && !image) return;

    // Clear the Angular model - this will update the textarea through two-way binding
    this.newMessage = '';
    this.chatUiStateService.setNewMessage('');
    
    // If we have a reference to the textarea element, reset its visual state
    if (this.messageInputElement) {
      // Force reset to default state
      this.messageInputElement.rows = 1;
      this.messageInputElement.style.height = '';
      // Update layout since we changed the rows
      this.chatTypingService.updateChatWindowHeight();
      this.chatTypingService.updateTypingIndicatorPosition();
    }

    this.chatMessageService.resetNewMessagesCount();
    const container = document.querySelector('.chat-window') as HTMLElement;
    if (container) {
      this.chatScrollService.scrollToBottomClick(container);
    }

    this.chat
      .send('', content, image || undefined)
      .then(() => {
        if (this.messageInputElement) {
          this.ngZone.runOutsideAngular(() => {
            requestAnimationFrame(() => this.messageInputElement!.focus());
          });
        }

        if (container) {
          this.ngZone.runOutsideAngular(() => {
            requestAnimationFrame(() => {
              this.ngZone.run(() => {
                this.chatScrollService.scrollToBottom(container, true);
              });
            });
          });
        }
      })
      .catch(error => {
        console.error('[ChatRoom] Error sending message:', error);
        this.chatUiStateService.restoreMessageAfterFailure(content, image);
      });
  }

  scrollToBottomClick(): void {
    const container = document.querySelector('.chat-window') as HTMLElement;
    if (container) {
      this.chatScrollService.scrollToBottomClick(container);
    }
    this.chatMessageService.resetNewMessagesCount();
  }

  // Edit actions
  beginEdit(message: ChatMsg): void {
    if (!this.chatMessageService.canEditMessage(message)) {
      alert('Cannot edit this message - original text is no longer available.');
      return;
    }

    this.chatUiStateService.beginEdit(message);
    this.editing = message;
    this.editDraft = message.text;

    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        // Use querySelector since *ngIf="editing" creates the element after beginEdit is called
        const editInput = document.querySelector('textarea[name="editDraft"]') as HTMLTextAreaElement;
        if (editInput) {
          editInput.focus();
          // Auto-resize to fit the content being edited
          this.chatTypingService.autoResizeTextarea(editInput, () => {
            this.chatTypingService.updateChatWindowHeight();
            this.chatTypingService.updateTypingIndicatorPosition();
          });
        }
      });
    });
  }

  cancelEdit(): void {
    this.chatUiStateService.cancelEdit();
    this.editing = null;
    this.editDraft = '';

    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        const messageInput = document.querySelector('#messageInput') as HTMLElement;
        messageInput?.focus();
      });
    });
  }

  async confirmEdit(): Promise<void> {
    const editing = this.editing;
    const editDraft = this.editDraft;

    if (!editing || !editDraft.trim()) return;

    await this.chat.editMessage(editing.id!, editDraft.trim());
    this.cancelEdit();
  }

  delete(message: ChatMsg): void {
    if (!message.id || !this.chatMessageService.canEditMessage(message)) {
      alert('Cannot delete this message - original text is no longer available.');
      return;
    }

    if (confirm('Delete this message for everyone?')) {
      this.chat.deleteMessage(message.id);
    }
  }

  // Utility methods
  onEmojiSelected(emoji: string): void {
    this.chatUiStateService.onEmojiSelected(emoji);
    if (this.editing) {
      this.editDraft = this.chatUiStateService.getCurrentEditDraft();
    } else {
      this.newMessage = this.chatUiStateService.getCurrentNewMessage();
    }
  }

  onImageSelected(compressedImage: CompressedImage): void {
    this.chatUiStateService.onImageSelected(compressedImage);
    this.attachedImage = compressedImage;

    const imageText = this.chatUiStateService.getCurrentNewMessage();
    if (this.editing) {
      this.editDraft = imageText;
    } else {
      this.newMessage = imageText;
    }

    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        const input = this.editing
          ? (this.editInputElement as HTMLTextAreaElement)
          : (document.querySelector('#messageInput') as HTMLTextAreaElement);
        if (input) {
          this.chatTypingService.autoResizeTextarea(input);
        }
      });
    });
  }

  removeAttachedImage(): void {
    this.chatUiStateService.removeAttachedImage();
    this.attachedImage = null;
    this.newMessage = '';
  }

  openImageModal(imageUrl: string): void {
    const link = document.createElement('a');
    link.href = imageUrl;
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  }

  // Template helper methods
  trackByTs(_: number, m: { ts: number }): number {
    return m.ts;
  }

  trackByDate(_: number, group: MessageGroup): number {
    return group.dateTimestamp;
  }

  formatMessageTime(timestamp: number): string {
    return formatMessageTime(timestamp);
  }

  getFullTimestamp(timestamp: number): string {
    return new Date(timestamp).toLocaleString();
  }

  getMessageAvatar(message: ChatMsg): string {
    if (message.sender === 'You') {
      return message.avatarUrl || this.myAvatar || 'assets/images/avatars/01.svg';
    }
    return message.avatarUrl || this.partnerAvatar || 'assets/images/avatars/01.svg';
  }

  getPartnerAvatar(): string {
    return this.partnerAvatar || 'assets/images/avatars/01.svg';
  }

  onAvatarError(event: Event): void {
    const img = event.target as HTMLImageElement;
    img.src = 'assets/images/avatars/01.svg';
  }

  onMessageAvatarError(event: Event, message: ChatMsg): void {
    const img = event.target as HTMLImageElement;

    if (message.sender === 'You') {
      img.src = this.myAvatar;
    } else {
      img.src = this.getPartnerAvatar();
    }
  }

  // Delegate methods to services
  isMessageUnreadable = (message: ChatMsg) =>
    this.chatMessageService.isMessageUnreadable(message);
  isMessageEncrypted = (message: ChatMsg) =>
    this.chatMessageService.isMessageEncrypted(message);
  canEditMessage = (message: ChatMsg) => this.chatMessageService.canEditMessage(message);
  isSystemMessage = (message: ChatMsg | string) => this.chatMessageService.isSystemMessage(message);
  getSystemMessageIcon = (text: string) =>
    this.chatMessageService.getSystemMessageIcon(text);
  getTruncatedFilename = (filename: string) =>
    this.chatMessageService.getTruncatedFilename(filename);
  getDisplayText = (text: string, hasImage?: boolean) =>
    this.chatMessageService.getDisplayText(text, hasImage);

  navigateToList = (event?: Event) => this.chatLifecycleService.navigateToList(event);
  isChatBlocked = () => this.chatLifecycleService.isChatBlocked();
  getChatInputPlaceholder = () => this.chatLifecycleService.getChatInputPlaceholder();
  regenerateEncryptionKeys = () => this.chatLifecycleService.regenerateEncryptionKeys();
  reloadPage = () => this.chatLifecycleService.reloadPage();
  checkPartnerKeyStatus = () => this.chatLifecycleService.checkPartnerKeyStatus();

  private handleTyping(): void {
    this.chatTypingService.handleTyping();
  }

  private handleKeydown(event: KeyboardEvent): void {
    this.chatTypingService.handleKeydown(event);
  }

  private handleChatInputFocus(): void {
    this.chat.manuallyCheckKeyStatus();
  }

  /**
   * Set up typing state debouncing using RxJS to prevent memory leaks
   */
  private setupTypingStateDebouncing(): void {
    this.subs.add(
      this.typingStateSubject
        .pipe(debounceTime(500), takeUntil(this.destroy$))
        .subscribe(() => {
          // Typing state reset handled by typing service
        })
    );
  }

  private emitChatRoomEnteredEvent(): void {
    window.dispatchEvent(
      new CustomEvent('chat-room-entered', {
        detail: { roomId: this.receiverId },
      })
    );
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

            // Scroll to bottom after ensuring layout is calculated
            this.ngZone.runOutsideAngular(() => {
              // Use multiple requestAnimationFrame calls to ensure layout is complete
              requestAnimationFrame(() => {
                // Force layout update before scrolling
                this.mobileChatLayoutService.forceUpdate();
                requestAnimationFrame(() => {
                  requestAnimationFrame(() => {
                    this.ngZone.run(() => {
                      const container = document.querySelector(
                        '.chat-window'
                      ) as HTMLElement;
                      if (container) {
                        this.chatScrollService.scrollToBottom(container, true);
                      }
                    });
                  });
                });
              });
            });
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

      // Enhanced partner online status tracking
      this.setupOnlineStatusTracking();

      // Get partner's avatar ONCE
      this.subs.add(
        this.chat.theirAvatar$.subscribe(avatar => {
          this.partnerAvatar = avatar;
        })
      );

      // Monitor key status changes and trigger change detection when needed
      this.subs.add(
        this.chat.myPrivateKeyMissing$.subscribe(missing => {
          if (missing === true && !this.chat.keyLoading$.value) {
            // Only mark keys as missing if this is genuine key loss, not artificial blocking
            if (!this.chat.isArtificialKeyMissingState) {
              this.chat.ensureKeysMissingFlagSet();
            }

            // Force change detection
            if (this.changeDetectionCallback) {
              this.changeDetectionCallback();
            }
          }
        })
      );

      // Enhanced auto-mark messages as read and update header counter
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
      } else {
        // User is at bottom, reset counter and auto-scroll
        this.newMessagesCount = 0;
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
        this.isPartnerOnline = Array.isArray(onlineUsers)
          ? onlineUsers.includes(this.receiverId)
          : false;
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
          
          // Force change detection for template updates
          if (this.changeDetectionCallback) {
            this.changeDetectionCallback();
          }
          
          // Update typing indicator position when visibility changes
          this.ngZone.runOutsideAngular(() => {
            requestAnimationFrame(() => {
              this.ngZone.run(() => {
                this.chatTypingService.updateTypingIndicatorPosition();
              });
            });
          });
        });
      })
    );
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
        (m.isSystemMessage === true || 
         m.text === 'Encrypted message (sent by you)' ||
         m.text === 'Message encrypted with previous keys (unreadable after key regeneration)')
    );

    if (hasUnreadableSentMessages && !this.showCacheInfoBanner) {
      this.showCacheInfoBanner = true;
    }
  }

  /**
   * Updates the mobile body background to match the current theme
   */
  private updateMobileBodyBackground(): void {
    const cardBg = getComputedStyle(document.documentElement)
      .getPropertyValue('--card-background')
      .trim();
    const defaultBg = this.themeService.isDarkTheme() ? '#0c2524' : '#fafafa';
    document.body.style.backgroundColor = cardBg || defaultBg;
  }

  /**
   * Initialize mobile layout with retry mechanism for better browser compatibility
   */
  private initializeMobileLayout(): void {
    if (window.innerWidth > 599) return;

    // Force immediate update
    this.mobileChatLayoutService.forceUpdate();

    // Set up retry mechanism using requestAnimationFrame for browsers that need more time
    let retryCount = 0;
    const maxRetries = 5;

    const retryLayoutUpdate = () => {
      retryCount++;

      this.ngZone.runOutsideAngular(() => {
        // Use requestAnimationFrame chain instead of setTimeout
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.ngZone.run(() => {
              this.mobileChatLayoutService.forceUpdate();

              // Check if layout was applied correctly
              const chatForm = document.querySelector('.chat-form') as HTMLElement;
              const chatWindow = document.querySelector('.chat-window') as HTMLElement;

              if (chatForm && chatWindow) {
                const chatFormHeight = chatForm.offsetHeight;
                const chatWindowHeight = chatWindow.offsetHeight;
                const windowHeight = window.innerHeight;

                // Check if height looks reasonable
                const expectedHeight = windowHeight - 56 - 60 - chatFormHeight; // viewport - header - chat-header - form
                const heightDiff = Math.abs(chatWindowHeight - expectedHeight);

                if (heightDiff > 50 && retryCount < maxRetries) {
                  retryLayoutUpdate();
                }
              } else if (retryCount < maxRetries) {
                retryLayoutUpdate();
              }
            });
          });
        });
      });
    };

    // Start retries after DOM settles
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.ngZone.run(() => {
            retryLayoutUpdate();
          });
        });
      });
    });

    // Also force updates on window events
    const forceUpdate = () => {
      this.mobileChatLayoutService.forceUpdate();
    };

    window.addEventListener('resize', forceUpdate);
    window.addEventListener('orientationchange', forceUpdate);

    // Clean up listeners in component destroy
    this.subs.add({
      unsubscribe: () => {
        window.removeEventListener('resize', forceUpdate);
        window.removeEventListener('orientationchange', forceUpdate);
      },
    });
  }

  private subscribeToServiceStates(): void {
    // Subscribe to all service states for template binding
    this.subs.add(
      this.chatMessageService.messageGroups.subscribe(
        groups => (this.messageGroups = groups)
      )
    );
    this.subs.add(
      this.chatUiStateService.newMessage.subscribe(message => (this.newMessage = message))
    );
    this.subs.add(
      this.chatUiStateService.editing.subscribe(editing => (this.editing = editing))
    );
    this.subs.add(
      this.chatUiStateService.editDraft.subscribe(draft => (this.editDraft = draft))
    );
    this.subs.add(
      this.chatUiStateService.attachedImage.subscribe(
        image => (this.attachedImage = image)
      )
    );
    this.subs.add(
      this.chatUiStateService.isLoadingMessages.subscribe(
        loading => (this.isLoadingMessages = loading)
      )
    );
    this.subs.add(
      this.chatUiStateService.showCacheInfoBanner.subscribe(
        show => (this.showCacheInfoBanner = show)
      )
    );
    this.subs.add(
      this.chatMessageService.newMessagesCount.subscribe(
        count => (this.newMessagesCount = count)
      )
    );
    this.subs.add(
      this.chatScrollService.showScrollToBottomButton.subscribe(
        show => (this.showScrollToBottomButton = show)
      )
    );

    // partnerTyping$ is already handled in setupTypingIndicatorSubscription()
    this.subs.add(
      this.chat.theirAvatar$.subscribe(
        avatar => (this.partnerAvatar = avatar || 'assets/images/avatars/01.svg')
      )
    );
  }
}
