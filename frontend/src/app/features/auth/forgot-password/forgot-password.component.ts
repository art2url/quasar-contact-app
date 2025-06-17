import { Component, OnDestroy } from '@angular/core';
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
  selector: 'app-forgot-password',
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
  templateUrl: './forgot-password.component.html',
  styleUrls: ['./forgot-password.component.css'],
})
export class ForgotPasswordComponent implements OnDestroy {
  email = '';
  error = '';
  isLoading = false;
  formSubmitted = false;
  emailSent = false;
  resendCooldown = 0;

  private resendInterval: ReturnType<typeof setInterval> | undefined;

  constructor(private authService: AuthService) {}

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  onSubmit(): void {
    this.formSubmitted = true;
    this.error = '';

    if (!this.email || !this.isValidEmail(this.email)) {
      this.error = 'Please enter a valid email address';
      return;
    }

    this.isLoading = true;

    this.authService.requestPasswordReset(this.email).subscribe({
      next: () => {
        this.isLoading = false;
        this.emailSent = true;
        this.startResendCooldown();
      },
      error: (err) => {
        this.isLoading = false;

        if (err.status === 404) {
          this.error = 'No account found with this email address';
        } else if (err.status === 429) {
          this.error = 'Too many requests. Please try again later.';
        } else {
          this.error = 'An error occurred. Please try again.';
        }
      },
    });
  }

  resendEmail(): void {
    if (this.resendCooldown > 0) return;

    this.authService.requestPasswordReset(this.email).subscribe({
      next: () => {
        this.startResendCooldown();
      },
      error: (err) => {
        console.error('Failed to resend email:', err);
      },
    });
  }

  private startResendCooldown(): void {
    this.resendCooldown = 60; // 60 seconds

    this.resendInterval = setInterval(() => {
      this.resendCooldown--;
      if (this.resendCooldown <= 0) {
        clearInterval(this.resendInterval);
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
    }
  }
}
