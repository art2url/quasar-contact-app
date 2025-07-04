// Alpha banner close functionality
function closeAlphaBanner() {
  const banner = document.getElementById('alphaBanner');
  const header = document.querySelector('.header');
  const body = document.body;
  const mobileNav = document.querySelector('.mobile-nav');

  if (banner) {
    banner.style.transform = 'translateY(-100%)';

    setTimeout(() => {
      banner.style.display = 'none';
      body.classList.add('alpha-closed');
      if (header) {
        header.classList.add('alpha-closed');
      }
      if (mobileNav) {
        mobileNav.classList.add('alpha-closed');
      }
    }, 300);

    localStorage.setItem('alphaBannerClosed', 'true');
  }
}

// Mobile menu functionality
function toggleMobileMenu() {
  const mobileNav = document.getElementById('mobileNav');
  if (mobileNav) {
    mobileNav.classList.toggle('open');

    // Prevent body scroll when menu is open
    if (mobileNav.classList.contains('open')) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
  }
}

function closeMobileMenu() {
  const mobileNav = document.getElementById('mobileNav');
  if (mobileNav) {
    mobileNav.classList.remove('open');
    document.body.style.overflow = '';
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
  const alphaBannerClosed = localStorage.getItem('alphaBannerClosed');

  if (alphaBannerClosed === 'true') {
    const banner = document.getElementById('alphaBanner');
    const header = document.querySelector('.header');
    const body = document.body;
    const mobileNav = document.querySelector('.mobile-nav');

    if (banner) {
      // Hide banner immediately without animation on page load
      banner.style.display = 'none';
      banner.style.transform = 'translateY(-100%)';
      body.classList.add('alpha-closed');
      if (header) {
        header.classList.add('alpha-closed');
      }
      if (mobileNav) {
        mobileNav.classList.add('alpha-closed');
      }
    }
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

  buttons.forEach(button => {
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

  // Mobile menu event handlers
  const mobileToggle = document.querySelector('.mobile-menu-toggle');
  const mobileNav = document.getElementById('mobileNav');

  // Close mobile menu when clicking outside
  document.addEventListener('click', function (event) {
    if (
      mobileNav &&
      mobileToggle &&
      !mobileNav.contains(event.target) &&
      !mobileToggle.contains(event.target)
    ) {
      closeMobileMenu();
    }
  });

  // Close mobile menu on window resize to desktop
  window.addEventListener('resize', function () {
    if (window.innerWidth > 768) {
      closeMobileMenu();
    }
  });

  // Intersection Observer for scroll animations
  const observerOptions = {
    threshold: 0.1,
    rootMargin: '0px 0px -50px 0px',
  };

  const observer = new IntersectionObserver(function (entries) {
    entries.forEach(entry => {
      if (entry.isIntersecting) {
        entry.target.classList.add('animate-in');
      }
    });
  }, observerOptions);

  // Observe elements for animation
  const animateElements = document.querySelectorAll('.fade-in-up');
  animateElements.forEach(el => {
    observer.observe(el);
  });

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
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
  features.forEach(feature => {
    feature.addEventListener('mouseenter', function () {
      this.style.transform = 'translateY(-10px) scale(1.02)';
    });

    feature.addEventListener('mouseleave', function () {
      this.style.transform = 'translateY(0) scale(1)';
    });
  });

  // Logo hover animation
  const logo = document.querySelector('.logo-icon');
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
    buttons.forEach(button => {
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
  const criticalImages = ['/assets/images/logo.svg'];

  criticalImages.forEach(src => {
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
});

// Add required CSS for ripple animation
const style = document.createElement('style');
style.textContent = `
  @keyframes ripple {
    to {
      transform: scale(4);
      opacity: 0;
    }
  }
`;
document.head.appendChild(style);

// Make functions globally available
window.closeAlphaBanner = closeAlphaBanner;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;
