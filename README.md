# Quasar Contact — Secure End-to-End Encrypted Chat

<p align="center">
  <a href="https://quasar.contact/" target="_blank">
    <img src="landing/public/assets/images/preview.png" alt="Quasar Contact preview" width="100%">
  </a>
</p>

Quasar Contact is a privacy-focused, real-time messaging application with end-to-end encryption.
Built with Angular 18, Node.js, and Socket.IO — your conversations remain completely private with
client-side encryption and zero plaintext logging.

> **Beta** — core features are stable, but the crypto implementation hasn't been independently
> audited yet.

## Features

### Security & Privacy

- **End-to-end encryption** — RSA-OAEP + AES-GCM hybrid encryption via Web Crypto API
- **Zero-knowledge server** — private keys never leave your browser, stored in AES-GCM encrypted
  IndexedDB
- **Client-side key generation** — RSA-OAEP 2048-bit key pairs with SHA-256 fingerprinting
- **Encrypted local storage** — Vault service with per-user IndexedDB databases
- **CSRF protection** — double-submit cookie pattern with cryptographically secure tokens
- **JWT security** — HttpOnly cookies with configurable expiry and refresh token rotation
- **Advanced rate limiting** — multiple rate limiters with brute-force protection
- **Bot protection** — Cloudflare Turnstile + multi-layer honeypot + 98+ blocked attack paths
- **Auto-blacklisting** — dynamic IP blocking for suspicious behavior
- **Security headers** — Helmet.js, strict CORS, parameterized queries via Prisma
- **Session management** — secure session handling with automatic cleanup
- **Key management** — private key fingerprinting, corruption detection, and rotation support
- **Input validation** — server-side validation and sanitization for all inputs
- **Password security** — bcrypt hashing, minimum requirements enforced

### Messaging

- **Real-time delivery** — Socket.IO with automatic reconnection (exponential backoff)
- **Edit & delete** — live message editing and deletion with WebSocket sync
- **Typing indicators** and **read receipts**
- **Message grouping** — automatic grouping by date with headers
- **Offline queue** — message delivery when users reconnect, with TTL management
- **Emoji picker** — theme-aware, mobile-optimized
- **Image attachments** — in-chat image sharing with server-side compression, stored as base64
- **Smart scrolling** — auto-scroll with "new messages" counter and scroll-to-bottom button
- **Online/offline presence** — real-time user status tracking
- **Message states** — visual distinction for encrypted, deleted, and unreadable messages
- **System message icons** — Material Design icons for consistency

### Mobile

- **Visual Viewport API** — real-time keyboard detection and layout adjustment
- **iOS Safari compatible** — proper handling of virtual keyboard, safe areas, and notches
- **60fps scrolling** — optimized event handling with `requestAnimationFrame`
- **Orientation-aware** — seamless experience across device rotations
- **Battery efficient** — debounced resize and typing events, `dvh` units, CSS variable-based layout
- **Smart keyboard management** — smooth virtual keyboard transitions without layout breaks

### UX

- **Progressive Web App** — installable on desktop and mobile
- **Dark/light theme** — system preference detection with manual override and localStorage
  persistence
- **User search** — find contacts quickly
- **Responsive** — mobile-first, works on all screen sizes
- **Settings page** — avatar picker (stock avatars), private key download as PEM backup, private key
  import from backup file with fingerprint verification

## Architecture

### Technology stack

#### Landing pages

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

- **Containerization**: Docker (multi-stage build)
- **Deployment**: Railway / cloud platforms
- **Build Tools**: TypeScript
- **Package Manager**: npm workspaces
- **Code Quality**: ESLint, Prettier, Stylelint, Husky pre-commit hooks
- **Linting**: Comprehensive linting for Angular, Node.js, and Astro with strict unused variable
  checking

### Project structure

