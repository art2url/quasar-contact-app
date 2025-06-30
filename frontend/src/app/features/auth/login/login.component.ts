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
import { catchError, firstValueFrom, timeout, TimeoutError } from 'rxjs';

import { AuthService } from '@services/auth.service';
import { LoadingService } from '@services/loading.service';
import { RecaptchaService } from '@services/recaptcha.service';
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

  constructor(
    private auth: AuthService,
    private router: Router,
    private loadingService: LoadingService,
    private http: HttpClient,
    private recaptchaService: RecaptchaService
  ) {}

  ngOnInit(): void {
    // Check for success message from registration during navigation
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state as { message?: string };
    if (state?.message) {
      console.log('Registration success:', state.message);
    }
  }

  ngAfterViewInit(): void {
    this.initializeRecaptcha();
  }

  private initializeRecaptcha(): void {
    setTimeout(() => {
      try {
        this.recaptchaWidgetId = this.recaptchaService.renderRecaptcha(
          'recaptcha-login',
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

    this.error = '';
    this.isLoading = true;

    console.log('[Login] Starting login process...');

    try {
      await this.checkBackendAvailability();
      console.log('[Login] Authenticating with server...');

      await firstValueFrom(
        this.auth.login(this.username, this.password, this.recaptchaToken)
      );
      console.log('[Login] Login successful! Navigating...');

      await this.router.navigate(['/chat']);
    } catch (error) {
      console.error('[Login] Login failed:', error);
      this.resetRecaptcha(); // Reset reCAPTCHA on failed attempt

      if (error instanceof Error) {
        if (error.message.includes('connect')) {
          this.error =
            'Cannot connect to server. Please check your connection.';
        } else if (
          error.message.includes('401') ||
          error.message.includes('Invalid')
        ) {
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
      console.log('[Login] Checking backend availability...');
      await firstValueFrom(
        this.http.get(`${environment.apiUrl}/health`).pipe(
          timeout(5000),
          catchError((error) => {
            console.error('[Login] Backend check failed:', error);
            if (error instanceof TimeoutError) {
              throw new Error('Connection timeout - server may be unavailable');
            }
            throw new Error('Cannot connect to server');
          })
        )
      );
      console.log('[Login] Backend is available');
    } catch (error) {
      console.error('[Login] Backend availability check failed:', error);
      throw error;
    }
  }

  ngOnDestroy(): void {
    if (this.recaptchaWidgetId !== undefined) {
      this.recaptchaService.resetRecaptcha(this.recaptchaWidgetId);
    }
  }
}
