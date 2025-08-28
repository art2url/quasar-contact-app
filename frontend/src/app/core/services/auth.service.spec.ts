import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';

import { AuthService } from './auth.service';
import { LoadingService } from './loading.service';
import { WebSocketService } from './websocket.service';
import { VaultService } from './vault.service';
import { CryptoService } from './crypto.service';
import { CsrfService } from './csrf.service';
import { LoginResponse, RegisterResponse } from '../models/auth.model';
import { environment } from '../../../environments/environment';

describe('AuthService (Core Authentication)', () => {
  let service: AuthService;
  let httpMock: HttpTestingController;
  let mockLoadingService: jasmine.SpyObj<LoadingService>;
  let mockWebSocketService: jasmine.SpyObj<WebSocketService>;
  let mockVaultService: jasmine.SpyObj<VaultService>;
  let mockCryptoService: jasmine.SpyObj<CryptoService>;
  let mockCsrfService: jasmine.SpyObj<CsrfService>;

  beforeEach(() => {
    // Create service mocks
    mockLoadingService = jasmine.createSpyObj('LoadingService', ['setAuthState']);
    mockWebSocketService = jasmine.createSpyObj('WebSocketService', [
      'connect', 'disconnect', 'isConnected'
    ]);
    mockVaultService = jasmine.createSpyObj('VaultService', [
      'setCurrentUser', 'waitUntilReady', 'get', 'set', 'clearAll'
    ]);
    mockCryptoService = jasmine.createSpyObj('CryptoService', [
      'hasPrivateKey', 'generateKeyPair', 'exportPrivateKey', 'exportCurrentPublicKey', 'importPrivateKey'
    ]);
    // mockCryptoService already created above
    mockCsrfService = jasmine.createSpyObj('CsrfService', ['setToken', 'clearToken']);

    // Configure return values
    mockWebSocketService.isConnected.and.returnValue(false);
    mockVaultService.setCurrentUser.and.returnValue(Promise.resolve());
    mockVaultService.waitUntilReady.and.returnValue(Promise.resolve());
    mockVaultService.get.and.returnValue(Promise.resolve(new ArrayBuffer(32))); // Return a mock private key
    mockVaultService.set.and.returnValue(Promise.resolve());
    mockCryptoService.hasPrivateKey.and.returnValue(false);
    mockCryptoService.generateKeyPair.and.returnValue(Promise.resolve('key-fingerprint'));
    mockCryptoService.exportPrivateKey.and.returnValue(Promise.resolve(new ArrayBuffer(32)));
    mockCryptoService.exportCurrentPublicKey.and.returnValue(Promise.resolve('public-key'));
    mockCryptoService.importPrivateKey.and.returnValue(Promise.resolve('imported'));

    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [
        AuthService,
        { provide: LoadingService, useValue: mockLoadingService },
        { provide: WebSocketService, useValue: mockWebSocketService },
        { provide: VaultService, useValue: mockVaultService },
        { provide: CryptoService, useValue: mockCryptoService },
        { provide: CsrfService, useValue: mockCsrfService }
      ]
    });

    service = TestBed.inject(AuthService);
    httpMock = TestBed.inject(HttpTestingController);

    // Clear localStorage before each test
    localStorage.clear();
  });

  afterEach(() => {
    httpMock.verify();
    localStorage.clear();
  });

  // Run: npm test -- --include="**/auth.service.spec.ts"
  it('initializes with correct authentication state', () => {
    expect(service).toBeTruthy();
    expect(service.isAuthenticated()).toBe(false);
    expect(mockLoadingService.setAuthState).toHaveBeenCalledWith(false);
  });

  it('detects authenticated state when user data exists', () => {
    localStorage.setItem('username', 'testuser');
    localStorage.setItem('userId', 'user-123');

    const newService = TestBed.inject(AuthService);
    
    expect(newService.isAuthenticated()).toBe(true);
  });

  it('handles successful login flow', async () => {
    const loginResponse: LoginResponse = {
      message: 'Login successful',
      user: {
        id: 'user-123',
        username: 'testuser',
        avatarUrl: 'avatar.jpg'
      },
      csrfToken: 'csrf-token-123'
    };

    const loginPromise = service.login('testuser', 'password123').toPromise();
    
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      username: 'testuser',
      password: 'password123'
    });
    req.flush(loginResponse);
    
    const response = await loginPromise;
    expect(response).toEqual(loginResponse);
    expect(mockCsrfService.setToken).toHaveBeenCalledWith('csrf-token-123');
    expect(mockWebSocketService.connect).toHaveBeenCalled();
    expect(service.isAuthenticated()).toBe(true);
  });

  it('handles login with Turnstile token', () => {
    const loginResponse: LoginResponse = {
      message: 'Login successful',
      user: {
        id: 'user-123',
        username: 'testuser'
      }
    };

    service.login('testuser', 'password123', 'turnstile-token').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    expect(req.request.body).toEqual({
      username: 'testuser',
      password: 'password123',
      turnstileToken: 'turnstile-token'
    });
    req.flush(loginResponse);
  });

  it('handles login failure correctly', () => {
    const errorResponse = { error: 'Invalid credentials' };

    service.login('testuser', 'wrongpassword').subscribe({
      next: () => fail('Should have failed'),
      error: (error) => {
        expect(error.message).toBe('Invalid username or password');
        expect(service.isAuthenticated()).toBe(false);
        expect(localStorage.getItem('username')).toBeNull();
      }
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    req.flush(errorResponse, { status: 401, statusText: 'Unauthorized' });
  });

  it('handles successful registration', () => {
    const registerResponse: RegisterResponse = {
      message: 'Registration successful'
    };

    const formData = {
      username: 'newuser',
      email: 'new@example.com',
      password: 'password123',
      confirmPassword: 'password123'
    };

    service.register(
      formData.username,
      formData.email,
      formData.password,
      'avatar.jpg'
    ).subscribe(response => {
      expect(response).toEqual(registerResponse);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/register`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      username: 'newuser',
      email: 'new@example.com', 
      password: 'password123',
      avatarUrl: 'avatar.jpg'
    });
    req.flush(registerResponse);
  });

  it('handles registration failure', () => {
    const errorResponse = { error: 'Username already exists' };

    service.register('existinguser', 'test@example.com', 'password', 'avatar.jpg').subscribe({
      next: () => fail('Should have failed'),
      error: (error) => {
        expect(error.error).toEqual(errorResponse);
        expect(service.isAuthenticated()).toBe(false);
      }
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/register`);
    req.flush(errorResponse, { status: 409, statusText: 'Conflict' });
  });

  it('handles logout correctly', () => {
    // Set up authenticated state
    localStorage.setItem('username', 'testuser');
    localStorage.setItem('userId', 'user-123');
    localStorage.setItem('myAvatar', 'avatar.jpg');
    mockWebSocketService.isConnected.and.returnValue(true);

    service.logout();

    // Verify logout API call
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/logout`);
    expect(req.request.method).toBe('POST');
    req.flush({});

    // Verify cleanup
    expect(mockWebSocketService.disconnect).toHaveBeenCalled();
    expect(localStorage.getItem('username')).toBeNull();
    expect(localStorage.getItem('userId')).toBeNull();
    expect(localStorage.getItem('myAvatar')).toBeNull();
    expect(service.isAuthenticated()).toBe(false);
  });

  it('handles logout when not authenticated', () => {
    service.logout();
    
    // Should not make HTTP request when not authenticated
    httpMock.expectNone(`${environment.apiUrl}/auth/logout`);
    expect(mockWebSocketService.disconnect).not.toHaveBeenCalled();
  });

  it('handles password reset request', () => {
    const response = { message: 'Reset email sent' };

    service.requestPasswordReset('user@example.com').subscribe(result => {
      expect(result).toEqual(response);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/forgot-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({ email: 'user@example.com' });
    req.flush(response);
  });

  it('handles password reset request with Turnstile token', () => {
    const response = { message: 'Reset email sent' };

    service.requestPasswordReset('user@example.com', 'turnstile-token').subscribe();

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/forgot-password`);
    expect(req.request.body).toEqual({
      email: 'user@example.com',
      turnstileToken: 'turnstile-token'
    });
    req.flush(response);
  });

  it('validates reset tokens correctly', () => {
    const validResponse = { valid: true };
    const invalidResponse = { valid: false };

    // Test valid token
    service.validateResetToken('valid-token').subscribe(result => {
      expect(result.valid).toBe(true);
    });

    const validReq = httpMock.expectOne(`${environment.apiUrl}/auth/reset-password/validate?token=valid-token`);
    expect(validReq.request.method).toBe('GET');
    validReq.flush(validResponse);

    // Test invalid token
    service.validateResetToken('invalid-token').subscribe(result => {
      expect(result.valid).toBe(false);
    });

    const invalidReq = httpMock.expectOne(`${environment.apiUrl}/auth/reset-password/validate?token=invalid-token`);
    invalidReq.flush(invalidResponse);
  });

  it('handles password reset completion', () => {
    const response = { message: 'Password reset successful' };

    service.resetPassword('reset-token', 'newpassword123').subscribe(result => {
      expect(result).toEqual(response);
    });

    const req = httpMock.expectOne(`${environment.apiUrl}/auth/reset-password`);
    expect(req.request.method).toBe('POST');
    expect(req.request.body).toEqual({
      token: 'reset-token',
      password: 'newpassword123'
    });
    req.flush(response);
  });

  it('tracks authentication state changes', async () => {
    expect(service.isAuthenticated()).toBe(false);

    // Login should trigger authenticated state
    const loginResponse: LoginResponse = {
      message: 'Login successful',
      user: { id: 'user-123', username: 'testuser' }
    };

    const loginPromise = service.login('testuser', 'password').toPromise();
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    req.flush(loginResponse);
    
    await loginPromise;
    expect(service.isAuthenticated()).toBe(true);
  });

  it('handles post-password-reset flag correctly', () => {
    service.markPostPasswordReset();
    
    // This is used internally to track state after password reset
    // The test verifies the method exists and doesn't throw
    expect(() => service.markPostPasswordReset()).not.toThrow();
  });

  it('manages crypto keys during login', async () => {
    mockCryptoService.hasPrivateKey.and.returnValue(false);
    
    const loginResponse: LoginResponse = {
      message: 'Login successful',
      user: { id: 'user-123', username: 'testuser' }
    };

    const loginPromise = service.login('testuser', 'password').toPromise();
    const req = httpMock.expectOne(`${environment.apiUrl}/auth/login`);
    req.flush(loginResponse);
    
    await loginPromise;
    expect(mockVaultService.setCurrentUser).toHaveBeenCalledWith('user-123');
    expect(mockVaultService.waitUntilReady).toHaveBeenCalled();
  });
});