```text
quasar-contact-app/
├── landing/                # Astro static site (home, about, FAQ, legal, author)
│   ├── public/             # Static assets
│   │   └── assets/images/
│   ├── src/
│   │   ├── components/     # Astro components
│   │   ├── layouts/        # Page layouts
│   │   ├── pages/          # Static pages
│   │   ├── scripts/        # Client-side scripts (cookie consent, image optimization)
│   │   └── styles/         # Global styles
│   └── astro.config.mjs
├── frontend/               # Angular application
│   └── src/
│       ├── app/
│       │   ├── core/
│       │   │   ├── auth/       # guards (auth, unauth, reset-password), interceptor
│       │   │   ├── models/
│       │   │   ├── services/   # auth, crypto, vault, websocket, csrf, chat-session, ...
│       │   │   └── utils/      # api-paths, avatar, date
│       │   ├── features/
│       │   │   ├── auth/       # login, register, forgot-password, reset-password
│       │   │   ├── chat/
│       │   │   │   ├── chat-list/
│       │   │   │   └── chat-room/
│       │   │   │       └── services/  # facade, message, scroll, typing, ui-state, lifecycle, mobile-layout
│       │   │   └── settings/
│       │   └── shared/
│       │       └── components/ # header, footer, emoji-picker, image-modal, image-attachment, loading-spinner, cache-info-banner
│       ├── assets/             # images, icons, fonts
│       └── environments/
├── backend/
│   ├── src/
│   │   ├── config/         # env, CORS, rate limits, security limits
│   │   ├── middleware/     # auth, CSRF, bot-blocker, bot-trap, honeypot, security-headers, logger
│   │   ├── routes/         # auth, users, messages, rooms, keys, upload, analytics
│   │   ├── sockets/        # Socket.IO event handlers
│   │   ├── services/       # database (Prisma), email (nodemailer)
│   │   ├── utils/          # encryption, cookie, password-reset, refresh-token, sanitization, security-logger
│   │   ├── app.ts          # Express app setup
│   │   └── server.ts       # Server entry point
│   └── prisma/
│       ├── schema.prisma   # Database schema
│       └── migrations/
├── docs/
│   ├── LINTING.md
│   ├── COOKIE_STRATEGY.md
│   └── TESTING.md
├── public/                 # Astro/landing build output (served at /)
├── dist/                   # Angular frontend build output (served by backend at /app)
├── .husky/                 # Git hooks
├── eslint.config.js
├── .prettierrc.js
├── .stylelintrc.js
├── .lintstagedrc.js
├── Dockerfile
├── nixpacks.toml
├── railway.json
├── Procfile
└── package.json
```

### Chat room — facade pattern

The chat room uses 8 specialized services orchestrated by a facade:

| Service                   | Responsibility                                     |
| ------------------------- | -------------------------------------------------- |
| `ChatRoomFacadeService`   | Main orchestrator — wires all services together    |
| `ChatMessageService`      | Message grouping, date headers, state              |
| `ChatScrollService`       | Auto-scroll, scroll position, "new messages" badge |
| `ChatTypingService`       | Typing indicators, textarea auto-resize            |
| `ChatUiStateService`      | Edit mode, attachment state, loading flags         |
| `ChatEventHandlerService` | Centralized Socket.IO event subscriptions          |
| `ChatLifecycleService`    | Init and cleanup on component enter/leave          |
| `MobileChatLayoutService` | Viewport calculations, keyboard offset, safe area  |

### Frontend services

#### Auth & security

- **`AuthService`** (`auth.service.ts`) — complete authentication lifecycle with HttpOnly JWT
  cookies, smart key management on login/register, CSRF integration, Cloudflare Turnstile bot
  protection, honeypot validation
- **`CryptoService`** (`crypto.service.ts`) — RSA-OAEP + AES-GCM hybrid E2E encryption, 2048-bit key
  generation, SHA-256 fingerprinting, chunk-based Base64 conversion to prevent stack overflow, error
  throttling
- **`VaultService`** (`vault.service.ts`) — AES-GCM encrypted IndexedDB with per-user databases,
  reactive readiness state, ArrayBuffer serialization, read-only mode support
- **`CsrfService`** (`csrf.service.ts`) — CSRF token lifecycle, localStorage persistence with
  in-memory fallback
- **`HoneypotService`** (`honeypot.service.ts`) — invisible fields, timing validation, CSS-based
  field hiding, behavioral pattern analysis
- **`TurnstileService`** (`turnstile.service.ts`) — Cloudflare Turnstile widget with theme support,
  flexible sizing, width preservation, automatic re-render

#### Real-time & messaging

- **`WebSocketService`** (`websocket.service.ts`) — Socket.IO connection, exponential backoff,
  health monitoring with ping/pong, user presence tracking, NgZone integration for mobile
  performance
- **`ChatSessionService`** (`chat-session.service.ts`) — chat orchestration, E2E encryption
  pipeline, connection monitoring with fallback sync, key status management, message persistence via
  vault
- **`MessagesService`** (`messages.service.ts`) — HTTP API for message CRUD with auth validation and
  error propagation
- **`UserService`** (`user.service.ts`) — user lookup and key exchange via repository pattern

