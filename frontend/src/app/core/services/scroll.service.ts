import { Injectable, NgZone } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ScrollService {
  constructor(private ngZone: NgZone) {}

  /**
   * Scroll to top of the page to prevent showing preserved scroll positions
   * when navigating back from other pages (like chat-room)
   * 
   * This method uses multiple approaches for maximum browser compatibility
   * and handles various scroll containers that might exist in the app.
   */
  scrollToTop(): void {
    try {
      // Immediate scroll to top - multiple methods for cross-browser support
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      window.scrollTo(0, 0);
      document.documentElement.scrollTop = 0;
      document.body.scrollTop = 0;

      // Also handle any potential scroll containers that might exist in the app
      const scrollContainers = [
        document.querySelector('.main-content'),
        document.querySelector('.chat-list-container'),
        document.querySelector('.settings-container'),
        document.querySelector('app-chat-list'),
        document.querySelector('app-settings'),
        document.querySelector('mat-sidenav-content'),
        document.querySelector('.content-wrapper'),
        document.querySelector('.page-container')
      ];

      scrollContainers.forEach(container => {
        if (container) {
          container.scrollTop = 0;
        }
      });

      // Force immediate scroll with different timing approaches for stubborn browsers
      this.ngZone.runOutsideAngular(() => {
        // Immediate
        window.scrollTo(0, 0);
        
        // After next animation frame
        requestAnimationFrame(() => {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
          document.documentElement.scrollTop = 0;
          document.body.scrollTop = 0;
          
          // And once more after DOM settles
          requestAnimationFrame(() => {
            window.scrollTo(0, 0);
          });
        });
        
        // Also use setTimeout as backup for browsers with timing issues
        setTimeout(() => {
          window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
        }, 0);
      });

      console.log('[ScrollService] Executed scroll to top');
    } catch (error) {
      console.warn('[ScrollService] Error scrolling to top:', error);
    }
  }

  /**
   * Scroll to a specific element smoothly
   */
  scrollToElement(element: HTMLElement, behavior: ScrollBehavior = 'smooth'): void {
    try {
      element.scrollIntoView({ behavior, block: 'start', inline: 'nearest' });
    } catch (error) {
      console.warn('[ScrollService] Error scrolling to element:', error);
      // Fallback
      element.scrollIntoView();
    }
  }

  /**
   * Get current scroll position
   */
  getCurrentScrollPosition(): { x: number; y: number } {
    return {
      x: window.pageXOffset || document.documentElement.scrollLeft,
      y: window.pageYOffset || document.documentElement.scrollTop
    };
  }

  /**
   * Check if user is at the top of the page
   */
  isAtTop(): boolean {
    return (window.pageYOffset || document.documentElement.scrollTop) === 0;
  }

  /**
   * Check if user is at the bottom of the page
   */
  isAtBottom(): boolean {
    const scrollHeight = document.documentElement.scrollHeight;
    const scrollTop = window.pageYOffset || document.documentElement.scrollTop;
    const clientHeight = window.innerHeight;
    
    return Math.abs(scrollHeight - (scrollTop + clientHeight)) < 10;
  }
}