import { Injectable, NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { ChatSessionService } from '@services/chat-session.service';
import { LoadingService } from '@services/loading.service';
import { ThemeService } from '@services/theme.service';
import { MobileChatLayoutService } from './mobile-chat-layout.service';
import { ChatEventHandlerService } from './chat-event-handler.service';
import { ChatUiStateService } from './chat-ui-state.service';

@Injectable({
  providedIn: 'root'
})
export class ChatLifecycleService {
  private isInitialized = false;

  constructor(
    private router: Router,
    private chat: ChatSessionService,
    private loadingService: LoadingService,
    private themeService: ThemeService,
    private mobileChatLayoutService: MobileChatLayoutService,
    private chatEventHandlerService: ChatEventHandlerService,
    private chatUiStateService: ChatUiStateService,
    private ngZone: NgZone
  ) {}

  /**
   * Initialize chat room with all necessary setup
   */
  async initializeChatRoom(receiverId: string, messageContainer?: HTMLElement): Promise<boolean> {
    if (this.isInitialized) {
      return true;
    }

    if (!receiverId) {
      this.navigateToList();
      return false;
    }

    this.loadingService.show('chat-room-init');

    try {
      // Initialize mobile layout
      this.initializeMobileLayout();

      // Initialize chat session
      await this.chat.init(receiverId);

      // Set up event handlers
      if (messageContainer) {
        this.chatEventHandlerService.initializeEventHandlers(receiverId, messageContainer);
      }

      // Get partner's avatar
      this.chat.theirAvatar$.subscribe(() => {
        // Avatar handled by component
      });

      this.isInitialized = true;
      return true;
    } catch (error) {
      console.error('Chat initialization failed:', error);
      this.navigateToList();
      return false;
    } finally {
      this.loadingService.hide();
    }
  }

  /**
   * Initialize mobile layout with retry mechanism
   */
  private initializeMobileLayout(): void {
    if (window.innerWidth > 599) return;

    // Set body background for mobile
    this.updateMobileBodyBackground();

    // Subscribe to theme changes
    this.themeService.theme$.subscribe(() => {
      this.updateMobileBodyBackground();
    });

    // Block overall page scroll in mobile
    document.documentElement.style.overflow = 'hidden';
    document.body.style.overflow = 'hidden';
    document.documentElement.style.height = '100vh';
    document.body.style.height = '100vh';

    // Force immediate update
    this.mobileChatLayoutService.forceUpdate();

    // Set up retry mechanism
    this.setupLayoutRetry();
  }

  /**
   * Set up retry mechanism for layout updates
   */
  private setupLayoutRetry(): void {
    let retryCount = 0;
    const maxRetries = 5;

    const retryLayoutUpdate = () => {
      retryCount++;

      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.ngZone.run(() => {
              this.mobileChatLayoutService.forceUpdate();

              const chatForm = document.querySelector('.chat-form') as HTMLElement;
              const chatWindow = document.querySelector('.chat-window') as HTMLElement;

              if (chatForm && chatWindow) {
                const chatFormHeight = chatForm.offsetHeight;
                const chatWindowHeight = chatWindow.offsetHeight;
                const windowHeight = window.innerHeight;

                const expectedHeight = windowHeight - 56 - 60 - chatFormHeight;
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

    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        requestAnimationFrame(() => {
          this.ngZone.run(() => {
            retryLayoutUpdate();
          });
        });
      });
    });
  }

  /**
   * Updates mobile body background to match theme
   */
  private updateMobileBodyBackground(): void {
    const cardBg = getComputedStyle(document.documentElement)
      .getPropertyValue('--card-background')
      .trim();
    const defaultBg = this.themeService.isDarkTheme() ? '#0c2524' : '#fafafa';
    document.body.style.backgroundColor = cardBg || defaultBg;
  }

  /**
   * Navigate back to chat list
   */
  navigateToList(event?: Event): void {
    if (event) {
      event.preventDefault();
    }

    this.loadingService.show('navigation');

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
              window.location.href = '/chat';
            });
        });
      });
    });
  }

  /**
   * Cleanup lifecycle service
   */
  cleanup(): void {
    document.body.classList.remove('chat-room-page');

    // Reset mobile layout
    if (window.innerWidth <= 599) {
      document.body.style.backgroundColor = '';
      document.documentElement.style.overflow = '';
      document.body.style.overflow = '';
      document.documentElement.style.height = '';
      document.body.style.height = '';

      // Clean up CSS variables
      const root = document.documentElement;
      root.style.removeProperty('--chat-window-height');
      root.style.removeProperty('--scroll-button-bottom');
      root.style.removeProperty('--typing-indicator-bottom');
      root.style.removeProperty('--attachment-preview-bottom');
      root.style.removeProperty('--viewport-height');
      root.style.removeProperty('--chat-form-height');
    }

    this.chatUiStateService.setMarkedMessagesAsRead(false);
    this.chatEventHandlerService.cleanup();
    this.isInitialized = false;
  }

  /**
   * Get chat blocked status
   */
  isChatBlocked(): boolean {
    if (this.chatUiStateService.getCurrentLoadingState()) {
      return true;
    }

    const myPrivateKeyMissing = this.chat.myPrivateKeyMissing$.value;
    if (myPrivateKeyMissing) {
      return true;
    }

    const keyMissing = this.chat.keyMissing$.value;
    if (keyMissing) {
      return true;
    }

    const partnerKeyRegenerated = this.chat.showPartnerKeyRegeneratedNotification$.value;
    if (partnerKeyRegenerated) {
      return true;
    }

    return false;
  }

  /**
   * Get appropriate placeholder text for chat input
   */
  getChatInputPlaceholder(): string {
    if (this.chatUiStateService.getCurrentLoadingState()) {
      return 'Loading messages...';
    }

    const myPrivateKeyMissing = this.chat.myPrivateKeyMissing$.value;
    if (myPrivateKeyMissing) {
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
   * Handle private key regeneration
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
   * Check partner key status
   */
  checkPartnerKeyStatus(): void {
    this.chat.manuallyCheckKeyStatus();
  }
}