#### State & UI

- **`NotificationService`** (`notification.service.ts`) — real-time notifications with rate
  limiting, debounced refresh, mobile change detection, NgZone integration
- **`ThemeService`** (`theme.service.ts`) — dark/light theme, system preference detection,
  localStorage persistence, mobile meta tag updates, reactive BehaviorSubject
- **`LoadingService`** (`loading.service.ts`) — global loading state, 15s timeout guard, emergency
  stop, auth-specific states
- **`ScrollService`** (`scroll.service.ts`) — cross-browser scroll management with mobile fallback
  strategies

#### Guards & interceptors

- **`AuthGuard`** (`auth.guard.ts`) — protects routes for unauthenticated users, redirects to login
- **`UnauthGuard`** (`unauth.guard.ts`) — prevents authenticated users from accessing auth pages
- **`ResetPasswordGuard`** (`reset-password.guard.ts`) — validates reset token presence before
  rendering form
- **`AuthInterceptor`** (`auth.interceptor.ts`) — attaches CSRF tokens, handles 401/429 responses,
  rate limit feedback

#### Utilities

- **`ApiPathsUtil`** (`api-paths.util.ts`) — constructs environment-specific API and WebSocket paths
- **`AvatarUtil`** (`avatar.util.ts`) — default avatar generation based on user input hash with
  consistent styling

### Backend services

#### Routes

| Route              | Description                                               |
| ------------------ | --------------------------------------------------------- |
| `auth.routes`      | Register, login, logout, refresh, password reset flow     |
| `users.routes`     | Avatar update, user lookup                                |
| `messages.routes`  | Send, edit, delete, mark-read, paginated history          |
| `rooms.routes`     | DM room creation and listing                              |
| `keys.routes`      | RSA public key upload, retrieval, mark-missing            |
| `upload.routes`    | Image upload with server-side compression (image/\* only) |
| `analytics.routes` | Privacy-preserving GA4 Measurement Protocol proxy         |

#### Infrastructure services

- **`DatabaseService`** (`database.service.ts`) — PostgreSQL connection management via Prisma ORM
  with connection pooling, health checks with retry logic, graceful connection/disconnection,
  timeout protection
- **`EmailService`** (`email.service.ts`) — SMTP email delivery for password reset with HTML/text
  dual format emails, mobile-responsive templates, TLS support, connection verification

#### Middleware

- **`auth.middleware`** — JWT validation, attaches user to request
- **`csrf.middleware`** — double-submit cookie CSRF validation
- **`bot-blocker`** — 98+ blocked malicious paths, user-agent filtering, auto-IP-blacklisting
- **`bot-trap`** — honeypot path traps that log and block crawlers
- **`honeypot-captcha`** — server-side form timing and field validation
- **`security-headers`** — Helmet.js with CSP, HSTS, and other headers
- **`request-logger`** — comprehensive request logging with daily rotation

#### Backend utilities

- **`encryption.utils`** — AES-256 encryption/decryption for reset tokens
- **`password-reset.utils`** — secure token generation, hashing, and expiry logic
- **`refresh-token.utils`** — refresh token rotation and revocation
- **`cookie.utils`** — HttpOnly + SameSite cookie management, environment-aware settings
- **`sanitization.utils`** — input sanitization for all user-supplied data
- **`security-logger.utils`** — structured security event logging

#### Landing page scripts

- **`script.js`** — interactive UI management with beta banner, mobile menu, scroll effects,
  carousel functionality, touch/swipe support, and intersection observer animations
- **`cookieConsent.js`** — GDPR-compliant cookie consent management with analytics tracking, batched
  event sending, and localStorage persistence
- **`imageOptimization.js`** — client-side responsive image loading and optimization

### Architecture patterns

- **Facade pattern** — `ChatRoomFacadeService` orchestrates complex chat functionality behind a
  single API
- **Observer pattern** — RxJS BehaviorSubjects for all reactive state across services
- **Repository pattern** — clean data access abstraction for users and messages
- **Singleton services** — Angular `providedIn: 'root'` for consistent service instances

### Performance

- **Memory management** — automatic cleanup of RxJS subscriptions and event listeners
- **Change detection** — strategic NgZone usage to avoid unnecessary Angular cycles
- **Event throttling** — debounced typing events and scroll listeners
- **Layout** — CSS variables and `dvh` units for smooth mobile experience
- **Lazy evaluation** — deferred calculations using `requestAnimationFrame`
- **Connection pooling** — Prisma connection pooling for database efficiency
- **Message vault** — local caching of decrypted messages with key status tracking

