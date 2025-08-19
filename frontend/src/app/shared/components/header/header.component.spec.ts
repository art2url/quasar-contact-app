import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { of, BehaviorSubject } from 'rxjs';

import { HeaderComponent } from './header.component';
import { AuthService } from '@services/auth.service';
import { WebSocketService } from '@services/websocket.service';
import { LoadingService } from '@services/loading.service';
import { NotificationService } from '@services/notification.service';
import { ThemeService } from '@services/theme.service';

describe('HeaderComponent', () => {
  let component: HeaderComponent;
  let fixture: ComponentFixture<HeaderComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockWebSocketService: jasmine.SpyObj<WebSocketService>;
  let mockLoadingService: jasmine.SpyObj<LoadingService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;
  let mockThemeService: jasmine.SpyObj<ThemeService>;

  beforeEach(async () => {
    // Create spies for all services
    mockAuthService = jasmine.createSpyObj('AuthService', ['isAuthenticated', 'logout']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    Object.defineProperty(mockRouter, 'url', { value: '/chat', writable: true });
    Object.defineProperty(mockRouter, 'events', { value: of() });
    
    mockWebSocketService = jasmine.createSpyObj('WebSocketService', ['disconnect'], {
      isConnected$: new BehaviorSubject(true)
    });
    mockLoadingService = jasmine.createSpyObj('LoadingService', ['show', 'forceHideLoading']);
    mockNotificationService = jasmine.createSpyObj('NotificationService', [], {
      totalUnread$: new BehaviorSubject(0)
    });
    mockThemeService = jasmine.createSpyObj('ThemeService', ['toggleTheme', 'isDarkTheme']);

    await TestBed.configureTestingModule({
      imports: [HeaderComponent],
      providers: [
        { provide: AuthService, useValue: mockAuthService },
        { provide: Router, useValue: mockRouter },
        { provide: WebSocketService, useValue: mockWebSocketService },
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: NotificationService, useValue: mockNotificationService },
        { provide: ThemeService, useValue: mockThemeService },
      ],
    }).compileComponents();

    fixture = TestBed.createComponent(HeaderComponent);
    component = fixture.componentInstance;
  });

  // Run: npm test
  it('creates and initializes', () => {
    expect(component).toBeTruthy();
    expect(component.online).toBe(true); // From mock WebSocket service
    expect(component.menuOpen).toBe(false);
  });

  it('toggles menu', () => {
    expect(component.menuOpen).toBe(false);
    
    component.toggleMenu();
    expect(component.menuOpen).toBe(true);
    
    component.toggleMenu();
    expect(component.menuOpen).toBe(false);
  });

  it('handles navigation', () => {
    mockRouter.navigate.and.returnValue(Promise.resolve(true));
    
    // Test navigation to chats (already on /chat, should just close menu)
    component.navigateToChats();
    expect(component.menuOpen).toBe(false);
    
    // Test navigation to settings (different page, should navigate and close menu)
    Object.defineProperty(mockRouter, 'url', { value: '/other', writable: true });
    component.navigateToSettings();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/settings']);
    expect(component.menuOpen).toBe(false);
  });

  it('handles logout', () => {
    mockRouter.navigate.and.returnValue(Promise.resolve(true));
    
    component.logout();
    
    expect(mockLoadingService.show).toHaveBeenCalledWith('header.logout');
    expect(mockWebSocketService.disconnect).toHaveBeenCalled();
    expect(mockAuthService.logout).toHaveBeenCalled();
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
  });

  it('shows logout conditionally', () => {
    mockAuthService.isAuthenticated.and.returnValue(true);
    Object.defineProperty(mockRouter, 'url', { value: '/chat', writable: true });
    
    expect(component.showLogout).toBe(true);
    
    Object.defineProperty(mockRouter, 'url', { value: '/auth/login', writable: true });
    expect(component.showLogout).toBe(false);
    
    mockAuthService.isAuthenticated.and.returnValue(false);
    expect(component.showLogout).toBe(false);
  });
});