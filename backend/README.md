# Quasar Contact - Backend

**🔒 Secure Node.js/Express Server** with real-time messaging and enterprise-grade security.

Originally developed as a separate repository:
[quasar-chat-backend](https://github.com/art2url/quasar-chat-backend)

## 🛡️ Security-First Architecture

### Core Security Features

- **PostgreSQL + Prisma ORM** with ACID compliance and connection pooling
- **Advanced Bot Protection** with 98+ blocked attack vectors and intelligent filtering
- **Multi-Layer Honeypots** with form timing validation and behavioral analysis
- **CSRF Protection** using double-submit cookie pattern with secure tokens
- **Auto-Blacklisting** for dynamic IP blocking of malicious behavior
- **Rate Limiting** with multiple limiters and brute-force protection
- **Request Logging** with comprehensive security analysis and daily rotation

### Encryption & Privacy

- **End-to-End Encryption** key exchange with RSA-OAEP + AES-GCM hybrid encryption
- **JWT Authentication** with HttpOnly cookies and secure token management
- **Password Security** with bcrypt hashing and configurable complexity
- **Encrypted Storage** with AES-GCM encrypted data persistence

### Real-Time Security

- **WebSocket Protection** with authenticated connections and encrypted events
- **Socket.IO Security** with cookie-based authentication and session management
- **Health Monitoring** with connection quality tracking and auto-reconnection
- **User Presence** management with secure online/offline status

## ✨ Features

### Backend Technologies

- **Express.js** server with TypeScript and comprehensive middleware
- **Socket.IO** for secure real-time WebSocket communication
- **PostgreSQL** with Prisma ORM for type-safe database operations
- **Security Middleware** with Helmet.js, CORS, and input validation
- **Email Service** with SMTP support for password reset functionality

### Development Experience

- **TypeScript** with strict type checking and comprehensive linting
- **Code Quality Tools** with ESLint flat config and Prettier formatting
- **Pre-commit Hooks** with Husky and lint-staged integration
- **Clean Production Code** with all debug middleware and console logs removed
- **Health Checks** for container monitoring and deployment verification

## 🚀 Quick Start

```bash
npm install
npm run dev  # Development server on http://localhost:3000
```

### Prerequisites

- Node.js 22+ and npm 10+
- PostgreSQL 14+ (local or cloud instance)
- Environment variables configured (see main README)

## 🔧 Development Scripts

```bash
# Development
npm run dev        # Start dev server with nodemon
npm run build      # Compile TypeScript
npm start          # Start production server

# Database
npx prisma migrate dev      # Run database migrations
npx prisma generate        # Generate Prisma client
npx prisma studio         # Open Prisma Studio

# Code Quality
npm run lint              # ESLint check
npm run lint:fix          # ESLint auto-fix
npm run format            # Prettier format
npm run typecheck         # TypeScript check
npm run style:fix         # Fix all style issues
```

## 🔒 Security Implementation

### Middleware Stack

- **BotBlockerMiddleware**: Advanced bot protection with path filtering
- **HoneypotMiddleware**: Server-side honeypot validation
- **SecurityMiddleware**: Comprehensive security headers with Helmet.js
- **RateLimitMiddleware**: Multiple rate limiters with configurable thresholds
- **CookieUtils**: Secure cookie management for authentication and CSRF

### Database Security

- **Prisma ORM**: SQL injection prevention with parameterized queries
- **Connection Pooling**: Secure connection management with timeout protection
- **Database Service**: Health checks with retry logic and graceful handling
- **Migration Safety**: Secure database schema migrations with backup support

### API Security

**🔒 Security Notice**: API specifications are available through secure developer channels only.

All backend functionality includes:

- **Authentication Required**: Every endpoint except public ones requires valid JWT
- **Rate Limited**: All endpoints subject to rate limiting and monitoring
- **Input Validated**: Comprehensive validation and sanitization
- **Security Logged**: All requests monitored for suspicious activity

_For complete API documentation including endpoints, request formats, and authentication details,
please contact the development team or access the secure developer portal._

## 🚦 Production Deployment

### Environment Variables

```env
# Required
NODE_ENV=production
DATABASE_PUBLIC_URL=postgresql://user:password@host:XXXX/database
JWT_SECRET=<generate-strong-secret>

# Optional Security
RATE_LIMIT_ENABLED=true
BOT_BLOCKER_ENABLED=true
HONEYPOT_ENABLED=true
```

### Health Monitoring

```bash
# Health check endpoint available for monitoring
GET /health
```

### Container Support

- **Docker Ready**: Multi-stage Docker build with health checks
- **Nixpacks Compatible**: Optimized for Railway and cloud deployment
- **Process Management**: Graceful shutdown and restart handling

## 📋 Security Best Practices

When deploying this backend:

1. **Environment Security**: Use secure environment variable management
2. **Database Security**: Enable database encryption and secure connections
3. **Monitoring**: Implement comprehensive request and error monitoring
4. **Updates**: Keep all dependencies and security measures updated
5. **Backup**: Regular database backups with encrypted storage

## 📖 Documentation

- See the [main README](../README.md) for full project documentation
- Security features documented in main project security section
- API functionality overview available in main documentation
- Complete developer documentation available through secure channels

---

**⚠️ Security Notice**: This backend implements enterprise-grade security measures. Ensure proper
configuration and monitoring in production environments.
