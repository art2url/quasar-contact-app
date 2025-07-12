import { Component, OnInit } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';

import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '@services/auth.service';

@Component({
  selector: 'app-reset-password',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatCardModule,
    MatIconModule,
    MatProgressSpinnerModule,
  ],
  templateUrl: './reset-password.component.html',
  styleUrls: ['./reset-password.component.css'],
})
export class ResetPasswordComponent implements OnInit {
  password = '';
  confirmPassword = '';
  error = '';
  isLoading = false;
  formSubmitted = false;
  passwordReset = false;
  tokenError = false;
  hidePassword = true;
  hideConfirmPassword = true;

  private token: string | null = null;

  constructor(
    private authService: AuthService,
    private route: ActivatedRoute,
    private router: Router
  ) {}

  ngOnInit(): void {
    // Force logout when user accesses reset password page
    this.authService.logout();

    // Get the token from URL query params
    this.token = this.route.snapshot.queryParamMap.get('token');

    if (!this.token) {
      this.tokenError = true;
    } else {
      // Optionally validate token on load
      this.validateToken();
    }
  }

  private validateToken(): void {
    if (!this.token) return;

    this.authService.validateResetToken(this.token).subscribe({
      next: () => {
        // Token is valid
      },
      error: () => {
        this.tokenError = true;
      },
    });
  }

  isFormValid(): boolean {
    return this.password.length >= 6 && this.password === this.confirmPassword;
  }

  getPasswordStrength(): 'weak' | 'medium' | 'strong' {
    if (!this.password) return 'weak';

    let strength = 0;

    // Length check
    if (this.password.length >= 8) strength++;
    if (this.password.length >= 12) strength++;

    // Character variety checks
    if (/[a-z]/.test(this.password)) strength++;
    if (/[A-Z]/.test(this.password)) strength++;
    if (/[0-9]/.test(this.password)) strength++;
    if (/[^a-zA-Z0-9]/.test(this.password)) strength++;

    if (strength <= 2) return 'weak';
    if (strength <= 4) return 'medium';
    return 'strong';
  }

  getPasswordStrengthPercent(): number {
    const strength = this.getPasswordStrength();
    if (strength === 'weak') return 33;
    if (strength === 'medium') return 66;
    return 100;
  }

  getPasswordStrengthText(): string {
    const strength = this.getPasswordStrength();
    if (strength === 'weak') return 'Weak - Consider adding more characters';
    if (strength === 'medium') return 'Medium - Good password';
    return 'Strong - Excellent password';
  }

  onSubmit(): void {
    this.formSubmitted = true;
    this.error = '';

    if (!this.isFormValid()) {
      if (this.password !== this.confirmPassword) {
        this.error = 'Passwords do not match';
      } else {
        this.error = 'Please fix the errors above';
      }
      return;
    }

    if (!this.token) {
      this.error = 'Invalid reset link';
      return;
    }

    this.isLoading = true;

    this.authService.resetPassword(this.token, this.password).subscribe({
      next: () => {
        this.isLoading = false;
        this.passwordReset = true;

        // Mark that we're in post-password-reset state
        // This tells the auth service to generate new keys on next login
        this.authService.markPostPasswordReset();

        // Password reset successful, marked post-reset state
      },
      error: err => {
        this.isLoading = false;

        if (err.status === 400 || err.status === 401) {
          this.error =
            'This reset link has expired or is invalid. Please request a new one.';
          this.tokenError = true;
        } else {
          this.error = 'An error occurred. Please try again.';
        }
      },
    });
  }
}
