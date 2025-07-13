import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatCardModule } from '@angular/material/card';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatIconModule } from '@angular/material/icon';
import { HttpClient } from '@angular/common/http';
import { catchError, firstValueFrom, timeout, TimeoutError, Subscription } from 'rxjs';

import { AuthService } from '@services/auth.service';
import { RecaptchaService } from '@services/recaptcha.service';
import { ThemeService } from '@services/theme.service';
import { HoneypotService } from '@services/honeypot.service';
import { environment } from '@environments/environment';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [
    FormsModule,
    CommonModule,
    RouterModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule,
    MatCardModule,
    MatProgressSpinnerModule,
    MatIconModule,
  ],
  templateUrl: './login.component.html',
  styleUrls: ['./login.component.css'],
})
export class LoginComponent implements OnInit, OnDestroy, AfterViewInit {
  @ViewChild('recaptchaElement', { static: false })
  recaptchaElement!: ElementRef;

  username = '';
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
    private auth: AuthService,
    private router: Router,
    private http: HttpClient,
    private recaptchaService: RecaptchaService,
    private themeService: ThemeService,
    public honeypotService: HoneypotService
  ) {}

  ngOnInit(): void {
    // Check for success message from registration during navigation
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state as { message?: string };
    if (state?.message) {
      // Registration success message available
    }
    
    // Initialize honeypot fields
    this.honeypotFields = this.honeypotService.createHoneypotData();
    this.formStartTime = this.honeypotService.addFormStartTime();
  }

  ngAfterViewInit(): void {
    // Component view initialized
    this.setupThemeSubscription();
    this.initializeRecaptcha();
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
        const recaptchaElement = document.getElementById('recaptcha-login');
        if (recaptchaElement && recaptchaElement.parentNode) {
          const parent = recaptchaElement.parentNode;
          const newElement = document.createElement('div');
          newElement.id = 'recaptcha-login';
          parent.replaceChild(newElement, recaptchaElement);
          // Recreated reCAPTCHA DOM element
        }

        // Re-render with delay
        setTimeout(() => {
          try {
            this.recaptchaWidgetId = this.recaptchaService.renderRecaptcha(
              'recaptcha-login',
              (token: string) => {
                this.recaptchaToken = token;
                this.error = '';
              }
            );
            // New reCAPTCHA widget created
          } catch (error) {
            console.error('Failed to re-render reCAPTCHA after theme change:', error);
            // Don't show error to user for theme switching failures
            // The form will still work, just without reCAPTCHA theme update
          }
        }, 300);
      }
    });
  }

  private initializeRecaptcha(retryCount = 0): void {
    const maxRetries = 3;
    const baseDelay = 500;

    setTimeout(() => {
      try {
        this.recaptchaWidgetId = this.recaptchaService.renderRecaptcha(
          'recaptcha-login',
          (token: string) => {
            this.recaptchaToken = token;
            this.error = ''; // Clear any reCAPTCHA-related errors
          }
        );
        // reCAPTCHA initialized successfully
      } catch (error) {
        console.error(
          'Failed to initialize reCAPTCHA (attempt',
          retryCount + 1,
          '):',
          error
        );

        if (retryCount < maxRetries) {
          // Retrying reCAPTCHA initialization
          setTimeout(
            () => {
              this.initializeRecaptcha(retryCount + 1);
            },
            (retryCount + 1) * 1000
          ); // Exponential backoff: 1s, 2s, 3s
        } else {
          console.error('Max retries reached. reCAPTCHA initialization failed.');
          this.error = 'Failed to load security verification. Please refresh the page.';
        }
      }
    }, baseDelay);
  }

  private resetRecaptcha(): void {
    this.recaptchaToken = '';
    if (this.recaptchaWidgetId !== undefined) {
      this.recaptchaService.resetRecaptcha(this.recaptchaWidgetId);
    }
  }

  async onLogin(): Promise<void> {
    this.formSubmitted = true;

    if (!this.username || !this.password) {
      this.error = 'Please fill in all fields';
      return;
    }

    if (!this.recaptchaToken) {
      this.error = 'Please complete the security verification';
      return;
    }

    // Client-side honeypot validation
    if (!this.honeypotService.validateHoneypotFields(this.honeypotFields)) {
      console.warn('[Login] Honeypot validation failed on client side');
      this.error = 'Please try again.';
      return;
    }

    this.error = '';
    this.isLoading = true;

    // Starting login process

    try {
      await this.checkBackendAvailability();
      // Authenticating with server

      // Prepare form data with honeypot fields
      const formData = this.honeypotService.prepareFormDataWithHoneypot({
        username: this.username,
        password: this.password,
        recaptchaToken: this.recaptchaToken
      }, this.formStartTime);

      await firstValueFrom(
        this.auth.loginWithHoneypot(formData)
      );
      // Login successful, navigating

      await this.router.navigate(['/chat']);
    } catch (error) {
      console.error('[Login] Login failed:', error);
      this.resetRecaptcha(); // Reset reCAPTCHA on failed attempt

      if (error instanceof Error) {
        if (error.message.includes('connect')) {
          this.error = 'Cannot connect to server. Please check your connection.';
        } else if (error.message.includes('401') || error.message.includes('Invalid')) {
          this.error = 'Invalid username or password.';
        } else if (error.message.includes('recaptcha')) {
          this.error = 'Security verification failed. Please try again.';
        } else {
          this.error = 'Login failed. Please try again.';
        }
      } else {
        this.error = 'An unexpected error occurred. Please try again.';
      }
    } finally {
      this.isLoading = false;
    }
  }

  private async checkBackendAvailability(): Promise<void> {
    try {
      // Checking backend availability
      await firstValueFrom(
        this.http.get(`${environment.apiUrl}/health`).pipe(
          timeout(5000),
          catchError(error => {
            console.error('[Login] Backend check failed:', error);
            if (error instanceof TimeoutError) {
              throw new Error('Connection timeout - server may be unavailable');
            }
            throw new Error('Cannot connect to server');
          })
        )
      );
      // Backend is available
    } catch (error) {
      console.error('[Login] Backend availability check failed:', error);
      throw error;
    }
  }

  ngOnDestroy(): void {
    if (this.recaptchaWidgetId !== undefined) {
      this.recaptchaService.resetRecaptcha(this.recaptchaWidgetId);
    }
    this.themeSubscription?.unsubscribe();
  }
}
