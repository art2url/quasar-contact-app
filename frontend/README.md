# Quasar Contact - Frontend

Angular 18 application for the Quasar Contact secure chat client with end-to-end encryption.

Originally developed as a separate repository:
[quasar-secure-chat](https://github.com/art2url/quasar-secure-chat)

## ✨ Features

- **Angular 18** with standalone components
- **End-to-End Encryption** using Web Crypto API
- **Real-time messaging** with Socket.IO
- **Responsive design** with mobile-optimized UI
- **PWA support** for installable app experience
- **Code quality tools** with ESLint, Prettier, and Stylelint

## 🚀 Quick Start

```bash
npm install
npm start  # Development server on http://localhost:4200
```

## 🔧 Development Scripts

```bash
# Development
npm start          # Start dev server
npm run build      # Production build
npm run test       # Run tests

# Code Quality
npm run lint       # ESLint check
npm run lint:fix   # ESLint auto-fix
npm run format     # Prettier format
npm run style:css  # Stylelint CSS check
npm run typecheck  # TypeScript check
```

## 🛡️ Security Features

- **RSA-OAEP** key pair generation
- **AES-GCM** message encryption
- **Client-side key storage** in IndexedDB
- **Zero-knowledge architecture** - server never sees plaintext

See the [main README](../README.md) for full documentation and setup instructions.
