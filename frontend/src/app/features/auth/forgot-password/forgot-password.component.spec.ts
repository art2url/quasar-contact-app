import { ComponentFixture, TestBed, fakeAsync, tick } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { ChangeDetectorRef } from '@angular/core';
import { of, throwError } from 'rxjs';

import { ForgotPasswordComponent } from './forgot-password.component';
import { AuthService } from '@services/auth.service';
import { TurnstileService } from '@services/turnstile.service';
import { ThemeService, Theme } from '@services/theme.service';
import { HoneypotService } from '@services/honeypot.service';

describe('ForgotPasswordComponent', () => {
  let component: ForgotPasswordComponent;
  let fixture: ComponentFixture<ForgotPasswordComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockTurnstileService: jasmine.SpyObj<TurnstileService>;
  let mockThemeService: jasmine.SpyObj<ThemeService>;
  let mockHoneypotService: jasmine.SpyObj<HoneypotService>;
  let mockChangeDetectorRef: jasmine.SpyObj<ChangeDetectorRef>;

  function resetComponentState() {
    component.isLoading = false;
    component.error = '';
    component.formSubmitted = false;
    component.email = '';
    component.turnstileToken = '';
    component.emailSent = false;
    component.resendCooldown = 0;
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
    mockAuthService = jasmine.createSpyObj('AuthService', ['requestPasswordReset']);
    mockTurnstileService = jasmine.createSpyObj('TurnstileService', [
      'initializeTurnstile', 'resetTurnstileWidget', 'reRenderTurnstile'
    ]);
    mockThemeService = jasmine.createSpyObj('ThemeService', [], { theme$: of('light' as Theme) });
    mockHoneypotService = jasmine.createSpyObj('HoneypotService', [
      'createHoneypotData', 'addFormStartTime', 'validateHoneypotFields'
    ]);
    mockChangeDetectorRef = jasmine.createSpyObj('ChangeDetectorRef', ['detectChanges']);

    await TestBed.configureTestingModule({
      imports: [ForgotPasswordComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: TurnstileService, useValue: mockTurnstileService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: HoneypotService, useValue: mockHoneypotService },
        { provide: ChangeDetectorRef, useValue: mockChangeDetectorRef }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ForgotPasswordComponent);
    component = fixture.componentInstance;
    
    // Setup default mock returns
    mockHoneypotService.createHoneypotData.and.returnValue({});
    mockHoneypotService.addFormStartTime.and.returnValue(Date.now());
    mockTurnstileService.initializeTurnstile.and.returnValue(Promise.resolve('widget-id'));
    
    // Reset component state
    resetComponentState();
  });

  // Run: npm test
  it('creates with defaults', () => {
    expect(component).toBeTruthy();
    expect(component.email).toBe('');
    expect(component.isLoading).toBe(false);
    expect(component.emailSent).toBe(false);
    expect(component.resendCooldown).toBe(0);
  });

  it('validates email input correctly', () => {
    // Test valid emails
    expect(component.isValidEmail('test@example.com')).toBe(true);
    expect(component.isValidEmail('user.name@domain.co.uk')).toBe(true);
    expect(component.isValidEmail('test+tag@example.org')).toBe(true);
    
    // Test invalid emails
    expect(component.isValidEmail('')).toBe(false);
    expect(component.isValidEmail('invalid-email')).toBe(false);
    expect(component.isValidEmail('test@')).toBe(false);
    expect(component.isValidEmail('@domain.com')).toBe(false);
    expect(component.isValidEmail('test@domain')).toBe(false);
  });

  it('handles form validation failures', () => {
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    
    // Test empty email
    component.email = '';
    component.turnstileToken = 'valid-token';
    component.onSubmit();
    expect(component.error).toBe('Please enter a valid email address');
    
    // Test invalid email
    component.email = 'invalid-email';
    component.onSubmit();
    expect(component.error).toBe('Please enter a valid email address');
    
    // Test missing turnstile token
    component.email = 'test@example.com';
    component.turnstileToken = '';
    component.onSubmit();
    expect(component.error).toBe('Please complete the security verification');
  });

  it('handles successful password reset request', () => {
    resetComponentState();
    component.email = 'test@example.com';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    mockAuthService.requestPasswordReset.and.returnValue(of({ message: 'Success' }));
    
    component.onSubmit();
    
    expect(mockAuthService.requestPasswordReset).toHaveBeenCalledWith(
      'test@example.com',
      'valid-token',
      jasmine.any(Object)
    );
    expect(component.isLoading).toBe(false);
    expect(component.emailSent).toBe(true);
    expect(component.resendCooldown).toBe(60);
  });

  it('handles password reset request errors', () => {
    resetComponentState();
    component.email = 'test@example.com';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    
    // Test 404 error (account not found)
    mockAuthService.requestPasswordReset.and.returnValue(
      throwError(() => ({ status: 404, error: { message: 'Not found' } }))
    );
    
    component.onSubmit();
    expect(component.error).toBe('No account found with this email address');
    expect(component.isLoading).toBe(false);
    expect(mockTurnstileService.resetTurnstileWidget).toHaveBeenCalled();
    
    // Test 429 error (rate limiting)
    resetComponentState();
    component.email = 'test@example.com';
    component.turnstileToken = 'valid-token';
    mockAuthService.requestPasswordReset.and.returnValue(
      throwError(() => ({ status: 429, error: { message: 'Too many requests' } }))
    );
    
    component.onSubmit();
    expect(component.error).toBe('Too many requests. Please try again later.');
    
    // Test turnstile error
    resetComponentState();
    component.email = 'test@example.com';
    component.turnstileToken = 'invalid-token';
    mockAuthService.requestPasswordReset.and.returnValue(
      throwError(() => ({ 
        status: 400, 
        error: { message: 'turnstile verification failed' } 
      }))
    );
    
    component.onSubmit();
    expect(component.error).toBe('Security verification failed. Please try again.');
  });

  it('handles honeypot validation failure', () => {
    component.email = 'test@example.com';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(false);
    spyOn(console, 'warn');
    
    component.onSubmit();
    
    expect(console.warn).toHaveBeenCalledWith('[Forgot Password] Security validation failed on client side');
    expect(component.error).toBe('Please try again.');
    expect(mockAuthService.requestPasswordReset).not.toHaveBeenCalled();
  });

  it('handles resend functionality with cooldown', fakeAsync(() => {
    resetComponentState();
    component.email = 'test@example.com';
    component.turnstileToken = 'valid-token';
    component.emailSent = true;
    component.resendCooldown = 30;
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    mockAuthService.requestPasswordReset.and.returnValue(of({ message: 'Success' }));
    
    // Should not resend during cooldown
    component.resendEmail();
    expect(mockAuthService.requestPasswordReset).not.toHaveBeenCalled();
    
    // Reset cooldown and try again
    component.resendCooldown = 0;
    component.resendEmail();
    expect(mockAuthService.requestPasswordReset).toHaveBeenCalled();
  }));

  it('handles resend timer countdown', fakeAsync(() => {
    resetComponentState();
    component.email = 'test@example.com';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    mockAuthService.requestPasswordReset.and.returnValue(of({ message: 'Success' }));
    
    // Trigger successful submit to start countdown
    component.onSubmit();
    expect(component.resendCooldown).toBe(60);
    
    // Advance time by 5 seconds
    tick(5000);
    expect(component.resendCooldown).toBeLessThanOrEqual(55);
    
    // Advance time to completion
    tick(55000);
    expect(component.resendCooldown).toBe(0);
    expect(mockTurnstileService.initializeTurnstile).toHaveBeenCalledTimes(1);
  }));

  it('handles Turnstile initialization and theme changes', async () => {
    // Test Turnstile initialization failure
    mockTurnstileService.initializeTurnstile.and.returnValue(Promise.reject(new Error('Turnstile failed')));
    
    component.ngAfterViewInit();
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(component.error).toBe('Turnstile failed');
    
    // Test theme changes with successful re-render
    component.turnstileWidgetId = 'existing-widget';
    mockTurnstileService.reRenderTurnstile.and.returnValue(Promise.resolve('new-widget'));
    
    Object.defineProperty(mockThemeService, 'theme$', {
      value: of('dark' as Theme, 'light' as Theme)
    });
    
    component.ngAfterViewInit();
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(component.turnstileToken).toBe('');
  });

  it('handles component lifecycle and cleanup', () => {
    component.ngOnInit();
    expect(mockHoneypotService.createHoneypotData).toHaveBeenCalled();
    expect(mockHoneypotService.addFormStartTime).toHaveBeenCalled();
    expect(component.error).toBe('');
    expect(component.emailSent).toBe(false);
    
    // Set up some state to clean up
    component.turnstileWidgetId = 'test-widget';
    const resendTimerSpy = jasmine.createSpyObj('Subscription', ['unsubscribe']);
    const themeSubscriptionSpy = jasmine.createSpyObj('Subscription', ['unsubscribe']);
    (component as unknown as { resendTimer: jasmine.SpyObj<unknown>; themeSubscription: jasmine.SpyObj<unknown> }).resendTimer = resendTimerSpy;
    (component as unknown as { resendTimer: jasmine.SpyObj<unknown>; themeSubscription: jasmine.SpyObj<unknown> }).themeSubscription = themeSubscriptionSpy;
    
    component.ngOnDestroy();
    
    expect(resendTimerSpy.unsubscribe).toHaveBeenCalled();
    expect(themeSubscriptionSpy.unsubscribe).toHaveBeenCalled();
    expect(mockTurnstileService.resetTurnstileWidget).toHaveBeenCalledWith('test-widget');
    expect(component.turnstileWidgetId).toBeUndefined();
  });

  it('handles different Turnstile element IDs based on state', async () => {
    // Test initial state (not email sent)
    component.emailSent = false;
    
    component.ngAfterViewInit();
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(mockTurnstileService.initializeTurnstile).toHaveBeenCalledWith(
      'turnstile-forgot-password',
      jasmine.any(Function)
    );
    
    // Reset and test after email sent
    mockTurnstileService.initializeTurnstile.calls.reset();
    component.emailSent = true;
    
    await (component as unknown as { initializeTurnstile: () => Promise<void> }).initializeTurnstile();
    
    expect(mockTurnstileService.initializeTurnstile).toHaveBeenCalledWith(
      'turnstile-forgot-password-resend',
      jasmine.any(Function)
    );
  });
});