# Quasar Contact — Frontend

Angular 18 application with end-to-end encryption via Web Crypto API.

Originally developed as a separate repository:
[quasar-secure-chat](https://github.com/art2url/quasar-secure-chat)

See the [main README](../README.md) for full architecture, service descriptions, and deployment
documentation.

## Quick start

```bash
npm install
npm start   # Angular dev server on http://localhost:4200
```

### Prerequisites

- Node.js 22+ and npm 10+
- Backend server running (see [backend README](../backend/README.md))
- `frontend/.env` configured — see [Getting started](../README.md#getting-started) in the main
  README

## Scripts

```bash
npm start              # ng serve (Angular dev server)
npm run build          # ng build (production)
npm run typecheck      # ng build with type checking
npm run lint           # ESLint check
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier format
npm run style:css      # Stylelint CSS check
npm run style:css:fix  # Stylelint CSS fix
npm run style:fix      # ESLint + Prettier + Stylelint fix
npm test               # ng test
```
