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
      console.log('[MobileChatLayout] Not mobile view, skipping update');
      return;
    }

    console.log('[MobileChatLayout] Starting metrics update');

    // Use multiple viewport height detection methods for better browser compatibility
    let viewportHeight = window.innerHeight;
    let visualViewportHeight = viewportHeight;

    // Try visual viewport API (Safari/Chrome support)
    if (window.visualViewport?.height) {
      visualViewportHeight = window.visualViewport.height;
    } else {
      // Fallback for browsers without visual viewport API
      const docHeight = document.documentElement.clientHeight;
      if (docHeight > 0 && Math.abs(docHeight - viewportHeight) > 50) {
        visualViewportHeight = Math.min(docHeight, viewportHeight);
      }
    }

    // Check if mobile keyboard is visible with more conservative threshold
    const isKeyboardVisible = viewportHeight > visualViewportHeight + 150;

    console.log('[MobileChatLayout] Viewport info:', {
      viewportHeight,
      visualViewportHeight,
      isKeyboardVisible,
      userAgent: navigator.userAgent
    });

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

    console.log('[MobileChatLayout] Final metrics:', newMetrics);

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
    // Precise calculation: chat-window should fill exact space available
    // Layout structure:
    // - viewport height (full screen)
    //   - app header (56px)
    //   - chat header (60px) 
    //   - chat-window (calculated)
    //   - typing indicator (if visible, takes space from chat-window)
    //   - chat-form (actual measured height)

    // Start with full viewport
    let availableHeight = viewportHeight;

    // Subtract fixed app header
    availableHeight -= this.HEADER_HEIGHT; // 56px

    // Subtract chat header  
    availableHeight -= this.CHAT_HEADER_HEIGHT; // 60px

    // Subtract actual chat form height (not fixed 70px)
    availableHeight -= chatFormHeight;

    // Subtract cache banner if visible (takes space at top)
    if (cacheInfoBannerHeight > 0) {
      availableHeight -= cacheInfoBannerHeight;
    }

    // Subtract typing indicator height if visible (it should push content up)
    const typingIndicatorHeight = this.getTypingIndicatorHeight();
    if (typingIndicatorHeight > 0) {
      availableHeight -= typingIndicatorHeight;
    }

    // Don't subtract overlay heights as they're positioned absolute and don't affect layout
    // Just ensure minimum height if overlays are present
    if (keyRecoveryOverlayHeight > 0 || partnerKeyNotificationHeight > 0) {
      availableHeight = Math.min(availableHeight, 200);
    }

    console.log('[MobileChatLayout] Height calculation breakdown:', {
      startingViewport: viewportHeight,
      afterAppHeader: viewportHeight - this.HEADER_HEIGHT,
      afterChatHeader: viewportHeight - this.HEADER_HEIGHT - this.CHAT_HEADER_HEIGHT,
      afterChatForm: viewportHeight - this.HEADER_HEIGHT - this.CHAT_HEADER_HEIGHT - chatFormHeight,
      afterTypingIndicator: typingIndicatorHeight > 0 ? availableHeight + typingIndicatorHeight - typingIndicatorHeight : availableHeight,
      typingIndicatorHeight,
      afterCacheBanner: availableHeight,
      finalHeight: Math.max(availableHeight, 150)
    });

    // Return calculated height with reasonable minimum
    return Math.max(availableHeight, 150);
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
    // Typing indicator should appear just above the chat form
    // Position it exactly at the chat form height + safe area
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
      // Use multiple measurement methods for better browser compatibility
      let height = chatForm.offsetHeight;
      
      // Fallback to getBoundingClientRect if offsetHeight is 0
      if (height === 0) {
        const rect = chatForm.getBoundingClientRect();
        height = rect.height;
      }
      
      // Additional fallback using computed style
      if (height === 0) {
        const style = window.getComputedStyle(chatForm);
        const computedHeight = parseFloat(style.height);
        if (!isNaN(computedHeight) && computedHeight > 0) {
          height = computedHeight;
        }
      }
      
      // Ensure minimum height but use actual height if larger
      return Math.max(height, this.MIN_CHAT_FORM_HEIGHT);
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
    return window.innerWidth <= 599; // Match CSS mobile breakpoint exactly
  }

  private applyCSSVariables(metrics: ChatLayoutMetrics): void {
    try {
      const root = document.documentElement;

      // Critical: Update chat-form-height FIRST so other calculations can use it
      // Use multiple approaches for better browser compatibility
      const chatFormHeightValue = `${metrics.chatFormHeight}px`;
      
      root.style.setProperty('--chat-form-height', chatFormHeightValue);
      
      // Also set a fallback data attribute for browsers with CSS variable issues
      root.setAttribute('data-chat-form-height', chatFormHeightValue);

      // Update other CSS variables for dynamic positioning
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

      console.log('[MobileChatLayout] Applied CSS variables:', {
        chatFormHeight: chatFormHeightValue,
        chatWindowHeight: `${metrics.availableChatHeight}px`,
        viewportHeight: `${metrics.viewportHeight}px`
      });

      // NEW: Apply styles directly to elements as a fallback
      this.applyDirectStyles(metrics);

      // Force immediate style recalculation in problematic browsers
      if (this.needsForceRecalculation()) {
        this.forceStyleRecalculation();
      }
    } catch (error) {
      console.warn('[MobileChatLayout] Error applying CSS variables:', error);
      // Continue without CSS variables - the layout will use fallback values
    }
  }

  private applyDirectStyles(metrics: ChatLayoutMetrics): void {
    // Only apply direct styles on mobile devices
    if (!this.isMobileView()) {
      return;
    }

    // Apply styles directly to elements for browsers with CSS variable issues
    const chatWindow = document.querySelector('.chat-window') as HTMLElement;
    const chatForm = document.querySelector('.chat-form') as HTMLElement;
    
    if (!chatForm) {
      console.warn('[MobileChatLayout] Chat form not found, cannot apply direct styles');
      return;
    }

    // Get actual chat form height for precise calculation
    const actualChatFormHeight = chatForm.offsetHeight;
    const safeAreaBottom = this.getSafeAreaBottom();
    
    if (chatWindow) {
      console.log('[MobileChatLayout] Applying direct styles to chat-window');
      
      // Calculate height to fill exactly to the top of chat form
      const viewportHeight = window.innerHeight;
      const headerHeight = 56; // App header
      const chatHeaderHeight = 60; // Chat room header
      
      // Calculate precise height: viewport - headers - actual chat form height
      const preciseHeight = viewportHeight - headerHeight - chatHeaderHeight - actualChatFormHeight;
      
      chatWindow.style.height = `${preciseHeight}px`;
      chatWindow.style.maxHeight = `${preciseHeight}px`;
      
      console.log('[MobileChatLayout] Precise height calculation:', {
        viewportHeight,
        headerHeight,
        chatHeaderHeight,
        actualChatFormHeight,
        calculatedHeight: preciseHeight,
        originalMetricsHeight: metrics.availableChatHeight
      });
    }

    // Update typing indicator position - should push chat content up, not overlay
    const typingIndicator = document.querySelector('.typing-indicator') as HTMLElement;
    if (typingIndicator) {
      // For mobile, typing indicator should be positioned just above the chat form
      // and reduce the available space for chat-window (not overlay on top)
      const typingIndicatorBottom = actualChatFormHeight + safeAreaBottom;
      
      // Position it fixed to bottom, but the chat-window height calculation above
      // already accounts for its height, so content will be pushed up
      typingIndicator.style.bottom = `${typingIndicatorBottom}px`;
      typingIndicator.style.position = 'fixed';
      
      // Make it full-width like chat-window, with internal padding
      typingIndicator.style.left = '0';
      typingIndicator.style.right = '0';
      typingIndicator.style.width = 'auto';
      
      // Apply the same internal padding as chat-window (--spacing-md = 16px)
      typingIndicator.style.paddingLeft = '16px';
      typingIndicator.style.paddingRight = '16px';
      
      typingIndicator.style.zIndex = '1001';
      
      console.log('[MobileChatLayout] Typing indicator positioned at:', {
        chatFormHeight: actualChatFormHeight,
        safeAreaBottom,
        totalBottom: typingIndicatorBottom,
        layout: 'full-width with internal padding (16px)',
        element: typingIndicator,
        computedBottom: getComputedStyle(typingIndicator).bottom
      });
    }

    // Update scroll button position - should be above typing indicator area
    const scrollButton = document.querySelector('.scroll-to-bottom-btn') as HTMLElement;
    if (scrollButton) {
      const typingIndicatorHeight = 35; // Typical typing indicator height
      const buttonSpacing = 16; // Spacing above typing indicator
      const scrollButtonBottom = actualChatFormHeight + safeAreaBottom + typingIndicatorHeight + buttonSpacing;
      
      scrollButton.style.bottom = `${scrollButtonBottom}px`;
      
      console.log('[MobileChatLayout] Scroll button positioned at:', {
        chatFormHeight: actualChatFormHeight,
        safeAreaBottom,
        typingIndicatorHeight,
        buttonSpacing,
        totalBottom: scrollButtonBottom
      });
    }
  }

  private needsForceRecalculation(): boolean {
    // Detect browsers that need forced style recalculation
    const userAgent = navigator.userAgent.toLowerCase();
    return userAgent.includes('safari') && !userAgent.includes('chrome');
  }

  private forceStyleRecalculation(): void {
    // Force style recalculation for Safari and other problematic browsers
    const chatWindow = document.querySelector('.chat-window') as HTMLElement;
    if (chatWindow) {
      // Temporarily change a non-visual property to force recalculation
      const originalTransform = chatWindow.style.transform;
      chatWindow.style.transform = 'translateZ(0)';
      // Use requestAnimationFrame to restore after recalculation
      requestAnimationFrame(() => {
        chatWindow.style.transform = originalTransform;
      });
    }
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

  /**
   * Update typing indicator position specifically (can be called when typing state changes)
   */
  public updateTypingIndicatorPosition(): void {
    if (!this.isMobileView()) {
      return;
    }

    const typingIndicator = document.querySelector('.typing-indicator') as HTMLElement;
    const chatForm = document.querySelector('.chat-form') as HTMLElement;
    
    if (typingIndicator && chatForm) {
      const actualChatFormHeight = chatForm.offsetHeight;
      const safeAreaBottom = this.getSafeAreaBottom();
      const typingIndicatorBottom = actualChatFormHeight + safeAreaBottom;
      
      // Apply the position directly for reliable positioning
      typingIndicator.style.bottom = `${typingIndicatorBottom}px`;
      typingIndicator.style.position = 'fixed';
      
      // Make it full-width like chat-window, with internal padding
      typingIndicator.style.left = '0';
      typingIndicator.style.right = '0';
      typingIndicator.style.width = 'auto';
      
      // Apply the same internal padding as chat-window (--spacing-md = 16px)
      typingIndicator.style.paddingLeft = '16px';
      typingIndicator.style.paddingRight = '16px';
      
      typingIndicator.style.zIndex = '1001';
      
      console.log('[MobileChatLayout] Updated typing indicator position:', {
        chatFormHeight: actualChatFormHeight,
        safeAreaBottom,
        totalBottom: typingIndicatorBottom,
        layout: 'full-width with internal padding (16px)',
        visible: !this.isElementHidden(typingIndicator)
      });

      // IMPORTANT: Trigger full layout recalculation to adjust chat-window height
      // This ensures the chat content is pushed up when typing indicator appears
      this.updateMetrics();
    }
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
