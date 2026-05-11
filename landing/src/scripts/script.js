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
      if (header) header.classList.add('beta-closed');
      if (mobileNav) mobileNav.classList.add('beta-closed');
    }, 300);

    localStorage.setItem('betaBannerClosed', 'true');
  }
}

function toggleMobileMenu() {
  const mobileNav = document.getElementById('mobileNav');
  if (mobileNav) {
    mobileNav.classList.toggle('open');
    document.body.style.overflow = mobileNav.classList.contains('open') ? 'hidden' : '';
  }
}

function closeMobileMenu() {
  const mobileNav = document.getElementById('mobileNav');
  if (mobileNav) {
    mobileNav.classList.remove('open');
    document.body.style.overflow = '';
  }
}

// One-time setup
if ('scrollRestoration' in history) {
  history.scrollRestoration = 'manual';
}

const rippleStyle = document.createElement('style');
rippleStyle.textContent = `@keyframes ripple { to { transform: scale(4); opacity: 0; } }`;
document.head.appendChild(rippleStyle);

window.closeBetaBanner = closeBetaBanner;
window.toggleMobileMenu = toggleMobileMenu;
window.closeMobileMenu = closeMobileMenu;

// Visibility change — global, added once
document.addEventListener('visibilitychange', function () {
  if (document.hidden) {
    document.body.style.animationPlayState = 'paused';
  } else {
    document.body.style.animationPlayState = 'running';
    if (window.scrollY !== 0) window.scrollTo(0, 0);
  }
});

// Carousel autoplay reference — cleared on each page swap
let carouselAutoPlay = null;

// IntersectionObserver reference — disconnected on each page swap
let pageObserver = null;

// Per-page AbortController — aborted before each swap to remove stale listeners
let pageController = new AbortController();

document.addEventListener('astro:before-swap', () => {
  if (carouselAutoPlay) {
    clearInterval(carouselAutoPlay);
    carouselAutoPlay = null;
  }
  if (pageObserver) {
    pageObserver.disconnect();
    pageObserver = null;
  }
  pageController.abort();
  pageController = new AbortController();
});

