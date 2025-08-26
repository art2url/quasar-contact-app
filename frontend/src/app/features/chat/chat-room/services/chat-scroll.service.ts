import { Injectable, NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { MobileChatLayoutService } from './mobile-chat-layout.service';

@Injectable({
  providedIn: 'root'
})
export class ChatScrollService {
  private isUserAtBottom$ = new BehaviorSubject<boolean>(true);
  private shouldAutoScroll$ = new BehaviorSubject<boolean>(true);
  private showScrollToBottomButton$ = new BehaviorSubject<boolean>(false);
  private hasInitiallyScrolled = false;
  private scrollTimeout: ReturnType<typeof setTimeout> | null = null;

  constructor(
    private mobileChatLayoutService: MobileChatLayoutService,
    private ngZone: NgZone
  ) {}

  get isUserAtBottom() {
    return this.isUserAtBottom$.asObservable();
  }

  get shouldAutoScroll() {
    return this.shouldAutoScroll$.asObservable();
  }

  get showScrollToBottomButton() {
    return this.showScrollToBottomButton$.asObservable();
  }

  getCurrentScrollState() {
    return {
      isUserAtBottom: this.isUserAtBottom$.value,
      shouldAutoScroll: this.shouldAutoScroll$.value,
      showScrollButton: this.showScrollToBottomButton$.value,
      hasInitiallyScrolled: this.hasInitiallyScrolled
    };
  }

  /**
   * Set up scroll listener for intelligent scrolling
   */
  setupScrollListener(messageContainer: HTMLElement): void {
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        messageContainer.addEventListener(
          'scroll',
          this.handleScroll.bind(this),
          { passive: true }
        );
      });
    });
  }

  /**
   * Enhanced scroll detection with stricter button visibility rules
   */
  private handleScroll(event: Event): void {
    const container = event.target as HTMLElement;
    if (!container) return;

    // Use mobile layout service for accurate scroll detection
    const distanceFromBottom = this.mobileChatLayoutService.getDistanceFromBottom(container);
    const isNearBottom = this.mobileChatLayoutService.isUserAtActualBottom(container);

    // Show button ONLY when user scrolls up significantly
    const shouldShowButton = distanceFromBottom > 100;

    // Update states
    this.isUserAtBottom$.next(isNearBottom);
    this.showScrollToBottomButton$.next(shouldShowButton);

    // Scroll data is now available through observables
  }

  /**
   * Handle scroll events and return state for component
   */
  handleScrollEvent(container: HTMLElement): { isNearBottom: boolean; distanceFromBottom: number } {
    const distanceFromBottom = this.mobileChatLayoutService.getDistanceFromBottom(container);
    const isNearBottom = this.mobileChatLayoutService.isUserAtActualBottom(container);

    // Show button ONLY when user scrolls up significantly
    const shouldShowButton = distanceFromBottom > 100;

    // Update states
    this.isUserAtBottom$.next(isNearBottom);
    this.showScrollToBottomButton$.next(shouldShowButton);

    return { isNearBottom, distanceFromBottom };
  }

  /**
   * Scroll to bottom with optional smooth scrolling
   */
  scrollToBottom(messageContainer: HTMLElement, smooth = false, markAsRead = false): boolean {
    try {
      // Use the mobile layout service for proper scroll handling
      this.mobileChatLayoutService.scrollToBottomWithLayout(messageContainer, smooth);

      // Clear any pending scroll timeout
      if (this.scrollTimeout) {
        clearTimeout(this.scrollTimeout);
        this.scrollTimeout = null;
      }

      // Update states
      this.isUserAtBottom$.next(true);
      this.shouldAutoScroll$.next(false);
      this.showScrollToBottomButton$.next(false);

      return markAsRead;
    } catch (error) {
      console.error('Error scrolling to bottom:', error);
      return false;
    }
  }

  /**
   * Handle initial scroll after messages load
   */
  handleInitialScroll(messageContainer: HTMLElement): void {
    if (this.hasInitiallyScrolled) return;

    this.hasInitiallyScrolled = true;
    this.shouldAutoScroll$.next(true);

    // Scroll to bottom after ensuring layout is calculated
    this.ngZone.runOutsideAngular(() => {
      // Use multiple requestAnimationFrame calls to ensure layout is complete
      requestAnimationFrame(() => {
        // Force layout update before scrolling
        this.mobileChatLayoutService.forceUpdate();
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            this.ngZone.run(() => {
              this.scrollToBottom(messageContainer, true);
            });
          });
        });
      });
    });
  }

  /**
   * Handle new messages with intelligent auto-scroll
   */
  handleNewMessages(messageContainer: HTMLElement, newMessageCount: number): boolean {
    const currentState = this.getCurrentScrollState();
    
    if (!currentState.isUserAtBottom && newMessageCount > 0) {
      // User is not at bottom, don't auto-scroll
      return false;
    } else {
      // User is at bottom, auto-scroll
      this.shouldAutoScroll$.next(true);

      // Check if we should actually auto-scroll based on user's position
      if (this.mobileChatLayoutService.shouldAutoScroll(messageContainer)) {
        this.ngZone.runOutsideAngular(() => {
          requestAnimationFrame(() => {
            this.ngZone.run(() => {
              this.scrollToBottom(messageContainer, true);
            });
          });
        });
        return true;
      }
    }
    return false;
  }

  /**
   * Handle scroll to bottom button click
   */
  scrollToBottomClick(messageContainer: HTMLElement): boolean {
    this.isUserAtBottom$.next(true);
    this.shouldAutoScroll$.next(true);
    this.showScrollToBottomButton$.next(false);
    
    return this.scrollToBottom(messageContainer, true, true); // Mark as read when user explicitly scrolls
  }

  /**
   * Check if should auto-scroll during view checked
   */
  shouldAutoScrollInViewChecked(messageContainer: HTMLElement, isLoadingMessages: boolean): boolean {
    const currentState = this.getCurrentScrollState();
    
    // Only auto-scroll if conditions are met and not loading
    if (currentState.shouldAutoScroll && currentState.isUserAtBottom && !isLoadingMessages) {
      // Check if we should actually auto-scroll based on user's position
      if (this.mobileChatLayoutService.shouldAutoScroll(messageContainer)) {
        return this.scrollToBottom(messageContainer, false);
      }
    }
    return false;
  }

  /**
   * Handle auto-scroll on textarea resize
   */
  autoScrollOnTextareaResize(messageContainer: HTMLElement): void {
    // Only auto-scroll if user was already at or near the bottom
    if (this.isUserAtBottom$.value) {
      // Use Angular's change detection cycle instead of setTimeout
      this.ngZone.runOutsideAngular(() => {
        requestAnimationFrame(() => {
          this.ngZone.run(() => {
            this.scrollToBottom(messageContainer, false, false);
          });
        });
      });
    }
  }

  /**
   * Clean up scroll listeners
   */
  cleanup(messageContainer?: HTMLElement): void {
    if (messageContainer) {
      messageContainer.removeEventListener('scroll', this.handleScroll);
    }
    
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }
  }

  /**
   * Reset service state
   */
  reset(): void {
    this.isUserAtBottom$.next(true);
    this.shouldAutoScroll$.next(true);
    this.showScrollToBottomButton$.next(false);
    this.hasInitiallyScrolled = false;
    
    if (this.scrollTimeout) {
      clearTimeout(this.scrollTimeout);
      this.scrollTimeout = null;
    }
  }
}