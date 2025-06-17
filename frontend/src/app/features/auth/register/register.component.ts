import { Component } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';

import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '@services/auth.service';
import { LoadingService } from '@services/loading.service';
import { defaultAvatarFor } from '@utils/avatar.util';

interface ValidationError {
  msg: string;
  [key: string]: unknown;
}

@Component({
  selector: 'app-register',
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
  templateUrl: './register.component.html',
  styleUrls: ['./register.component.css'],
})
export class RegisterComponent {
  username = '';
  email = '';
  password = '';
  error = '';
  isLoading = false;
  hidePassword = true;
  formSubmitted = false;

  constructor(
    private authService: AuthService,
    private router: Router,
    private loadingService: LoadingService
  ) {}

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isFormValid(): boolean {
    return (
      this.username.length >= 3 &&
      this.isValidEmail(this.email) &&
      this.password.length >= 6
    );
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

  onRegister(): void {
    this.formSubmitted = true;
    this.error = '';

    if (!this.isFormValid()) {
      this.error = 'Please fix the errors above';
      return;
    }

    this.isLoading = true;
    this.loadingService.showForAuth('register');

    // Generate a deterministic avatar based on the chosen username
    const avatarUrl = defaultAvatarFor(this.username);

    this.authService
      .register(this.username, this.email, this.password, avatarUrl)
      .subscribe({
        next: () => {
          console.log('[Register] Registration successful');
          // Navigate to login page with success message
          this.router.navigate(['/auth/login'], {
            state: { message: 'Account created successfully! Please sign in.' },
          });
        },
        error: (err) => {
          console.error('[Register] Registration failed:', err);

          this.isLoading = false;
          this.loadingService.hide('register');

          // Handle different error types
          if (err.status === 409) {
            this.error =
              'Username or email already exists. Please choose different ones.';
          } else if (err.status === 422) {
            // Validation errors from server
            if (err.error && err.error.errors && err.error.errors.length > 0) {
              // Fixed: (e: any) -> (e: ValidationError)
              this.error = err.error.errors
                .map((e: ValidationError) => e.msg)
                .join(', ');
            } else {
              this.error = 'Invalid input. Please check your information.';
            }
          } else if (err.status === 0) {
            this.error =
              'Cannot connect to server. Please check your connection.';
          } else {
            this.error =
              err.error?.message || 'Registration failed. Please try again.';
          }
        },
        complete: () => {
          if (this.isLoading) {
            this.isLoading = false;
            this.loadingService.hide('register');
          }
        },
      });
  }
}
