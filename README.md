# Quasar Contact - Secure End-to-End Encrypted Chat Application

<p align="center">
  <a href="https://quasar.contact/" target="_blank">
    <img src="landing/public/assets/images/preview.png" alt="Lead to Quasar Landing" width="100%">
  </a>
</p>

## 🔐 Overview

Quasar Contact is a privacy-focused, real-time messaging application that implements military-grade
end-to-end encryption. Built with Angular 18, Node.js, and Socket.IO, it ensures that your
conversations remain completely private with zero data logging and client-side encryption.

**🚧 Current Status: Beta Stage**

## 🚀 **Production-Ready Features**

### **🔐 Enterprise-Grade Security**

- **Military-Grade Encryption**: RSA-OAEP + AES-GCM hybrid encryption
- **Advanced Bot Protection**: 98+ blocked attack vectors with intelligent filtering
- **Multi-Layer Honeypots**: Form timing validation and suspicious pattern detection
- **CSRF Protection**: Double-submit cookie pattern with secure tokens
- **Auto-Blacklisting**: Dynamic IP blocking for malicious behavior

### **💬 Advanced Messaging**

- **Real-Time Editing**: Live message editing and deletion via WebSocket
- **Rich Media Support**: Emoji picker and secure file attachments
- **Smart Features**: Message grouping, read receipts, typing indicators
- **Offline Queue**: Message delivery when users reconnect with TTL management

### **📱 Mobile-First Experience**

- **60fps Performance**: Optimized scrolling and keyboard handling
- **Dynamic Viewport**: Real-time layout adjustments for virtual keyboards
- **iOS Safari Compatible**: Visual Viewport API integration
- **Battery Efficient**: Reduced CPU usage through event optimization

### **🏗️ Modern Architecture**

- **PostgreSQL + Prisma**: ACID compliant with connection pooling
- **Facade Pattern**: 8 specialized services for chat functionality
- **Encrypted Storage**: AES-GCM encrypted IndexedDB with Vault service
- **Health Monitoring**: Container health checks and connection management

## ✨ Key Features

### 🛡️ Security & Privacy

- **End-to-End Encryption**: All messages are encrypted using Web Crypto API (AES-GCM) before
  leaving your device
- **Zero Knowledge Architecture**: Server never has access to decryption keys or plaintext messages
- **Client-Side Key Generation**: RSA-OAEP key pairs generated and stored locally
- **No Data Logging**: Messages are stored encrypted and can only be decrypted by intended
  recipients
- **Encrypted Local Storage**: AES-GCM encrypted IndexedDB storage with Vault service
- **Key Management**: Private key derivation, fingerprinting, and corruption detection
- **Hybrid Encryption**: RSA-OAEP + AES-GCM with error throttling and retry logic

### 🛡️ Advanced Security & Protection

#### Bot Protection & Anti-Abuse

- **Intelligent Bot Blocker**: 98+ blocked malicious paths with user agent filtering
- **Multi-layer Honeypot**: Form timing validation, suspicious pattern detection, trap fields
- **Auto-Blacklisting**: Automatic IP blocking for suspicious behavior
- **Request Logging**: Comprehensive logging with daily rotation for security analysis

#### Authentication & Session Security

- **CSRF Protection**: Double-submit cookie pattern with cryptographically secure tokens
- **Advanced Rate Limiting**: Multiple rate limiters with brute-force protection
- **JWT Security**: Secure token generation with configurable expiry
- **Session Management**: Secure session handling with automatic cleanup

#### Server Security

- **Security Headers**: Comprehensive security header middleware (Helmet.js)
- **CORS Protection**: Strict origin validation and pre-flight handling
- **Input Validation**: Server-side validation for all inputs with sanitization
- **SQL Injection Protection**: Prisma ORM with parameterized queries

### 💬 Messaging Features

- **Real-Time Communication**: Instant message delivery via WebSocket connections
- **Message Status Indicators**: Sent, delivered, and read receipts
- **Typing Indicators**: See when your conversation partner is typing
- **Message Editing & Deletion**: Edit or delete sent messages
- **Online/Offline Status**: Real-time presence tracking
- **Message Queue**: Offline message delivery when users reconnect
- **Smart Message Grouping**: Automatic grouping of messages by date with headers
- **Intelligent Scrolling**: Auto-scroll with "new messages" counter and scroll-to-bottom
- **Enhanced Read Receipts**: Automatic read receipt handling with improved tracking
- **Advanced Message Styling**: Visual hierarchy with dimmed metadata and smaller timestamps
- **System Message Icons**: Material Design icons instead of emojis for better consistency
- **Enhanced Message States**: Improved styling for encrypted, deleted, and unreadable messages
- **Emoji Picker**: Rich emoji selection with theme-aware design and mobile optimization
- **File Attachments**: Secure file sharing with encryption and size limits
- **Message Editing**: Real-time message editing with WebSocket synchronization
- **Message Deletion**: Soft deletion with proper cleanup and real-time updates

