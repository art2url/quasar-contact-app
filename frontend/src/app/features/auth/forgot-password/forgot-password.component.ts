import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  ChangeDetectorRef,
} from '@angular/core';
import { Subscription, timer } from 'rxjs';

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
import { ThemeService } from '@services/theme.service';
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
export class ForgotPasswordComponent implements OnInit, OnDestroy, AfterViewInit {
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
  private themeSubscription?: Subscription;

  private resendTimer: Subscription | undefined;

  constructor(
    private authService: AuthService,
    private recaptchaService: RecaptchaService,
    private themeService: ThemeService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Reset form state on component initialization
    this.error = '';
    this.emailSent = false;
    this.resendCooldown = 0;
  }

  ngAfterViewInit(): void {
    this.initializeRecaptcha();
    this.setupThemeSubscription();
  }

  private initializeRecaptcha(): void {
    this.cdr.detectChanges();
    try {
      // Use different element ID based on email sent state
      const elementId = this.emailSent ? 'recaptcha-forgot-password-resend' : 'recaptcha-forgot-password';
      this.recaptchaWidgetId = this.recaptchaService.renderRecaptcha(
        elementId,
        (token: string) => {
          this.recaptchaToken = token;
          this.error = ''; // Clear any reCAPTCHA-related errors
        }
      );
    } catch (error) {
      // Only log error if it's not the common "reCAPTCHA not loaded" error
      if ((error as Error)?.message !== 'reCAPTCHA not loaded') {
        console.error('Failed to initialize reCAPTCHA:', error);
      }
      this.error = 'Failed to load security verification. Please refresh the page.';
    }
  }

  private setupThemeSubscription(): void {
    // Setting up theme subscription
    let isFirstEmission = true;

    this.themeSubscription = this.themeService.theme$.subscribe(() => {
      // Theme subscription triggered

      if (isFirstEmission) {
        isFirstEmission = false;
        // Skipping first emission
        return;
      }

      // reCAPTCHA widget ID available

      if (this.recaptchaWidgetId !== undefined) {
        // Re-rendering reCAPTCHA for theme change

        // Reset the widget first
        this.recaptchaService.resetRecaptcha(this.recaptchaWidgetId);
        this.recaptchaToken = '';

        // Completely remove and recreate the DOM element
        const recaptchaElement = document.getElementById('recaptcha-forgot-password');
        if (recaptchaElement && recaptchaElement.parentNode) {
          const parent = recaptchaElement.parentNode;
          const newElement = document.createElement('div');
          newElement.id = 'recaptcha-forgot-password';
          parent.replaceChild(newElement, recaptchaElement);
          // Recreated reCAPTCHA DOM element
        }

        // Re-render with change detection
        this.cdr.detectChanges();
        try {
          this.recaptchaWidgetId = this.recaptchaService.renderRecaptcha(
            'recaptcha-forgot-password',
            (token: string) => {
              this.recaptchaToken = token;
              this.error = '';
            }
          );
          // New reCAPTCHA widget created
        } catch {
          // Don't log theme change errors - they're not critical
          // The form will still work, just without reCAPTCHA theme update
        }
      }
    });
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

    this.authService.requestPasswordReset(this.email, this.recaptchaToken).subscribe({
      next: () => {
        this.isLoading = false;
        this.emailSent = true;
        this.startResendCooldown();
      },
      error: err => {
        this.isLoading = false;
        this.resetRecaptcha(); // Reset reCAPTCHA on failed attempt

        if (err.status === 404) {
          this.error = 'No account found with this email address';
        } else if (err.status === 429) {
          this.error = 'Too many requests. Please try again later.';
        } else if (err.status === 400 && err.error?.message?.includes('recaptcha')) {
          this.error = 'Security verification failed. Please try again.';
        } else {
          this.error = 'An error occurred. Please try again.';
        }
      },
    });
  }

  resendEmail(): void {
    if (this.resendCooldown > 0) return;

    this.onSubmit();
  }

  private resetRecaptcha(): void {
    this.recaptchaToken = '';
    if (this.recaptchaWidgetId !== undefined) {
      this.recaptchaService.resetRecaptcha(this.recaptchaWidgetId);
    }
  }

  private startResendCooldown(): void {
    this.resendCooldown = 60; // 60 seconds

    this.resendTimer = timer(0, 1000).subscribe(() => {
      this.resendCooldown--;
      if (this.resendCooldown <= 0) {
        this.resendTimer?.unsubscribe();
        this.resendTimer = undefined;
        // Re-initialize reCAPTCHA for resend functionality
        this.initializeRecaptcha();
      }
    });
  }

  ngOnDestroy(): void {
    // Clear any running timers
    if (this.resendTimer) {
      this.resendTimer.unsubscribe();
      this.resendTimer = undefined;
    }

    // Reset reCAPTCHA widget
    if (this.recaptchaWidgetId !== undefined) {
      this.recaptchaService.resetRecaptcha(this.recaptchaWidgetId);
      this.recaptchaWidgetId = undefined;
    }

    // Clean up theme subscription
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }

    // Component destroyed, cleaned up resources
  }
}