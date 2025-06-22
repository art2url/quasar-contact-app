// Cookie consent functionality
function showCookieBanner() {
  const banner = document.getElementById('cookieBanner');
  if (banner && !getCookieConsent()) {
    banner.classList.add('show');
  }
}

function hideCookieBanner() {
  const banner = document.getElementById('cookieBanner');
  if (banner) {
    banner.classList.remove('show');
  }
}

function acceptAllCookies() {
  setCookieConsent({
    essential: true,
    preferences: true,
    analytics: true,
  });
  hideCookieBanner();
}

function manageCookies() {
  document.getElementById('cookieModal').classList.add('show');
}

function closeCookieModal() {
  document.getElementById('cookieModal').classList.remove('show');
}

function acceptAllFromModal() {
  document.getElementById('preferencesCookies').checked = true;
  document.getElementById('analyticsCookies').checked = true;
  savePreferences();
}

function savePreferences() {
  const preferences = {
    essential: true, // Always true
    preferences: document.getElementById('preferencesCookies').checked,
    analytics: document.getElementById('analyticsCookies').checked,
  };

  setCookieConsent(preferences);
  closeCookieModal();
  hideCookieBanner();
}

function setCookieConsent(preferences) {
  localStorage.setItem(
    'cookieConsent',
    JSON.stringify({
      timestamp: Date.now(),
      preferences: preferences,
    })
  );

  // Initialize cookies based on preferences
  initializeCookies(preferences);

  console.log('Cookie preferences saved:', preferences);
}

function getCookieConsent() {
  const consent = localStorage.getItem('cookieConsent');
  if (!consent) return null;

  try {
    const parsed = JSON.parse(consent);
    // Check if consent is older than 1 year
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

function initializeCookies(preferences) {
  // Initialize analytics if enabled
  if (preferences.analytics) {
    // Add analytics initialization here if needed
    // Example: Google Analytics, etc.
    console.log('Analytics cookies enabled');

    // You can add analytics tracking code here
    // gtag('config', 'GA_MEASUREMENT_ID');
  }

  // Initialize preferences if enabled
  if (preferences.preferences) {
    // Add preference cookies initialization here if needed
    console.log('Preference cookies enabled');

    // Example: Remember theme, language, etc.
    // enableUserPreferences();
  }

  console.log('Cookies initialized with preferences:', preferences);
}

function loadCookiePreferences() {
  const consent = getCookieConsent();
  if (consent) {
    // Load existing preferences into modal
    document.getElementById('preferencesCookies').checked = consent.preferences;
    document.getElementById('analyticsCookies').checked = consent.analytics;

    // Initialize cookies with saved preferences
    initializeCookies(consent);
  }
}

// Utility function to get a specific cookie by name
function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

// Utility function to set a cookie
function setCookie(name, value, days = 365) {
  const consent = getCookieConsent();

  // Only set non-essential cookies if user has consented
  if (name !== 'cookieConsent' && (!consent || !consent.preferences)) {
    console.log('Cookie not set - no consent for preferences:', name);
    return;
  }

  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Strict`;
}

// Utility function to delete a cookie
function deleteCookie(name) {
  document.cookie = `${name}=;expires=Thu, 01 Jan 1970 00:00:00 UTC;path=/;`;
}

// Function to reset all cookie preferences (useful for testing or user request)
function resetCookiePreferences() {
  localStorage.removeItem('cookieConsent');

  // Delete all non-essential cookies
  const cookiesToDelete = ['preferences', 'analytics', 'tracking']; // Add your cookie names here
  cookiesToDelete.forEach(deleteCookie);

  // Show banner again
  setTimeout(() => {
    showCookieBanner();
  }, 500);

  console.log('Cookie preferences reset');
}

// Initialize cookie banner on page load
document.addEventListener('DOMContentLoaded', function () {
  console.log('Cookie management initialized');

  // Load existing preferences
  loadCookiePreferences();

  // Show banner after a short delay if no consent
  setTimeout(() => {
    showCookieBanner();
  }, 1000);

  // Add event listeners for modal close
  const modal = document.getElementById('cookieModal');
  if (modal) {
    // Close modal when clicking outside
    modal.addEventListener('click', function (e) {
      if (e.target === modal) {
        closeCookieModal();
      }
    });

    // Close modal with Escape key
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && modal.classList.contains('show')) {
        closeCookieModal();
      }
    });
  }
});

// Export functions for potential use in other scripts
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    showCookieBanner,
    hideCookieBanner,
    acceptAllCookies,
    manageCookies,
    setCookieConsent,
    getCookieConsent,
    getCookie,
    setCookie,
    deleteCookie,
    resetCookiePreferences,
  };
}
