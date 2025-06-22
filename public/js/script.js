/*
// Current year
document.getElementById('current-year').innerHTML = new Date().getFullYear();

// Alpha banner close functionality
function closeAlphaBanner() {
  const banner = document.getElementById('alphaBanner');
  const header = document.querySelector('.header');
  const body = document.body;

  banner.style.transform = 'translateY(-100%)';

  setTimeout(() => {
    banner.style.display = 'none';
    body.classList.add('alpha-closed');
    header.classList.add('alpha-closed');
  }, 300);

  localStorage.setItem('alphaBannerClosed', 'true');
}

// Prevent auto-scroll on page reload
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// Enhanced landing page interactions
document.addEventListener('DOMContentLoaded', function () {
  // Prevent any scroll restoration
  window.scrollTo(0, 0);

  // Check if alpha banner should be hidden on page load
  const alphaBannerClosed = localStorage.getItem('alphaBannerClosed');

  if (alphaBannerClosed === 'true') {
    const banner = document.getElementById('alphaBanner');
    const header = document.querySelector('.header');
    const body = document.body;

    // Hide banner immediately without animation on page load
    banner.style.display = 'none';
    banner.style.transform = 'translateY(-100%)';
    body.classList.add('alpha-closed');
    header.classList.add('alpha-closed');
  }

  // Header scroll effect
  const header = document.querySelector('.header');

  function handleScroll() {
    const currentScrollY = window.scrollY;

    // Add/remove scrolled class for styling changes
    if (currentScrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }

    // Header always stays visible
    header.style.transform = 'translateY(0)';
  }

  // Throttled scroll handler
  let scrollTimeout;
  window.addEventListener('scroll', function () {
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }
    scrollTimeout = setTimeout(handleScroll, 10);
  });

  // Button click effects
  const buttons = document.querySelectorAll('.cta-button, .header-button');

  buttons.forEach((button) => {
    button.addEventListener('click', function (e) {
      // Create ripple effect
      const ripple = document.createElement('span');
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.cssText = `
              position: absolute;
              width: ${size}px;
              height: ${size}px;
              left: ${x}px;
              top: ${y}px;
              background: rgba(255, 255, 255, 0.3);
              border-radius: 50%;
              transform: scale(0);
              animation: ripple 0.6s ease-out;
              pointer-events: none;
              z-index: 1;
          `;

      this.appendChild(ripple);

      // Remove ripple after animation
      setTimeout(() => {
        if (ripple.parentNode) {
          ripple.parentNode.removeChild(ripple);
        }
      }, 600);
    });
  });

  // Intersection Observer for scroll animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px',
  };

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
      }
    });
  }, observerOptions);

  // Observe elements for animation
  const animateElements = document.querySelectorAll('.fade-in-up');
  animateElements.forEach((el) => {
    observer.observe(el);
  });

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    });
  });

  // Feature hover effects
  const features = document.querySelectorAll('.feature');
  features.forEach((feature) => {
    feature.addEventListener('mouseenter', function () {
      this.style.transform = 'translateY(-10px) scale(1.02)';
    });

    feature.addEventListener('mouseleave', function () {
      this.style.transform = 'translateY(0) scale(1)';
    });
  });

  // Logo hover animation
  const logo = document.querySelector('.logo-image');
  if (logo) {
    logo.addEventListener('mouseenter', function () {
      this.style.transform = 'scale(1.1) rotate(0deg)';
    });

    logo.addEventListener('mouseleave', function () {
      this.style.transform = 'scale(1) rotate(0deg)';
    });
  }

  // Performance optimization - pause animations when not visible
  let isVisible = true;

  document.addEventListener('visibilitychange', function () {
    isVisible = !document.hidden;

    if (!isVisible) {
      // Pause heavy animations when tab is not visible
      document.body.style.animationPlayState = 'paused';
    } else {
      document.body.style.animationPlayState = 'running';
      // Ensure scroll position is maintained when returning to tab
      if (window.scrollY !== 0) {
        window.scrollTo(0, 0);
      }
    }
  });

  // Touch device optimizations
  if ('ontouchstart' in window) {
    // Add touch-friendly classes
    document.body.classList.add('touch-device');

    // Enhanced touch feedback for buttons
    buttons.forEach((button) => {
      button.addEventListener('touchstart', function () {
        this.style.transform = 'scale(0.95)';
      });

      button.addEventListener('touchend', function () {
        setTimeout(() => {
          this.style.transform = '';
        }, 150);
      });
    });
  }

  // Preload critical images
  const criticalImages = ['assets/images/logo.svg'];

  criticalImages.forEach((src) => {
    const img = new Image();
    img.src = src;
  });

  // Initialize particles or background effects (if needed)
  function initBackgroundEffects() {
    // This could be extended for particle systems or other visual effects
    const mainContent = document.querySelector('.main-content');
    if (mainContent && window.innerWidth > 768) {
      // Add subtle background effects for desktop only
      // Implementation would go here
    }
  }

  // Initialize on load
  initBackgroundEffects();

  // Reinitialize on resize
  let resizeTimeout;
  window.addEventListener('resize', function () {
    clearTimeout(resizeTimeout);
    resizeTimeout = setTimeout(initBackgroundEffects, 250);
  });

  // Add loading class removal after page load
  window.addEventListener('load', function () {
    // Ensure we stay at top after full page load
    setTimeout(() => {
      window.scrollTo(0, 0);
    }, 0);

    document.body.classList.add('loaded');

    // Trigger any additional load animations
    const heroSection = document.querySelector('.hero-section');
    if (heroSection) {
      heroSection.classList.add('loaded');
    }
  });

  // Add stagger animation to features on load
  features.forEach((feature, index) => {
    feature.style.animationDelay = `${1.2 + index * 0.2}s`;
    feature.classList.add('fade-in-up');
  });

  // Add animation to encryption tech section
  const encryptionTech = document.querySelector('.encryption-tech');
  if (encryptionTech) {
    encryptionTech.style.animationDelay = '1.8s';
    encryptionTech.classList.add('fade-in-up');
  }
}); */

