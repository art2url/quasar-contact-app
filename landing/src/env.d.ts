/// <reference path="../.astro/types.d.ts" />
/// <reference types="astro/client" />

// Global window extensions for our functions
declare global {
  interface Window {
    closeAlphaBanner?: () => void;
    manageCookies?: () => void;
    closeCookieModal?: () => void;
    acceptAllCookies?: () => void;
    acceptAllFromModal?: () => void;
    savePreferences?: () => void;
    getCookieConsent?: () => any;
    getCookie?: (name: string) => string | null;
    setCookie?: (name: string, value: string, days?: number) => void;
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
