import { Injectable } from '@angular/core';
import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { BehaviorSubject, firstValueFrom, Observable, throwError } from 'rxjs';
import { catchError, switchMap, tap } from 'rxjs/operators';
import { environment } from '@environments/environment';

import { LoadingService } from '@services/loading.service';
import { WebSocketService } from '@services/websocket.service';
import { VaultService, VAULT_KEYS } from '@services/vault.service';
import { CryptoService } from '@services/crypto.service';
import { CsrfService } from '@services/csrf.service';
import { LoginResponse, RegisterResponse } from '@models/auth.model';
import { getApiPath } from '@utils/api-paths.util';

@Injectable({ providedIn: 'root' })
export class AuthService {
  private authenticatedSubject = new BehaviorSubject<boolean>(this.hasToken());
  public isAuthenticated$ = this.authenticatedSubject.asObservable();

  private isPostPasswordReset = false;

  constructor(
    private http: HttpClient,
    private loadingService: LoadingService,
    private wsService: WebSocketService,
    private vault: VaultService,
    private crypto: CryptoService,
    private csrfService: CsrfService
  ) {
    this.loadingService.setAuthState(this.hasToken());
    this.isAuthenticated$.subscribe(isAuth => {
      this.loadingService.setAuthState(isAuth);
    });
  }

  private hasToken(): boolean {
    // Check if we have user authentication data (username and userId)
    // The actual auth token is now in HttpOnly cookies
    return !!(localStorage.getItem('username') && localStorage.getItem('userId'));
  }

  login(
    username: string,
    password: string,
    recaptchaToken?: string
  ): Observable<LoginResponse> {
    console.log('[Auth] Starting login for:', username);

    // Build login data with optional reCAPTCHA token
    interface LoginData {
      username: string;
      password: string;
      recaptchaToken?: string;
    }

    const loginData: LoginData = { username, password };
    if (recaptchaToken) {
      loginData.recaptchaToken = recaptchaToken;
    }

    return this.http
      .post<LoginResponse>(`${environment.apiUrl}/auth/login`, loginData)
      .pipe(
        switchMap(async response => {
          // Store CSRF token from response
          if (response.csrfToken) {
            this.csrfService.setToken(response.csrfToken);
          }

          // Store user auth data (JWT token is now in HttpOnly cookies)
          localStorage.setItem('username', username);

          const userId = response.user?.id;
          if (!userId) {
            throw new Error('No userId available in response');
          }
          localStorage.setItem('userId', userId);

          if (response.user?.avatarUrl) {
            localStorage.setItem('myAvatar', response.user.avatarUrl);
          }

          // Setup vault and keys
          console.log('[Auth] Setting up vault for user:', userId);
          await this.vault.setCurrentUser(userId);
          await this.vault.waitUntilReady();
          console.log('[Auth] Vault is ready');

          // Smart key management - only generate new keys when needed
          await this.ensurePrivateKey(userId);

          console.log('[Auth] Connecting WebSocket');
          // WebSocket will use cookies for authentication now
          this.wsService.connect(); // Uses cookies for authentication

          return response;
        }),
        tap(() => {
          console.log('[Auth] Login complete, updating auth state');
          this.authenticatedSubject.next(true);
          // Reset the post-password-reset flag
          this.isPostPasswordReset = false;
        }),
        catchError((err: HttpErrorResponse) => {
          console.error('[Auth] Login failed:', err);
          this.clearAuthData();

          if (err.status === 401) {
            return throwError(() => new Error('Invalid username or password'));
          } else if (err.status === 400 && err.error?.message?.includes('recaptcha')) {
            return throwError(
              () => new Error('Security verification failed. Please try again.')
            );
          } else if (err.status === 0) {
            return throwError(() => new Error('Cannot connect to server'));
          } else {
            return throwError(() => new Error(err.error?.message || 'Login failed'));
          }
        })
      );
  }

  // Smart key management - reuse existing keys when possible
  private async ensurePrivateKey(userId: string): Promise<void> {
    try {
      // Check if we should force new key generation
      const shouldGenerateNewKeys =
        this.isPostPasswordReset || !(await this.tryLoadExistingKeys());

      if (shouldGenerateNewKeys) {
        console.log(
          '[Auth] Generating new keys because:',
          this.isPostPasswordReset ? 'post-password-reset' : 'no valid existing keys'
        );
        await this.generateFreshKeyPair(userId);
      } else {
        console.log('[Auth] Successfully loaded existing keys from vault');
      }
    } catch (error) {
      console.error('[Auth] Error in ensurePrivateKey:', error);
      throw new Error(`Failed to setup encryption keys: ${error}`);
    }
  }

