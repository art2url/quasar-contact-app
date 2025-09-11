# Testing Guide for Quasar Contact App

## Overview

This guide explains how to write and run tests for the Quasar Contact application. I focus on
testing the most important functionality while keeping tests maintainable and fast.

## Testing Philosophy

### Test Only What Matters

Focus on testing:

1. **Core functionality** - Does the component do its main job?
2. **User interactions** - Can users interact with the component correctly?
3. **Error handling** - Does the component handle failures gracefully?
4. **Accessibility** - Is the component accessible to all users?
5. **Integration points** - Does the component work with external dependencies?

### Avoid Over-Testing

Don't test:

- Implementation details (private methods, internal state)
- Framework functionality (Angular's built-in features)
- Third-party libraries (Material Design components)
- Obvious getters/setters
- CSS styling details

## Running Tests

### Frontend Tests

```bash
# Run all frontend tests
cd frontend && npm test

# Run tests with coverage
npm test -- --code-coverage

# Run specific test file
npm test -- --include="**/component-name.component.spec.ts"

# Run tests in headless mode (CI)
npm test -- --watch=false --browsers=ChromeHeadless
```

### Backend Tests

```bash
# Run all backend tests
cd backend && npm test

# Run tests with coverage
npm test -- --coverage

# Run specific test file
npm test -- --testPathPattern="specific-test.test.ts"

# Run tests in CI mode
npm run test:ci
```

### Coverage Goals

- **Minimum**: 80% line coverage
- **Target**: 90% line coverage for critical components
- Focus on covering all major code paths, not just percentage

## Component-Specific Guidelines

### Shared Components

- Test all input properties
- Test content projection (ng-content)
- Test event outputs
- Focus on reusability aspects

### Feature Components

- Test business logic
- Test navigation/routing
- Test service integrations
- Test complex user flows

### Service Testing

- Test public methods only
- Mock external dependencies (HTTP, localStorage)
- Test error handling and retries
- Test state management

## Continuous Integration

### Pre-commit Hooks

Tests automatically run before commits via Husky:

```bash
# In package.json
"husky": {
  "hooks": {
    "pre-commit": "npm test -- --watch=false --browsers=ChromeHeadless"
  }
}
```

### CI Pipeline

All tests must pass before merging:

- Unit tests with coverage report
- Linting checks
- Build verification

## Debugging Tests

### Common Issues

1. **Test timeout**: Increase timeout in karma.conf.js
2. **DOM not updating**: Use `fixture.detectChanges()`
3. **Async issues**: Use `async/await` or `fakeAsync`
4. **Memory leaks**: Clean up subscriptions and timers

### Debug Commands

```bash
# Run tests with debug info
npm test -- --browsers=Chrome

# Run single test with console output
npm test -- --include="**/component.spec.ts" --browsers=Chrome
```

## Examples

### Frontend Test Examples

See the following examples in the codebase:

- `cache-info-banner.component.spec.ts` - Component testing with localStorage
- `loading-spinner.component.spec.ts` - Component with inputs and CSS classes
- `footer.component.spec.ts` - Component with links and accessibility
- `header.component.spec.ts` - Component with service dependencies and mocks
- `emoji-picker.component.spec.ts` - Component with events and keyboard handling
- `image-attachment.component.spec.ts` - Component with file handling and validation
- `image-modal.component.spec.ts` - Component with zoom, dragging, and keyboard controls
- `login.component.spec.ts` - Feature component with comprehensive authentication, security, and
  error handling tests
- `register.component.spec.ts` - Feature component with form validation, password strength, and
  registration flow
- `reset-password.component.spec.ts` - Feature component with token validation, password strength
  checking, form validation, and password reset completion
- `forgot-password.component.spec.ts` - Feature component with email validation, password reset
  requests, error handling, and resend functionality with timer
- `settings.component.spec.ts` - Feature component with avatar selection, private key management,
  file import/export, and navigation handling
- `chat-list.component.spec.ts` - Feature component with message display formatting, search
  functionality, chat tracking, system message handling, and navigation
- `chat-room.component.spec.ts` - Feature component with UI delegation testing covering message
  composition, editing, partner status display, image modal functionality, and navigation
- `chat-room-facade.service.spec.ts` - Service integration tests for real chat functionality
  including message handling, partner status tracking, image workflows, emoji insertion, scroll
  behavior, and real-time updates
- `app.component.spec.ts` - Main application component with authentication flow, navigation
  management, WebSocket connection handling, and reset token processing (foundation tests)
- `auth.service.spec.ts` - Core authentication service tests covering login/logout flows,
  registration, password reset functionality, token validation, authentication state management,
  crypto key handling, WebSocket integration, and comprehensive error handling scenarios
- `websocket.service.spec.ts` - Real-time communication service tests covering connection
  management, message sending/receiving, handler management (including edit/delete events), typing
  indicators, online user tracking, connection state observables, and graceful error handling
- `crypto.service.spec.ts` - Security-critical encryption service tests with comprehensive coverage
  of hybrid encryption (AES-GCM + RSA-OAEP), key generation/management, format validation, cross-key
  security testing, tamper detection, concurrent operations, and edge case handling
- `notification.service.spec.ts` - Real-time notification service tests covering message handling,
  unread count tracking, user state management, authentication validation, rate limiting,
  performance optimization, WebSocket integration, and resource cleanup for chat notification
  functionality
- `vault.service.spec.ts` - Security-critical encrypted storage service tests covering AES-GCM
  encryption, user isolation, private key security, data integrity, ArrayBuffer handling, key
  management, and async state management for secure cryptographic storage operations
- `messages.service.spec.ts` - Chat message API service tests covering message history loading,
  overview retrieval, last message fetching, mark-as-read functionality, authentication validation,
  error handling, loading state management, and API integration for chat messaging operations
- `user.service.spec.ts` - User management service tests covering user listing and search
  functionality, public key management (upload/retrieval/missing key handling), profile management
  (avatar updates), direct message operations (creation/listing), authentication validation, error
  handling with detailed logging, edge cases (empty lists, large datasets, special characters),
  concurrent operations, and network error recovery for user API integration
- `theme.service.spec.ts` - Theme management service tests covering theme initialization with
  localStorage persistence and fallbacks, theme switching and toggling functionality, DOM
  manipulation (CSS classes and meta tags), localStorage persistence verification, theme state
  observable emissions, theme query methods accuracy, and edge cases with rapid theme changes
- `loading.service.spec.ts` - Loading state management service tests covering loading state display
  and hiding, authentication state management, navigation event handling, timeout management with
  automatic force-hide, NgZone integration for change detection, specialized methods for auth and
  navigation, observable behavior consistency, and edge cases with rapid state changes
- `scroll.service.spec.ts` - Scroll position management service tests covering scroll-to-top
  operations with cross-browser compatibility, element scrolling with smooth behavior, scroll
  position detection and calculation, bottom/top detection with tolerance handling, container
  scrolling for app-specific elements, error handling for missing DOM elements, and edge cases with
  floating point calculations
- `chat-session.service.spec.ts` - Chat state management service tests covering chat initialization
  and partner status tracking, typing functionality and WebSocket integration, key state management
  with artificial blocking states, partner key regeneration notifications, message duplicate
  detection and sorting, vault key generation, loading operations management, and service cleanup
- `chat-typing.service.spec.ts` - Typing state management service tests covering business logic for
  1-second throttling rules, typing state tracking, service initialization and reset behavior,
  resource cleanup rules, and configuration constants validation
- `chat-ui-state.service.spec.ts` - Chat UI state management service tests covering message editing
  business rules, new message state management, emoji addition rules, image attachment logic,
  filename truncation rules, cache issue detection logic, message preparation for sending, state
  flag management, and complete state consistency rules
- `chat-message.service.spec.ts` - Chat message service tests covering message date grouping logic,
  new messages counter tracking, message edit permissions, system message detection with flag
  priority, read receipt tracking with duplicate prevention, display text formatting with filename
  truncation, and service state management
- `chat-scroll.service.spec.ts` - Chat scroll service tests covering scroll state management,
  scroll-to-bottom logic with error handling, initial scroll handling with layout updates, new
  messages auto-scroll logic based on user position, scroll button click handling, auto-scroll
  conditions for view checking, textarea resize auto-scroll, and service state reset
- `chat-lifecycle.service.spec.ts` - Chat lifecycle service tests covering chat room initialization
  with dependency setup, mobile layout management, navigation handling with fallback, chat blocked
  status logic based on key states, input placeholder logic for different blocking conditions, key
  management operations with user confirmation, and service cleanup with state reset
- `chat-event-handler.service.spec.ts` - Chat event handler service tests covering event
  subscription management, message handling coordination, typing indicator updates, online status
  tracking, key status management, read receipt handling, scroll event coordination, and service
  cleanup
- `mobile-chat-layout.service.spec.ts` - Mobile chat layout service tests covering mobile view
  detection, keyboard visibility detection, scroll position calculations, auto-scroll logic, scroll
  operations, metrics management, and safe area calculations using mock data patterns
- `auth.guard.spec.ts` - Authentication guard tests covering route protection logic, authentication
  status checking, navigation redirection to login page, and access control business rules
- `unauth.guard.spec.ts` - Unauthenticated guard tests covering reverse route protection logic,
  preventing authenticated users from accessing auth pages, navigation redirection to chat, and
  access control for login/register pages
- `csrf.service.spec.ts` - CSRF token management service tests covering token storage with memory
  and localStorage persistence, token retrieval with fallback mechanism, token clearing from both
  locations, token existence checking, and cross-instance token sharing for security operations

### Backend Test Examples

- `app.session.integration.test.ts` - Application session integration tests covering session
  configuration with security properties (httpOnly, sameSite, maxAge), session ID generation and
  uniqueness, session persistence across requests, password reset token processing with session
  storage, invalid token handling, session lifecycle management, cross-session isolation, concurrent
  request handling, and comprehensive error handling for malformed data and edge cases
- `auth.middleware.test.ts` - Authentication middleware tests covering JWT token validation from
  cookies and Authorization headers, token prioritization logic, security validation (expired
  tokens, wrong secrets, malformed headers), error handling without information leakage, timing
  consistency for security, and request property preservation during authentication flow
- `csrf.middleware.test.ts` - CSRF protection middleware tests covering double-submit cookie pattern
  validation, HTTP method exemptions (GET/HEAD/OPTIONS), development environment handling, token
  validation from multiple header formats, comprehensive error handling with specific error codes,
  timing attack prevention, and response locals token management for CSRF protection
- `auth.routes.test.ts` - Authentication API routes tests covering user registration with field
  validation and duplicate prevention, user login with credential verification, password reset
  request handling with enumeration protection, security properties including consistent error
  messages, input sanitization, and concurrent registration handling for authentication endpoints

- More examples will be added as I develop the backend test suite

## Resources

- [Angular Testing Guide](https://angular.io/guide/testing)
- [Jasmine Documentation](https://jasmine.github.io/)
- [Angular TestBed](https://angular.io/guide/testing-services#angular-testbed)
