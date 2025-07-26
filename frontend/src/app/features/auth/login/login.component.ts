import {
  Component,
  OnInit,
  OnDestroy,
  AfterViewInit,
  ElementRef,
  ViewChild,
  ChangeDetectorRef,
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
import { TurnstileService } from '@services/turnstile.service';
import { ThemeService } from '@services/theme.service';
import { HoneypotService } from '@services/honeypot.service';
import { ScrollService } from '@services/scroll.service';
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
  @ViewChild('turnstileElement', { static: false })
  turnstileElement!: ElementRef;

  username = '';
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
    private auth: AuthService,
    private router: Router,
    private http: HttpClient,
    private turnstileService: TurnstileService,
    private themeService: ThemeService,
    public honeypotService: HoneypotService,
    private cdr: ChangeDetectorRef,
    private scrollService: ScrollService
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
    this.initializeTurnstile();
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
          'turnstile-login',
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

  private async initializeTurnstile(): Promise<void> {
    this.cdr.detectChanges();
    
    try {
      this.turnstileWidgetId = await this.turnstileService.initializeTurnstile(
        'turnstile-login',
        (token: string) => {
          this.turnstileToken = token;
          this.error = ''; // Clear any Turnstile-related errors
        }
      );
    } catch (error) {
      this.error = (error as Error).message;
    }
  }

  private resetTurnstile(): void {
    this.turnstileToken = '';
    this.turnstileService.resetTurnstileWidget(this.turnstileWidgetId);
  }

  async onLogin(): Promise<void> {
    this.formSubmitted = true;

    if (!this.username || !this.password) {
      this.error = 'Please fill in all fields';
      return;
    }

    if (!this.turnstileToken) {
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
        turnstileToken: this.turnstileToken
      }, this.formStartTime);

      await firstValueFrom(
        this.auth.loginWithHoneypot(formData)
      );
      // Login successful, navigating

      // Ensure page scrolls to top before navigation
      this.scrollService.scrollToTop();
      await this.router.navigate(['/chat']);
    } catch (error) {
      console.error('[Login] Login failed:', error);
      this.resetTurnstile(); // Reset Turnstile on failed attempt

      if (error instanceof Error) {
        if (error.message.includes('connect')) {
          this.error = 'Cannot connect to server. Please check your connection.';
        } else if (error.message.includes('401') || error.message.includes('Invalid')) {
          this.error = 'Invalid username or password.';
        } else if (error.message.includes('turnstile')) {
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
    this.turnstileService.resetTurnstileWidget(this.turnstileWidgetId);
    this.themeSubscription?.unsubscribe();
  }
}