### 🎯 User Experience

- **Progressive Web App**: Installable on desktop and mobile devices
- **Responsive Design**: Optimized for all screen sizes with mobile-first approach
- **Dark Theme**: Modern, eye-friendly interface
- **Auto-Reconnection**: Seamless connection recovery with exponential backoff
- **Search Functionality**: Find users and conversations quickly

### 📱 Mobile Optimizations

- **Dynamic Viewport Handling**: Real-time keyboard detection and layout adjustments
- **Performance Optimized**: 60fps scrolling and typing on mobile devices
- **Battery Efficient**: Reduced CPU usage through optimized event handling
- **Smart Keyboard Management**: Smooth virtual keyboard transitions without layout breaks
- **iOS Safari Compatible**: Visual viewport API integration for modern iOS devices
- **Safe Area Support**: Proper handling of iPhone safe areas and notches
- **Orientation Aware**: Seamless experience across device rotations
- **Enhanced Emoji Picker**: Improved mobile scrolling and positioning
- **Theme Consistency**: Fixed mobile theme switching for chat backgrounds
- **Scroll Optimization**: Prevented unwanted scrolling in mobile views

## 🏗️ Architecture

### Technology Stack

#### Landing Pages

- **Framework**: Astro 4.0 (Static Site Generator)
- **Pages**: Home, About, FAQ, Legal, Author
- **SEO**: Built-in sitemap generation and meta optimization
- **Performance**: Optimized static builds with minimal JavaScript
- **Styling**: Modern CSS with responsive design

#### Frontend

- **Framework**: Angular 18 (Standalone Components)
- **UI Library**: Angular Material
- **State Management**: RxJS BehaviorSubjects
- **Encryption**: Web Crypto API
- **Real-Time**: Socket.IO Client
- **Styling**: CSS3 with custom animations and CSS variables
- **Architecture**: Facade pattern with specialized services for chat functionality
- **Mobile Optimization**: Visual Viewport API, CSS `dvh` units, dynamic layout calculations

#### Backend

- **Runtime**: Node.js 22+
- **Framework**: Express.js
- **WebSocket**: Socket.IO
- **Database**: PostgreSQL with Prisma ORM
- **Authentication**: JWT (JSON Web Tokens)
- **Security**: Helmet, CORS, Rate Limiting
- **Password Hashing**: bcrypt

#### Infrastructure

- **Containerization**: Docker (Multi-stage build)
- **Deployment**: Railway/Cloud platforms
- **Build Tools**: TypeScript, Webpack
- **Package Manager**: npm
- **Code Quality**: ESLint, Prettier, Stylelint, Husky pre-commit hooks
- **Linting**: Comprehensive linting for Angular, Node.js, and Astro with strict unused variable
  checking
- **Debug-Free Production Code**: Clean production builds with all debug code removed

### Project Structure

```
quasar-contact-app/
├── landing/                # Astro static site generator
│   ├── public/             # Static assets for landing
│   │   └── assets/
│   │       └── images/
│   ├── scripts/            # Build scripts
│   ├── src/
│   │   ├── components/     # Astro components
│   │   ├── layouts/        # Page layouts
│   │   ├── pages/          # Static pages
│   │   ├── scripts/        # Client-side scripts
│   │   └── styles/         # Global styles
│   ├── astro.config.mjs
│   └── package.json
├── frontend/               # Angular application
│   ├── src/
│   │   ├── app/
│   │   │   ├── core/       # Core services and models
│   │   │   ├── features/   # Feature modules (auth, chat)
│   │   │   │   └── chat/
│   │   │   │       └── chat-room/
│   │   │   │           └── services/  # Specialized chat services
│   │   │   ├── shared/     # Shared components
│   │   │   └── utils/      # Utility functions
│   │   ├── assets/         # Images, icons, fonts
│   │   └── environments/   # Environment configs
│   └── angular.json
├── backend/                # Node.js server
│   ├── src/
│   │   ├── config/         # Server configuration
│   │   ├── controllers/    # Route controllers
│   │   ├── middleware/     # Express middleware
│   │   ├── routes/         # API routes
│   │   ├── services/       # Business logic
│   │   ├── socket/         # Socket.IO handlers
│   │   ├── app.ts          # Express app setup
│   │   └── server.ts       # Server entry point
│   ├── prisma/             # Prisma ORM configuration
│   │   ├── schema.prisma   # Database schema
│   │   └── migrations/     # Database migrations
│   ├── backup/             # MongoDB backup data
│   └── package.json
├── public/                 # Generated static files (from Astro)
├── dist/                   # Production build output
├── docs/                   # Documentation
│   ├── LINTING.md         # Code quality and linting guide
│   └── COOKIE_STRATEGY.md # Cookie and analytics strategy
├── .husky/                 # Git hooks
├── eslint.config.js        # Root ESLint configuration
├── .prettierrc.js          # Prettier configuration
├── .stylelintrc.js         # Stylelint configuration
├── .lintstagedrc.js        # lint-staged configuration
├── Dockerfile              # Container configuration
├── nixpacks.toml           # Nixpacks deployment config
└── package.json            # Root package file
```

