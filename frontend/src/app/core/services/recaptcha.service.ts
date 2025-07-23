import { Injectable } from '@angular/core';
import { environment } from '@environments/environment';
import { timer } from 'rxjs';
import { ThemeService } from './theme.service';

declare const grecaptcha: {
  ready(callback: () => void): void;
  execute(siteKey: string, options: { action: string }): Promise<string>;
  render(elementId: string, options: RecaptchaOptions): number;
  reset(widgetId?: number): void;
  getResponse(widgetId?: number): string;
};

interface RecaptchaOptions {
  sitekey: string;
  callback: (token: string) => void;
  'expired-callback': () => void;
  'error-callback': () => void;
  theme?: 'light' | 'dark';
}

@Injectable({
  providedIn: 'root',
})
export class RecaptchaService {
  private siteKey = environment.recaptchaSiteKey;

  constructor(private themeService: ThemeService) {}

  getSiteKey(): string {
    return this.siteKey;
  }

  async executeRecaptcha(action: string): Promise<string> {
    return new Promise((resolve, reject) => {
      if (typeof grecaptcha === 'undefined') {
        reject('reCAPTCHA not loaded');
        return;
      }

      grecaptcha.ready(() => {
        grecaptcha
          .execute(this.siteKey, { action })
          .then((token: string) => {
            resolve(token);
          })
          .catch((error: unknown) => {
            reject(error);
          });
      });
    });
  }

  renderRecaptcha(elementId: string, callback: (token: string) => void): number {
    if (typeof grecaptcha === 'undefined') {
      throw new Error('reCAPTCHA not loaded');
    }

    const currentTheme = this.themeService.getCurrentTheme();
    const recaptchaTheme = currentTheme === 'dark' ? 'dark' : 'light';

    try {
      return grecaptcha.render(elementId, {
        sitekey: this.siteKey,
        callback: callback,
        theme: recaptchaTheme,
        'expired-callback': () => {
          // reCAPTCHA token expired
        },
        'error-callback': () => {
          console.error('reCAPTCHA error occurred');
          // Don't throw error, just log it to prevent app crashes
        },
      });
    } catch (error) {
      console.error('Failed to render reCAPTCHA:', error);
      throw error;
    }
  }

  resetRecaptcha(widgetId?: number): void {
    if (typeof grecaptcha !== 'undefined') {
      try {
        if (widgetId !== undefined) {
          grecaptcha.reset(widgetId);
        } else {
          grecaptcha.reset();
        }
      } catch (error) {
        // Silently ignore reCAPTCHA reset errors during component destruction
        console.debug('reCAPTCHA reset error (ignored):', error);
      }
    }
  }

  getRecaptchaResponse(widgetId?: number): string {
    if (typeof grecaptcha === 'undefined') {
      return '';
    }

    if (widgetId !== undefined) {
      return grecaptcha.getResponse(widgetId);
    } else {
      return grecaptcha.getResponse();
    }
  }

  /**
   * Initialize reCAPTCHA widget with proper loading checks and retries
   */
  async initializeRecaptcha(
    elementId: string,
    callback: (token: string) => void,
    retryCount = 0
  ): Promise<number> {
    const maxRetries = 3;

    return new Promise((resolve, reject) => {
      // Wait for reCAPTCHA to be ready before initializing
      if (typeof grecaptcha !== 'undefined' && grecaptcha.ready) {
        grecaptcha.ready(() => {
          try {
            const widgetId = this.renderRecaptcha(elementId, callback);
            resolve(widgetId);
          } catch (error) {
            if (retryCount < maxRetries) {
              // Retry reCAPTCHA initialization
              this.initializeRecaptcha(elementId, callback, retryCount + 1)
                .then(resolve)
                .catch(reject);
            } else {
              console.error(
                'reCAPTCHA initialization failed after',
                maxRetries + 1,
                'attempts:',
                error
              );
              reject(
                new Error(
                  'Failed to load security verification. Please refresh the page.'
                )
              );
            }
          }
        });
      } else {
        // Fallback for when grecaptcha is not yet available
        if (retryCount < maxRetries) {
          // Wait a bit before retrying
          setTimeout(() => {
            this.initializeRecaptcha(elementId, callback, retryCount + 1)
              .then(resolve)
              .catch(reject);
          }, 300);
        } else {
          console.error('reCAPTCHA script not loaded after', maxRetries + 1, 'attempts');
          reject(
            new Error('Failed to load security verification. Please refresh the page.')
          );
        }
      }
    });
  }

  /**
   * Reset reCAPTCHA widget and clear token
   */
  resetRecaptchaWidget(widgetId?: number): void {
    if (widgetId !== undefined) {
      this.resetRecaptcha(widgetId);
    }
  }

  /**
   * Re-render reCAPTCHA widget after DOM recreation (for theme changes)
   */
  async reRenderRecaptcha(
    elementId: string,
    callback: (token: string) => void,
    currentWidgetId?: number
  ): Promise<number> {
    // Reset the current widget if it exists
    if (currentWidgetId !== undefined) {
      this.resetRecaptcha(currentWidgetId);
    }

    // Completely remove and recreate the DOM element
    const recaptchaElement = document.getElementById(elementId);
    if (recaptchaElement && recaptchaElement.parentNode) {
      const parent = recaptchaElement.parentNode;
      const newElement = document.createElement('div');
      newElement.id = elementId;
      parent.replaceChild(newElement, recaptchaElement);
    }

    // Initialize with the new element
    return this.initializeRecaptcha(elementId, callback);
  }

  /**
   * Re-render reCAPTCHA with current theme when theme changes
   */
  reRenderWithTheme(
    elementId: string,
    callback: (token: string) => void,
    currentWidgetId?: number
  ): Promise<number> {
    return new Promise(resolve => {
      // Reset the current widget if it exists
      if (currentWidgetId !== undefined) {
        // Resetting reCAPTCHA widget
        this.resetRecaptcha(currentWidgetId);
      }

      // Wait a bit for the reset to complete before rendering new widget
      timer(150).subscribe(() => {
        // Rendering new reCAPTCHA with theme
        const newWidgetId = this.renderRecaptcha(elementId, callback);
        resolve(newWidgetId);
      });
    });
  }
}
