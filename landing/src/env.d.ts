/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Global window extensions for our functions
declare global {
  interface Window {
    closeBetaBanner?: () => void;
    manageCookies?: () => void;
    closeCookieModal?: () => void;
    acceptAllCookies?: () => void;
    acceptAllFromModal?: () => void;
    savePreferences?: () => void;
    getCookieConsent?: () => any;
    getCookie?: (name: string) => string | null;
    setCookie?: (name: string, value: string, days?: number) => void;
    toggleFaq?: (element: HTMLElement) => void;
    trackCustomEvent?: (
      eventName: string,
      category: string,
      label: string,
      value?: number
    ) => void;

    // Google Analytics related
    GA_MEASUREMENT_ID?: string;
    gtag?: (...args: any[]) => void;
    dataLayer?: any[];
    cookieConsentManager?: any;

    // Mobile menu functions
    toggleMobileMenu?: () => void;
    closeMobileMenu?: () => void;
  }
}

// Environment variables
interface ImportMetaEnv {
  readonly GA_MEASUREMENT_ID: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

export {};