## Security implementation

### Encryption flow

1. **Key generation** (on user registration)
   - Generate RSA-OAEP key pair in the browser
   - Store private key in browser's IndexedDB (wrapped with AES-GCM)
   - Upload public key to server

2. **Sending messages**
   - Generate a fresh AES-GCM session key
   - Encrypt message body with the session key
   - Encrypt the session key with recipient's RSA public key
   - Send encrypted message + encrypted session key as opaque blobs

3. **Receiving messages**
   - Decrypt the session key using own RSA private key
   - Decrypt the message body using the decrypted session key
   - Display plaintext — decryption happens entirely in the browser

The server stores and forwards ciphertext only. It never participates in decryption.

### Security features

- **HTTPS only** — all production traffic must use TLS
- **JWT authentication** — stateless auth with token expiry and refresh rotation
- **Rate limiting** — brute-force protection across all sensitive endpoints
- **CORS** — strict origin validation and pre-flight handling
- **Helmet.js** — security headers including CSP and HSTS
- **Input validation** — server-side validation and sanitization for all inputs
- **SQL injection protection** — Prisma ORM with parameterized queries only
- **Password requirements** — minimum length enforced, hashed with bcrypt

## Getting started

### Prerequisites

- Node.js 22+ / npm 10+
- PostgreSQL 14+

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

3. **Set up PostgreSQL**

   ```bash
   createdb quasar_chat
   ```

4. **Configure backend** — create `backend/.env`:

   ```env
   PORT=3000
   NODE_ENV=development

   DATABASE_PUBLIC_URL=postgresql://user:password@localhost:5432/quasar_chat?connection_limit=10

   JWT_SECRET=your-jwt-secret
   TOKEN_ENCRYPTION_SECRET=your-token-encryption-secret
   SESSION_SECRET=your-session-secret
   COOKIE_SECRET=your-cookie-secret

   CLIENT_ORIGIN=http://localhost:4200

   TURNSTILE_SECRET_KEY=your-turnstile-secret

   # optional — enables password reset emails
   SMTP_HOST=smtp.gmail.com
   SMTP_PORT=587
   SMTP_SECURE=false
   SMTP_USER=you@gmail.com
   SMTP_PASS=your-app-password
   SMTP_FROM=noreply@quasar.contact

   # optional — enables analytics proxy
   GA_MEASUREMENT_ID=G-XXXXXXXXXX
   GA_API_SECRET=your-ga-api-secret
   ```

