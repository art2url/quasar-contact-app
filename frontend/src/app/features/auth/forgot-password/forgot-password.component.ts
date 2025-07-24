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
import { CommonModule, KeyValuePipe } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { AuthService } from '@services/auth.service';
import { ThemeService } from '@services/theme.service';
import { TurnstileService } from '@services/turnstile.service';
import { HoneypotService } from '@services/honeypot.service';

@Component({
  selector: 'app-forgot-password',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    KeyValuePipe,
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
  @ViewChild('turnstileElement', { static: false })
  turnstileElement!: ElementRef;

  email = '';
  error = '';
  isLoading = false;
  formSubmitted = false;
  emailSent = false;
  resendCooldown = 0;
  turnstileToken = '';
  turnstileWidgetId: string | undefined;
  private themeSubscription?: Subscription;

  private resendTimer: Subscription | undefined;
  
  // Security fields
  securityFields: Record<string, string> = {};
  formStartTime = 0;

  constructor(
    private authService: AuthService,
    private turnstileService: TurnstileService,
    private themeService: ThemeService,
    private cdr: ChangeDetectorRef,
    public honeypotService: HoneypotService
  ) {}

  ngOnInit(): void {
    // Reset form state on component initialization
    this.error = '';
    this.emailSent = false;
    this.resendCooldown = 0;
    
    // Initialize security fields
    this.securityFields = this.honeypotService.createHoneypotData();
    this.formStartTime = this.honeypotService.addFormStartTime();
  }

  ngAfterViewInit(): void {
    this.initializeTurnstile();
    this.setupThemeSubscription();
  }

  private async initializeTurnstile(): Promise<void> {
    this.cdr.detectChanges();
    
    try {
      // Use different element ID based on email sent state
      const elementId = this.emailSent ? 'turnstile-forgot-password-resend' : 'turnstile-forgot-password';
      this.turnstileWidgetId = await this.turnstileService.initializeTurnstile(
        elementId,
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
          'turnstile-forgot-password',
          (token: string) => {
            this.turnstileToken = token;
            this.error = '';
          },
          this.turnstileWidgetId
        ).then((widgetId) => {
          this.turnstileWidgetId = widgetId;
          // New Turnstile widget created
        }).catch(() => {
          // Don't log theme change errors - they're not critical
          // The form will still work, just without Turnstile theme update
        });
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

    if (!this.turnstileToken) {
      this.error = 'Please complete the security verification';
      return;
    }

    // Client-side security validation
    if (!this.honeypotService.validateHoneypotFields(this.securityFields)) {
      console.warn('[Forgot Password] Security validation failed on client side');
      this.error = 'Please try again.';
      return;
    }

    this.isLoading = true;

    this.authService.requestPasswordReset(this.email, this.turnstileToken, this.securityFields).subscribe({
      next: () => {
        this.isLoading = false;
        this.emailSent = true;
        this.startResendCooldown();
      },
      error: err => {
        this.isLoading = false;
        this.resetTurnstile(); // Reset Turnstile on failed attempt

        if (err.status === 404) {
          this.error = 'No account found with this email address';
        } else if (err.status === 429) {
          this.error = 'Too many requests. Please try again later.';
        } else if (err.status === 400 && err.error?.message?.includes('turnstile')) {
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

  private resetTurnstile(): void {
    this.turnstileToken = '';
    this.turnstileService.resetTurnstileWidget(this.turnstileWidgetId);
  }

  private startResendCooldown(): void {
    this.resendCooldown = 60; // 60 seconds

    this.resendTimer = timer(0, 1000).subscribe(() => {
      this.resendCooldown--;
      if (this.resendCooldown <= 0) {
        this.resendTimer?.unsubscribe();
        this.resendTimer = undefined;
        // Re-initialize Turnstile for resend functionality
        this.initializeTurnstile();
      }
    });
  }

  ngOnDestroy(): void {
    // Clear any running timers
    if (this.resendTimer) {
      this.resendTimer.unsubscribe();
      this.resendTimer = undefined;
    }

    // Reset Turnstile widget
    this.turnstileService.resetTurnstileWidget(this.turnstileWidgetId);
    this.turnstileWidgetId = undefined;

    // Clean up theme subscription
    if (this.themeSubscription) {
      this.themeSubscription.unsubscribe();
    }

    // Component destroyed, cleaned up resources
  }
}