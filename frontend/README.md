# Quasar Contact - Frontend

**🔒 Secure Angular 18 Application** for enterprise-grade end-to-end encrypted messaging.

Originally developed as a separate repository:
[quasar-secure-chat](https://github.com/art2url/quasar-secure-chat)

## 🛡️ Security-First Frontend Architecture

### End-to-End Encryption

- **RSA-OAEP + AES-GCM Hybrid Encryption** with 2048-bit key pairs and SHA-256 fingerprinting
- **Client-Side Key Generation** with secure storage in AES-GCM encrypted IndexedDB
- **Zero-Knowledge Architecture** - server never has access to decryption keys or plaintext
- **Key Management System** with corruption detection, automatic recovery, and rotation support
- **Vault Service** for encrypted local storage with per-user databases and serialization

### Authentication & Security

- **HttpOnly JWT Cookies** with secure session management and automatic cleanup
- **CSRF Protection** with double-submit cookie pattern and cryptographically secure tokens
- **reCAPTCHA Integration** with theme support, retry logic, and automatic widget re-rendering
- **Honeypot Protection** with invisible form fields, timing validation, and behavioral analysis
- **Authentication Guards** with route protection and smart redirect functionality

### Real-Time Security

- **Authenticated WebSocket Connections** with cookie-based authentication and health monitoring
- **Encrypted Event Transmission** with all real-time data encrypted before transmission
- **Connection Quality Tracking** with automatic reconnection and exponential backoff
- **Session Management** with secure timeout protection and cleanup procedures

## ✨ Advanced Features

### Mobile-First Experience

- **60fps Performance** with optimized scrolling and keyboard handling for mobile devices
- **Dynamic Viewport Handling** with real-time layout adjustments for virtual keyboards
- **Visual Viewport API Integration** for iOS Safari compatibility and modern mobile devices
- **Battery Efficient Design** with reduced CPU usage through strategic event optimization
- **Safe Area Support** for proper handling of iPhone safe areas and device notches

### Chat Architecture

- **Facade Pattern Implementation** with 8 specialized services for chat functionality:
  - `ChatRoomFacadeService`: Main orchestrator for all chat room functionality
  - `ChatMessageService`: Message grouping, date headers, and state management
  - `ChatScrollService`: Intelligent auto-scrolling and scroll position management
  - `ChatTypingService`: Typing indicators and textarea auto-resize functionality
  - `ChatUiStateService`: UI state management (editing, attachments, loading states)
  - `ChatEventHandlerService`: Centralized event subscriptions and handlers
  - `ChatLifecycleService`: Component initialization and cleanup management
  - `MobileChatLayoutService`: Dynamic mobile layout calculations and viewport handling

### Frontend Technologies

- **Angular 18** with standalone components and reactive forms
- **Angular Material** UI library with custom theming and mobile optimization
- **RxJS BehaviorSubjects** for reactive state management and real-time updates
- **Progressive Web App** support for installable app experience across platforms
- **TypeScript** with strict type checking and comprehensive error handling

### User Experience

- **Rich Media Support** with emoji picker and secure file attachment capabilities
- **Smart Message Features** including grouping, read receipts, and typing indicators
- **Theme Management** with dark/light theme support and system preference detection
- **Notification System** with real-time updates, rate limiting, and mobile optimization
- **Advanced UI States** with loading management, error handling, and offline support

## 🚀 Quick Start

```bash
npm install
npm start  # Development server on http://localhost:4200
```

### Prerequisites

- Node.js 22+ and npm 10+
- Backend server running (see backend README)
- Environment configuration (see main README)

## 🔧 Development Scripts

```bash
# Development
npm start              # Start dev server
npm run build          # Production build
npm run test           # Run tests (when implemented)

# Code Quality
npm run lint           # ESLint check with Angular rules
npm run lint:fix       # ESLint auto-fix
npm run format         # Prettier format
npm run style:css      # Stylelint CSS check
npm run style:css:fix  # Fix CSS style issues
npm run typecheck      # TypeScript check
```

## 🔒 Security Implementation

### Core Security Services

- **AuthService**: Complete authentication lifecycle with smart key management
- **CryptoService**: RSA-OAEP + AES-GCM encryption with performance optimization
- **VaultService**: AES-GCM encrypted IndexedDB storage with reactive state management
- **CsrfService**: CSRF token management with LocalStorage persistence
- **HoneypotService**: Client-side bot detection with behavioral pattern analysis
- **RecaptchaService**: Google reCAPTCHA V3 integration with theme awareness

### Authentication & Authorization

- **AuthGuard**: Route protection ensuring authentication before access
- **UnauthGuard**: Preventing authenticated users from accessing auth pages
- **AuthInterceptor**: HTTP request/response handling with CSRF and rate limiting
- **JWT Management**: Secure token handling with automatic refresh and validation

### State Management Security

- **NotificationService**: Real-time notification management with rate limiting
- **ThemeService**: Secure theme management with system preference detection
- **LoadingService**: Global loading state with timeout protection (15-second limit)
- **WebSocketService**: Secure real-time communication with health monitoring

## 📱 Mobile Optimization

### Performance Features

- **NgZone Integration** for proper change detection and mobile performance
- **Event Throttling** with debounced typing events and scroll listeners
- **RequestAnimationFrame** for smooth UI updates without main thread blocking
- **Layout Optimization** using CSS variables and `dvh` units for mobile experience
- **Memory Management** with automatic cleanup of RxJS subscriptions and event listeners

### Mobile-Specific Services

- **ScrollService**: Cross-browser scroll management with mobile compatibility
- **MobileChatLayoutService**: Dynamic viewport handling and keyboard detection
- **ChatScrollService**: Mobile-aware scrolling with intelligent auto-scroll logic
- **ChatTypingService**: Mobile-optimized typing indicators with performance throttling

## 🎨 User Interface

### Design System

- **Material Design Integration** with Angular Material components
- **Custom Theming** with dark/light mode support and system preferences
- **Responsive Design** optimized for all screen sizes with mobile-first approach
- **Animation System** with smooth transitions and performance-optimized effects
- **Accessibility** with ARIA support and keyboard navigation

### Advanced UI Components

- **Emoji Picker** with theme-aware design and mobile optimization
- **File Attachment System** with secure upload and encryption support
- **Message Composer** with auto-resize and advanced editing capabilities
- **Chat Interface** with intelligent scrolling and real-time updates

## 🔐 Security Best Practices

When deploying this frontend:

1. **Environment Security**: Secure handling of environment variables and API endpoints
2. **Content Security Policy**: Implement strict CSP headers for XSS protection
3. **HTTPS Only**: Ensure all traffic uses TLS encryption in production
4. **Key Storage Security**: Verify IndexedDB encryption and secure key handling
5. **Session Security**: Implement proper session timeout and cleanup procedures

## 📖 Architecture Documentation

### Service Layer

- **19 Core Services** with clear separation of concerns and security integration
- **Authentication & Security** services for comprehensive protection
- **Communication Services** for real-time and HTTP API interactions
- **State Management** services for reactive UI updates and data persistence
- **Utility Services** for cross-cutting concerns and helper functionality

### Design Patterns

- **Facade Pattern**: Complex chat functionality orchestration
- **Observer Pattern**: Reactive state management with RxJS
- **Repository Pattern**: Clean data access abstraction
- **Guard Pattern**: Route protection and authentication

## 📋 Documentation

- See the [main README](../README.md) for full project documentation and setup
- Backend integration documented in [backend README](../backend/README.md)
- Security architecture detailed in main project documentation
- Service specifications available through secure developer channels

---

**⚠️ Security Notice**: This frontend implements military-grade encryption and enterprise security
measures. Ensure proper configuration and security review before production deployment.
