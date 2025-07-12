# Quasar Contact - Backend

Node.js/Express server with Socket.IO for secure real-time messaging and end-to-end encryption
support.

Originally developed as a separate repository:
[quasar-chat-backend](https://github.com/art2url/quasar-chat-backend)

## ✨ Features

- **Express.js** server with TypeScript
- **Socket.IO** for real-time WebSocket communication
- **MongoDB** with Mongoose ODM for data persistence
- **JWT Authentication** with secure token management
- **End-to-end encryption** key exchange support
- **Rate limiting** and security middleware
- **Code quality tools** with ESLint and Prettier
- **Clean production code** with debug middleware and console logs removed

## 🚀 Quick Start

```bash
npm install
npm run dev  # Development server on http://localhost:3000
```

## 🔧 Development Scripts

```bash
# Development
npm run dev        # Start dev server with nodemon
npm run build      # Compile TypeScript
npm start          # Start production server

# Code Quality
npm run lint       # ESLint check
npm run lint:fix   # ESLint auto-fix
npm run format     # Prettier format
npm run typecheck  # TypeScript check
```

## 🔗 API Endpoints

### Authentication

- `POST /api/auth/register` - User registration
- `POST /api/auth/login` - User login
- `GET /api/auth/me` - Get current user

### Key Exchange

- `POST /api/keys/upload` - Upload public key
- `GET /api/keys/:userId` - Get user's public key
- `POST /api/keys/mark-missing` - Mark user keys as missing (rate limited)

### Messaging

- `GET /api/messages/:userId` - Get conversation history
- WebSocket events for real-time messaging

## 🛡️ Security Features

- **bcrypt** password hashing
- **Helmet.js** security headers
- **CORS** protection
- **Rate limiting** against brute force
- **JWT** stateless authentication
- **Input validation** and sanitization

See the [main README](../README.md) for full documentation and deployment instructions.