// Current year
document.getElementById('current-year').innerHTML = new Date().getFullYear();

// Alpha banner close functionality
function closeAlphaBanner() {
  const banner = document.getElementById('alphaBanner');
  const header = document.querySelector('.header');
  const body = document.body;

  banner.style.transform = 'translateY(-100%)';

  setTimeout(() => {
    banner.style.display = 'none';
    body.classList.add('alpha-closed');
    header.classList.add('alpha-closed');
  }, 300);

  // Store preference using cookie utility (if consent given)
  const consent = getCookieConsent();
  if (consent && consent.preferences) {
    setCookie('alphaBannerClosed', 'true', 365);
  } else {
    // Fallback to localStorage for essential functionality
    localStorage.setItem('alphaBannerClosed', 'true');
  }
}

// Prevent auto-scroll on page reload
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

// Enhanced landing page interactions
document.addEventListener('DOMContentLoaded', function () {
  // Prevent any scroll restoration
  window.scrollTo(0, 0);

  // Check if alpha banner should be hidden on page load
  const consent = getCookieConsent();
  let alphaBannerClosed = false;

  if (consent && consent.preferences) {
    alphaBannerClosed = getCookie('alphaBannerClosed') === 'true';
  } else {
    // Fallback to localStorage for essential functionality
    alphaBannerClosed = localStorage.getItem('alphaBannerClosed') === 'true';
  }

  if (alphaBannerClosed) {
    const banner = document.getElementById('alphaBanner');
    const header = document.querySelector('.header');
    const body = document.body;

    // Hide banner immediately without animation on page load
    banner.style.display = 'none';
    banner.style.transform = 'translateY(-100%)';
    body.classList.add('alpha-closed');
    header.classList.add('alpha-closed');
  }

  // Header scroll effect
  const header = document.querySelector('.header');

  function handleScroll() {
    const currentScrollY = window.scrollY;

    // Add/remove scrolled class for styling changes
    if (currentScrollY > 50) {
      header.classList.add('scrolled');
    } else {
      header.classList.remove('scrolled');
    }

    // Header always stays visible
    header.style.transform = 'translateY(0)';
  }

  // Throttled scroll handler
  let scrollTimeout;
  window.addEventListener('scroll', function () {
    if (scrollTimeout) {
      clearTimeout(scrollTimeout);
    }

    scrollTimeout = setTimeout(handleScroll, 10);
  });

  // Initial scroll check
  handleScroll();

  // Smooth scrolling for anchor links
  document.querySelectorAll('a[href^="#"]').forEach((anchor) => {
    anchor.addEventListener('click', function (e) {
      e.preventDefault();
      const target = document.querySelector(this.getAttribute('href'));
      if (target) {
        target.scrollIntoView({
          behavior: 'smooth',
          block: 'start',
        });
      }
    });
  });

  // Add subtle animations to elements when they come into view
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px',
  };

  const observer = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (entry.isIntersecting) {
        entry.target.style.opacity = '1';
        entry.target.style.transform = 'translateY(0)';
      }
    });
  }, observerOptions);

  // Observe elements for animation
  document
    .querySelectorAll('.feature, .tech-step, .privacy-point')
    .forEach((el) => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(20px)';
      el.style.transition = 'opacity 0.6s ease, transform 0.6s ease';
      observer.observe(el);
    });

  // Add ripple effect to buttons
  document.querySelectorAll('.cta-button, .header-button').forEach((button) => {
    button.addEventListener('click', function (e) {
      const ripple = document.createElement('span');
      const rect = this.getBoundingClientRect();
      const size = Math.max(rect.width, rect.height);
      const x = e.clientX - rect.left - size / 2;
      const y = e.clientY - rect.top - size / 2;

      ripple.style.width = ripple.style.height = size + 'px';
      ripple.style.left = x + 'px';
      ripple.style.top = y + 'px';
      ripple.classList.add('ripple');

      this.appendChild(ripple);

      setTimeout(() => {
        ripple.remove();
      }, 600);
    });
  });

  // Performance optimization: Reduce animations on slower devices
  if (navigator.hardwareConcurrency && navigator.hardwareConcurrency < 4) {
    document.body.classList.add('reduced-motion');
  }

  // Accessibility: Respect user's motion preferences
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    document.body.classList.add('reduced-motion');
  }

  // Add loading states for interactive elements
  document.querySelectorAll('.cta-button').forEach((button) => {
    button.addEventListener('click', function (e) {
      // Don't prevent default for actual navigation
      // Just add visual feedback
      this.style.transform = 'scale(0.98)';
      setTimeout(() => {
        this.style.transform = '';
      }, 150);
    });
  });

  // Initialize cookie management
  console.log('Landing page initialized with cookie support');
});

