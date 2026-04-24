# Quasar Contact — Landing Pages

Astro 4.0 static site — home, about, FAQ, legal, and author pages.

See the [main README](../README.md) for full project documentation.

## Quick start

```bash
npm install
npm run dev   # Astro dev server on http://localhost:4321
```

### Prerequisites

- Node.js 22+ and npm 10+

## Scripts

```bash
npm run dev              # Astro dev server with hot reload
npm run build            # build static site
npm run preview          # preview production build locally
npm run build:selective  # build + copy pages to ../public/
npm run deploy:pages     # deploy to GitHub Pages
npm run lint             # ESLint check
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier format
npm run style:css        # Stylelint CSS check
npm run style:css:fix    # Stylelint CSS fix
npm run typecheck        # Astro type check
npm run style:fix        # ESLint + Prettier + Stylelint fix
```

## Pages

| Route     | File                 |
| --------- | -------------------- |
| `/`       | `pages/index.astro`  |
| `/about`  | `pages/about.astro`  |
| `/faq`    | `pages/faq.astro`    |
| `/legal`  | `pages/legal.astro`  |
| `/author` | `pages/author.astro` |
