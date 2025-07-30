# Unified Cookie & Storage Strategy

This document outlines the comprehensive cookie and storage strategy implemented in Quasar Contact
for enhanced security and GDPR compliance.

## Overview

The application uses a hybrid approach combining **HttpOnly cookies** for sensitive authentication
data and **localStorage** for user preferences and non-sensitive data.

## Security Enhancements Implemented

### 1. HttpOnly Cookies for Authentication

- **JWT tokens** are stored in `HttpOnly` cookies (not accessible via JavaScript)
- **CSRF tokens** are stored in regular cookies (readable by JavaScript for headers)
- **Cross-domain support** with `.quasar.contact` domain in production
- **Secure flags** enabled in production (`Secure`, `SameSite`)

### 2. CSRF Protection

- **Double-submit cookie pattern** implementation
- CSRF tokens required for all state-changing operations (POST, PUT, DELETE, PATCH)
- Automatic validation in backend middleware
- Development mode bypass for easier testing

### 3. Cookie Configuration

#### Development Settings

```typescript
{
  httpOnly: true,
  secure: false,       // HTTP allowed in development
  sameSite: 'lax',     // More permissive for development
  maxAge: 7 days,
  path: '/'
}
```

#### Production Settings

```typescript
{
  httpOnly: true,
  secure: true,        // HTTPS required
  sameSite: 'strict',  // Strict CSRF protection
  maxAge: 7 days,
  path: '/',
  domain: '.quasar.contact'  // Cross-subdomain sharing
}
```

## Storage Strategy

### HttpOnly Cookies (Backend-Managed)

**Purpose**: Sensitive authentication data that should not be accessible via JavaScript

- `auth_token` - JWT authentication token
  - Duration: 7 days
  - Automatically sent with all requests
  - Cleared on logout

### Regular Cookies (JavaScript-Accessible)

**Purpose**: CSRF protection and consent management

- `csrf_token` - CSRF protection token
  - Duration: 24 hours
  - Required in headers for state-changing requests
  - Cleared on logout

- `betaBannerClosed` - Landing page beta banner state
  - Duration: 1 year
  - Managed by landing page scripts

- Cookie consent preferences
  - Duration: 1 year
  - Stores user's privacy choices

### localStorage (Client-Managed)

**Purpose**: User preferences and non-sensitive data

- `username` - User's username for display
- `userId` - User's ID for vault management
- `myAvatar` - User's avatar URL
- `csrf_token` - Backup storage for CSRF token
- Encryption keys and vault data (managed by CryptoService)

## Implementation Details

### Backend Components

#### Cookie Utilities (`/backend/src/utils/cookie.utils.ts`)

- `setAuthCookie()` - Sets JWT in HttpOnly cookie
- `clearAuthCookie()` - Clears authentication cookie
- `generateCSRFToken()` - Creates cryptographically secure CSRF token
- `setCSRFCookie()` - Sets CSRF token in accessible cookie

#### CSRF Middleware (`/backend/src/middleware/csrf.middleware.ts`)

- `validateCSRF()` - Validates double-submit cookie pattern
- `addCSRFToken()` - Adds CSRF token to response locals
- Automatic bypass for GET/HEAD/OPTIONS requests
- Development mode bypass for easier testing

#### Updated Auth Middleware (`/backend/src/middleware/auth.middleware.ts`)

- Reads JWT from cookies (primary) or Authorization header (fallback)
- Backward compatibility maintained
- Enhanced error handling

### Frontend Components

#### CSRF Service (`/frontend/src/app/core/services/csrf.service.ts`)

- Manages CSRF token storage and retrieval
- Memory + localStorage persistence
- Token validation helpers

#### Updated Auth Service (`/frontend/src/app/core/services/auth.service.ts`)

- Removed localStorage JWT management
- Added CSRF token handling
- Cookie-based authentication flow
- Server-side logout implementation

#### HTTP Interceptor (`/frontend/src/app/core/auth/interceptors/auth.interceptor.ts`)

- `withCredentials: true` for all requests
- Automatic CSRF header injection
- Enhanced error handling for 401/403
- Cookie-based authentication detection

## Security Benefits

### 1. XSS Protection

- JWT tokens not accessible via JavaScript
- Reduced attack surface for code injection
- HttpOnly flag prevents script access

### 2. CSRF Protection

- Double-submit cookie pattern
- Cryptographically secure tokens
- Automatic validation on state changes

### 3. Cross-Domain Security

- Proper SameSite configuration
- Controlled domain sharing in production
- CORS policy enforcement

### 4. Session Management

- Secure cookie expiration
- Server-side logout with cookie clearing
- Automatic token refresh capability

## GDPR Compliance

### Cookie Consent Banner

- Granular controls (Essential, Preferences, Analytics)
- 1-year consent persistence
- Privacy-first analytics implementation
- Server-side Google Analytics proxy

### Privacy Features

- No tracking without explicit consent
- Batched analytics with rate limiting
- Anonymous client ID management
- Transparent data handling

## Development vs Production

### Development Mode

- HTTP cookies allowed
- Relaxed SameSite policy
- CSRF validation bypassed
- Enhanced debug logging

### Production Mode

- HTTPS-only cookies
- Strict SameSite enforcement
- Full CSRF protection
- Cross-domain cookie sharing

## Migration Notes

### Breaking Changes

- Old localStorage-based auth will require re-login
- CSRF tokens now required for API calls
- Cookie-dependent authentication flow

### Backward Compatibility

- Authorization header fallback maintained
- Graceful degradation for unsupported browsers
- Progressive enhancement approach

## Testing Strategy

### Unit Tests

- Cookie utility functions
- CSRF middleware validation
- Auth service cookie handling
- HTTP interceptor behavior

### Integration Tests

- End-to-end login/logout flow
- CSRF protection validation
- Cross-domain cookie behavior
- Server-side cookie management

### Security Tests

- XSS prevention validation
- CSRF attack prevention
- Cookie security flag verification
- Domain restriction testing

## Monitoring

### Security Metrics

- Failed CSRF validations
- Suspicious cookie behavior
- Authentication failures
- Cross-domain access patterns

### Performance Metrics

- Cookie size and transfer overhead
- CSRF token generation performance
- Authentication latency
- Session management efficiency

## Future Enhancements

### Planned Improvements

- Token refresh automation
- Enhanced session management
- Multi-factor authentication support
- Advanced rate limiting

### Security Roadmap

- Hardware security key support
- Enhanced audit logging
- Automated security scanning
- Penetration testing integration

---

This strategy provides enterprise-grade security while maintaining user experience and GDPR
compliance.
