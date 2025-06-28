import { Injectable } from '@angular/core';
import { environment } from '@environments/environment';

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
}

@Injectable({
  providedIn: 'root',
})
export class RecaptchaService {
  private siteKey = environment.recaptchaSiteKey;

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

  renderRecaptcha(
    elementId: string,
    callback: (token: string) => void
  ): number {
    if (typeof grecaptcha === 'undefined') {
      throw new Error('reCAPTCHA not loaded');
    }

    return grecaptcha.render(elementId, {
      sitekey: this.siteKey,
      callback: callback,
      'expired-callback': () => {
        // Handle token expiration
        console.log('reCAPTCHA token expired');
      },
      'error-callback': () => {
        // Handle errors
        console.error('reCAPTCHA error occurred');
      },
    });
  }

  resetRecaptcha(widgetId?: number): void {
    if (typeof grecaptcha !== 'undefined') {
      if (widgetId !== undefined) {
        grecaptcha.reset(widgetId);
      } else {
        grecaptcha.reset();
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
}