document.addEventListener('astro:page-load', () => {
  const { signal } = pageController;

  window.scrollTo(0, 0);

  // Beta banner state
  if (localStorage.getItem('betaBannerClosed') === 'true') {
    const banner = document.getElementById('betaBanner');
    const header = document.querySelector('.header');
    const mobileNav = document.querySelector('.mobile-nav');

    if (banner) {
      banner.style.display = 'none';
      banner.style.transform = 'translateY(-100%)';
      document.body.classList.add('beta-closed');
      if (header) header.classList.add('beta-closed');
      if (mobileNav) mobileNav.classList.add('beta-closed');
    }
  }

  // Touch device class
  if ('ontouchstart' in window) {
    document.body.classList.add('touch-device');
  }

  // Header scroll effect
  const header = document.querySelector('.header');
  if (header) {
    let scrollTimeout;
    window.addEventListener(
      'scroll',
      function () {
        clearTimeout(scrollTimeout);
        scrollTimeout = setTimeout(() => {
          if (window.scrollY > 50) {
            header.classList.add('scrolled');
          } else {
            header.classList.remove('scrolled');
          }
          header.style.transform = 'translateY(0)';
        }, 10);
      },
      { signal }
    );
  }

  // Button ripple effects
  document.querySelectorAll('.cta-button, .header-button').forEach(button => {
    button.addEventListener(
      'click',
      function (e) {
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
        setTimeout(() => ripple.parentNode?.removeChild(ripple), 600);
      },
      { signal }
    );
  });

  // Touch button feedback
  if ('ontouchstart' in window) {
    document.querySelectorAll('.cta-button, .header-button').forEach(button => {
      button.addEventListener(
        'touchstart',
        function () {
          this.style.transform = 'scale(0.95)';
        },
        { signal }
      );
      button.addEventListener(
        'touchend',
        function () {
          setTimeout(() => {
            this.style.transform = '';
          }, 150);
        },
        { signal }
      );
    });
  }

  // Mobile menu: close on outside click
  const mobileToggle = document.querySelector('.mobile-menu-toggle');
  const mobileNav = document.getElementById('mobileNav');
  document.addEventListener(
    'click',
    function (event) {
      if (
        mobileNav &&
        mobileToggle &&
        !mobileNav.contains(event.target) &&
        !mobileToggle.contains(event.target)
      ) {
        closeMobileMenu();
      }
    },
    { signal }
  );

  // Mobile menu: close on resize to desktop
  window.addEventListener(
    'resize',
    function () {
      if (window.innerWidth > 768) closeMobileMenu();
    },
    { signal }
  );

  // Intersection observer for scroll animations
  pageObserver = new IntersectionObserver(
    function (entries) {
      entries.forEach(entry => {
        if (entry.isIntersecting) entry.target.classList.add('animate-in');
      });
    },
    { threshold: 0.1, rootMargin: '0px 0px -50px 0px' }
  );

  document.querySelectorAll('.fade-in-up').forEach(el => pageObserver.observe(el));

  // Smooth scroll for anchor links
  document.querySelectorAll('a[href^="#"]').forEach(anchor => {
    anchor.addEventListener(
      'click',
      function (e) {
        e.preventDefault();
        const target = document.querySelector(this.getAttribute('href'));
        if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      },
      { signal }
    );
  });

  // Feature hover effects
  document.querySelectorAll('.feature').forEach(feature => {
    feature.addEventListener(
      'mouseenter',
      function () {
        this.style.transform = 'translateY(-10px) scale(1.02)';
      },
      { signal }
    );
    feature.addEventListener(
      'mouseleave',
      function () {
        this.style.transform = 'translateY(0) scale(1)';
      },
      { signal }
    );
  });

  // Logo hover animation
  const logo = document.querySelector('.logo-icon');
  if (logo) {
    logo.addEventListener(
      'mouseenter',
      function () {
        this.style.transform = 'scale(1.1) rotate(0deg)';
      },
      { signal }
    );
    logo.addEventListener(
      'mouseleave',
      function () {
        this.style.transform = 'scale(1) rotate(0deg)';
      },
      { signal }
    );
  }

  // Mark page as loaded
  document.body.classList.add('loaded');
  const heroSection = document.querySelector('.hero-section');
  if (heroSection) heroSection.classList.add('loaded');

  // Feature stagger animations
  document.querySelectorAll('.feature').forEach((feature, index) => {
    feature.style.animationDelay = `${1.2 + index * 0.2}s`;
    feature.classList.add('fade-in-up');
  });

  const encryptionTech = document.querySelector('.encryption-tech');
  if (encryptionTech) {
    encryptionTech.style.animationDelay = '1.8s';
    encryptionTech.classList.add('fade-in-up');
  }

  // Carousel (home page only)
  const track = document.getElementById('carousel-track');
  if (track && window.innerWidth >= 599) {
    const dots = document.querySelectorAll('.carousel-dot');
    const tabs = document.querySelectorAll('.carousel-tab');
    const prevBtn = document.querySelector('.carousel-btn-prev');
    const nextBtn = document.querySelector('.carousel-btn-next');
    const pauseBtn = document.querySelector('.carousel-btn-pause');
    const carouselContainer = document.querySelector('.carousel-container');
    const slideInfoTitle = document.getElementById('slide-info-title');
    const slideInfoDesc = document.getElementById('slide-info-desc');

    const slideData = [
      {
        title: 'Messaging Features',
        desc: 'Send encrypted messages in real-time with delivery confirmation and read receipts. Edit or delete messages seamlessly.',
      },
      {
        title: 'Theme Customization',
        desc: 'Switch between dark and light themes instantly. Full end-to-end encryption is maintained across all visual themes.',
      },
      {
        title: 'Key Recovery',
        desc: 'Moved to a new device? Quasar detects missing keys and guides you through regeneration. Previous messages are unreadable for security.',
      },
      {
        title: 'Account Security',
        desc: 'Protect conversations with robust authentication and seamless access controls. Multi-layered protection keeps unauthorized users out.',
      },
      {
        title: 'Password Recovery',
        desc: 'Lost your password? Regain access to encrypted conversations safely through our streamlined, security-preserving reset process.',
      },
      {
        title: 'Privacy Controls',
        desc: 'Backup encryption keys as secure .pem files and restore them anytime. Choose from curated avatars to personalize your profile.',
      },
    ];

    if (prevBtn && nextBtn && pauseBtn && carouselContainer) {
      const slides = track.querySelectorAll('.carousel-slide');
      const totalSlides = slides.length;
      let currentSlide = 0;
      let isPaused = false;

      function updateCarousel() {
        track.style.transform = `translateX(${-currentSlide * 100}%)`;
        dots.forEach((dot, i) => dot.classList.toggle('active', i === currentSlide));
        tabs.forEach((tab, i) => tab.classList.toggle('active', i === currentSlide));
        if (slideInfoDesc && slideData[currentSlide]) {
          if (slideInfoTitle) slideInfoTitle.textContent = slideData[currentSlide].title;
          slideInfoDesc.textContent = slideData[currentSlide].desc;
        }
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
        if (carouselAutoPlay) clearInterval(carouselAutoPlay);
        if (!isPaused) carouselAutoPlay = setInterval(nextSlide, 8000);
      }

      function stopAutoPlay() {
        if (carouselAutoPlay) {
          clearInterval(carouselAutoPlay);
          carouselAutoPlay = null;
        }
      }

      function togglePause() {
        isPaused = !isPaused;
        isPaused ? stopAutoPlay() : startAutoPlay();
        const pauseIcon = pauseBtn.querySelector('.pause-icon');
        const playIcon = pauseBtn.querySelector('.play-icon');
        if (pauseIcon && playIcon) {
          pauseIcon.style.display = isPaused ? 'none' : 'block';
          playIcon.style.display = isPaused ? 'block' : 'none';
          pauseBtn.setAttribute('aria-label', isPaused ? 'Play slideshow' : 'Pause slideshow');
        }
      }

      nextBtn.addEventListener(
        'click',
        () => {
          nextSlide();
          startAutoPlay();
        },
        { signal }
      );
      prevBtn.addEventListener(
        'click',
        () => {
          prevSlide();
          startAutoPlay();
        },
        { signal }
      );
      dots.forEach((dot, i) =>
        dot.addEventListener(
          'click',
          () => {
            goToSlide(i);
            startAutoPlay();
          },
          { signal }
        )
      );
      tabs.forEach((tab, i) =>
        tab.addEventListener(
          'click',
          () => {
            goToSlide(i);
            startAutoPlay();
          },
          { signal }
        )
      );
      pauseBtn.addEventListener('click', togglePause, { signal });
      carouselContainer.addEventListener('mouseenter', stopAutoPlay, { signal });
      carouselContainer.addEventListener('mouseleave', startAutoPlay, { signal });

      // Swipe support
      let startX = null;
      let currentX = null;
      let isDragging = false;

      carouselContainer.addEventListener(
        'touchstart',
        e => {
          startX = e.touches[0].clientX;
          isDragging = true;
          stopAutoPlay();
        },
        { signal }
      );

      carouselContainer.addEventListener(
        'touchmove',
        e => {
          if (isDragging) currentX = e.touches[0].clientX;
        },
        { signal }
      );

      carouselContainer.addEventListener(
        'touchend',
        () => {
          if (!isDragging || startX === null || currentX === null) return;
          isDragging = false;
          const diffX = startX - currentX;
          if (Math.abs(diffX) > 50) {
            diffX > 0 ? nextSlide() : prevSlide();
          }
          startAutoPlay();
        },
        { signal }
      );

      // Keyboard navigation
      document.addEventListener(
        'keydown',
        e => {
          if (e.key === 'ArrowLeft') {
            prevSlide();
            startAutoPlay();
          } else if (e.key === 'ArrowRight') {
            nextSlide();
            startAutoPlay();
          }
        },
        { signal }
      );

      updateCarousel();
      startAutoPlay();
    }
  }
});
