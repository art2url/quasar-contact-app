import { Injectable, NgZone, OnDestroy, inject } from '@angular/core';
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
    scrollButtonBottomOffset: 0,
    typingIndicatorBottomOffset: 0,
    attachmentPreviewBottomOffset: 0,
  });

  // MutationObserver for tracking DOM changes
  private mutationObserver?: MutationObserver;

  // Removed unused constants to fix TypeScript warnings

  // Removed unused keyboard tracking variables to fix TypeScript warnings

  private ngZone = inject(NgZone);

  constructor() {
    this.initializeLayoutMonitoring();
  }

  private initializeLayoutMonitoring(): void {
    // Monitor viewport changes (includes keyboard show/hide)
    fromEvent(window, 'resize')
      .pipe(debounceTime(100), takeUntil(this.destroy$))
      .subscribe(() => {
        this.updateMetrics();
      });

    // Monitor visual viewport changes with much longer debounce to prevent keyboard freezing
    if (window.visualViewport) {
      fromEvent(window.visualViewport, 'resize')
        .pipe(debounceTime(300), takeUntil(this.destroy$)) // Increased from 16ms to 300ms
        .subscribe(() => {
          this.updateMetrics();
        });

      // Disable scroll monitoring completely as it's too aggressive for typing
      // fromEvent(window.visualViewport, 'scroll')
      //   .pipe(debounceTime(16), takeUntil(this.destroy$))
      //   .subscribe(() => {
      //     this.updateMetrics();
      //   });
    }

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

    // Monitor focus events to predict keyboard appearance
    this.setupFocusMonitoring();

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
          // Check if typing indicator, cache banner, or other dynamic elements changed
          const addedNodes = Array.from(mutation.addedNodes);
          const removedNodes = Array.from(mutation.removedNodes);

          const relevantChanges = [...addedNodes, ...removedNodes].some(node => {
            if (node.nodeType === Node.ELEMENT_NODE) {
              const element = node as Element;
              return (
                element.classList?.contains('typing-indicator') ||
                element.classList?.contains('cache-info-banner') ||
                element.classList?.contains('key-recovery-overlay') ||
                element.classList?.contains('partner-key-notification') ||
                element.tagName === 'APP-CACHE-INFO-BANNER'
              );
            }
            return false;
          });

          if (relevantChanges) {
            shouldUpdate = true;
          }
        }

        if (mutation.type === 'attributes') {
          const target = mutation.target as Element;
          if (
            target.classList?.contains('typing-indicator') ||
            target.classList?.contains('cache-info-banner') ||
            target.classList?.contains('key-recovery-overlay') ||
            target.classList?.contains('partner-key-notification')
          ) {
            shouldUpdate = true;
          }
        }
      });

      if (shouldUpdate) {
        // Debounce rapid mutations
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

  private setupFocusMonitoring(): void {
    // Completely disable focus monitoring to prevent keyboard freezing
    // CSS dvh units will handle layout automatically without JavaScript intervention
    // 
    // The original focus/blur event listeners were causing expensive updateMetrics() 
    // calls during typing which severely impacted virtual keyboard performance
  }

  private updateMetrics(): void {
    if (!this.isMobileView()) {
      return;
    }

    // Minimal implementation - let CSS dvh units handle everything
    // Only update the absolute minimum required for other components
    
    // Keyboard visibility tracking removed - CSS dvh units handle layout automatically

    // Only update chat-form-height CSS variable (minimal DOM work)
    const chatForm = document.querySelector('.chat-form') as HTMLElement;
    if (chatForm) {
      const chatFormHeight = chatForm.offsetHeight;
      document.documentElement.style.setProperty(
        '--chat-form-height',
        `${chatFormHeight}px`
      );
    }

    // Skip all other expensive calculations - CSS dvh units handle the layout
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

  // Removed unused styling methods to fix TypeScript warnings

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