### Chat Architecture

The chat system uses a modern facade pattern with specialized services:

#### Core Chat Services

- **`ChatRoomFacadeService`**: Main orchestrator for all chat room functionality
- **`ChatMessageService`**: Message grouping, date headers, and state management
- **`ChatScrollService`**: Intelligent auto-scrolling and scroll position management
- **`ChatTypingService`**: Typing indicators and textarea auto-resize functionality
- **`ChatUiStateService`**: UI state management (editing, attachments, loading states)
- **`ChatEventHandlerService`**: Centralized event subscriptions and handlers
- **`ChatLifecycleService`**: Component initialization and cleanup management
- **`MobileChatLayoutService`**: Dynamic mobile layout calculations and viewport handling

#### Core Application Services

**Authentication & Security Services**

- **`AuthService`** (`auth.service.ts`): Complete user authentication lifecycle with HttpOnly JWT
  cookies, smart key management, CSRF integration, Cloudflare Turnstile bot protection, and honeypot
  validation
- **`CryptoService`** (`crypto.service.ts`): RSA-OAEP + AES-GCM hybrid encryption with 2048-bit
  keys, SHA-256 fingerprinting, chunk-based Base64 conversion, and error throttling
- **`VaultService`** (`vault.service.ts`): AES-GCM encrypted IndexedDB storage with per-user
  databases, reactive state management, and ArrayBuffer serialization support
- **`CsrfService`** (`csrf.service.ts`): CSRF token management with LocalStorage persistence and
  memory fallback for secure API requests
- **`HoneypotService`** (`honeypot.service.ts`): Bot detection with invisible form fields, timing
  validation, CSS hiding, and behavioral pattern analysis
- **`TurnstileService`** (`turnstile.service.ts`): Cloudflare Turnstile integration with theme
  support, flexible sizing, width preservation, and automatic widget re-rendering

**Communication & Real-time Services**

- **`WebSocketService`** (`websocket.service.ts`): Real-time communication with automatic
  reconnection, health monitoring, user presence tracking, and mobile performance optimization
- **`ChatSessionService`** (`chat-session.service.ts`): Complex chat orchestration with end-to-end
  encryption, connection monitoring, key status management, and message persistence
- **`MessagesService`** (`messages.service.ts`): HTTP API communication for message operations with
  authentication validation and error handling
- **`UserService`** (`user.service.ts`): User management and key exchange operations with repository
  pattern and authentication checks

**State Management & UI Services**

- **`NotificationService`** (`notification.service.ts`): Real-time notification management with rate
  limiting, debounced operations, and mobile change detection
- **`ThemeService`** (`theme.service.ts`): Dark/light theme management with system preference
  detection, persistence, and reactive state streams
- **`LoadingService`** (`loading.service.ts`): Global loading state with timeout protection,
  emergency stops, and authentication-specific states
- **`ScrollService`** (`scroll.service.ts`): Cross-browser scroll management with mobile
  compatibility and multiple fallback strategies

**Authentication Guards & Interceptors**

- **`AuthGuard`** (`auth.guard.ts`): Route guard ensuring users are authenticated before accessing
  protected routes with redirect functionality
- **`UnauthGuard`** (`unauth.guard.ts`): Route guard preventing authenticated users from accessing
  auth pages with smart redirects
- **`AuthInterceptor`** (`auth.interceptor.ts`): HTTP interceptor handling authentication, CSRF
  tokens, rate limiting, and comprehensive error responses

**Utility Services & Helpers**

- **`ApiPathsUtil`** (`api-paths.util.ts`): Utility functions for constructing environment-specific
  API and WebSocket paths
