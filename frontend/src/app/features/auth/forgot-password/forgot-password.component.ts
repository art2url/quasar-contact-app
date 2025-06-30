import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
} from '@angular/core';
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
import { RecaptchaService } from '@services/recaptcha.service';

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
export class ForgotPasswordComponent
  implements OnInit, OnDestroy, AfterViewInit
{
  @ViewChild('recaptchaElement', { static: false })
  recaptchaElement!: ElementRef;

  email = '';
  error = '';
  isLoading = false;
  formSubmitted = false;
  emailSent = false;
  resendCooldown = 0;
  recaptchaToken = '';
  recaptchaWidgetId: number | undefined;

  private resendInterval: ReturnType<typeof setInterval> | undefined;

  constructor(
    private authService: AuthService,
    private recaptchaService: RecaptchaService
  ) {}

  ngOnInit(): void {
    // Initialize form validation and reCAPTCHA when component loads
    console.log('[ForgotPassword] Component initialized');
  }

  ngAfterViewInit(): void {
    this.initializeRecaptcha();
  }

  private initializeRecaptcha(): void {
    setTimeout(() => {
      try {
        this.recaptchaWidgetId = this.recaptchaService.renderRecaptcha(
          'recaptcha-forgot-password',
          (token: string) => {
            this.recaptchaToken = token;
            this.error = ''; // Clear any reCAPTCHA-related errors
          }
        );
      } catch (error) {
        console.error('Failed to initialize reCAPTCHA:', error);
        this.error =
          'Failed to load security verification. Please refresh the page.';
      }
    }, 500);
  }

  private resetRecaptcha(): void {
    this.recaptchaToken = '';
    if (this.recaptchaWidgetId !== undefined) {
      this.recaptchaService.resetRecaptcha(this.recaptchaWidgetId);
    }
  }

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

    if (!this.recaptchaToken) {
      this.error = 'Please complete the security verification';
      return;
    }

    this.isLoading = true;

    this.authService
      .requestPasswordReset(this.email, this.recaptchaToken)
      .subscribe({
        next: () => {
          this.isLoading = false;
          this.emailSent = true;
          this.startResendCooldown();
        },
        error: (err) => {
          this.isLoading = false;
          this.resetRecaptcha(); // Reset reCAPTCHA on failed attempt

          if (err.status === 404) {
            this.error = 'No account found with this email address';
          } else if (err.status === 429) {
            this.error = 'Too many requests. Please try again later.';
          } else if (
            err.status === 400 &&
            err.error?.message?.includes('recaptcha')
          ) {
            this.error = 'Security verification failed. Please try again.';
          } else {
            this.error = 'An error occurred. Please try again.';
          }
        },
      });
  }

  resendEmail(): void {
    if (this.resendCooldown > 0) return;

    if (!this.recaptchaToken) {
      this.error = 'Please complete the security verification';
      return;
    }

    this.authService
      .requestPasswordReset(this.email, this.recaptchaToken)
      .subscribe({
        next: () => {
          this.startResendCooldown();
        },
        error: (err) => {
          console.error('Failed to resend email:', err);
          this.resetRecaptcha(); // Reset reCAPTCHA on failed attempt

          if (err.status === 400 && err.error?.message?.includes('recaptcha')) {
            this.error = 'Security verification failed. Please try again.';
          }
        },
      });
  }

  private startResendCooldown(): void {
    this.resendCooldown = 60; // 60 seconds

    this.resendInterval = setInterval(() => {
      this.resendCooldown--;
      if (this.resendCooldown <= 0) {
        clearInterval(this.resendInterval);
        // Re-initialize reCAPTCHA for resend functionality
        this.initializeRecaptcha();
      }
    }, 1000);
  }

  ngOnDestroy(): void {
    // Clear any running intervals
    if (this.resendInterval) {
      clearInterval(this.resendInterval);
      this.resendInterval = undefined;
    }

    // Reset reCAPTCHA widget
    if (this.recaptchaWidgetId !== undefined) {
      this.recaptchaService.resetRecaptcha(this.recaptchaWidgetId);
      this.recaptchaWidgetId = undefined;
    }

    console.log('[ForgotPassword] Component destroyed, cleaned up resources');
  }
}
