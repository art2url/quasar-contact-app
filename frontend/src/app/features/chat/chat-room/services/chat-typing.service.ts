import { Injectable, NgZone } from '@angular/core';
import { Subject, Subscription, timer } from 'rxjs';
import { debounceTime, takeUntil } from 'rxjs/operators';
import { ChatSessionService } from '@services/chat-session.service';
import { MobileChatLayoutService } from './mobile-chat-layout.service';

@Injectable({
  providedIn: 'root'
})
export class ChatTypingService {
  private typingThrottle: Subscription | null = null;
  private lastTypingEvent = 0;
  private readonly TYPING_THROTTLE = 1000; // ms
  
  // Track typing state to prevent expensive layout updates during typing
  private isCurrentlyTyping = false;
  private typingStateSubject = new Subject<void>();
  private destroy$ = new Subject<void>();
  private lastTextareaRows = 1;

  constructor(
    private chat: ChatSessionService,
    private mobileChatLayoutService: MobileChatLayoutService,
    private ngZone: NgZone
  ) {
    this.setupTypingStateDebouncing();
  }

  /**
   * Set up typing state debouncing using RxJS to prevent memory leaks
   */
  private setupTypingStateDebouncing(): void {
    this.typingStateSubject
      .pipe(debounceTime(500), takeUntil(this.destroy$))
      .subscribe(() => {
        this.isCurrentlyTyping = false;
      });
  }

  /**
   * Handle user typing with throttling
   */
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

  /**
   * Handle typing input events
   */
  handleTyping(): void {
    const now = Date.now();

    // Only send typing event if enough time has passed
    if (now - this.lastTypingEvent > this.TYPING_THROTTLE) {
      this.lastTypingEvent = now;

      // Send typing event to chat session
      this.chat.sendTyping();
    }

    // Mark as actively typing to prevent expensive layout updates
    this.isCurrentlyTyping = true;

    // Use RxJS debouncing to reset typing state (prevents memory leaks)
    this.typingStateSubject.next();
  }

  /**
   * Handle keydown events for typing detection
   */
  handleKeydown(event: KeyboardEvent): void {
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

  /**
   * Auto resize textarea with performance optimization
   */
  autoResizeTextarea(
    textarea: HTMLTextAreaElement,
    onHeightChange?: () => void
  ): void {
    // Use JavaScript auto-resize on all devices to ensure proper 3-row limit
    const originalValue = textarea.value;
    
    // If textarea is empty, keep single row
    if (!originalValue.trim()) {
      textarea.rows = 1;
      textarea.style.height = '';
      
      // Check if we need to trigger layout update (shrinking from multiple rows to 1)
      if (this.lastTextareaRows !== 1) {
        this.lastTextareaRows = 1;
        if (onHeightChange) {
          onHeightChange();
        }
      }
      return;
    }

    // Reset to single row to get baseline measurement
    textarea.rows = 1;
    textarea.style.height = 'auto';
    
    const style = window.getComputedStyle(textarea);
    const lineHeight = parseInt(style.lineHeight) || parseInt(style.fontSize) * 1.4;
    const padding = parseInt(style.paddingTop) + parseInt(style.paddingBottom);
    const border = parseInt(style.borderTopWidth) + parseInt(style.borderBottomWidth);
    
    // Get the base height for one row
    const baseHeight = lineHeight + padding + border;
    const scrollHeight = textarea.scrollHeight;
    
    // Calculate the number of rows needed based on content
    // Use a more precise calculation that accounts for actual line breaks
    let calculatedRows = 1;
    
    // Check if content overflows the single row
    if (scrollHeight > baseHeight + 2) {
      // Calculate rows based on scroll height, being more precise
      const contentHeight = scrollHeight - padding - border;
      calculatedRows = Math.ceil(contentHeight / lineHeight);
      
      // Ensure we respect the 3-row limit and minimum is 1
      calculatedRows = Math.max(1, Math.min(3, calculatedRows));
    }
    
    // Apply the calculated rows
    textarea.rows = calculatedRows;
    textarea.style.height = '';
    
    // Only trigger layout updates when rows actually change
    const newRows = textarea.rows;
    if (newRows !== this.lastTextareaRows) {
      this.lastTextareaRows = newRows;
      
      // Call height change callback for layout updates
      if (onHeightChange) {
        onHeightChange();
      }
    }
  }

  /**
   * Set up input event listeners for typing detection
   */
  setupInputListeners(
    messageInput: HTMLElement,
    onTyping: () => void,
    onKeydown: (event: KeyboardEvent) => void,
    onFocus?: () => void
  ): void {
    this.ngZone.runOutsideAngular(() => {
      requestAnimationFrame(() => {
        if (messageInput) {
          // Use more reliable input events to detect typing
          messageInput.addEventListener('input', onTyping);
          messageInput.addEventListener('keydown', onKeydown);

          if (onFocus) {
            messageInput.addEventListener('focus', onFocus);
          }

          // Skip focus/blur listeners on mobile to prevent keyboard freezing
          if (window.innerWidth > 599 && onFocus) {
            messageInput.addEventListener('focus', onFocus);
          }
        }
      });
    });
  }

  /**
   * Update typing indicator position
   */
  updateTypingIndicatorPosition(): void {
    // Only update on desktop to avoid mobile performance issues
    if (window.innerWidth > 599) {
      const chatForm = document.querySelector('.chat-form') as HTMLElement;
      if (chatForm) {
        const chatFormHeight = chatForm.offsetHeight;
        const typingIndicatorHeight = 35; // Desktop typing indicator height
        const spacing = 15; // More spacing for desktop
        document.documentElement.style.setProperty(
          '--scroll-button-bottom-desktop',
          `calc(${chatFormHeight + typingIndicatorHeight + spacing}px)`
        );
      }
    } else {
      // Mobile-specific typing indicator positioning
      this.mobileChatLayoutService.updateTypingIndicatorPosition();
    }
  }

  /**
   * Update chat window height based on form changes
   */
  updateChatWindowHeight(): void {
    // Get current chat-form height
    const chatForm = document.querySelector('.chat-form') as HTMLElement;
    if (chatForm) {
      const chatFormHeight = chatForm.offsetHeight;
      // Update the CSS variable directly
      document.documentElement.style.setProperty(
        '--chat-form-height',
        `${chatFormHeight}px`
      );
    }
  }

  /**
   * Clean up typing-related resources
   */
  cleanup(messageInput?: HTMLElement): void {
    // Clear typing throttle
    if (this.typingThrottle) {
      this.typingThrottle.unsubscribe();
      this.typingThrottle = null;
    }

    // Remove event listeners if input provided
    if (messageInput) {
      messageInput.removeEventListener('input', this.handleTyping);
      messageInput.removeEventListener('keydown', this.handleKeydown);

      // Only remove focus/blur listeners if they were added (desktop only)
      // Note: Actual event listener removal would need proper function references
    }

    // Complete RxJS subjects to prevent memory leaks
    this.destroy$.next();
    this.destroy$.complete();
    this.typingStateSubject.complete();
  }

  /**
   * Reset typing service state
   */
  reset(): void {
    this.isCurrentlyTyping = false;
    this.lastTextareaRows = 1;
    this.lastTypingEvent = 0;
    
    if (this.typingThrottle) {
      this.typingThrottle.unsubscribe();
      this.typingThrottle = null;
    }
  }

  /**
   * Get current typing state
   */
  getCurrentTypingState(): boolean {
    return this.isCurrentlyTyping;
  }
}