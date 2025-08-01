// Beta banner close functionality
function closeBetaBanner() {
  const banner = document.getElementById('betaBanner');
  const header = document.querySelector('.header');
  const body = document.body;
  const mobileNav = document.querySelector('.mobile-nav');

  if (banner) {
    banner.style.transform = 'translateY(-100%)';

    setTimeout(() => {
      banner.style.display = 'none';
      body.classList.add('beta-closed');
      if (header) {
        header.classList.add('beta-closed');
      }
      if (mobileNav) {
        mobileNav.classList.add('beta-closed');
      }
    }, 300);

    localStorage.setItem('betaBannerClosed', 'true');
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

  // Check if beta banner should be hidden on page load
  const betaBannerClosed = localStorage.getItem('betaBannerClosed');

  if (betaBannerClosed === 'true') {
    const banner = document.getElementById('betaBanner');
    const header = document.querySelector('.header');
    const body = document.body;
    const mobileNav = document.querySelector('.mobile-nav');

    if (banner) {
      // Hide banner immediately without animation on page load
      banner.style.display = 'none';
      banner.style.transform = 'translateY(-100%)';
      body.classList.add('beta-closed');
      if (header) {
        header.classList.add('beta-closed');
      }
      if (mobileNav) {
        mobileNav.classList.add('beta-closed');
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
    new Image().src = src;
  });

  // Initialize particles or background effects (if needed)
  function initBackgroundEffects() {
    // This could be extended for particle systems or other visual effects
    if (window.innerWidth > 768) {
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

  // Carousel functionality
  const track = document.getElementById('carousel-track');
  if (track) {
    const slides = track.querySelectorAll('.carousel-slide');
    const dots = document.querySelectorAll('.carousel-dot');
    const prevBtn = document.querySelector('.carousel-btn-prev');
    const nextBtn = document.querySelector('.carousel-btn-next');
    const pauseBtn = document.querySelector('.carousel-btn-pause');
    const carouselContainer = document.querySelector('.carousel-container');

    if (prevBtn && nextBtn && pauseBtn && carouselContainer) {
      let currentSlide = 0;
      const totalSlides = slides.length;

      // Auto-play interval (8 seconds - slower speed)
      let autoPlayInterval = null;
      let isPaused = false;

      function updateCarousel() {
        const translateX = -currentSlide * 100;
        track.style.transform = `translateX(${translateX}%)`;

        // Update dots
        dots.forEach((dot, index) => {
          dot.classList.toggle('active', index === currentSlide);
        });
      }

      function nextSlide() {
        currentSlide = (currentSlide + 1) % totalSlides;
        updateCarousel();
      }

      function prevSlide() {
        currentSlide = (currentSlide - 1 + totalSlides) % totalSlides;
        updateCarousel();
      }

      function goToSlide(index) {
        currentSlide = index;
        updateCarousel();
      }

      function startAutoPlay() {
        stopAutoPlay(); // Clear any existing interval
        if (!isPaused) {
          autoPlayInterval = setInterval(nextSlide, 8000);
        }
      }

      function stopAutoPlay() {
        if (autoPlayInterval) {
          clearInterval(autoPlayInterval);
          autoPlayInterval = null;
        }
      }

      function togglePause() {
        isPaused = !isPaused;

        if (isPaused) {
          stopAutoPlay();
        } else {
          startAutoPlay();
        }

        // Update pause button visuals
        if (pauseBtn) {
          const pauseIcon = pauseBtn.querySelector('.pause-icon');
          const playIcon = pauseBtn.querySelector('.play-icon');

          if (pauseIcon && playIcon) {
            if (isPaused) {
              pauseIcon.style.display = 'none';
              playIcon.style.display = 'block';
              pauseBtn.setAttribute('aria-label', 'Play slideshow');
            } else {
              pauseIcon.style.display = 'block';
              playIcon.style.display = 'none';
              pauseBtn.setAttribute('aria-label', 'Pause slideshow');
            }
          }
        }
      }

      // Event listeners
      nextBtn.addEventListener('click', () => {
        nextSlide();
        startAutoPlay(); // Restart with fresh timer
      });

      prevBtn.addEventListener('click', () => {
        prevSlide();
        startAutoPlay(); // Restart with fresh timer
      });

      dots.forEach((dot, index) => {
        dot.addEventListener('click', () => {
          goToSlide(index);
          startAutoPlay(); // Restart with fresh timer
        });
      });

      pauseBtn.addEventListener('click', togglePause);

      // Pause auto-play on hover
      carouselContainer.addEventListener('mouseenter', stopAutoPlay);
      carouselContainer.addEventListener('mouseleave', startAutoPlay);

      // Touch/swipe support for mobile
      let startX = null;
      let currentX = null;
      let isDragging = false;

      carouselContainer.addEventListener('touchstart', e => {
        const touchEvent = e;
        startX = touchEvent.touches[0].clientX;
        isDragging = true;
        stopAutoPlay();
      });

      carouselContainer.addEventListener('touchmove', e => {
        if (!isDragging) return;
        const touchEvent = e;
        currentX = touchEvent.touches[0].clientX;
      });

      carouselContainer.addEventListener('touchend', () => {
        if (!isDragging || startX === null || currentX === null) return;
        isDragging = false;

        const diffX = startX - currentX;
        const threshold = 50; // Minimum swipe distance

        if (Math.abs(diffX) > threshold) {
          if (diffX > 0) {
            nextSlide();
          } else {
            prevSlide();
          }
          startAutoPlay(); // Restart with fresh timer
        } else {
          startAutoPlay(); // Resume if no swipe detected
        }
      });

      // Keyboard navigation
      document.addEventListener('keydown', e => {
        if (e.key === 'ArrowLeft') {
          prevSlide();
          startAutoPlay();
        } else if (e.key === 'ArrowRight') {
          nextSlide();
          startAutoPlay();
        }
      });

      // Initialize
      updateCarousel();
      startAutoPlay();
    }
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
window.closeBetaBanner = closeBetaBanner;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;
