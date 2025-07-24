import { Injectable } from '@angular/core';
import { environment } from '@environments/environment';
import { interval, timer } from 'rxjs';
import { ThemeService } from './theme.service';

declare const turnstile: {
  ready(callback: () => void): void;
  render(elementId: string, options: TurnstileOptions): string;
  reset(widgetId?: string): void;
  getResponse(widgetId?: string): string;
  remove(widgetId: string): void;
};

interface TurnstileOptions {
  sitekey: string;
  callback?: (token: string) => void;
  'expired-callback'?: () => void;
  'error-callback'?: () => void;
  theme?: 'light' | 'dark' | 'auto';
  size?: 'normal' | 'compact';
  action?: string;
}

@Injectable({
  providedIn: 'root',
})
export class TurnstileService {
  private siteKey = environment.turnstileSiteKey;

  constructor(private themeService: ThemeService) {}

  getSiteKey(): string {
    return this.siteKey;
  }

  renderTurnstile(elementId: string, callback: (token: string) => void): string {
    if (typeof turnstile === 'undefined') {
      throw new Error('Turnstile not loaded');
    }

    // Check if element exists
    const element = document.getElementById(elementId);
    if (!element) {
      throw new Error(`Element with ID '${elementId}' not found`);
    }

    const currentTheme = this.themeService.getCurrentTheme();
    const turnstileTheme = currentTheme === 'dark' ? 'dark' : 'light';

    const widgetId = turnstile.render(`#${elementId}`, {
      sitekey: this.siteKey,
      callback: callback,
      theme: turnstileTheme,
      size: 'normal',
      'expired-callback': () => {
        // Turnstile token expired
      },
      'error-callback': () => {
        // Turnstile error occurred - handled silently
      },
    });

    return widgetId;
  }

  resetTurnstile(widgetId?: string): void {
    if (typeof turnstile !== 'undefined') {
      try {
        if (widgetId !== undefined) {
          turnstile.reset(widgetId);
        } else {
          turnstile.reset();
        }
      } catch (_error) {
        // Silently ignore Turnstile reset errors during component destruction
      }
    }
  }

  getTurnstileResponse(widgetId?: string): string {
    if (typeof turnstile === 'undefined') {
      return '';
    }

    if (widgetId !== undefined) {
      return turnstile.getResponse(widgetId);
    } else {
      return turnstile.getResponse();
    }
  }

  removeTurnstile(widgetId: string): void {
    if (typeof turnstile !== 'undefined') {
      try {
        turnstile.remove(widgetId);
      } catch (_error) {
        // Silently ignore Turnstile remove errors
      }
    }
  }

  /**
   * Initialize Turnstile widget with proper loading checks using interval polling
   */
  async initializeTurnstile(
    elementId: string,
    callback: (token: string) => void
  ): Promise<string> {
    return new Promise((resolve, reject) => {
      // Check if Turnstile is already available
      if (typeof turnstile !== 'undefined') {
        try {
          const widgetId = this.renderTurnstile(elementId, callback);
          resolve(widgetId);
          return;
        } catch (error) {
          reject(error);
          return;
        }
      }

      // Use interval to poll for Turnstile availability
      const maxAttempts = 50; // 5 seconds total (100ms * 50)
      let attempts = 0;

      const pollInterval = interval(100).subscribe(() => {
        attempts++;

        if (typeof turnstile !== 'undefined') {
          try {
            const widgetId = this.renderTurnstile(elementId, callback);
            resolve(widgetId);
            pollInterval.unsubscribe();
          } catch (error) {
            reject(error);
            pollInterval.unsubscribe();
          }
        } else if (attempts >= maxAttempts) {
          reject(
            new Error('Failed to load security verification. Please refresh the page.')
          );
          pollInterval.unsubscribe();
        }
      });
    });
  }

  /**
   * Reset Turnstile widget and clear token
   */
  resetTurnstileWidget(widgetId?: string): void {
    if (widgetId !== undefined) {
      this.resetTurnstile(widgetId);
    }
  }

  /**
   * Re-render Turnstile widget after DOM recreation (for theme changes)
   */
  async reRenderTurnstile(
    elementId: string,
    callback: (token: string) => void,
    currentWidgetId?: string
  ): Promise<string> {
    // Remove the current widget if it exists
    if (currentWidgetId !== undefined) {
      this.removeTurnstile(currentWidgetId);
    }

    // Completely remove and recreate the DOM element
    const turnstileElement = document.getElementById(elementId);
    if (turnstileElement && turnstileElement.parentNode) {
      const parent = turnstileElement.parentNode;
      const newElement = document.createElement('div');
      newElement.id = elementId;
      parent.replaceChild(newElement, turnstileElement);
    }

    // Initialize with the new element
    return this.initializeTurnstile(elementId, callback);
  }

  /**
   * Re-render Turnstile with current theme when theme changes
   */
  reRenderWithTheme(
    elementId: string,
    callback: (token: string) => void,
    currentWidgetId?: string
  ): Promise<string> {
    return new Promise(resolve => {
      // Remove the current widget if it exists
      if (currentWidgetId !== undefined) {
        this.removeTurnstile(currentWidgetId);
      }

      // Wait a bit for the removal to complete before rendering new widget
      timer(150).subscribe(() => {
        const newWidgetId = this.renderTurnstile(elementId, callback);
        resolve(newWidgetId);
      });
    });
  }
}
