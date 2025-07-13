import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { Subscription } from 'rxjs';
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
import { RecaptchaService } from '@services/recaptcha.service';
import { ThemeService } from '@services/theme.service';
import { HoneypotService } from '@services/honeypot.service';
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
export class RegisterComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('recaptchaElement', { static: false })
  recaptchaElement!: ElementRef;

  username = '';
  email = '';
  password = '';
  error = '';
  isLoading = false;
  hidePassword = true;
  formSubmitted = false;
  recaptchaToken = '';
  recaptchaWidgetId: number | undefined;
  private themeSubscription?: Subscription;
  
  // Honeypot fields
  honeypotFields: Record<string, string> = {};
  formStartTime = 0;

  constructor(
    private authService: AuthService,
    private router: Router,
    private loadingService: LoadingService,
    private recaptchaService: RecaptchaService,
    private themeService: ThemeService,
    public honeypotService: HoneypotService
  ) {}

  ngOnInit(): void {
    // Initialize form validation and reCAPTCHA when component loads
    // Component initialized
    
    // Initialize honeypot fields
    this.honeypotFields = this.honeypotService.createHoneypotData();
    this.formStartTime = this.honeypotService.addFormStartTime();
  }

  ngAfterViewInit(): void {
    this.initializeRecaptcha();
    this.setupThemeSubscription();
  }

  private initializeRecaptcha(): void {
    setTimeout(() => {
      try {
        this.recaptchaWidgetId = this.recaptchaService.renderRecaptcha(
          'recaptcha-register',
          (token: string) => {
            this.recaptchaToken = token;
            this.error = ''; // Clear any reCAPTCHA-related errors
          }
        );
      } catch (error) {
        console.error('Failed to initialize reCAPTCHA:', error);
        this.error = 'Failed to load security verification. Please refresh the page.';
      }
    }, 500);
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
        const recaptchaElement = document.getElementById('recaptcha-register');
        if (recaptchaElement && recaptchaElement.parentNode) {
          const parent = recaptchaElement.parentNode;
          const newElement = document.createElement('div');
          newElement.id = 'recaptcha-register';
          parent.replaceChild(newElement, recaptchaElement);
          // Recreated reCAPTCHA DOM element
        }

        // Re-render with delay
        setTimeout(() => {
          try {
            this.recaptchaWidgetId = this.recaptchaService.renderRecaptcha(
              'recaptcha-register',
              (token: string) => {
                this.recaptchaToken = token;
                this.error = '';
              }
            );
            // New reCAPTCHA widget created
          } catch (error) {
            console.error(
              '[Register] Failed to re-render reCAPTCHA after theme change:',
              error
            );
            // Don't show error to user for theme switching failures
            // The form will still work, just without reCAPTCHA theme update
          }
        }, 300);
      }
    });
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

  isFormValid(): boolean {
    return (
      this.username.length >= 3 &&
      this.isValidEmail(this.email) &&
      this.password.length >= 6 &&
      this.recaptchaToken.length > 0
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
      if (!this.recaptchaToken) {
        this.error = 'Please complete the security verification';
      } else {
        this.error = 'Please fix the errors above';
      }
      return;
    }

    // Client-side honeypot validation
    if (!this.honeypotService.validateHoneypotFields(this.honeypotFields)) {
      console.warn('[Register] Honeypot validation failed on client side');
      this.error = 'Please try again.';
      return;
    }

    this.isLoading = true;
    this.loadingService.showForAuth('register');

    // Generate a deterministic avatar based on the chosen username
    const avatarUrl = defaultAvatarFor(this.username);

    // Prepare form data with honeypot fields
    const formData = this.honeypotService.prepareFormDataWithHoneypot({
      username: this.username,
      email: this.email,
      password: this.password,
      avatarUrl: avatarUrl,
      recaptchaToken: this.recaptchaToken
    }, this.formStartTime);

    this.authService
      .registerWithHoneypot(formData)
      .subscribe({
        next: () => {
          // Registration successful
          // Navigate to login page with success message
          this.router.navigate(['/auth/login'], {
            state: { message: 'Account created successfully! Please sign in.' },
          });
        },
        error: err => {
          console.error('[Register] Registration failed:', err);
          this.resetRecaptcha(); // Reset reCAPTCHA on failed attempt

          this.isLoading = false;
          this.loadingService.hide();

          // Handle different error types
          if (err.status === 409) {
            this.error =
              'Username or email already exists. Please choose different ones.';
          } else if (err.status === 422) {
            // Validation errors from server
            if (err.error && err.error.errors && err.error.errors.length > 0) {
              this.error = err.error.errors.map((e: ValidationError) => e.msg).join(', ');
            } else {
              this.error = 'Invalid input. Please check your information.';
            }
          } else if (err.status === 400 && err.error?.message?.includes('recaptcha')) {
            this.error = 'Security verification failed. Please try again.';
          } else if (err.status === 0) {
            this.error = 'Cannot connect to server. Please check your connection.';
          } else {
            this.error = err.error?.message || 'Registration failed. Please try again.';
          }
        },
        complete: () => {
          if (this.isLoading) {
            this.isLoading = false;
            this.loadingService.hide();
          }
        },
      });
  }

  ngOnDestroy(): void {
    if (this.recaptchaWidgetId !== undefined) {
      this.recaptchaService.resetRecaptcha(this.recaptchaWidgetId);
    }

    // Clean up theme subscription
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }
  }
}
