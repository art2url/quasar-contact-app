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

### Commands

```bash
# Run all tests
npm test

# Run tests with coverage
npm test -- --code-coverage

# Run specific test file
npm test -- --include="**/component-name.component.spec.ts"

# Run tests in headless mode (CI)
npm test -- --watch=false --browsers=ChromeHeadless
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
- More examples will be added as I develop the test suite

## Resources

- [Angular Testing Guide](https://angular.io/guide/testing)
- [Jasmine Documentation](https://jasmine.github.io/)
- [Angular TestBed](https://angular.io/guide/testing-services#angular-testbed)
