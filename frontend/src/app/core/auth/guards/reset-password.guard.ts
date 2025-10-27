import { Injectable } from '@angular/core';
import { CanActivate } from '@angular/router';

@Injectable({ providedIn: 'root' })
export class ResetPasswordGuard implements CanActivate {
  canActivate(): boolean {
    // Allow access to reset-password route regardless of authentication state
    // The component will handle token validation:
    // 1. If user has a token in URL params (from email link), use it
    // 2. If user has a reset token in session (from post-password-reset flow), claim it
    // 3. If user has no token, show error
    return true;
  }
}