- **`AvatarUtil`** (`avatar.util.ts`): Default avatar generation based on user input hash with
  consistent styling

### Core Services Architecture

#### Authentication & Security Services

**AuthService**

- Complete user authentication lifecycle with HttpOnly JWT cookies
- Smart key management with automatic generation for new users
- CSRF token integration and Cloudflare Turnstile bot protection
- Honeypot form validation with timing analysis

**CryptoService**

- RSA-OAEP + AES-GCM hybrid end-to-end encryption
- 2048-bit key pair generation with SHA-256 fingerprinting
- Chunk-based Base64 conversion to prevent stack overflow
- Error throttling to prevent console spam

**VaultService**

- AES-GCM encrypted IndexedDB storage with per-user databases
- Repository pattern with reactive readiness state
- Proper serialization for ArrayBuffers and complex objects
- Read-only mode support for security

**HoneypotService**

- Bot detection with invisible form fields and timing validation
- CSS-based field hiding and form interaction analysis
- Spam prevention with behavioral pattern detection

#### Communication Services

**WebSocketService**

- Real-time communication with automatic reconnection (exponential backoff)
- Health monitoring with ping/pong and connection quality tracking
- User presence management and cookie-based authentication
- NgZone optimization for mobile performance

**ChatSessionService**

- Complex chat orchestration with end-to-end encryption
- Connection monitoring with fallback sync mechanisms
- Key status management with artificial blocking states
- Message persistence with vault storage integration

**MessagesService & UserService**

- HTTP API communication with authentication validation
- Repository pattern for data management and key exchange
- Error handling with fallback responses and proper error propagation

#### State & UI Management Services

**NotificationService**

- Real-time notification management with rate limiting
- Debounced refresh operations and mobile change detection
- Immediate update streams with NgZone integration

**ThemeService**

- Dark/light theme management with system preference detection
- LocalStorage persistence and mobile meta tag updates
- Reactive theme state with BehaviorSubject streams

**LoadingService**

- Global loading state with timeout protection (15-second limit)
- Emergency stop functionality and NgZone integration
- Authentication-specific loading states

#### Performance Features

- **Memory Management**: Automatic cleanup of RxJS subscriptions and event listeners
- **Change Detection Optimization**: Strategic use of NgZone for performance
- **Event Throttling**: Debounced typing events and scroll listeners
- **Layout Optimization**: CSS variables and `dvh` units for smooth mobile experience
- **Lazy Loading**: Deferred calculations using `requestAnimationFrame`

### Backend Services Architecture

#### Database Service

**Database Service** (`database.service.ts`)

- PostgreSQL connection management via Prisma ORM with connection pooling
- Health checks with retry logic and configurable timeout settings
- Graceful connection/disconnection with environment-based configuration
- Connection limits and timeout protection for production stability

#### Backend Services

**Database & Infrastructure Services**

- **`DatabaseService`** (`database.service.ts`): PostgreSQL connection management via Prisma ORM
  with connection pooling, health checks with retry logic, graceful connection handling, and timeout
  protection
- **`EmailService`** (`email.service.ts`): SMTP email delivery for password reset with HTML/text
  dual format emails, mobile-responsive templates, TLS support, and connection verification

**Middleware & Security Services**

- **`BotBlockerMiddleware`** (`bot-blocker.middleware.js`): Advanced bot protection with 98+ blocked
  attack vectors, user agent filtering, auto-blacklisting, and request logging with daily rotation
- **`HoneypotMiddleware`** (`honeypot.middleware.js`): Server-side honeypot validation with form
  timing analysis, suspicious pattern detection, and behavioral blocking
- **`SecurityMiddleware`** (`security.middleware.js`): Comprehensive security headers with Helmet.js
  integration, CORS protection, input validation, and SQL injection prevention
- **`RateLimitMiddleware`** (`rate-limit.middleware.js`): Multiple rate limiters with brute-force
  protection, authentication-specific limiting, and configurable thresholds

**Backend Utility Services**

- **`CookieUtils`** (`cookie.utils.ts`): Cookie management utilities for authentication and CSRF
  tokens with secure options, HttpOnly settings, and cross-domain support

**Landing Page Services**

- **`LandingPageScript`** (`script.js`): Interactive UI management with beta banner, mobile menu,
  scroll effects, carousel functionality, touch/swipe support, and intersection observer animations
- **`CookieConsentManager`** (`cookieConsent.js`): GDPR-compliant cookie consent management with
  analytics tracking, batched event sending, and local storage persistence

#### Service Design Patterns

**Architecture Patterns Used**