5. **Set up Cloudflare Turnstile**

   Go to [Cloudflare Dashboard](https://dash.cloudflare.com/) → Turnstile → create a new site. Add
   `localhost` and your production domain. Copy the site key into your env files.

6. **Run database migrations**

   ```bash
   cd backend
   npx prisma migrate dev
   npx prisma generate
   ```

7. **Configure frontend** — create `frontend/.env`:

   ```env
   NG_APP_API_URL=http://localhost:3000/api
   NG_APP_WS_URL=http://localhost:3000
   NG_APP_TURNSTILE_SITE_KEY=your-turnstile-site-key
   ```

### Development

Start the backend dev server (serves the pre-built Angular app from `dist/`):

```bash
npm run dev
```

For Angular hot-reload, run in a separate terminal:

```bash
cd frontend && npm start
```

Access:

- Angular app (hot-reload): <http://localhost:4200>
- Angular app (via backend): <http://localhost:3000>
- Landing (dev): run `npm run dev:landing` → <http://localhost:4321>
- Backend API: <http://localhost:3000/api>

### Production build

```bash
npm run build
```

This builds:

- Astro landing pages
- Angular application
- Copies all assets to `public/`
- Compiles backend TypeScript

```bash
npm start   # start production server
```

## Development tools

### Commands

```bash
# root
npm run install:all     # install all workspaces
npm run dev             # start backend dev server (serves pre-built frontend)
npm run dev:landing     # start Astro landing dev server
npm run build           # full production build
npm run start           # start production server
npm run clean           # wipe build artifacts and node_modules
npm run full            # clean + full build + start (one-shot deploy)
npm run copy:landing    # copy Astro output to public/
npm run style:fix       # run all linters with --fix across workspaces

# backend
cd backend
npm run dev             # ts-node-dev with hot reload
npm run build           # prisma generate + tsc
npm run typecheck       # tsc --noEmit
npm test                # jest
npm run style:fix       # ESLint + Prettier fix

# frontend
cd frontend
npm start               # ng serve (Angular dev server at localhost:4200)
npm run build           # ng build
npm run typecheck       # ng build with type checking
npm run style:css       # Stylelint check
npm run style:css:fix   # Stylelint fix

# landing
cd landing
npm run dev             # astro dev
npm run build           # astro build
npm run build:selective # selective build optimization
npm run deploy:pages    # deploy to GitHub Pages
npm run style:fix       # Prettier + ESLint fix
```

### Code quality & linting

#### ESLint

- **Flat config** — modern ESLint 9+ flat configuration across all three workspaces
- **TypeScript support** — full TypeScript linting with strict unused variable detection
- **Angular rules** — Angular-specific linting with template checking
- **Import sorting** — automatic import organization

#### Pre-commit hooks

- **Husky** — git hooks for code quality enforcement
- **lint-staged** — runs linters only on staged files
- **Automatic fixes** — auto-fix ESLint and Prettier issues before commit
- **Type checking** — TypeScript compilation verified on every commit

#### Style tools

- **Prettier** — consistent code formatting across all files
- **Stylelint** — CSS/SCSS quality and property ordering
- **Angular template linting** — accessibility and template best-practice checks

### Docker & containerization

Multi-stage Docker build:

- Smaller images via separate build and runtime stages
- Health checks for container monitoring
- Proper layer caching for faster rebuilds
- Non-root user for security
- Build-time environment variable injection

Container health check:

```bash
HEALTHCHECK --interval=30s --timeout=10s --start-period=30s --retries=3 \
  CMD curl -f http://localhost:${PORT:-3000}/health || exit 1
```

### Deployment configuration

#### Nixpacks (Railway)

- Custom build process optimized for cloud deployment
- Secure environment variable management
- Automatic Prisma migrations on deploy

#### Environment management

- Development, staging, and production configs via environment files
- Angular environment files injected at build time
- Server configuration via runtime environment variables

## Testing checklist

Before submitting a PR, verify:

### Core functionality

- [ ] User registration and login
- [ ] Key generation and exchange
- [ ] Message encryption/decryption
- [ ] Real-time message delivery
- [ ] Offline message queuing
- [ ] Connection recovery
- [ ] Message editing/deletion
- [ ] User search functionality
- [ ] Database migrations (Prisma)

### Chat features

- [ ] Message grouping with date headers
- [ ] Typing indicators and textarea auto-resize
- [ ] Intelligent auto-scrolling
- [ ] Read receipt tracking
- [ ] New message notifications
- [ ] Enhanced message styling and visual hierarchy
- [ ] System message icons and states
- [ ] Emoji picker functionality and theme compatibility
- [ ] Image attachment — upload, display, modal view
- [ ] Real-time message editing and deletion

### Mobile experience

- [ ] Virtual keyboard show/hide — layout adjusts without breaks (iOS + Android)
- [ ] Safe area on iPhone — input not hidden behind home indicator
- [ ] Smooth 60fps scrolling on mobile
- [ ] Orientation change — no layout breakage
- [ ] Touch interaction responsiveness
- [ ] Emoji picker mobile scrolling and positioning
- [ ] Theme switching consistency on mobile

### Security & protection

- [ ] Bot blocker — suspicious paths return 403/404
- [ ] Honeypot trap detection
- [ ] Cloudflare Turnstile — widget renders, theme switches, resets correctly
- [ ] Rate limiting — too many requests get 429
- [ ] CSRF token — state-changing requests include token header
- [ ] Security headers verification

### Build & infra

- [ ] All npm scripts execute without errors
- [ ] TypeScript compiles (`npm run typecheck`) in all three workspaces
- [ ] Linting passes — no ESLint or Stylelint errors
- [ ] Docker build succeeds and health check passes (`/api/health`)
- [ ] Environment variable injection works at build time
- [ ] `npx prisma migrate dev` runs clean on a fresh database

### Settings

- [ ] Avatar picker — select and save a stock avatar
- [ ] Private key download — exports as PEM file
- [ ] Private key import — restores from backup file, shows fingerprint

### API endpoints

- [ ] All authentication endpoints
- [ ] Room management (DM creation/listing)
- [ ] Message CRUD operations
- [ ] Key management endpoints
- [ ] Analytics proxy functionality
- [ ] User avatar updates

### Landing pages & SEO

- [ ] Landing page navigation
- [ ] SEO meta tags and sitemap
- [ ] Cookie consent and Google Analytics integration

## Deployment

### Railway

1. Connect your GitHub repository to Railway
2. Set environment variables in the Railway dashboard
3. Deploy using the included `nixpacks.toml` — migrations run automatically on deploy

### Docker

```bash
# NG_APP_* vars are baked in at build time — pass them as --build-arg
docker build -t quasar-contact-app \
  --build-arg NG_APP_API_URL=https://your-domain.com/api \
  --build-arg NG_APP_WS_URL=https://your-domain.com \
  --build-arg NG_APP_TURNSTILE_SITE_KEY=your-turnstile-site-key \
  .

docker run -p 3000:3000 \
  -e NODE_ENV=production \
  -e DATABASE_PUBLIC_URL=your-postgres-uri \
  -e JWT_SECRET=your-jwt-secret \
  -e TOKEN_ENCRYPTION_SECRET=your-token-secret \
  -e SESSION_SECRET=your-session-secret \
  -e COOKIE_SECRET=your-cookie-secret \
  -e CLIENT_ORIGIN=https://your-domain.com \
  -e TURNSTILE_SECRET_KEY=your-turnstile-secret-key \
  quasar-contact-app
```

### Production environment variables

```env
NODE_ENV=production
DATABASE_PUBLIC_URL=postgresql://user:password@host:5432/db?connection_limit=10
JWT_SECRET=<strong-random-secret>
TOKEN_ENCRYPTION_SECRET=<strong-random-secret>
SESSION_SECRET=<strong-random-secret>
COOKIE_SECRET=<strong-random-secret>
CLIENT_ORIGIN=https://your-domain.com
TURNSTILE_SECRET_KEY=<from-cloudflare>

# NG_APP_* variables must be set at docker build time (--build-arg), not at runtime
# NG_APP_API_URL=https://your-domain.com/api
# NG_APP_WS_URL=https://your-domain.com
# NG_APP_TURNSTILE_SITE_KEY=<from-cloudflare>

# optional — SMTP for password reset emails
SMTP_HOST=smtp.provider.com
SMTP_PORT=587
SMTP_SECURE=true
SMTP_USER=...
SMTP_PASS=...
SMTP_FROM=noreply@your-domain.com

# optional — analytics proxy
GA_MEASUREMENT_ID=G-XXXXXXXXXX
GA_API_SECRET=...
```

## Contributing

Contributions are welcome! Please follow these steps:

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/your-feature`
3. Commit your changes: `git commit -m 'feat: add your feature'`
4. Push to the branch: `git push origin feature/your-feature`
5. Open a Pull Request with a clear description of what changed and why

### Code style

- Follow Angular style guide for frontend code
- Follow Astro best practices for landing pages
- Use ESLint and Prettier for code formatting
- Write meaningful commit messages (`fix: ...`, `feat: ...`, `chore: ...`)
- No `console.log` in production paths, no unused variables or imports
- Add comments only when the "why" is non-obvious

### GPL-3.0 implications for contributors

- Your contributions will be licensed under GPL-3.0
- Any derivative work must also be open-source under GPL-3.0
- You must preserve copyright notices and license information
- If you distribute a modified version, you must clearly mark it as changed

## License

This project is licensed under the **GNU General Public License v3.0** — see the [LICENSE](LICENSE)
file for details.

### What this means

- Freedom to use — for any purpose, including commercial (with conditions)
- Freedom to study — access and study the source code
- Freedom to share — copy and distribute the software
- Freedom to improve — modify and distribute your modifications

### Requirements

- Copyleft — any distributed modifications must also be GPL-3.0
- Source code disclosure — must provide source code when distributing
- Copyright notices — must include original copyright and license notices
- Document changes — changes must be clearly documented
- No proprietary derivatives — cannot create closed-source commercial versions
- Network use clause — if you modify and offer as a network service, you must provide source to
  users

## Credits

- [Astro](https://astro.build/) — landing pages
- [Angular](https://angular.dev/) — frontend framework
- [Socket.IO](https://socket.io/) — real-time transport
- [Prisma](https://www.prisma.io/) — database ORM
- [Boring Avatars](https://github.com/boringdesigners/boring-avatars) — avatar design inspiration
  (MIT)
- Web Crypto API — browser-side encryption primitives
- The open-source community

## Support

For issues and feature requests, please use the
[GitHub Issues](https://github.com/art2url/quasar-contact-app/issues) page.

---

**Note**: This is a beta release. The core features are stable and ready for production use. The
encryption implementation should be audited by security professionals before deploying in sensitive
environments.