  // Try to load existing keys from vault
  private async tryLoadExistingKeys(): Promise<boolean> {
    try {
      console.log('[Auth] Checking for existing keys in vault');

      // Check if crypto service already has keys
      if (this.crypto.hasPrivateKey()) {
        console.log('[Auth] Crypto service already has private key');
        return true;
      }

      // Try to load from vault
      const existingKey = await this.vault.get<ArrayBuffer>(VAULT_KEYS.PRIVATE_KEY);

      if (existingKey && existingKey instanceof ArrayBuffer) {
        console.log('[Auth] Found existing private key in vault, importing');
        await this.crypto.importPrivateKey(existingKey);
        console.log('[Auth] Successfully imported existing private key');
        return true;
      } else {
        console.log('[Auth] No valid private key found in vault');
        return false;
      }
    } catch (error) {
      console.warn('[Auth] Failed to load existing keys:', error);
      return false;
    }
  }

  // Generate fresh key pair (only when needed)
  private async generateFreshKeyPair(userId: string): Promise<void> {
    try {
      console.log('[Auth] Generating fresh RSA key pair for user:', userId);

      // Clear existing keys first
      await this.vault.set(VAULT_KEYS.PRIVATE_KEY, null);

      // Generate new key pair
      const publicKeyB64 = await this.crypto.generateKeyPair();
      const privateKeyBuffer = await this.crypto.exportPrivateKey();

      console.log('[Auth] Storing new private key in vault');
      await this.vault.set(VAULT_KEYS.PRIVATE_KEY, privateKeyBuffer);

      // Verify storage
      const storedKey = await this.vault.get<ArrayBuffer>(VAULT_KEYS.PRIVATE_KEY);
      if (!storedKey || !(storedKey instanceof ArrayBuffer)) {
        throw new Error('Failed to store private key in vault');
      }

      console.log('[Auth] Private key stored successfully, size:', storedKey.byteLength);

      // Upload public key to server
      console.log('[Auth] Uploading new public key to server');
      await firstValueFrom(
        this.http.post(`${environment.apiUrl}/keys/upload`, {
          publicKeyBundle: publicKeyB64,
        })
      );

      console.log('[Auth] Fresh key pair generated and uploaded successfully');
    } catch (error) {
      console.error('[Auth] Error generating fresh key pair:', error);
      throw new Error(`Failed to setup encryption keys: ${error}`);
    }
  }

  private clearAuthData(): void {
    // Clear user data from localStorage (JWT token is cleared via logout API call)
    localStorage.removeItem('username');
    localStorage.removeItem('userId');
    localStorage.removeItem('myAvatar');

    // Clear CSRF token
    this.csrfService.clearToken();

    this.authenticatedSubject.next(false);
  }

  register(
    username: string,
    email: string,
    password: string,
    avatarUrl: string,
    recaptchaToken?: string
  ): Observable<RegisterResponse> {
    // Build register data with optional reCAPTCHA token
    interface RegisterData {
      username: string;
      email: string;
      password: string;
      avatarUrl: string;
      recaptchaToken?: string;
    }

    const registerData: RegisterData = { username, email, password, avatarUrl };
    if (recaptchaToken) {
      registerData.recaptchaToken = recaptchaToken;
    }

    return this.http.post<RegisterResponse>(getApiPath('auth/register'), registerData);
  }

  logout(): void {
    console.log('[Auth] Logging out');

    if (!this.hasToken()) return;

    try {
      if (this.wsService.isConnected()) {
        this.wsService.disconnect();
      }

      // Call backend logout to clear cookies
      this.http.post(`${environment.apiUrl}/auth/logout`, {}).subscribe({
        next: () => {
          console.log('[Auth] Server logout successful');
        },
        error: error => {
          console.error('[Auth] Server logout failed:', error);
          // Continue with client-side cleanup even if server call fails
        },
      });

      this.clearAuthData();
      // Note: We don't clear vault storage on normal logout
      // This preserves user's private keys for next login

      console.log('[Auth] Logout complete');
    } catch (error) {
      console.error('[Auth] Logout error:', error);
    }
  }

  // Method to mark that we're in post-password-reset state
  markPostPasswordReset(): void {
    console.log('[Auth] Marking post-password-reset state');
    this.isPostPasswordReset = true;

    // Clear all local storage to ensure fresh start
    localStorage.clear();
    sessionStorage.clear();
  }

  isAuthenticated(): boolean {
    return this.hasToken();
  }

  // Password reset methods
  requestPasswordReset(
    email: string,
    recaptchaToken?: string
  ): Observable<{ message: string }> {
    // Build reset data with optional reCAPTCHA token
    interface ResetData {
      email: string;
      recaptchaToken?: string;
    }

    const resetData: ResetData = { email };
    if (recaptchaToken) {
      resetData.recaptchaToken = recaptchaToken;
    }

    return this.http.post<{ message: string }>(
      getApiPath('auth/forgot-password'),
      resetData
    );
  }

  validateResetToken(token: string): Observable<{ valid: boolean }> {
    return this.http.get<{ valid: boolean }>(
      getApiPath(`auth/reset-password/validate?token=${token}`)
    );
  }

  resetPassword(token: string, newPassword: string): Observable<{ message: string }> {
    return this.http.post<{ message: string }>(getApiPath('auth/reset-password'), {
      token,
      password: newPassword,
    });
  }
}