- **Facade Pattern**: ChatRoomFacadeService orchestrates complex chat functionality
- **Observer Pattern**: Extensive RxJS BehaviorSubjects for reactive state management
- **Repository Pattern**: Clean data access abstraction for users and messages
- **Singleton Pattern**: Angular's `providedIn: 'root'` for service instances

**Security Integration**

- **End-to-End Encryption**: Service-level RSA-OAEP + AES-GCM implementation
- **HttpOnly Cookies**: JWT tokens handled securely at service layer
- **CSRF Protection**: Token-based validation across all authenticated services
- **Bot Protection**: Integrated Cloudflare Turnstile and honeypot validation services

**Performance Optimization Strategies**

- **NgZone Integration**: Proper change detection for mobile performance
- **Debouncing/Throttling**: Rate limiting for expensive service operations
- **RequestAnimationFrame**: Smooth UI updates without main thread blocking
- **Connection Pooling**: Database efficiency through Prisma optimization
- **Caching**: Message vault storage and intelligent key status caching

### Recent Improvements

#### Database Migration (July 2025)

- **Complete migration from MongoDB to PostgreSQL** with Prisma ORM
- **Data preservation**: All original MongoDB data backed up during migration
- **Enhanced type safety**: Better TypeScript integration with Prisma
- **Improved performance**: Connection pooling and optimized queries
- **ACID compliance**: PostgreSQL transactions for data consistency

#### Performance Enhancements

- **Connection stability**: Improved database connection handling
- **Angular lifecycle**: Replaced setTimeout with proper Angular lifecycle methods
- **Memory optimization**: Better RxJS subscription cleanup and garbage collection
- **Event optimization**: Debounced resize and typing events for smoother experience

## 🚀 Getting Started

### Prerequisites

- Node.js 22+ and npm 10+
- PostgreSQL 14+ (local or cloud instance)
- Git

### Installation

1. **Clone the repository**

   ```bash
   git clone https://github.com/art2url/quasar-contact-app.git
   cd quasar-contact-app
   ```

2. **Install dependencies**

   ```bash
   npm run install:all
   ```

3. **Set up PostgreSQL database**

   Install and start PostgreSQL, then create a database:

   ```bash
   # Create database (adjust for your PostgreSQL setup)
   createdb quasar_chat
   ```

4. **Set up environment variables**

   Create `.env` file in the backend directory:

   ```env
   # Server Configuration
   PORT=3000
   NODE_ENV=development

   # Database (PostgreSQL with connection pooling)
   DATABASE_PUBLIC_URL=postgresql://username:password@localhost:XXXX/quasar_chat?connection_limit=XX&pool_timeout=XX&connect_timeout=XX

   # Security
   JWT_SECRET=your-super-secret-jwt-key
   JWT_EXPIRES_IN=7d

   # Client URLs
   CLIENT_ORIGIN=http://localhost:4200

   # Cloudflare Turnstile (bot protection)
   NG_APP_TURNSTILE_SITE_KEY=your-turnstile-site-key

   # Email Service (optional)
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your-email@gmail.com
   EMAIL_PASS=your-app-password
   EMAIL_FROM=noreply@quasar.contact
   ```

