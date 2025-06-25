// Cookie Consent & Google Analytics Management
// This module handles all cookie consent functionality and Google Analytics integration

class CookieConsentManager {
  constructor(gaMeasurementId) {
    this.GA_MEASUREMENT_ID = gaMeasurementId;
    this.init();
  }

  init() {
    // Initialize on DOM content loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => this.initializeApp());
    } else {
      this.initializeApp();
    }

    // Close modal when clicking outside
    window.addEventListener('click', (event) => {
      const modal = document.getElementById('cookieModal');
      if (event.target === modal) {
        this.closeCookieModal();
      }
    });

    // Make functions globally available for onclick handlers
    this.exposeGlobalFunctions();
  }

  initializeApp() {
    const consent = this.getCookieConsent();

    // Don't show/hide banner here - inline scripts already handled initial state
    // Just initialize services if consent exists
    if (consent) {
      this.initializeServices();
    }
    // If no consent, banner is already shown by inline script
  }

  // Google Analytics functions
  loadGoogleAnalytics() {
    console.log('Loading Google Analytics...');

    // Load Google Analytics script
    const script = document.createElement('script');
    script.async = true;
    script.src = `https://www.googletagmanager.com/gtag/js?id=${this.GA_MEASUREMENT_ID}`;
    document.head.appendChild(script);

    // Initialize gtag
    window.dataLayer = window.dataLayer || [];
    function gtag() {
      window.dataLayer.push(arguments);
    }
    window.gtag = gtag;

    gtag('js', new Date());
    gtag('config', this.GA_MEASUREMENT_ID, {
      // Privacy-friendly settings
      anonymize_ip: true,
      cookie_flags: 'SameSite=Strict;Secure',
      send_page_view: true,
    });

    // Update consent mode
    gtag('consent', 'update', {
      analytics_storage: 'granted',
    });

    console.log('Google Analytics loaded successfully');

    // Enable tracking features
    this.enableUsageTracking();
  }

  disableGoogleAnalytics() {
    console.log('Disabling Google Analytics...');

    if (window.gtag) {
      window.gtag('consent', 'update', {
        analytics_storage: 'denied',
      });
    }

    // Set opt-out flag
    window[`ga-disable-${this.GA_MEASUREMENT_ID}`] = true;
  }

  // Usage tracking functions
  enableUsageTracking() {
    console.log('Enabling usage tracking...');

    // Track page view
    this.trackPageView();

    // Set up interaction tracking
    this.setupInteractionTracking();

    // Track user environment
    this.trackUserEnvironment();
  }

  trackPageView() {
    if (window.gtag) {
      window.gtag('event', 'page_view', {
        page_title: document.title,
        page_location: window.location.href,
        content_group1: 'Quasar Website',
      });
    }
  }

  setupInteractionTracking() {
    // Track button clicks
    document.addEventListener('click', (event) => {
      if (window.gtag && this.getCookieConsent()?.analytics) {
        const target = event.target;

        // Track button clicks
        if (target.tagName === 'BUTTON' || target.closest('button')) {
          const button =
            target.tagName === 'BUTTON' ? target : target.closest('button');
          const buttonText = button.textContent?.trim() || 'Unknown Button';

          window.gtag('event', 'click', {
            event_category: 'Button',
            event_label: buttonText,
          });
        }

        // Track link clicks
        if (target.tagName === 'A') {
          const linkText = target.textContent?.trim() || 'Unknown Link';
          const linkUrl = target.href;

          window.gtag('event', 'click', {
            event_category: 'Link',
            event_label: linkText,
            link_url: linkUrl,
          });
        }
      }
    });

    // Track scroll depth
    this.trackScrollDepth();
  }

  trackScrollDepth() {
    let maxScroll = 0;
    const milestones = [25, 50, 75, 90, 100];
    const triggered = new Set();

    window.addEventListener('scroll', () => {
      if (window.gtag && this.getCookieConsent()?.analytics) {
        const scrollTop = window.pageYOffset;
        const documentHeight =
          document.documentElement.scrollHeight - window.innerHeight;
        const scrollPercent = Math.round((scrollTop / documentHeight) * 100);

        if (scrollPercent > maxScroll) {
          maxScroll = scrollPercent;

          milestones.forEach((milestone) => {
            if (scrollPercent >= milestone && !triggered.has(milestone)) {
              triggered.add(milestone);

              window.gtag('event', 'scroll', {
                event_category: 'Scroll Depth',
                event_label: `${milestone}%`,
                value: milestone,
              });
            }
          });
        }
      }
    });
  }

  trackUserEnvironment() {
    if (window.gtag && this.getCookieConsent()?.analytics) {
      // Track screen size category
      const screenWidth = window.screen.width;
      let deviceType = 'Desktop';

      if (screenWidth < 768) {
        deviceType = 'Mobile';
      } else if (screenWidth < 1024) {
        deviceType = 'Tablet';
      }

      window.gtag('event', 'user_environment', {
        event_category: 'Device Info',
        event_label: `Device Type: ${deviceType}`,
      });

      // Track user language
      const userLanguage = navigator.language || 'unknown';
      window.gtag('event', 'user_environment', {
        event_category: 'Language',
        event_label: userLanguage,
      });
    }
  }

  // Custom tracking function for external use
  trackCustomEvent(eventName, category, label, value = 1) {
    const consent = this.getCookieConsent();

    if (consent && consent.analytics && window.gtag) {
      window.gtag('event', eventName, {
        event_category: category,
        event_label: label,
        value: value,
      });

      console.log('Custom event tracked:', {
        eventName,
        category,
        label,
        value,
      });
    }
  }

  // Cookie management functions
  showCookieBanner() {
    const banner = document.getElementById('cookieBanner');
    if (banner && !this.getCookieConsent()) {
      // Add body class to indicate cookies are showing
      document.body.classList.add('cookies-showing');
      document.body.classList.remove('cookies-hidden');

      // Show banner with animation
      banner.classList.add('show');
    }
  }

  hideCookieBanner() {
    const banner = document.getElementById('cookieBanner');
    if (banner) {
      // Remove body class and add hidden class
      document.body.classList.remove('cookies-showing');
      document.body.classList.add('cookies-hidden');

      // Hide banner with animation
      banner.classList.remove('show');

      // After animation completes, hide completely
      setTimeout(() => {
        banner.style.display = 'none';
      }, 300);
    }
  }

  manageCookies() {
    const modal = document.getElementById('cookieModal');
    if (modal) {
      modal.classList.add('show');
      setTimeout(() => {
        this.loadCookiePreferences();
      }, 150);
    }
  }

  closeCookieModal() {
    const modal = document.getElementById('cookieModal');
    if (modal) {
      modal.classList.remove('show');
    }
  }

  acceptAllCookies() {
    this.setCookieConsent({
      essential: true,
      preferences: true,
      analytics: true,
    });
    this.hideCookieBanner();
    this.initializeServices();
  }

  acceptAllFromModal() {
    this.acceptAllCookies();
    this.closeCookieModal();
  }

  savePreferences() {
    const essential =
      document.getElementById('essentialCookies')?.checked || true;
    const preferences =
      document.getElementById('preferencesCookies')?.checked || false;
    const analytics =
      document.getElementById('analyticsCookies')?.checked || false;

    this.setCookieConsent({
      essential: essential,
      preferences: preferences,
      analytics: analytics,
    });

    this.hideCookieBanner();
    this.closeCookieModal();
    this.initializeServices();
  }

  setCookieConsent(preferences) {
    localStorage.setItem(
      'cookieConsent',
      JSON.stringify({
        timestamp: Date.now(),
        preferences: preferences,
      })
    );

    // Update Google Analytics consent
    if (window.gtag) {
      window.gtag('consent', 'update', {
        analytics_storage: preferences.analytics ? 'granted' : 'denied',
      });
    }

    console.log('Cookie preferences saved:', preferences);
  }

  getCookieConsent() {
    const consent = localStorage.getItem('cookieConsent');
    if (!consent) return null;

    try {
      const parsed = JSON.parse(consent);
      const oneYear = 365 * 24 * 60 * 60 * 1000;
      if (Date.now() - parsed.timestamp > oneYear) {
        localStorage.removeItem('cookieConsent');
        return null;
      }
      return parsed.preferences;
    } catch (e) {
      console.error('Error parsing cookie consent:', e);
      return null;
    }
  }

  initializeServices() {
    const consent = this.getCookieConsent();
    if (!consent) return;

    // Initialize analytics if enabled
    if (consent.analytics) {
      this.loadGoogleAnalytics();
    } else {
      this.disableGoogleAnalytics();
    }

    // Initialize preferences if enabled
    if (consent.preferences) {
      console.log('Preference cookies enabled');
      // Add preference features here
    }

    console.log('Services initialized with consent:', consent);
  }

  loadCookiePreferences() {
    const consent = this.getCookieConsent();
    if (consent) {
      const preferencesEl = document.getElementById('preferencesCookies');
      const analyticsEl = document.getElementById('analyticsCookies');

      if (preferencesEl) preferencesEl.checked = consent.preferences;
      if (analyticsEl) analyticsEl.checked = consent.analytics;
    }

    setTimeout(() => {
      this.addCheckboxListeners();
    }, 100);
  }

  addCheckboxListeners() {
    // No need for checkbox listeners since we only have two buttons:
    // "Accept Selected" and "Accept All" - both always visible
    // This simplifies the logic and removes the dynamic button showing/hiding
  }

  // Expose functions globally for onclick handlers
  exposeGlobalFunctions() {
    window.manageCookies = () => this.manageCookies();
    window.closeCookieModal = () => this.closeCookieModal();
    window.acceptAllCookies = () => this.acceptAllCookies();
    window.acceptAllFromModal = () => this.acceptAllFromModal();
    window.savePreferences = () => this.savePreferences();
    window.showCookieBanner = () => this.showCookieBanner();
    window.hideCookieBanner = () => this.hideCookieBanner();
    window.trackCustomEvent = (eventName, category, label, value) =>
      this.trackCustomEvent(eventName, category, label, value);
  }
}

// Initialize the cookie consent manager with GA ID
export function initCookieConsent(gaMeasurementId) {
  return new CookieConsentManager(gaMeasurementId);
}

// Auto-initialize if running in browser
if (typeof window !== 'undefined') {
  // Check if GA_MEASUREMENT_ID is available globally (from Astro define:vars)
  const gaId = window.GA_MEASUREMENT_ID;
  window.cookieConsentManager = new CookieConsentManager(gaId);
}
