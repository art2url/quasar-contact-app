import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, NavigationEnd } from '@angular/router';
import { ChangeDetectorRef, CUSTOM_ELEMENTS_SCHEMA } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { AppComponent } from './app.component';
import { AuthService } from '@services/auth.service';
import { LoadingService } from '@services/loading.service';
import { WebSocketService } from '@services/websocket.service';
import { VaultService } from '@services/vault.service';
import { CryptoService } from '@services/crypto.service';
import { NotificationService } from '@services/notification.service';
import { ThemeService } from '@services/theme.service';

describe('AppComponent (Main Application)', () => {
  let component: AppComponent;
  let fixture: ComponentFixture<AppComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockLoadingService: jasmine.SpyObj<LoadingService>;
  let mockWebSocketService: jasmine.SpyObj<WebSocketService>;

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

    // Create minimal service mocks
    mockAuthService = jasmine.createSpyObj('AuthService', ['isAuthenticated'], {
      isAuthenticated$: new BehaviorSubject<boolean>(false)
    });

    mockLoadingService = jasmine.createSpyObj('LoadingService', [
      'setAuthState', 'showForNavigation', 'hide', 'emergencyStop'
    ]);

    mockWebSocketService = jasmine.createSpyObj('WebSocketService', [
      'connect', 'disconnect', 'isConnected', 'debugOnlineStatus'
    ], {
      isConnected$: new BehaviorSubject<boolean>(false)
    });

    const mockRouter = jasmine.createSpyObj('Router', ['navigate'], {
      url: '/dashboard',
      events: new BehaviorSubject(new NavigationEnd(1, '/', '/'))
    });

    const mockVaultService = jasmine.createSpyObj('VaultService', ['setCurrentUser', 'get']);
    const mockCryptoService = jasmine.createSpyObj('CryptoService', ['hasPrivateKey', 'importPrivateKey']);
    const mockNotificationService = jasmine.createSpyObj('NotificationService', ['showSuccess'], {
      unreadCount$: new BehaviorSubject<number>(0),
      totalUnread$: new BehaviorSubject<number>(0)
    });
    const mockThemeService = jasmine.createSpyObj('ThemeService', ['isDarkTheme'], {
      theme$: new BehaviorSubject<string>('light')
    });

    // Configure return values
    mockAuthService.isAuthenticated.and.returnValue(false);
    mockWebSocketService.isConnected.and.returnValue(false);
    mockCryptoService.hasPrivateKey.and.returnValue(false);
    mockVaultService.setCurrentUser.and.returnValue(Promise.resolve());
    mockCryptoService.importPrivateKey.and.returnValue(Promise.resolve('imported'));

    await TestBed.configureTestingModule({
      imports: [AppComponent],
      schemas: [CUSTOM_ELEMENTS_SCHEMA],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: Router, useValue: mockRouter },
        { provide: AuthService, useValue: mockAuthService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: WebSocketService, useValue: mockWebSocketService },
        { provide: VaultService, useValue: mockVaultService },
        { provide: CryptoService, useValue: mockCryptoService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: ThemeService, useValue: mockThemeService },
        ChangeDetectorRef
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(AppComponent);
    component = fixture.componentInstance;
  });

  // Run: npm test -- --include="**/app.component.spec.ts"
  it('creates the app component successfully', () => {
    expect(component).toBeTruthy();
    expect(component.title).toBe('quasar-secure-chat');
  });

  it('exposes loading service for template use', () => {
    expect(component.loadingService).toBe(mockLoadingService);
  });

  it('initializes component properties correctly', () => {
    fixture.detectChanges();
    
    expect(component.title).toBe('quasar-secure-chat');
    expect(component.loadingService).toBeDefined();
  });

  it('handles component destruction cleanly', () => {
    component.ngOnInit();
    
    expect(() => {
      component.ngOnDestroy();
    }).not.toThrow();

    expect(mockWebSocketService.disconnect).toHaveBeenCalled();
    expect(mockLoadingService.emergencyStop).toHaveBeenCalledWith('app-destroy');
  });

  it('calls authentication service methods during initialization', () => {
    spyOn(localStorage, 'getItem').and.returnValue('test-user');
    
    component.ngOnInit();
    
    // Trigger the auth state change to ensure setAuthState is called
    (mockAuthService.isAuthenticated$ as BehaviorSubject<boolean>).next(false);
    
    // The component sets up authentication state monitoring
    expect(mockLoadingService.setAuthState).toHaveBeenCalled();
  });

  it('handles WebSocket connection based on authentication state', () => {
    spyOn(localStorage, 'getItem').and.callFake((key: string) => {
      if (key === 'userId') return 'user-123';
      if (key === 'username') return 'test-user';
      return null;
    });

    component.ngOnInit();
    
    // Simulate authentication change
    (mockAuthService.isAuthenticated$ as BehaviorSubject<boolean>).next(true);
    
    expect(mockWebSocketService.connect).toHaveBeenCalled();
  });

  it('handles app initialization lifecycle correctly', async () => {
    spyOn(localStorage, 'getItem').and.returnValue('test-value');
    
    component.ngOnInit();
    component.ngAfterViewInit();
    
    // Wait for async operations
    await new Promise(resolve => setTimeout(resolve, 10));
    
    // Component should handle initialization without errors
    expect(component).toBeTruthy();
  });

  it('manages router navigation events', () => {
    component.ngOnInit();
    
    // The component should subscribe to router events for loading management
    expect(mockLoadingService.hide).toHaveBeenCalled();
  });
});