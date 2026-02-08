import { Router } from '@angular/router';
import { UnauthGuard } from './unauth.guard';
import { AuthService } from '@services/auth.service';

describe('UnauthGuard (Business Logic)', () => {
  let guard: UnauthGuard;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(() => {
    mockAuthService = jasmine.createSpyObj('AuthService', ['isAuthenticated']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    guard = new UnauthGuard(mockAuthService, mockRouter);
  });

  // Run: npm test -- --include="**/unauth.guard.spec.ts"
  describe('Route Protection', () => {
    it('allows access when user is not authenticated', () => {
      mockAuthService.isAuthenticated.and.returnValue(false);

      const result = guard.canActivate();

      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('blocks access and redirects when user is authenticated', () => {
      mockAuthService.isAuthenticated.and.returnValue(true);

      const result = guard.canActivate();

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/chat']);
    });

    it('calls authentication service to check status', () => {
      mockAuthService.isAuthenticated.and.returnValue(false);

      guard.canActivate();

      expect(mockAuthService.isAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  describe('Navigation Logic', () => {
    it('navigates to chat page when user is already authenticated', () => {
      mockAuthService.isAuthenticated.and.returnValue(true);

      guard.canActivate();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/chat']);
      expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
    });

    it('does not navigate when user is not authenticated', () => {
      mockAuthService.isAuthenticated.and.returnValue(false);

      guard.canActivate();

      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });

  describe('Return Value Logic', () => {
    it('returns true when not authenticated', () => {
      mockAuthService.isAuthenticated.and.returnValue(false);

      const result = guard.canActivate();

      expect(result).toBe(true);
    });

    it('returns false when authenticated', () => {
      mockAuthService.isAuthenticated.and.returnValue(true);

      const result = guard.canActivate();

      expect(result).toBe(false);
    });
  });

  describe('Guard Purpose', () => {
    it('prevents authenticated users from accessing login/register pages', () => {
      mockAuthService.isAuthenticated.and.returnValue(true);

      const result = guard.canActivate();

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/chat']);
    });

    it('allows unauthenticated users to access login/register pages', () => {
      mockAuthService.isAuthenticated.and.returnValue(false);

      const result = guard.canActivate();

      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });
});