// Cookie consent utility functions (if cookies.js is not loaded)
function getCookieConsent() {
  if (typeof window.getCookieConsent === 'function') {
    return window.getCookieConsent();
  }

  // Fallback implementation
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
    return null;
  }
}

function getCookie(name) {
  if (typeof window.getCookie === 'function') {
    return window.getCookie(name);
  }

  // Fallback implementation
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return null;
}

function setCookie(name, value, days = 365) {
  if (typeof window.setCookie === 'function') {
    return window.setCookie(name, value, days);
  }

  // Fallback implementation
  const expires = new Date();
  expires.setTime(expires.getTime() + days * 24 * 60 * 60 * 1000);
  document.cookie = `${name}=${value};expires=${expires.toUTCString()};path=/;SameSite=Strict`;
}

// Error handling for missing elements
function safeQuerySelector(selector) {
  try {
    return document.querySelector(selector);
  } catch (e) {
    console.warn('Element not found:', selector);
    return null;
  }
}

function safeQuerySelectorAll(selector) {
  try {
    return document.querySelectorAll(selector);
  } catch (e) {
    console.warn('Elements not found:', selector);
    return [];
  }
}

// Export for potential module use
if (typeof module !== 'undefined' && module.exports) {
  module.exports = {
    closeAlphaBanner,
    getCookieConsent,
    getCookie,
    setCookie,
  };
}