5. **Set up Cloudflare Turnstile**
   - Go to [Cloudflare Dashboard](https://dash.cloudflare.com/)
   - Navigate to "Turnstile"
   - Create a new site and add your domains (e.g., `localhost`, `your-domain.com`)
   - Copy the site key to your environment configuration

6. **Run database migrations**

   ```bash
   cd backend
   npx prisma migrate dev
   npx prisma generate
   ```

7. **Configure frontend environment**

   Create `environment.ts` in frontend/src/environments/:

   ```typescript
   export const environment = {
     production: false,
     apiUrl: 'http://localhost:3000/api',
     wsUrl: 'http://localhost:3000',
     turnstileSiteKey: 'your-turnstile-site-key',
   };
   ```

### Development

1. **Start PostgreSQL** (if running locally)

   Ensure PostgreSQL is running on your system.

2. **Run in development mode**

   ```bash

   npm run dev
   ```

3. **Access the application**
   - Landing pages: http://localhost:3000 (in production mode)
   - Landing dev: http://localhost:4321 (in dev mode)
   - Angular app: http://localhost:4200 (dev) or http://localhost:3000/app (production)

### Production Build

1. **Build for production**

   ```bash
   npm run build
   ```

   This will:
   - Build Astro landing pages
   - Build Angular application
   - Copy all assets to public directory
   - Build backend TypeScript

2. **Start production server**

   ```bash
   npm start
   ```

### Docker Deployment

1. **Build Docker image**

   ```bash
   docker build -t quasar-contact-app .
   ```

2. **Run container**

   ```bash
   docker run -p 3000:3000 \
     -e DATABASE_PUBLIC_URL=your-postgresql-uri \
     -e JWT_SECRET=your-secret \
     -e NG_APP_API_URL=https://your-domain.com/api \
     -e NG_APP_WS_URL=https://your-domain.com \
     -e NG_APP_TURNSTILE_SITE_KEY=your-turnstile-site-key \
     quasar-contact-app
   ```

## 📝 API Functionality Overview

**🔒 Security-First API Design**: This section describes the application's API capabilities without
exposing implementation details.

### Security Architecture

- **Zero-Trust Model**: Every request authenticated and validated
- **Multi-Layer Protection**: Bot detection, rate limiting, CSRF protection, input validation
- **Encrypted Communications**: All sensitive data encrypted in transit and at rest
- **Abuse Prevention**: Sophisticated anti-abuse and anomaly detection systems
- **Security Monitoring**: Comprehensive request monitoring and logging

### Developer Access

- **Secure Documentation**: Complete API specifications available through secure developer portal
- **Authentication Required**: Developer access requires verified authentication
- **Rate Limited**: All API access subject to rate limiting and monitoring
- **Security Review**: All integrations subject to security review process

_For complete API documentation including endpoints, request formats, and authentication details,
please contact the development team or access the secure developer portal._

### Authentication System

**🔐 Secure Authentication Features**

- **User Registration**: Secure account creation with validation and verification
- **Multi-Factor Login**: Username/email login with optional MFA support
- **Password Security**: Bcrypt hashing with configurable complexity
- **Session Management**: JWT tokens with HttpOnly cookies
- **Account Recovery**: Secure password reset with email verification
- **Anti-Automation**: Cloudflare Turnstile and honeypot protection against bots

### Key Exchange

**🔒 Security-Critical Functionality**: All cryptographic key operations are protected by:

- Multi-layer authentication validation
- Rate limiting specific to cryptographic operations
- Bot detection and honeypot validation
- Request signing and CSRF protection

#### Available Key Operations

**Public Key Upload**

- Secure upload of RSA public keys for new users
- Base64 encoded key bundle format
- Automatic key validation and storage

**Public Key Retrieval**

- Secure retrieval of user public keys for encryption
- User-specific key access with authentication
- Key fingerprint validation

**Key Status Management**

- Ability to mark keys as compromised or missing
- Secure key rotation support
- Administrative key management functions

_Note: Specific API endpoints and request formats are available in the developer documentation for
authenticated developers only._

### User Management

**🛡️ User Account Operations**

- **Avatar Management**: Secure avatar URL updates with validation
- **Password Reset**: Token-based password reset with email verification
- **Profile Updates**: User profile modification with authentication
- **Account Security**: Multi-factor authentication support

### Analytics & Monitoring

**📊 Privacy-First Analytics**

- **Proxy Service**: Analytics data processing without direct third-party access
- **Event Batching**: Efficient event collection and transmission
- **Privacy Compliance**: GDPR-compliant analytics with user consent
- **Data Minimization**: Only essential metrics collected

_Note: Specific implementation details available in secure developer documentation._

### Room Management

**💬 Secure Chat Room Operations**

- **DM Room Creation**: Secure direct message room establishment between users
- **Room Listing**: User-specific room access and management
- **Participant Management**: Adding/removing participants with proper authorization
- **Room Security**: End-to-end encrypted room metadata

### Message Operations

**📨 Secure Message Handling**

- **Message Retrieval**: Paginated message history with encryption support
- **Message Overview**: Unread count and conversation summaries
- **Message Search**: Encrypted message search capabilities
- **Message Management**: Edit, delete, and status tracking
- **Offline Support**: Message queuing for offline users

### Real-Time Communication

**⚡ Secure WebSocket Operations**

- **Message Sending**: Real-time encrypted message transmission
- **Message Editing**: Live message modification with encryption
- **Message Deletion**: Secure message removal with cleanup
- **Typing Indicators**: Real-time typing status updates
- **Read Receipts**: Message read status tracking
- **Connection Management**: Health monitoring and auto-reconnection
- **User Presence**: Online/offline status management

_Note: WebSocket event names and data structures are defined in the secure API specification._

### WebSocket Security Features

**🔐 Encrypted Real-Time Features**

- **Authenticated Connections**: Cookie-based authentication for WebSocket connections
- **Encrypted Events**: All real-time data transmitted with encryption
- **Rate Limiting**: WebSocket-specific rate limiting and abuse prevention
- **Connection Monitoring**: Health checks and automatic reconnection
- **Session Management**: Secure session handling with timeout protection

_Note: WebSocket implementation details, event names, and data structures are provided through
secure developer channels only._

## 🔒 Security Implementation

### Encryption Flow

1. **Key Generation** (on user registration)
   - Generate RSA-OAEP key pair
   - Store private key in browser's IndexedDB
   - Upload public key to server

2. **Sending Messages**
   - Generate AES-GCM session key
   - Encrypt message with AES-GCM
   - Encrypt session key with recipient's RSA public key
   - Send encrypted message + encrypted session key

3. **Receiving Messages**
   - Decrypt session key with own RSA private key
   - Decrypt message with decrypted session key
   - Display plaintext message

### Security Features

- **HTTPS Only**: All production traffic must use TLS
- **JWT Authentication**: Stateless authentication with token expiry
- **Rate Limiting**: Protection against brute force attacks
- **CORS Protection**: Strict origin validation
- **Helmet.js**: Security headers for XSS and other attacks
- **Input Validation**: Server-side validation for all inputs
- **Password Requirements**: Minimum 6 characters, hashed with bcrypt

## 🧪 Testing

Currently, the project doesn't include automated tests. Testing implementation is planned for future
releases.

## 🛠️ Development Tools & Configuration

### Build Tools & Scripts

The project includes comprehensive build automation with the following key scripts:

#### Root Level Commands

```bash
npm run install:all    # Install dependencies for all projects
npm run clean          # Clean all build artifacts and node_modules
npm run full           # Full production build with asset copying
npm run copy:landing   # Copy Astro landing pages to public directory
npm run style:fix      # Fix styling issues across all projects
npm run dev            # Start all services in development mode
```

#### Frontend Development

```bash
cd frontend
npm run build          # Production build
npm run dev            # Development server
npm run typecheck      # TypeScript type checking
npm run style:css      # CSS linting
npm run style:css:fix  # Fix CSS linting issues
```

#### Backend Development

```bash
cd backend
npm run build          # TypeScript compilation
npm run dev            # Development with nodemon
npm run start          # Production server
npm run typecheck      # TypeScript checking
npm run style:fix      # ESLint and Prettier fixes
```

#### Landing Page Development

```bash
cd landing
npm run build          # Static site generation
npm run dev            # Astro development server
npm run build:selective # Selective build optimization
npm run deploy:pages   # Deploy to GitHub Pages
npm run style:fix      # Style and format fixes
```

### Code Quality & Linting

#### ESLint Configuration

- **Flat Config**: Modern ESLint 9+ flat configuration
- **TypeScript Support**: Full TypeScript linting across all projects
- **Angular Rules**: Angular-specific linting with template checking
- **Unused Variables**: Strict unused variable detection and removal
- **Import Sorting**: Automatic import organization

#### Pre-commit Hooks

- **Husky Integration**: Git hooks for code quality enforcement
- **Lint-staged**: Run linters only on staged files
- **Automatic Fixes**: Auto-fix linting issues before commit
- **Type Checking**: Ensure TypeScript compilation success

#### Style Configuration

```bash
# Prettier configuration for consistent formatting
# Stylelint for CSS/SCSS quality and property ordering
# Angular template linting with accessibility checks
```

### Docker & Containerization

#### Multi-stage Docker Build

```dockerfile
# Optimized Docker build with:
# - Multi-stage compilation for smaller images
# - Health checks for container monitoring
# - Proper layer caching for faster builds
# - Non-root user for security
# - Build-time environment variable injection
```

#### Health Checks

```bash
# Container health monitoring
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s \
  CMD curl -f http://localhost:3000/api/health || exit 1
```

### Deployment Configuration

#### Nixpacks (Railway/Cloud)

- **Custom Build Process**: Optimized for cloud deployment
- **Environment Handling**: Secure environment variable management
- **Asset Optimization**: Automatic asset compression and serving
- **Database Migrations**: Automatic Prisma migration on deploy

#### Environment Management

- **Multi-environment Support**: Development, staging, production configs
- **Build-time Variables**: Angular environment injection during build
- **Runtime Variables**: Server configuration via environment variables
- **Security**: Secure handling of secrets and API keys

### Manual Testing Checklist

#### Core Functionality

- [ ] User registration and login
- [ ] Key generation and exchange
- [ ] Message encryption/decryption
- [ ] Real-time message delivery
- [ ] Offline message queuing
- [ ] Connection recovery
- [ ] Message editing/deletion
- [ ] User search functionality
- [ ] Database migrations (Prisma)

#### Chat Features

- [ ] Message grouping with date headers
- [ ] Typing indicators and auto-resize
- [ ] Intelligent auto-scrolling
- [ ] Read receipt tracking
- [ ] New message notifications
- [ ] Enhanced message styling and visual hierarchy
- [ ] System message icons and states
- [ ] Emoji picker functionality and theme compatibility
- [ ] File attachment upload and download
- [ ] Real-time message editing and deletion

#### Mobile Experience

- [ ] Virtual keyboard handling on iOS/Android
- [ ] Viewport adjustments during keyboard show/hide
- [ ] Smooth scrolling performance (60fps)
- [ ] Safe area handling on iPhone
- [ ] Orientation change handling
- [ ] Touch interaction responsiveness
- [ ] Emoji picker mobile functionality
- [ ] Theme switching consistency
- [ ] Optimized scroll behavior

#### Security & Protection

- [ ] Bot blocker effectiveness
- [ ] Honeypot trap detection
- [ ] Cloudflare Turnstile widget functionality
- [ ] Turnstile theme switching and width preservation
- [ ] Rate limiting functionality
- [ ] CSRF protection validation
- [ ] Security headers verification

#### Development & Build

- [ ] All npm scripts execution
- [ ] TypeScript compilation
- [ ] Linting and formatting
- [ ] Docker build and health checks
- [ ] Environment variable injection

#### API Endpoints

- [ ] All authentication endpoints
- [ ] Room management (DM creation/listing)
- [ ] Message CRUD operations
- [ ] Key management endpoints
- [ ] Analytics proxy functionality
- [ ] User avatar updates

#### Landing Pages & SEO

- [ ] Landing page navigation
- [ ] SEO meta tags and sitemap
- [ ] Google Analytics integration

## 🚦 Deployment

### Railway Deployment

1. Connect your GitHub repository to Railway
2. Set environment variables in Railway dashboard
3. Deploy using the included `nixpacks.toml` configuration

### Environment Variables for Production

```env
# Required
NODE_ENV=production
DATABASE_PUBLIC_URL=postgresql://user:password@host:XXXX/database?connection_limit=XX
JWT_SECRET=<generate-strong-secret>
NG_APP_API_URL=https://your-domain.com/api
NG_APP_WS_URL=https://your-domain.com
NG_APP_TURNSTILE_SITE_KEY=<your-turnstile-site-key>

# Optional
EMAIL_HOST=smtp.provider.com
EMAIL_PORT=587
EMAIL_USER=your-email
EMAIL_PASS=your-password
GA_MEASUREMENT_ID=G-XXXXXXXXXX
```

## 🤝 Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

### Code Style

- Follow Angular style guide for frontend code
- Follow Astro best practices for landing pages
- Use ESLint and Prettier for code formatting
- Write meaningful commit messages
- Add comments for complex logic
- Maintain clean code with no unused variables or debug statements
- Remove all console.log statements except for legitimate error logging

### GPL-3.0 License Implications

When contributing to this project, please note:

- Your contributions will also be licensed under GPL-3.0
- Any derivative work must also be open-source under GPL-3.0
- You must preserve copyright notices and license information
- If you distribute a modified version, you must clearly mark it as changed

## 📄 License

This project is licensed under the **GNU General Public License v3.0** - see the LICENSE file for
details.

### What this means:

- ✅ **Freedom to use** - Use for any purpose, including commercial (with conditions)
- ✅ **Freedom to study** - Access and study the source code
- ✅ **Freedom to share** - Copy and distribute the software
- ✅ **Freedom to improve** - Modify and distribute your modifications

### Important Requirements for Commercial Use:

- 📋 **Copyleft requirement** - Any distributed modifications must also be GPL-3.0
- 📋 **Source code disclosure** - Must provide source code when distributing
- 📋 **Copyright notices** - Must include original copyright and license notices
- 📋 **Document changes** - Changes must be clearly documented
- ⚠️ **No proprietary derivatives** - Cannot create closed-source commercial versions
- ⚠️ **Network use clause** - If you modify and offer as network service, must provide source to
  users

## 💡 Acknowledgments

- Astro team for the excellent static site generator
- Angular team for the amazing framework
- Socket.IO for real-time capabilities
- Web Crypto API for client-side encryption
- [Boring Avatars](https://github.com/boringdesigners/boring-avatars) by Boring Designers for avatar
  design inspiration (MIT License)
- The open-source community

## 📞 Support

For issues and feature requests, please use the GitHub Issues page.

---

**Note**: This is a beta release. The core features are stable and ready for production use. The
encryption implementation should be audited by security professionals before deploying in sensitive
environments.
