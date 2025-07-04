# Quasar Contact - Landing Pages

Static landing pages built with Astro 4.0 for SEO-optimized marketing site.

## ✨ Features

- **Astro 4.0** static site generator
- **SEO optimized** with meta tags and sitemap
- **Fast loading** with minimal JavaScript
- **Responsive design** for all devices
- **Code quality tools** with ESLint, Prettier, and Stylelint

## 🚀 Quick Start

```bash
npm install
npm run dev  # Development server on http://localhost:4321
```

## 🔧 Development Scripts

```bash
# Development
npm run dev        # Start dev server
npm run build      # Build static site
npm run preview    # Preview production build

# Code Quality
npm run lint       # ESLint check
npm run lint:fix   # ESLint auto-fix
npm run format     # Prettier format
npm run style:css  # Stylelint CSS check
npm run typecheck  # TypeScript/Astro check
```

## 📄 Pages

- **Home** (`/`) - Main landing page
- **About** (`/about`) - Project information
- **FAQ** (`/faq`) - Frequently asked questions
- **Legal** (`/legal`) - Terms and privacy policy
- **Author** (`/author`) - Developer information

## 🏗️ Build Process

The build process generates static HTML files that are copied to the main `public/` directory:

```bash
npm run build:selective  # Build and deploy pages
```

This automatically:

1. Builds the Astro site
2. Copies generated HTML files to `../public/`
3. Makes them available at the root domain

## 🎨 Styling

- Modern CSS with custom properties
- Responsive design patterns
- Optimized for performance
- Consistent with main app design

See the [main README](../README.md) for full project documentation.
