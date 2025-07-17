import { Injectable, OnDestroy, NgZone, inject } from '@angular/core';
import { BehaviorSubject, Subject, fromEvent } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';

export interface ChatLayoutMetrics {
  viewportHeight: number;
  availableChatHeight: number;
  chatFormHeight: number;
  typingIndicatorHeight: number;
  cacheInfoBannerHeight: number;
  scrollButtonBottomOffset: number;
  typingIndicatorBottomOffset: number;
  attachmentPreviewBottomOffset: number;
}

@Injectable({
  providedIn: 'root',
})
export class MobileChatLayoutService implements OnDestroy {
  private destroy$ = new Subject<void>();
  private metrics$ = new BehaviorSubject<ChatLayoutMetrics>({
    viewportHeight: 0,
    availableChatHeight: 0,
    chatFormHeight: 70,
    typingIndicatorHeight: 0,
    cacheInfoBannerHeight: 0,
    scrollButtonBottomOffset: 100,
    typingIndicatorBottomOffset: 58,
    attachmentPreviewBottomOffset: 80,
  });

  private mutationObserver?: MutationObserver;

  // Constants for mobile layout
  private readonly HEADER_HEIGHT = 56;
  private readonly CHAT_HEADER_HEIGHT = 60;
  private readonly MIN_CHAT_FORM_HEIGHT = 70;
  private readonly SPACING_SM = 8;
  private readonly SPACING_MD = 16;

  private ngZone = inject(NgZone);

  constructor() {
    this.initializeLayoutMonitoring();
  }

  private initializeLayoutMonitoring(): void {
    // Monitor viewport changes (includes keyboard show/hide)
    fromEvent(window, 'resize')
      .pipe(debounceTime(150), takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateMetrics();
      });

    // Monitor orientation changes
    fromEvent(window, 'orientationchange')
      .pipe(debounceTime(300), takeUntil(this.destroy$))
      .subscribe(() => {
        this.ngZone.runOutsideAngular(() => {
          requestAnimationFrame(() => {
            this.ngZone.run(() => {
              this.updateMetrics();
            });
          });
        });
      });

    // Monitor DOM changes for dynamic elements
    this.setupMutationObserver();

