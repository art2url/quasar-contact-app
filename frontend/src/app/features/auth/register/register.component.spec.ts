import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';
import { of, throwError } from 'rxjs';

import { RegisterComponent } from './register.component';
import { RegisterResponse } from '@models/auth.model';
import { AuthService } from '@services/auth.service';
import { TurnstileService } from '@services/turnstile.service';
import { ThemeService, Theme } from '@services/theme.service';
import { HoneypotService } from '@services/honeypot.service';
import { LoadingService } from '@services/loading.service';

describe('RegisterComponent', () => {
  let component: RegisterComponent;
  let fixture: ComponentFixture<RegisterComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockTurnstileService: jasmine.SpyObj<TurnstileService>;
  let mockThemeService: jasmine.SpyObj<ThemeService>;
  let mockHoneypotService: jasmine.SpyObj<HoneypotService>;
  let mockLoadingService: jasmine.SpyObj<LoadingService>;
  let mockChangeDetectorRef: jasmine.SpyObj<ChangeDetectorRef>;

  function resetComponentState() {
    component.isLoading = false;
    component.error = '';
    component.formSubmitted = false;
    component.username = '';
    component.email = '';
    component.password = '';
    component.turnstileToken = '';
  }

  beforeEach(async () => {
    // Mock window.matchMedia for BreakpointObserver
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jasmine.createSpy('addListener'),
        removeListener: jasmine.createSpy('removeListener'),
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener'),
        dispatchEvent: jasmine.createSpy('dispatchEvent'),
      }),
    });

    // Create spies for all services
    mockAuthService = jasmine.createSpyObj('AuthService', ['registerWithHoneypot']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    mockTurnstileService = jasmine.createSpyObj('TurnstileService', [
      'initializeTurnstile', 'resetTurnstileWidget', 'reRenderTurnstile'
    ]);
    mockThemeService = jasmine.createSpyObj('ThemeService', [], { theme$: of('light' as Theme) });
    mockHoneypotService = jasmine.createSpyObj('HoneypotService', [
      'createHoneypotData', 'addFormStartTime', 'validateHoneypotFields', 'prepareFormDataWithHoneypot'
    ]);
    mockLoadingService = jasmine.createSpyObj('LoadingService', ['showForAuth', 'hide']);
    mockChangeDetectorRef = jasmine.createSpyObj('ChangeDetectorRef', ['detectChanges']);

    await TestBed.configureTestingModule({
      imports: [RegisterComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: TurnstileService, useValue: mockTurnstileService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: HoneypotService, useValue: mockHoneypotService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: ChangeDetectorRef, useValue: mockChangeDetectorRef }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(RegisterComponent);
    component = fixture.componentInstance;
    
    // Get the real router from provideRouter
    mockRouter = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    spyOn(mockRouter, 'navigate').and.returnValue(Promise.resolve(true));
    
    // Setup default mock returns
    mockHoneypotService.createHoneypotData.and.returnValue({});
    mockHoneypotService.addFormStartTime.and.returnValue(Date.now());
    mockTurnstileService.initializeTurnstile.and.returnValue(Promise.resolve('widget-id'));
    
    // Reset component state
    component.isLoading = false;
    component.error = '';
    component.formSubmitted = false;
  });

  // Run: npm test
  it('creates with defaults', () => {
    expect(component).toBeTruthy();
    expect(component.username).toBe('');
    expect(component.email).toBe('');
    expect(component.password).toBe('');
    expect(component.isLoading).toBe(false);
    expect(component.hidePassword).toBe(true);
  });

  it('validates form inputs and requirements', () => {
    // Test username validation
    expect(component.isValidUsername('test')).toBe(true);
    expect(component.isValidUsername('admin')).toBe(false);
    expect(component.isValidUsername('test@user')).toBe(false);
    expect(component.isValidUsername('bot_test')).toBe(false);
    
    // Test email validation
    expect(component.isValidEmail('test@example.com')).toBe(true);
    expect(component.isValidEmail('invalid-email')).toBe(false);
    expect(component.isValidEmail('test@')).toBe(false);
    
    // Test form validity
    component.username = 'validuser';
    component.email = 'test@example.com';
    component.password = 'password123';
    component.turnstileToken = 'valid-token';
    expect(component.isFormValid()).toBe(true);
    
    // Test invalid cases
    component.username = 'ab'; // too short
    expect(component.isFormValid()).toBe(false);
  });

  it('calculates password strength correctly', () => {
    // Test weak password
    component.password = '123';
    expect(component.getPasswordStrength()).toBe('weak');
    expect(component.getPasswordStrengthPercent()).toBe(33);
    
    // Test medium password
    component.password = 'Password1';
    expect(component.getPasswordStrength()).toBe('medium');
    expect(component.getPasswordStrengthPercent()).toBe(66);
    
    // Test strong password
    component.password = 'StrongPassword123!';
    expect(component.getPasswordStrength()).toBe('strong');
    expect(component.getPasswordStrengthPercent()).toBe(100);
    expect(component.getPasswordStrengthText()).toBe('Strong - Excellent password');
  });

  it('handles successful registration', () => {
    component.username = 'newuser';
    component.email = 'new@example.com';
    component.password = 'password123';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    mockHoneypotService.prepareFormDataWithHoneypot.and.returnValue({
      username: 'newuser',
      email: 'new@example.com',
      password: 'password123',
      turnstileToken: 'valid-token'
    });
    
    const registerResponse: RegisterResponse = {
      message: 'Registration successful'
    };
    mockAuthService.registerWithHoneypot.and.returnValue(of(registerResponse));
    
    component.onRegister();
    
    expect(mockLoadingService.showForAuth).toHaveBeenCalledWith('register');
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login'], {
      state: { message: 'Account created successfully! Please sign in.' }
    });
  });

  it('handles registration errors', () => {
    component.username = 'existinguser';
    component.email = 'existing@example.com';
    component.password = 'password123';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    mockHoneypotService.prepareFormDataWithHoneypot.and.returnValue({});
    
    // Test username/email conflict
    mockAuthService.registerWithHoneypot.and.returnValue(
      throwError(() => ({ status: 409, error: { message: 'User exists' } }))
    );
    
    component.onRegister();
    
    expect(component.error).toBe('Username or email already exists. Please choose different ones.');
    expect(component.isLoading).toBe(false);
    expect(mockLoadingService.hide).toHaveBeenCalled();
    expect(mockTurnstileService.resetTurnstileWidget).toHaveBeenCalled();
  });

  it('handles validation errors and form validation failures', () => {
    // Test form validation failures
    component.username = '';
    component.email = 'invalid-email';
    component.password = '123';
    component.turnstileToken = '';
    
    component.onRegister();
    expect(component.error).toBe('Please complete the security verification');
    
    // Test invalid username after form submission
    component.username = 'admin';
    component.email = 'test@example.com';
    component.password = 'password123';
    component.turnstileToken = 'valid-token';
    
    component.onRegister();
    expect(component.error).toBe('Please choose a different username');
    
    // Test honeypot validation failure
    component.username = 'validuser';
    mockHoneypotService.validateHoneypotFields.and.returnValue(false);
    spyOn(console, 'warn');
    
    component.onRegister();
    expect(console.warn).toHaveBeenCalledWith('[Register] Honeypot validation failed on client side');
    expect(component.error).toBe('Please try again.');
  });

  it('handles Turnstile initialization and theme changes', async () => {
    // Test Turnstile initialization failure
    mockTurnstileService.initializeTurnstile.and.returnValue(Promise.reject(new Error('Turnstile failed')));
    
    component.ngAfterViewInit();
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(component.error).toBe('Turnstile failed');
    
    // Test theme changes
    component.turnstileWidgetId = 'existing-widget';
    mockTurnstileService.reRenderTurnstile.and.returnValue(Promise.resolve('new-widget'));
    
    Object.defineProperty(mockThemeService, 'theme$', {
      value: of('dark' as Theme, 'light' as Theme)
    });
    
    component.ngAfterViewInit();
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(component.turnstileToken).toBe('');
  });

  it('handles component lifecycle properly', () => {
    component.ngOnInit();
    expect(mockHoneypotService.createHoneypotData).toHaveBeenCalled();
    expect(mockHoneypotService.addFormStartTime).toHaveBeenCalled();
    
    component.turnstileWidgetId = 'test-widget';
    component.ngOnDestroy();
    expect(mockTurnstileService.resetTurnstileWidget).toHaveBeenCalledWith('test-widget');
  });

  it('generates avatar and prepares form data correctly', () => {
    component.username = 'validuser';
    component.email = 'test@example.com';
    component.password = 'password123';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    mockHoneypotService.prepareFormDataWithHoneypot.and.returnValue({
      username: 'validuser',
      email: 'test@example.com',
      password: 'password123',
      avatarUrl: 'expected-avatar-url',
      turnstileToken: 'valid-token'
    });
    
    const registerResponse: RegisterResponse = { message: 'Success' };
    mockAuthService.registerWithHoneypot.and.returnValue(of(registerResponse));
    
    component.onRegister();
    
    // Verify form data preparation includes avatar
    expect(mockHoneypotService.prepareFormDataWithHoneypot).toHaveBeenCalledWith(
      jasmine.objectContaining({
        username: 'validuser',
        email: 'test@example.com',
        password: 'password123',
        avatarUrl: jasmine.any(String),
        turnstileToken: 'valid-token'
      }),
      jasmine.any(Number)
    );
  });

  it('handles server validation errors with detailed parsing', () => {
    resetComponentState();
    component.username = 'validuser';
    component.email = 'test@example.com';
    component.password = 'password123';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    mockHoneypotService.prepareFormDataWithHoneypot.and.returnValue({});
    
    // Test detailed validation errors
    const validationErrors = {
      status: 422,
      error: {
        errors: [
          { msg: 'Username must be unique' },
          { msg: 'Email format is invalid' }
        ]
      }
    };
    mockAuthService.registerWithHoneypot.and.returnValue(throwError(() => validationErrors));
    
    component.onRegister();
    
    expect(component.error).toBe('Username must be unique, Email format is invalid');
    expect(component.isLoading).toBe(false);
    
    // Reset for second test
    resetComponentState();
    component.username = 'validuser';
    component.email = 'test@example.com';
    component.password = 'password123';
    component.turnstileToken = 'valid-token';
    
    // Test fallback for 422 without detailed errors
    const genericValidationError = { status: 422, error: {} };
    mockAuthService.registerWithHoneypot.and.returnValue(throwError(() => genericValidationError));
    
    component.onRegister();
    expect(component.error).toBe('Invalid input. Please check your information.');
  });

  it('handles loading state management properly', () => {
    component.username = 'validuser';
    component.email = 'test@example.com';
    component.password = 'password123';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    mockHoneypotService.prepareFormDataWithHoneypot.and.returnValue({});
    
    // Test loading during registration
    const registerResponse: RegisterResponse = { message: 'Success' };
    mockAuthService.registerWithHoneypot.and.returnValue(of(registerResponse));
    
    expect(component.isLoading).toBe(false);
    component.onRegister();
    
    expect(mockLoadingService.showForAuth).toHaveBeenCalledWith('register');
    // Note: isLoading would be set to true but immediately completed due to synchronous observable
    
    // Reset loading state for next test
    component.isLoading = false;
    
    // Test loading cleanup on error
    mockAuthService.registerWithHoneypot.and.returnValue(
      throwError(() => ({ status: 500, error: { message: 'Server error' } }))
    );
    
    component.onRegister();
    expect(mockLoadingService.hide).toHaveBeenCalled();
    expect(component.isLoading).toBe(false);
  });

  it('handles edge cases in form validation', () => {
    // Test very long username
    const longUsername = 'a'.repeat(100);
    expect(component.isValidUsername(longUsername)).toBe(true);
    
    // Test special characters in username
    expect(component.isValidUsername('user@name')).toBe(false);
    expect(component.isValidUsername('user name')).toBe(false);
    expect(component.isValidUsername('user-name_123')).toBe(true);
    
    // Test restricted username patterns
    expect(component.isValidUsername('test_user')).toBe(false);
    expect(component.isValidUsername('ADMIN')).toBe(false);
    expect(component.isValidUsername('bot-test')).toBe(false);
    
    // Test email edge cases
    expect(component.isValidEmail('user@domain')).toBe(false);
    expect(component.isValidEmail('user@domain.')).toBe(false);
    expect(component.isValidEmail('user.name+tag@domain.com')).toBe(true);
    
    // Test password edge cases
    component.password = '';
    expect(component.getPasswordStrength()).toBe('weak');
    
    component.password = 'a'.repeat(20);
    expect(component.getPasswordStrength()).toBe('medium'); // Length + lowercase = medium
  });

  it('handles multiple form submissions correctly', () => {
    // Reset mock call count
    mockAuthService.registerWithHoneypot.calls.reset();
    
    component.username = 'validuser';
    component.email = 'test@example.com';
    component.password = 'password123';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    mockHoneypotService.prepareFormDataWithHoneypot.and.returnValue({});
    
    const registerResponse: RegisterResponse = { message: 'Success' };
    mockAuthService.registerWithHoneypot.and.returnValue(of(registerResponse));
    
    // Multiple submissions will both go through since component doesn't check isLoading
    // This documents the current behavior - each call will set loading to true briefly
    component.onRegister();
    expect(mockAuthService.registerWithHoneypot).toHaveBeenCalledTimes(1);
    
    // Second submission will also go through  
    component.onRegister();
    expect(mockAuthService.registerWithHoneypot).toHaveBeenCalledTimes(2);
    
    // This test verifies the actual behavior - no double submission prevention
    expect(component.formSubmitted).toBe(true);
  });

  it('handles Turnstile reset and failure scenarios', async () => {
    resetComponentState();
    // Test Turnstile reset on various error types - use valid username
    component.username = 'validuser';
    component.email = 'test@example.com';
    component.password = 'password123';
    component.turnstileToken = 'valid-token';
    component.turnstileWidgetId = 'test-widget';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    mockHoneypotService.prepareFormDataWithHoneypot.and.returnValue({});
    
    // Test turnstile-specific error
    mockAuthService.registerWithHoneypot.and.returnValue(
      throwError(() => ({ 
        status: 400, 
        error: { message: 'turnstile verification failed' } 
      }))
    );
    
    component.onRegister();
    expect(component.error).toBe('Security verification failed. Please try again.');
    expect(mockTurnstileService.resetTurnstileWidget).toHaveBeenCalledWith('test-widget');
    
    // Reset for second test
    resetComponentState();
    component.username = 'validuser';
    component.email = 'test@example.com';
    component.password = 'password123';
    component.turnstileToken = 'valid-token';
    
    // Test network error
    mockAuthService.registerWithHoneypot.and.returnValue(
      throwError(() => ({ status: 0, error: null }))
    );
    
    component.onRegister();
    expect(component.error).toBe('Cannot connect to server. Please check your connection.');
  });

  it('handles theme re-rendering failures gracefully', async () => {
    component.turnstileWidgetId = 'existing-widget';
    mockTurnstileService.reRenderTurnstile.and.returnValue(
      Promise.reject(new Error('Re-render failed'))
    );
    spyOn(console, 'error');
    
    Object.defineProperty(mockThemeService, 'theme$', {
      value: of('dark' as Theme, 'light' as Theme)
    });
    
    component.ngAfterViewInit();
    await new Promise(resolve => setTimeout(resolve, 0));
    
    // Should log error but not break functionality
    expect(console.error).toHaveBeenCalledWith(
      '[Register] Failed to re-render Turnstile after theme change:',
      jasmine.any(Error)
    );
    
    // Component should continue working despite theme re-render failure
    expect(component.error).not.toContain('theme');
  });

  it('validates honeypot data structure and timing', () => {
    const mockHoneypotData = {
      'honey_trap': '',
      'user_agent_check': 'valid',
      'timestamp_field': Date.now().toString()
    };
    mockHoneypotService.createHoneypotData.and.returnValue(mockHoneypotData);
    
    component.ngOnInit();
    
    expect(component.honeypotFields).toEqual(mockHoneypotData);
    expect(mockHoneypotService.addFormStartTime).toHaveBeenCalled();
    expect(component.formStartTime).toBeGreaterThan(0);
    
    // Test that form data includes honeypot timing
    component.username = 'validuser';
    component.email = 'test@example.com';
    component.password = 'password123';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    mockHoneypotService.prepareFormDataWithHoneypot.and.returnValue({});
    const registerResponse: RegisterResponse = { message: 'Success' };
    mockAuthService.registerWithHoneypot.and.returnValue(of(registerResponse));
    
    component.onRegister();
    
    expect(mockHoneypotService.prepareFormDataWithHoneypot).toHaveBeenCalledWith(
      jasmine.any(Object),
      component.formStartTime
    );
  });
});