import { CommonModule } from '@angular/common';
import {
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  OnDestroy,
  OnInit,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router, RouterModule } from '@angular/router';
import { Subscription } from 'rxjs';

import { MatButtonModule } from '@angular/material/button';
import { MatCardModule } from '@angular/material/card';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '@services/auth.service';
import { HoneypotService } from '@services/honeypot.service';
import { LoadingService } from '@services/loading.service';
import { ThemeService } from '@services/theme.service';
import { TurnstileService } from '@services/turnstile.service';
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
  @ViewChild('turnstileElement', { static: false })
  turnstileElement!: ElementRef;

  username = '';
  email = '';
  password = '';
  error = '';
  isLoading = false;
  hidePassword = true;
  formSubmitted = false;
  turnstileToken = '';
  turnstileWidgetId: string | undefined;
  private themeSubscription?: Subscription;
  
  // Honeypot fields
  honeypotFields: Record<string, string> = {};
  formStartTime = 0;

  constructor(
    private authService: AuthService,
    private router: Router,
    private loadingService: LoadingService,
    private turnstileService: TurnstileService,
    private themeService: ThemeService,
    public honeypotService: HoneypotService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    // Initialize form validation and Turnstile when component loads
    // Component initialized
    
    // Initialize honeypot fields
    this.honeypotFields = this.honeypotService.createHoneypotData();
    this.formStartTime = this.honeypotService.addFormStartTime();
  }

  ngAfterViewInit(): void {
    this.initializeTurnstile();
    this.setupThemeSubscription();
  }


  private async initializeTurnstile(): Promise<void> {
    this.cdr.detectChanges();
    
    try {
      this.turnstileWidgetId = await this.turnstileService.initializeTurnstile(
        'turnstile-register',
        (token: string) => {
          this.turnstileToken = token;
          this.error = ''; // Clear any Turnstile-related errors
        }
      );
      // Turnstile initialized successfully
    } catch (error) {
      this.error = (error as Error).message;
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

      // Turnstile widget ID available

      if (this.turnstileWidgetId !== undefined) {
        // Re-rendering Turnstile for theme change
        this.turnstileToken = '';

        // Re-render with change detection
        this.cdr.detectChanges();
        this.turnstileService.reRenderTurnstile(
          'turnstile-register',
          (token: string) => {
            this.turnstileToken = token;
            this.error = '';
          },
          this.turnstileWidgetId
        ).then((widgetId) => {
          this.turnstileWidgetId = widgetId;
          // New Turnstile widget created
        }).catch((error) => {
          console.error(
              '[Register] Failed to re-render Turnstile after theme change:',
              error
            );
            // Don't show error to user for theme switching failures
            // The form will still work, just without Turnstile theme update
          });
      }
    });
  }

  private resetTurnstile(): void {
    this.turnstileToken = '';
    this.turnstileService.resetTurnstileWidget(this.turnstileWidgetId);
  }

  isValidEmail(email: string): boolean {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(email);
  }

  isValidUsername(username: string): boolean {
    // Only allow alphanumeric characters, underscores, and hyphens
    const validCharacters = /^[a-zA-Z0-9_-]+$/;
    if (!validCharacters.test(username)) {
      return false;
    }

    // Prevent usernames that might trigger honeypot validation or impersonate roles
    const restrictedPatterns = [
      /test[_-]?user/i,
      /bot[_-]?test/i,
      /admin[_-]?test/i,
      /admin/i, // Block any username containing "admin"
    ];
    
    return !restrictedPatterns.some(pattern => pattern.test(username));
  }

  isFormValid(): boolean {
    return (
      this.username.length >= 3 &&
      this.isValidEmail(this.email) &&
      this.password.length >= 8 &&
      this.turnstileToken.length > 0
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
      if (!this.turnstileToken) {
        this.error = 'Please complete the security verification';
      } else {
        this.error = 'Please fix the errors above';
      }
      return;
    }

    // Additional username validation check before submission
    if (!this.isValidUsername(this.username)) {
      this.error = 'Please choose a different username';
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
      turnstileToken: this.turnstileToken
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
          this.resetTurnstile(); // Reset Turnstile on failed attempt

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
          } else if (err.status === 400 && err.error?.message?.includes('turnstile')) {
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
    this.turnstileService.resetTurnstileWidget(this.turnstileWidgetId);
    this.themeSubscription?.unsubscribe();
  }
}
