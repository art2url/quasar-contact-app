import { Component } from '@angular/core';
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
import { catchError, firstValueFrom, timeout, TimeoutError, of } from 'rxjs';

import { AuthService } from '@services/auth.service';
import { LoadingService } from '@services/loading.service';
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
export class LoginComponent {
  username = '';
  password = '';
  error = '';
  isLoading = false;
  hidePassword = true;
  formSubmitted = false;

  constructor(
    private auth: AuthService,
    private router: Router,
    private loadingService: LoadingService,
    private http: HttpClient
  ) {
    // Check for success message from registration
    const navigation = this.router.getCurrentNavigation();
    const state = navigation?.extras?.state as { message?: string };
    if (state?.message) {
      // Could display this in a snackbar or banner
      console.log(state.message);
    }
  }

  async onLogin(): Promise<void> {
    this.formSubmitted = true;

    if (!this.username || !this.password) {
      this.error = 'Please fill in all fields';
      return;
    }

    this.error = '';
    this.isLoading = true;

    console.log('[Login] Starting login process...');

    try {
      await this.checkBackendAvailability();
      console.log('[Login] Authenticating with server...');

      await firstValueFrom(this.auth.login(this.username, this.password));
      console.log('[Login] Login successful! Navigating...');

      await this.router.navigate(['/chat']);
    } catch (error) {
      console.error('[Login] Login failed:', error);

      if (error instanceof Error) {
        if (error.message.includes('connect')) {
          this.error =
            'Cannot connect to server. Please check your connection.';
        } else if (
          error.message.includes('401') ||
          error.message.includes('Invalid')
        ) {
          this.error = 'Invalid username or password.';
        } else if (
          error.message.includes('429') ||
          error.message.includes('attempts')
        ) {
          this.error = error.message;
        } else {
          this.error = error.message || 'Login failed. Please try again.';
        }
      } else {
        this.error = 'Login failed. Please try again.';
      }
    } finally {
      this.isLoading = false;
    }
  }

  private async checkBackendAvailability(): Promise<void> {
    try {
      const apiBase = environment.apiUrl.replace(/\/api$/, '');
      const healthUrl = `${apiBase}/health`;

      console.log('[Login] Checking backend health at:', healthUrl);

      await firstValueFrom(
        this.http
          .get<{ status: string; uptime: number; date: string }>(healthUrl)
          .pipe(
            timeout(5000),
            catchError((error) => {
              console.error('[Login] Health check error:', error);

              if (error instanceof TimeoutError) {
                throw new Error('Backend server is not responding.');
              }

              if (error.status === 404) {
                console.warn(
                  '[Login] Health endpoint not found, continuing anyway'
                );
                return of({
                  status: 'unknown',
                  uptime: 0,
                  date: new Date().toISOString(),
                });
              }

              if (error.status >= 500) {
                throw new Error(
                  'Backend server error. Please try again later.'
                );
              }

              if (error.status === 0) {
                throw new Error('Cannot connect to backend server.');
              }

              throw error;
            })
          )
      );

      console.log('[Login] Backend health check passed');
    } catch (error) {
      console.error('[Login] Backend availability check failed:', error);
      throw new Error(
        'Cannot connect to server. Please ensure the backend is running.'
      );
    }
  }
}
