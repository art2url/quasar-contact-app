import { timer } from 'rxjs';
import { Injectable } from '@angular/core';
import { environment } from '@environments/environment';
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
