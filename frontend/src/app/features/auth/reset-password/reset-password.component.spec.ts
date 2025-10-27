import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ActivatedRoute } from '@angular/router';
import { provideRouter } from '@angular/router';
import { of, throwError } from 'rxjs';

import { ResetPasswordComponent } from './reset-password.component';
import { AuthService } from '@services/auth.service';

describe('ResetPasswordComponent', () => {
  let component: ResetPasswordComponent;
  let fixture: ComponentFixture<ResetPasswordComponent>;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockQueryParamMap: jasmine.SpyObj<{ get: (key: string) => string | null }>;

  function resetComponentState() {
    component.isLoading = false;
    component.error = '';
    component.formSubmitted = false;
    component.password = '';
    component.confirmPassword = '';
    component.passwordReset = false;
    component.tokenError = false;
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

    // Create spies for services
    mockAuthService = jasmine.createSpyObj('AuthService', [
      'validateResetToken', 'resetPassword', 'markPostPasswordReset', 'claimResetToken'
    ]);
    
    mockQueryParamMap = jasmine.createSpyObj('ParamMap', ['get']);
    
    const mockActivatedRoute = {
      snapshot: {
        queryParamMap: mockQueryParamMap
      }
    };

    await TestBed.configureTestingModule({
      imports: [ResetPasswordComponent],
      providers: [
        provideRouter([]),
        { provide: AuthService, useValue: mockAuthService },
        { provide: ActivatedRoute, useValue: mockActivatedRoute }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ResetPasswordComponent);
    component = fixture.componentInstance;

    // Setup default mock returns
    mockQueryParamMap.get.and.returnValue('valid-token');
    mockAuthService.validateResetToken.and.returnValue(of({ valid: true }));
    mockAuthService.claimResetToken.and.returnValue(of({ success: true, token: 'claimed-token' }));
    
    // Reset component state
    resetComponentState();
  });

  // Run: npm test
  it('creates with defaults', () => {
    expect(component).toBeTruthy();
    expect(component.password).toBe('');
    expect(component.confirmPassword).toBe('');
    expect(component.isLoading).toBe(false);
    expect(component.passwordReset).toBe(false);
    expect(component.hidePassword).toBe(true);
  });

  it('validates form inputs and requirements', () => {
    // Test form validity with matching passwords
    component.password = 'password123';
    component.confirmPassword = 'password123';
    expect(component.isFormValid()).toBe(true);
    
    // Test password too short
    component.password = '123';
    component.confirmPassword = '123';
    expect(component.isFormValid()).toBe(false);
    
    // Test passwords don't match
    component.password = 'password123';
    component.confirmPassword = 'different';
    expect(component.isFormValid()).toBe(false);
    
    // Test empty passwords
    component.password = '';
    component.confirmPassword = '';
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

  it('handles token validation on initialization', () => {
    // Test valid token scenario
    mockQueryParamMap.get.and.returnValue('valid-token');
    mockAuthService.validateResetToken.and.returnValue(of({ valid: true }));

    component.ngOnInit();

    expect(mockAuthService.validateResetToken).toHaveBeenCalledWith('valid-token');
    expect(component.tokenError).toBe(false);

    // Test missing token scenario - should claim from session
    mockQueryParamMap.get.and.returnValue(null);
    mockAuthService.claimResetToken.and.returnValue(of({ success: true, token: 'claimed-token' }));
    mockAuthService.validateResetToken.and.returnValue(of({ valid: true }));
    resetComponentState();

    component.ngOnInit();
    expect(mockAuthService.claimResetToken).toHaveBeenCalled();
    expect(component.tokenError).toBe(false);

    // Test claim failure scenario
    mockQueryParamMap.get.and.returnValue(null);
    mockAuthService.claimResetToken.and.returnValue(of({ success: false }));
    resetComponentState();

    component.ngOnInit();
    expect(component.tokenError).toBe(true);

    // Test invalid token scenario
    mockQueryParamMap.get.and.returnValue('invalid-token');
    mockAuthService.validateResetToken.and.returnValue(
      throwError(() => ({ status: 401, error: { message: 'Invalid token' } }))
    );
    resetComponentState();

    component.ngOnInit();
    expect(component.tokenError).toBe(true);
  });

  it('handles successful password reset', () => {
    // Setup valid form
    component.password = 'newpassword123';
    component.confirmPassword = 'newpassword123';
    
    // Mock token from route
    mockQueryParamMap.get.and.returnValue('valid-token');
    mockAuthService.resetPassword.and.returnValue(of({ message: 'Success' }));
    
    // Initialize component to set token
    component.ngOnInit();
    
    component.onSubmit();
    
    expect(mockAuthService.resetPassword).toHaveBeenCalledWith('valid-token', 'newpassword123');
    expect(mockAuthService.markPostPasswordReset).toHaveBeenCalled();
    expect(component.isLoading).toBe(false);
    expect(component.passwordReset).toBe(true);
    expect(component.error).toBe('');
  });

  it('handles password reset errors', () => {
    // Setup valid form
    component.password = 'newpassword123';
    component.confirmPassword = 'newpassword123';
    
    // Mock token from route
    mockQueryParamMap.get.and.returnValue('expired-token');
    component.ngOnInit();
    
    // Test expired/invalid token error
    mockAuthService.resetPassword.and.returnValue(
      throwError(() => ({ status: 400, error: { message: 'Token expired' } }))
    );
    
    component.onSubmit();
    
    expect(component.error).toBe('This reset link has expired or is invalid. Please request a new one.');
    expect(component.tokenError).toBe(true);
    expect(component.isLoading).toBe(false);
    expect(component.passwordReset).toBe(false);
    
    // Test 401 unauthorized error
    resetComponentState();
    component.password = 'newpassword123';
    component.confirmPassword = 'newpassword123';
    mockAuthService.resetPassword.and.returnValue(
      throwError(() => ({ status: 401, error: { message: 'Unauthorized' } }))
    );
    
    component.onSubmit();
    expect(component.error).toBe('This reset link has expired or is invalid. Please request a new one.');
    expect(component.tokenError).toBe(true);
    
    // Test generic server error
    resetComponentState();
    component.password = 'newpassword123';
    component.confirmPassword = 'newpassword123';
    mockAuthService.resetPassword.and.returnValue(
      throwError(() => ({ status: 500, error: { message: 'Server error' } }))
    );
    
    component.onSubmit();
    expect(component.error).toBe('An error occurred. Please try again.');
    expect(component.tokenError).toBe(false);
  });

  it('handles form validation failures', () => {
    // Test password mismatch
    component.password = 'password123';
    component.confirmPassword = 'different';

    component.onSubmit();
    expect(component.error).toBe('Passwords do not match');
    expect(mockAuthService.resetPassword).not.toHaveBeenCalled();

    // Test short password
    resetComponentState();
    component.password = '123';
    component.confirmPassword = '123';

    component.onSubmit();
    expect(component.error).toBe('Please fix the errors above');

    // Test missing token during submit
    resetComponentState();
    component.password = 'password123';
    component.confirmPassword = 'password123';
    // Don't initialize with a token - just call onSubmit directly
    // This simulates the case where token is not available

    component.onSubmit();
    expect(component.error).toBe('Invalid reset link');
  });

  it('handles loading state management', () => {
    // Setup valid form
    component.password = 'newpassword123';
    component.confirmPassword = 'newpassword123';
    
    // Mock token from route
    mockQueryParamMap.get.and.returnValue('valid-token');
    component.ngOnInit();
    
    // Test loading during successful reset
    mockAuthService.resetPassword.and.returnValue(of({ message: 'Success' }));
    
    expect(component.isLoading).toBe(false);
    component.onSubmit();
    expect(component.isLoading).toBe(false); // Would be true briefly but completes immediately
    
    // Test loading cleanup on error
    resetComponentState();
    component.password = 'newpassword123';
    component.confirmPassword = 'newpassword123';
    mockAuthService.resetPassword.and.returnValue(
      throwError(() => ({ status: 500, error: { message: 'Server error' } }))
    );
    
    component.onSubmit();
    expect(component.isLoading).toBe(false);
  });

  it('handles edge cases in password validation', () => {
    // Test very long password
    const longPassword = 'a'.repeat(100);
    component.password = longPassword;
    component.confirmPassword = longPassword;
    expect(component.isFormValid()).toBe(true);
    
    // Test empty password strength
    component.password = '';
    expect(component.getPasswordStrength()).toBe('weak');
    
    // Test medium strength edge case - long lowercase
    component.password = 'a'.repeat(20);
    expect(component.getPasswordStrength()).toBe('medium');
    
    // Test password with only special characters
    component.password = '!@#$%^&*';
    expect(component.getPasswordStrength()).toBe('weak'); // Length < 8 and only special chars = 2 points
  });

  it('handles component initialization states', () => {
    // Test initialization with valid token
    mockQueryParamMap.get.and.returnValue('valid-token');
    mockAuthService.validateResetToken.and.returnValue(of({ valid: true }));

    component.ngOnInit();

    expect(mockQueryParamMap.get).toHaveBeenCalledWith('token');
    expect(mockAuthService.validateResetToken).toHaveBeenCalledWith('valid-token');
    expect(component.tokenError).toBe(false);

    // Test initialization without token - should try to claim from session
    resetComponentState();
    mockQueryParamMap.get.and.returnValue(null);
    mockAuthService.claimResetToken.and.returnValue(of({ success: false }));
    mockAuthService.validateResetToken.calls.reset(); // Reset call count

    component.ngOnInit();

    expect(component.tokenError).toBe(true);
    expect(mockAuthService.claimResetToken).toHaveBeenCalled();
    expect(mockAuthService.validateResetToken).not.toHaveBeenCalled();
  });

  it('handles password strength text variations', () => {
    // Test weak password text
    component.password = '123';
    expect(component.getPasswordStrengthText()).toBe('Weak - Consider adding more characters');
    
    // Test medium password text
    component.password = 'Password1';
    expect(component.getPasswordStrengthText()).toBe('Medium - Good password');
    
    // Test strong password text
    component.password = 'StrongPassword123!';
    expect(component.getPasswordStrengthText()).toBe('Strong - Excellent password');
  });

  it('handles multiple form submission attempts', () => {
    // Setup valid form
    component.password = 'newpassword123';
    component.confirmPassword = 'newpassword123';
    
    // Mock token from route
    mockQueryParamMap.get.and.returnValue('valid-token');
    mockAuthService.resetPassword.and.returnValue(of({ message: 'Success' }));
    component.ngOnInit();
    
    // First submission
    component.onSubmit();
    expect(mockAuthService.resetPassword).toHaveBeenCalledTimes(1);
    expect(component.passwordReset).toBe(true);
    
    // Second submission (should still work since no loading state prevention)
    component.onSubmit();
    expect(mockAuthService.resetPassword).toHaveBeenCalledTimes(2);
  });
});