// Simple Cookie Consent & Batched Analytics
class CookieConsentManager {
  constructor() {
    this.analyticsEnabled = false;
    this.clientId = this.getOrCreateClientId();
    this.eventQueue = [];
    this.batchTimer = null;
    this.consentExists = false;
    this.init();
  }

  init() {
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initializeApp());
    } else {
      this.initializeApp();
    }

    window.addEventListener('click', event => {
      const modal = document.getElementById('cookieModal');
      if (event.target === modal) this.closeCookieModal();
    });

    this.exposeGlobalFunctions();
  }

  initializeApp() {
    // Check if inline script already detected consent
    const hasConsentFlag =
      document.documentElement.getAttribute('data-cookies-accepted') === 'true';
    const consent = this.getCookieConsent();

    this.consentExists =
      hasConsentFlag || (consent && this.hasRealConsent(consent));

    if (this.consentExists) {
      // User has made a choice - ensure banner stays hidden
      this.hideCookieBannerPermanently();

      if (consent && consent.analytics) {
        this.enableAnalytics();
      }
    } else {
      // No consent yet - show banner with smooth animation
      this.showCookieBannerAnimated();
    }
  }

  // Check if user made a real choice (not all false)
  hasRealConsent(consent) {
    return (
      consent && (consent.essential || consent.preferences || consent.analytics)
    );
  }

  getOrCreateClientId() {
    let clientId = localStorage.getItem('ga_client_id');
    if (!clientId) {
      clientId = Date.now() + '.' + Math.random().toString(36).substring(2);
      localStorage.setItem('ga_client_id', clientId);
    }
    return clientId;
  }

  async sendEvent(eventName, params = {}) {
    if (!this.analyticsEnabled) return;

    // Add event to queue instead of sending immediately
    this.eventQueue.push({
      name: eventName,
      params: {
        page_title: document.title,
        page_location: window.location.href,
        timestamp: Date.now(),
        ...params,
      },
    });

    // Start batch timer if not already running
    if (!this.batchTimer) {
      this.batchTimer = setTimeout(() => this.sendBatch(), 30000); // Send every 30 seconds
    }

    // Send immediately if queue gets too large
    if (this.eventQueue.length >= 10) {
      this.sendBatch();
    }
  }

  async sendBatch() {
    if (this.eventQueue.length === 0) return;

    const eventsToSend = [...this.eventQueue];
    this.eventQueue = [];

    if (this.batchTimer) {
      clearTimeout(this.batchTimer);
      this.batchTimer = null;
    }

    try {
      await fetch('/api/analytics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          client_id: this.clientId,
          events: eventsToSend,
        }),
      });
      // Analytics batch sent successfully
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Analytics batch error:', error);
      // Re-queue events on failure (optional)
      // this.eventQueue.unshift(...eventsToSend);
    }
  }

  enableAnalytics() {
    this.analyticsEnabled = true;
    // Analytics enabled

    // Send page view
    this.sendEvent('page_view');

    // Setup click tracking
    document.addEventListener('click', e => {
      if (!this.analyticsEnabled) return;

      if (e.target.tagName === 'BUTTON' || e.target.closest('button')) {
        const button =
          e.target.tagName === 'BUTTON' ? e.target : e.target.closest('button');
        this.sendEvent('click', {
          event_category: 'Button',
          event_label: button.textContent?.trim(),
        });
      }

      if (e.target.tagName === 'A') {
        this.sendEvent('click', {
          event_category: 'Link',
          event_label: e.target.textContent?.trim(),
        });
      }
    });

    // Send remaining events before page unload
    window.addEventListener('beforeunload', () => {
      if (this.eventQueue.length > 0) {
        // Use sendBeacon for reliability during page unload
        const data = JSON.stringify({
          client_id: this.clientId,
          events: this.eventQueue,
        });

        if (navigator.sendBeacon) {
          navigator.sendBeacon('/api/analytics', data);
        } else {
          // Fallback for older browsers
          this.sendBatch();
        }
      }
    });
  }

  disableAnalytics() {
    this.analyticsEnabled = false;
    // Analytics disabled
  }

  // Cookie management
  showCookieBanner() {
    const banner = document.getElementById('cookieBanner');
    if (banner && !this.consentExists) {
      document.body.classList.add('cookies-showing');
      document.body.classList.remove('cookies-hidden');
      banner.classList.add('show');
      banner.classList.remove('hide-immediate');
    }
  }

  showCookieBannerAnimated() {
    const banner = document.getElementById('cookieBanner');
    if (banner && !this.consentExists) {
      // Small delay to ensure smooth appearance after page load
      setTimeout(() => {
        requestAnimationFrame(() => {
          document.body.classList.add('cookies-showing');
          document.body.classList.remove('cookies-hidden');
          banner.classList.remove('hide-immediate');

          // Small delay for smooth animation
          setTimeout(() => {
            banner.classList.add('show');
          }, 50);
        });
      }, 100);
    }
  }

  hideCookieBanner() {
    const banner = document.getElementById('cookieBanner');
    if (banner) {
      document.body.classList.add('cookies-hidden');
      document.body.classList.remove('cookies-showing');
      banner.classList.remove('show');
    }
  }

  hideCookieBannerPermanently() {
    const banner = document.getElementById('cookieBanner');
    if (banner) {
      document.body.classList.add('cookies-hidden');
      document.body.classList.remove('cookies-showing');
      banner.classList.remove('show');
      banner.classList.add('hide-immediate');
    }
  }

  manageCookies() {
    const modal = document.getElementById('cookieModal');
    if (modal) {
      modal.classList.add('show');
      this.loadCookiePreferences();
    }
  }

  closeCookieModal() {
    const modal = document.getElementById('cookieModal');
    if (modal) modal.classList.remove('show');
  }

  acceptAllCookies() {
    this.setCookieConsent({
      essential: true,
      preferences: true,
      analytics: true,
    });
    this.consentExists = true;
    this.hideCookieBannerPermanently();
    this.enableAnalytics();

    // Set the flag for future page loads
    document.documentElement.setAttribute('data-cookies-accepted', 'true');
  }

  acceptAllFromModal() {
    this.acceptAllCookies();
    this.closeCookieModal();
  }

  savePreferences() {
    const analytics =
      document.getElementById('analyticsCookies')?.checked || false;
    const preferences =
      document.getElementById('preferencesCookies')?.checked || false;

    this.setCookieConsent({ essential: true, preferences, analytics });
    this.consentExists = true;
    this.hideCookieBannerPermanently();
    this.closeCookieModal();

    // Set the flag for future page loads
    document.documentElement.setAttribute('data-cookies-accepted', 'true');

    if (analytics) {
      this.enableAnalytics();
    } else {
      this.disableAnalytics();
    }
  }

  setCookieConsent(preferences) {
    localStorage.setItem(
      'cookieConsent',
      JSON.stringify({
        timestamp: Date.now(),
        preferences,
      })
    );
  }

  getCookieConsent() {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) return null;

    try {
      const parsed = JSON.parse(consent);
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      if (Date.now() - parsed.timestamp > oneYear) {
        localStorage.removeItem('cookieConsent');
        document.documentElement.removeAttribute('data-cookies-accepted');
        return null;
      }
      return parsed.preferences;
    } catch {
      localStorage.removeItem('cookieConsent');
      document.documentElement.removeAttribute('data-cookies-accepted');
      return null;
    }
  }

  loadCookiePreferences() {
    const consent = this.getCookieConsent();
    if (consent) {
      const preferencesEl = document.getElementById('preferencesCookies');
      const analyticsEl = document.getElementById('analyticsCookies');
      if (preferencesEl) preferencesEl.checked = consent.preferences;
      if (analyticsEl) analyticsEl.checked = consent.analytics;
    }
  }

  exposeGlobalFunctions() {
    window.manageCookies = () => this.manageCookies();
    window.closeCookieModal = () => this.closeCookieModal();
    window.acceptAllCookies = () => this.acceptAllCookies();
    window.acceptAllFromModal = () => this.acceptAllFromModal();
    window.savePreferences = () => this.savePreferences();
  }
}

// Initialize
if (typeof window !== 'undefined') {
  window.cookieConsentManager = new CookieConsentManager();
}
