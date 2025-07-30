# Quasar Contact - Landing Pages

**🌐 SEO-Optimized Static Marketing Site** built with Astro 4.0 for enterprise-grade performance.

## ✨ Features

### Static Site Generation

- **Astro 4.0** static site generator with optimized builds
- **SEO Excellence** with comprehensive meta tags, sitemap generation, and structured data
- **Performance Optimized** with minimal JavaScript and optimized asset loading
- **Responsive Design** with mobile-first approach and cross-device compatibility
- **Progressive Enhancement** with JavaScript layered on top of fully functional HTML

### Privacy & Analytics

- **GDPR Compliant** with cookie consent management and privacy controls
- **Privacy-First Analytics** with Google Analytics integration and user consent
- **Batched Event Processing** for efficient analytics data collection
- **Cookie Management** with comprehensive consent tracking and preferences
- **Data Minimization** with only essential analytics data collected

### User Experience

- **Interactive Components** with smooth animations and touch/swipe support
- **Mobile Menu System** with responsive navigation and accessibility
- **Carousel Functionality** with touch gestures and keyboard navigation
- **Beta Banner Management** with user preferences and dismissal tracking
- **Intersection Observer Animations** for smooth scroll-triggered effects

## 🚀 Quick Start

```bash
npm install
npm run dev  # Development server on http://localhost:4321
```

### Prerequisites

- Node.js 22+ and npm 10+
- Backend server configured (for full integration)

## 🔧 Development Scripts

```bash
# Development
npm run dev                # Start dev server with hot reload
npm run build              # Build static site for production
npm run preview            # Preview production build locally
npm run build:selective    # Build and deploy to public directory

# Code Quality
npm run lint               # ESLint check for JavaScript and Astro files
npm run lint:fix           # ESLint auto-fix
npm run format             # Prettier format for all files
npm run style:css          # Stylelint CSS validation
npm run style:css:fix      # Fix CSS style issues
npm run typecheck          # TypeScript and Astro type checking
npm run style:fix          # Fix all style issues across the project

# Deployment
npm run deploy:pages       # Deploy to GitHub Pages
```

## 📄 Site Structure

### Pages & Content

- **Home** (`/`) - Main landing page with product showcase and features
- **About** (`/about`) - Comprehensive project information and technical details
- **FAQ** (`/faq`) - Frequently asked questions with security and privacy focus
- **Legal** (`/legal`) - Terms of service and privacy policy with GDPR compliance
- **Author** (`/author`) - Developer information and project background

### Component Architecture

- **BetaBanner** - Development status notification with user dismissal
- **CookieConsent** - GDPR-compliant cookie consent with analytics integration
- **Navigation** - Responsive navigation with mobile menu and accessibility
- **Layout Components** - Reusable layouts with SEO optimization
- **Interactive Elements** - Carousel, animations, and user interaction handlers

## 🔒 Privacy & Security Features

### Cookie Consent System

- **CookieConsentManager** - Comprehensive GDPR compliance with user preferences
- **Analytics Integration** - Privacy-first Google Analytics with consent management
- **Local Storage Management** - Secure preference storage with encryption consideration
- **Consent Tracking** - Detailed tracking of user privacy preferences
- **Batched Analytics** - Efficient event collection respecting user privacy

### Security Implementation

- **Content Security Policy** - Strict CSP headers for XSS protection
- **Privacy Controls** - User control over all data collection and analytics
- **Secure Asset Loading** - Optimized and secure static asset delivery
- **No Tracking by Default** - Analytics only enabled with explicit user consent

## 🏗️ Build & Deployment Process

### Static Site Generation

```bash
npm run build:selective  # Comprehensive build and deployment
```

This process:

1. **Builds Astro Site** - Static generation with SEO optimization
2. **Optimizes Assets** - Image compression, CSS minification, JS bundling
3. **Copies to Public** - Deploys generated files to `../public/` directory
4. **Enables Root Access** - Makes landing pages available at root domain
5. **Generates Sitemap** - SEO sitemap with configurable priorities

### Integration with Main App

- **Seamless Navigation** - Direct integration with Angular app routing
- **Shared Styling** - Consistent design system across landing and app
- **Asset Optimization** - Coordinated asset loading and caching
- **SEO Benefits** - Static pages for search engine optimization

## 🎨 Styling & Design

### Design System

- **Modern CSS** with custom properties and advanced selectors
- **Responsive Patterns** - Mobile-first design with breakpoint optimization
- **Performance Focus** - Critical CSS inlining and lazy loading
- **Animation System** - Smooth CSS animations with reduced motion support
- **Accessibility** - WCAG compliance with keyboard navigation and screen readers

### Visual Features

- **Interactive Elements** - Hover effects, transitions, and micro-interactions
- **Carousel System** - Touch-enabled image/content carousel with indicators
- **Mobile Optimization** - Touch gestures, swipe support, and mobile-specific layouts
- **Dark Mode Support** - Theme-aware styling with system preference detection

## 📊 Analytics & Monitoring

### Privacy-First Analytics

- **Google Analytics 4** integration with privacy controls
- **Event Tracking** - User interaction and engagement metrics
- **Consent Management** - Analytics only with explicit user permission
- **Data Processing** - Client-side event batching and processing
- **Performance Monitoring** - Core web vitals and user experience metrics

### SEO Optimization

- **Structured Data** - JSON-LD markup for rich search results
- **Meta Tag Optimization** - Comprehensive meta tags for social sharing
- **Sitemap Generation** - Automatic XML sitemap with priority weighting
- **Performance Optimization** - Lighthouse score optimization for search ranking

## 🚀 Performance Features

### Loading Optimization

- **Static Generation** - Pre-built HTML for instant loading
- **Asset Optimization** - Image compression, CSS/JS minification
- **Critical Resource Prioritization** - Above-the-fold content optimization
- **Progressive Enhancement** - Core functionality without JavaScript
- **Caching Strategy** - Optimal cache headers for static assets

### Mobile Performance

- **Responsive Images** - Optimized images for different screen sizes
- **Touch Optimization** - Native touch handling for mobile interactions
- **Reduced JavaScript** - Minimal client-side JavaScript for better performance
- **Mobile-First Loading** - Prioritized mobile user experience

## 📋 Security Best Practices

### Content Security

- **Static Asset Security** - Secure static file serving with proper headers
- **Privacy Protection** - No user tracking without explicit consent
- **Secure Headers** - Security headers for XSS and clickjacking protection
- **HTTPS Enforcement** - All assets served over secure connections

### Data Privacy

- **GDPR Compliance** - Full compliance with European privacy regulations
- **Cookie Security** - Secure cookie handling and user consent
- **Analytics Privacy** - Privacy-first analytics implementation
- **User Control** - Complete user control over data collection and preferences

## 📖 Documentation & Integration

### Development Documentation

- **Component Documentation** - Detailed component usage and API
- **Build Process** - Comprehensive build and deployment documentation
- **Integration Guide** - How to integrate with the main application
- **Customization** - Guidelines for theming and content customization

### Deployment Options

- **GitHub Pages** - Static site deployment with automated builds
- **CDN Integration** - Content delivery network optimization
- **Custom Domain** - Support for custom domain configuration
- **SSL/TLS** - Automatic HTTPS with security best practices

---

**📈 SEO Notice**: This landing site implements comprehensive SEO optimization and privacy-first
analytics. Monitor performance metrics and user engagement while respecting user privacy
preferences.