    // Initial calculation
    this.updateMetrics();
  }

  private setupMutationObserver(): void {
    if (!this.isMobileView()) return;

    const targetNode = document.querySelector('.chat-container') || document.body;

    this.mutationObserver = new MutationObserver(mutations => {
      let shouldUpdate = false;

      mutations.forEach(mutation => {
        if (mutation.type === 'childList') {
          // Check if any added/removed nodes are layout-affecting elements
          const affectedElements = [
            '.cache-info-banner',
            '.typing-indicator',
            '.key-recovery-overlay',
            '.partner-key-regenerated-overlay',
            '.chat-form',
          ];

          mutation.addedNodes.forEach(node => {
            if (node.nodeType === 1) {
              // Element node
              const element = node as HTMLElement;
              if (
                affectedElements.some(
                  selector =>
                    element.matches?.(selector) || element.querySelector?.(selector)
                )
              ) {
                shouldUpdate = true;
              }
            }
          });

          mutation.removedNodes.forEach(node => {
            if (node.nodeType === 1) {
              // Element node
              const element = node as HTMLElement;
              if (
                affectedElements.some(
                  selector =>
                    element.matches?.(selector) || element.querySelector?.(selector)
                )
              ) {
                shouldUpdate = true;
              }
            }
          });
        }

        if (mutation.type === 'attributes' && mutation.attributeName === 'style') {
          const element = mutation.target as HTMLElement;
          if (
            element.matches?.(
              '.cache-info-banner, .typing-indicator, .key-recovery-overlay, .partner-key-regenerated-overlay, .chat-form, .message-input, textarea'
            )
          ) {
            shouldUpdate = true;
          }
        }
      });

      if (shouldUpdate) {
        // Use NgZone + requestAnimationFrame to avoid excessive recalculations
        this.ngZone.runOutsideAngular(() => {
          requestAnimationFrame(() => {
            this.ngZone.run(() => {
              this.updateMetrics();
            });
          });
        });
      }
    });

    this.mutationObserver.observe(targetNode, {
      childList: true,
      subtree: true,
      attributes: true,
      attributeFilter: ['style', 'class'],
    });
  }

  private updateMetrics(): void {
    if (!this.isMobileView()) {
      return;
    }

    const viewportHeight = window.innerHeight;
    const visualViewportHeight = window.visualViewport?.height || viewportHeight;

    // Check if mobile keyboard is visible
    const isKeyboardVisible = viewportHeight > visualViewportHeight + 100;

    // Get actual element heights and visibility
    const chatFormHeight = this.getChatFormHeight();
    const typingIndicatorHeight = this.getTypingIndicatorHeight();
    const cacheInfoBannerHeight = this.getCacheInfoBannerHeight();
    const keyRecoveryOverlayHeight = this.getKeyRecoveryOverlayHeight();
    const partnerKeyNotificationHeight = this.getPartnerKeyNotificationHeight();

    // Calculate available height for chat window based on all visible elements
    const availableChatHeight = this.calculateAvailableChatHeight(
      isKeyboardVisible ? visualViewportHeight : viewportHeight,
      chatFormHeight,
      cacheInfoBannerHeight,
      keyRecoveryOverlayHeight,
      partnerKeyNotificationHeight
    );

    // Calculate positioning offsets
    const safeAreaBottom = this.getSafeAreaBottom();
    const scrollButtonBottomOffset = this.calculateScrollButtonPosition(
      chatFormHeight,
      typingIndicatorHeight,
      safeAreaBottom
    );

    const typingIndicatorBottomOffset = this.calculateTypingIndicatorPosition(
      chatFormHeight,
      safeAreaBottom
    );

    const attachmentPreviewBottomOffset = this.calculateAttachmentPreviewPosition(
      chatFormHeight,
      safeAreaBottom
    );

    const newMetrics: ChatLayoutMetrics = {
      viewportHeight: isKeyboardVisible ? visualViewportHeight : viewportHeight,
      availableChatHeight,
      chatFormHeight,
      typingIndicatorHeight,
      cacheInfoBannerHeight,
      scrollButtonBottomOffset,
      typingIndicatorBottomOffset,
      attachmentPreviewBottomOffset,
    };

    this.metrics$.next(newMetrics);
    this.applyCSSVariables(newMetrics);
  }

  private calculateAvailableChatHeight(
    viewportHeight: number,
    chatFormHeight: number,
    cacheInfoBannerHeight: number,
    keyRecoveryOverlayHeight: number,
    partnerKeyNotificationHeight: number
  ): number {
    // Simplified calculation: chat-window should fill chat-container minus elements that take space
    // Layout structure:
    // - chat-wrapper (fills viewport minus app header)
    //   - chat-header (60px, positioned above chat-container)
    //   - chat-container (flexible height)
    //     - cache-info-banner (if visible)
    //     - chat-window (flexible, should fill remaining space)
    //     - overlays (positioned absolute, don't affect layout)
    //   - chat-form (fixed at bottom, overlaps chat-container)

    // The chat-container gets: viewport - app-header - chat-header
    const chatContainerHeight =
      viewportHeight - this.HEADER_HEIGHT - this.CHAT_HEADER_HEIGHT;

    // Within chat-container, chat-window gets: container height - cache banner - chat-form overlap
    let chatWindowHeight = chatContainerHeight;

    // Subtract cache banner if visible (takes space at top of chat-container)
    if (cacheInfoBannerHeight > 0) {
      chatWindowHeight -= cacheInfoBannerHeight;
    }

    // Subtract chat-form height to prevent overlap (chat-form is fixed at bottom)
    chatWindowHeight -= chatFormHeight;

    // Overlays don't affect layout calculation (they're positioned absolute)
    // Just ensure minimum height if overlays are present
    if (keyRecoveryOverlayHeight > 0 || partnerKeyNotificationHeight > 0) {
      chatWindowHeight = Math.min(chatWindowHeight, 100);
    }

    // Return calculated height with reasonable minimum
    return Math.max(chatWindowHeight, 150);
  }

  private calculateScrollButtonPosition(
    chatFormHeight: number,
    typingIndicatorHeight: number,
    safeAreaBottom: number
  ): number {
    return chatFormHeight + typingIndicatorHeight + this.SPACING_MD + safeAreaBottom;
  }

  private calculateTypingIndicatorPosition(
    chatFormHeight: number,
    safeAreaBottom: number
  ): number {
    return chatFormHeight + safeAreaBottom;
  }

  private calculateAttachmentPreviewPosition(
    chatFormHeight: number,
    safeAreaBottom: number
  ): number {
    return chatFormHeight + this.SPACING_SM + safeAreaBottom;
  }

  private getChatFormHeight(): number {
    if (!this.isMobileView()) return this.MIN_CHAT_FORM_HEIGHT;

    const chatForm = document.querySelector('.chat-form') as HTMLElement;
    if (chatForm) {
      return chatForm.offsetHeight;
    }
    return this.MIN_CHAT_FORM_HEIGHT;
  }

  private getTypingIndicatorHeight(): number {
    if (!this.isMobileView()) return 0;

    const typingIndicator = document.querySelector('.typing-indicator') as HTMLElement;
    if (
      typingIndicator &&
      typingIndicator.offsetHeight > 0 &&
      !this.isElementHidden(typingIndicator)
    ) {
      return typingIndicator.offsetHeight;
    }
    return 0;
  }

  private getCacheInfoBannerHeight(): number {
    if (!this.isMobileView()) return 0;

    const cacheInfoBanner = document.querySelector('.cache-info-banner') as HTMLElement;
    if (
      cacheInfoBanner &&
      cacheInfoBanner.offsetHeight > 0 &&
      !this.isElementHidden(cacheInfoBanner)
    ) {
      return cacheInfoBanner.offsetHeight;
    }
    return 0;
  }

  private getKeyRecoveryOverlayHeight(): number {
    if (!this.isMobileView()) return 0;

    const keyRecoveryOverlay = document.querySelector(
      '.key-recovery-overlay'
    ) as HTMLElement;
    if (
      keyRecoveryOverlay &&
      keyRecoveryOverlay.offsetHeight > 0 &&
      !this.isElementHidden(keyRecoveryOverlay)
    ) {
      return keyRecoveryOverlay.offsetHeight;
    }
    return 0;
  }

  private getPartnerKeyNotificationHeight(): number {
    if (!this.isMobileView()) return 0;

    const partnerKeyNotification = document.querySelector(
      '.partner-key-regenerated-overlay'
    ) as HTMLElement;
    if (
      partnerKeyNotification &&
      partnerKeyNotification.offsetHeight > 0 &&
      !this.isElementHidden(partnerKeyNotification)
    ) {
      return partnerKeyNotification.offsetHeight;
    }
    return 0;
  }

  private isElementHidden(element: HTMLElement): boolean {
    const style = window.getComputedStyle(element);
    return (
      style.display === 'none' || style.visibility === 'hidden' || style.opacity === '0'
    );
  }

  private getSafeAreaBottom(): number {
    // Try to get CSS env value for safe area
    const testElement = document.createElement('div');
    testElement.style.paddingBottom = 'env(safe-area-inset-bottom)';
    document.body.appendChild(testElement);
    const safeArea = parseInt(getComputedStyle(testElement).paddingBottom) || 0;
    document.body.removeChild(testElement);
    return safeArea;
  }

  private isMobileView(): boolean {
    return window.innerWidth <= 768; // Increased breakpoint to cover more devices
  }

  private applyCSSVariables(metrics: ChatLayoutMetrics): void {
    const root = document.documentElement;

    // Critical: Update chat-form-height FIRST so other calculations can use it
    root.style.setProperty('--chat-form-height', `${metrics.chatFormHeight}px`);

    // Update CSS variables for dynamic positioning
    root.style.setProperty('--chat-window-height', `${metrics.availableChatHeight}px`);
    root.style.setProperty(
      '--cache-info-banner-height',
      `${metrics.cacheInfoBannerHeight}px`
    );
    root.style.setProperty(
      '--scroll-button-bottom',
      `${metrics.scrollButtonBottomOffset}px`
    );
    root.style.setProperty(
      '--typing-indicator-bottom',
      `${metrics.typingIndicatorBottomOffset}px`
    );
    root.style.setProperty(
      '--attachment-preview-bottom',
      `${metrics.attachmentPreviewBottomOffset}px`
    );
    root.style.setProperty('--viewport-height', `${metrics.viewportHeight}px`);
  }

  // Public methods for components to use
  public getMetrics(): ChatLayoutMetrics {
    return this.metrics$.value;
  }

  public getMetrics$() {
    return this.metrics$.asObservable();
  }

  public forceUpdate(): void {
    this.updateMetrics();
  }

  public isKeyboardVisible(): boolean {
    if (!this.isMobileView()) return false;
    const viewportHeight = window.innerHeight;
    const visualViewportHeight = window.visualViewport?.height || viewportHeight;
    return viewportHeight > visualViewportHeight + 100;
  }

  public scrollToBottomWithLayout(messageContainer: HTMLElement, smooth = false): void {
    // Don't force layout update during manual scroll - it causes position shifts
    // Just calculate the target scroll position with current layout
    const targetScrollTop = this.calculateTargetScrollPosition(messageContainer);

    if (smooth) {
      messageContainer.scrollTo({
        top: targetScrollTop,
        behavior: 'smooth',
      });
    } else {
      messageContainer.scrollTop = targetScrollTop;
    }
  }

  private calculateTargetScrollPosition(messageContainer: HTMLElement): number {
    // Since chat-window height is calculated to stop at chat-form edge,
    // we can use the simple scrollHeight approach
    return messageContainer.scrollHeight;
  }

  public isUserAtActualBottom(messageContainer: HTMLElement): boolean {
    const scrollTop = messageContainer.scrollTop;
    const scrollHeight = messageContainer.scrollHeight;
    const clientHeight = messageContainer.clientHeight;

    const distanceFromBottom = scrollHeight - (scrollTop + clientHeight);

    if (!this.isMobileView()) {
      return distanceFromBottom <= 50;
    }

    // Mobile view: Now that we have proper bottom padding, standard calculation should work
    // But we need a more generous threshold since the chat-form height varies
    const metrics = this.getMetrics();
    const threshold = Math.max(50, metrics.chatFormHeight * 0.5); // At least 50px or half chat-form height

    return distanceFromBottom <= threshold;
  }

  public getDistanceFromBottom(messageContainer: HTMLElement): number {
    const scrollTop = messageContainer.scrollTop;
    const scrollHeight = messageContainer.scrollHeight;
    const clientHeight = messageContainer.clientHeight;

    return scrollHeight - (scrollTop + clientHeight);
  }

  public isUserAtTrueBottom(messageContainer: HTMLElement): boolean {
    // Check if user has manually scrolled to the target bottom position
    const distanceFromBottom = this.getDistanceFromBottom(messageContainer);
    return distanceFromBottom <= 5; // Within 5px of target bottom
  }

  public shouldAutoScroll(messageContainer: HTMLElement): boolean {
    return this.isUserAtActualBottom(messageContainer);
  }

  ngOnDestroy(): void {
    this.destroy$.next();
    this.destroy$.complete();

    if (this.mutationObserver) {
      this.mutationObserver.disconnect();
      this.mutationObserver = undefined;
    }
  }
}
