import { Router } from '@angular/router';
import { AuthGuard } from './auth.guard';
import { AuthService } from '@services/auth.service';

describe('AuthGuard (Business Logic)', () => {
  let guard: AuthGuard;
  let mockAuthService: jasmine.SpyObj<AuthService>;
  let mockRouter: jasmine.SpyObj<Router>;

  beforeEach(() => {
    mockAuthService = jasmine.createSpyObj('AuthService', ['isAuthenticated']);
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);

    guard = new AuthGuard(mockAuthService, mockRouter);
  });

  // Run: npm test -- --include="**/auth.guard.spec.ts"
  describe('Route Protection', () => {
    it('allows access when user is authenticated', () => {
      mockAuthService.isAuthenticated.and.returnValue(true);

      const result = guard.canActivate();

      expect(result).toBe(true);
      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });

    it('blocks access and redirects when user is not authenticated', () => {
      mockAuthService.isAuthenticated.and.returnValue(false);

      const result = guard.canActivate();

      expect(result).toBe(false);
      expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
    });

    it('calls authentication service to check status', () => {
      mockAuthService.isAuthenticated.and.returnValue(true);

      guard.canActivate();

      expect(mockAuthService.isAuthenticated).toHaveBeenCalledTimes(1);
    });
  });

  describe('Navigation Logic', () => {
    it('navigates to login page when authentication fails', () => {
      mockAuthService.isAuthenticated.and.returnValue(false);

      guard.canActivate();

      expect(mockRouter.navigate).toHaveBeenCalledWith(['/auth/login']);
      expect(mockRouter.navigate).toHaveBeenCalledTimes(1);
    });

    it('does not navigate when authentication succeeds', () => {
      mockAuthService.isAuthenticated.and.returnValue(true);

      guard.canActivate();

      expect(mockRouter.navigate).not.toHaveBeenCalled();
    });
  });

  describe('Return Value Logic', () => {
    it('returns true when authenticated', () => {
      mockAuthService.isAuthenticated.and.returnValue(true);

      const result = guard.canActivate();

      expect(result).toBe(true);
    });

    it('returns false when not authenticated', () => {
      mockAuthService.isAuthenticated.and.returnValue(false);

      const result = guard.canActivate();

      expect(result).toBe(false);
    });
  });
});