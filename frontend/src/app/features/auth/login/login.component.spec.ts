import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { ChangeDetectorRef } from '@angular/core';
import { of, throwError } from 'rxjs';

import { LoginComponent } from './login.component';
import { LoginResponse } from '@models/auth.model';
import { AuthService } from '@services/auth.service';
import { TurnstileService } from '@services/turnstile.service';
import { ThemeService, Theme } from '@services/theme.service';
import { HoneypotService } from '@services/honeypot.service';
import { ScrollService } from '@services/scroll.service';

describe('LoginComponent', () => {
  let component: LoginComponent;
  let fixture: ComponentFixture<LoginComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockHttpClient: jasmine.SpyObj<HttpClient>;
  let mockTurnstileService: jasmine.SpyObj<TurnstileService>;
  let mockThemeService: jasmine.SpyObj<ThemeService>;
  let mockHoneypotService: jasmine.SpyObj<HoneypotService>;
  let mockScrollService: jasmine.SpyObj<ScrollService>;
  let mockChangeDetectorRef: jasmine.SpyObj<ChangeDetectorRef>;

  beforeEach(async () => {
    // Create spies for all services
    mockAuthService = jasmine.createSpyObj('AuthService', ['loginWithHoneypot']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate', 'getCurrentNavigation']);
    mockHttpClient = jasmine.createSpyObj('HttpClient', ['get']);
    mockTurnstileService = jasmine.createSpyObj('TurnstileService', [
      'initializeTurnstile', 'resetTurnstileWidget', 'reRenderTurnstile'
    ]);
    mockThemeService = jasmine.createSpyObj('ThemeService', [], { theme$: of('light') });
    mockHoneypotService = jasmine.createSpyObj('HoneypotService', [
      'createHoneypotData', 'addFormStartTime', 'validateHoneypotFields', 'prepareFormDataWithHoneypot'
    ]);
    mockScrollService = jasmine.createSpyObj('ScrollService', ['scrollToTop']);
    mockChangeDetectorRef = jasmine.createSpyObj('ChangeDetectorRef', ['detectChanges']);

    await TestBed.configureTestingModule({
      imports: [LoginComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: HttpClient, useValue: mockHttpClient },
        { provide: TurnstileService, useValue: mockTurnstileService },
        { provide: ThemeService, useValue: mockThemeService },
        { provide: HoneypotService, useValue: mockHoneypotService },
        { provide: ScrollService, useValue: mockScrollService },
        { provide: ChangeDetectorRef, useValue: mockChangeDetectorRef }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(LoginComponent);
    component = fixture.componentInstance;
    
    // Get the real router from RouterTestingModule
    mockRouter = TestBed.inject(Router) as jasmine.SpyObj<Router>;
    spyOn(mockRouter, 'navigate').and.returnValue(Promise.resolve(true));
    spyOn(mockRouter, 'getCurrentNavigation').and.returnValue(null);
    
    // Setup default mock returns
    mockHoneypotService.createHoneypotData.and.returnValue({});
    mockHoneypotService.addFormStartTime.and.returnValue(Date.now());
    mockTurnstileService.initializeTurnstile.and.returnValue(Promise.resolve('widget-id'));
  });

  // Run: npm test
  it('creates with defaults', () => {
    expect(component).toBeTruthy();
    expect(component.username).toBe('');
    expect(component.password).toBe('');
    expect(component.isLoading).toBe(false);
    expect(component.hidePassword).toBe(true);
  });

  it('validates form inputs', async () => {
    component.turnstileToken = 'valid-token';
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    
    // Test empty username
    component.username = '';
    component.password = 'password';
    await component.onLogin();
    expect(component.error).toBe('Please fill in all fields');
    
    // Test empty password
    component.username = 'user';
    component.password = '';
    await component.onLogin();
    expect(component.error).toBe('Please fill in all fields');
    
    // Test missing turnstile token
    component.username = 'user';
    component.password = 'password';
    component.turnstileToken = '';
    await component.onLogin();
    expect(component.error).toBe('Please complete the security verification');
  });

  it('handles successful login', async () => {
    component.username = 'testuser';
    component.password = 'testpass';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    mockHoneypotService.prepareFormDataWithHoneypot.and.returnValue({
      username: 'testuser',
      password: 'testpass',
      turnstileToken: 'valid-token'
    });
    mockHttpClient.get.and.returnValue(of({ status: 'healthy' }));
    const loginResponse: LoginResponse = {
      user: { id: '1', username: 'testuser' },
      message: 'Login successful'
    };
    mockAuthService.loginWithHoneypot.and.returnValue(of(loginResponse));
    
    await component.onLogin();
    
    expect(mockScrollService.scrollToTop).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/chat']);
    expect(component.error).toBe('');
  });

  it('handles login errors', async () => {
    component.username = 'testuser';
    component.password = 'wrongpass';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    mockHoneypotService.prepareFormDataWithHoneypot.and.returnValue({});
    mockHttpClient.get.and.returnValue(of({ status: 'healthy' }));
    mockAuthService.loginWithHoneypot.and.returnValue(throwError(() => new Error('401 Unauthorized')));
    
    await component.onLogin();
    
    expect(component.error).toBe('Invalid username or password.');
    expect(component.isLoading).toBe(false);
    expect(mockTurnstileService.resetTurnstileWidget).toHaveBeenCalled();
  });

  it('handles initialization and cleanup', () => {
    spyOn(component, 'ngOnDestroy').and.callThrough();
    
    component.ngOnInit();
    expect(mockHoneypotService.createHoneypotData).toHaveBeenCalled();
    expect(mockHoneypotService.addFormStartTime).toHaveBeenCalled();
    
    component.turnstileWidgetId = 'test-widget';
    component.ngOnDestroy();
    expect(mockTurnstileService.resetTurnstileWidget).toHaveBeenCalledWith('test-widget');
  });

  it('handles URL error parameters', () => {
    // Mock URLSearchParams
    spyOn(window, 'URLSearchParams').and.returnValue({
      get: jasmine.createSpy('get').and.returnValue('expired_link')
    } as unknown as URLSearchParams);
    
    component.ngOnInit();
    expect(component.error).toBe('Password reset link has expired. Please request a new one.');
    expect(mockRouter.navigate).toHaveBeenCalledWith([], { replaceUrl: true });
  });

  it('handles backend availability failures', async () => {
    component.username = 'testuser';
    component.password = 'testpass';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(true);
    mockHttpClient.get.and.returnValue(throwError(() => new Error('Connection timeout')));
    
    await component.onLogin();
    
    expect(component.error).toBe('Cannot connect to server. Please check your connection.');
    expect(component.isLoading).toBe(false);
  });

  it('handles honeypot validation failures', async () => {
    component.username = 'testuser';
    component.password = 'testpass';
    component.turnstileToken = 'valid-token';
    
    mockHoneypotService.validateHoneypotFields.and.returnValue(false);
    spyOn(console, 'warn');
    
    await component.onLogin();
    
    expect(console.warn).toHaveBeenCalledWith('[Login] Honeypot validation failed on client side');
    expect(component.error).toBe('Please try again.');
  });

  it('handles Turnstile initialization failures', async () => {
    mockTurnstileService.initializeTurnstile.and.returnValue(Promise.reject(new Error('Turnstile failed to load')));
    
    component.ngAfterViewInit();
    
    // Wait for async initialization to complete
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(component.error).toBe('Turnstile failed to load');
  });

  it('handles theme changes and Turnstile re-rendering', async () => {
    component.turnstileWidgetId = 'existing-widget';
    mockTurnstileService.reRenderTurnstile.and.returnValue(Promise.resolve('new-widget'));
    
    // Trigger theme change (skip first emission)
    Object.defineProperty(mockThemeService, 'theme$', {
      value: of('dark' as Theme, 'light' as Theme)
    });
    
    component.ngAfterViewInit();
    
    // Wait for theme subscription to process
    await new Promise(resolve => setTimeout(resolve, 0));
    
    expect(mockTurnstileService.reRenderTurnstile).toHaveBeenCalled();
    expect(component.turnstileToken).toBe('');
  });

  it('handles navigation state messages', () => {
    const mockNavigation = {
      extras: { state: { message: 'Registration successful' } }
    };
    mockRouter.getCurrentNavigation.and.returnValue(mockNavigation as unknown as ReturnType<Router['getCurrentNavigation']>);
    
    component.ngOnInit();
    
    // Should handle the message without errors
    expect(mockRouter.getCurrentNavigation).toHaveBeenCalled();
  });
});