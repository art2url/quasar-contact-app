import { Component, OnInit, OnDestroy, ChangeDetectorRef } from '@angular/core';
import {
  RouterOutlet,
  Router,
  NavigationStart,
  NavigationEnd,
  NavigationCancel,
  NavigationError,
} from '@angular/router';
import { CommonModule, AsyncPipe } from '@angular/common';
import { Subscription } from 'rxjs';

import { HeaderComponent } from '@shared/components/header/header.component';
import { FooterComponent } from '@shared/components/footer/footer.component';
import { LoadingSpinnerComponent } from '@shared/components/loading-spinner/loading-spinner.component';

import { LoadingService } from '@services/loading.service';
import { WebSocketService } from '@services/websocket.service';
import { AuthService } from '@services/auth.service';
import { CryptoService } from '@services/crypto.service';
import { VaultService, VAULT_KEYS } from '@services/vault.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [
    CommonModule,
    AsyncPipe,
    RouterOutlet,
    HeaderComponent,
    FooterComponent,
    LoadingSpinnerComponent,
  ],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'quasar-secure-chat';
  private subs = new Subscription();

  constructor(
    private router: Router,
    public loadingService: LoadingService,
    private ws: WebSocketService,
    private authService: AuthService,
    private vault: VaultService,
    private crypto: CryptoService,
    private cdr: ChangeDetectorRef
  ) {}

  ngOnInit(): void {
    console.log('[App] Component initializing');

    // Delay initialization to prevent change detection error
    setTimeout(() => {
      this.initializeApp();
    }, 100); // Slightly longer delay

    // Subscribe to authentication changes
    this.subs.add(
      this.authService.isAuthenticated$.subscribe((isAuthenticated) => {
        console.log('[App] Auth state changed:', isAuthenticated);

        // Use longer setTimeout to prevent change detection errors
        setTimeout(() => {
          this.loadingService.setAuthState(isAuthenticated);

          if (isAuthenticated) {
            const username = localStorage.getItem('username');
            const userId = localStorage.getItem('userId');
            if (username && userId && !this.ws.isConnected()) {
              console.log('[App] Connecting WebSocket for authenticated user');
              this.ws.connect(''); // Empty token - will use cookies for auth
              // Reconnection is now handled automatically by enhanced WebSocketService
            }
          } else {
            console.log(
              '[App] Disconnecting WebSocket for unauthenticated user'
            );
            this.ws.disconnect();

            if (!this.router.url.includes('/auth/')) {
              console.log('[App] Redirecting unauthenticated user to login');
              this.router.navigate(['/auth/login']);
            }
          }
        }, 100); // Longer delay
      })
    );

    // Simple navigation loading
    this.subs.add(
      this.router.events.subscribe((event) => {
        if (event instanceof NavigationStart) {
          // Only show for authenticated users or auth pages
          if (
            this.authService.isAuthenticated() ||
            event.url.includes('/auth/')
          ) {
            // Delay loading service call
            setTimeout(() => {
              this.loadingService.showForNavigation(`nav:${event.url}`);
            }, 0);
          }
        } else if (
          event instanceof NavigationEnd ||
          event instanceof NavigationCancel ||
          event instanceof NavigationError
        ) {
          // Delay loading service call
          setTimeout(() => {
            this.loadingService.hide('nav-complete');
          }, 0);
        }
      })
    );
  }

  /**
   * Simplified app initialization to prevent change detection errors
   */
  private async initializeApp(): Promise<void> {
    const username = localStorage.getItem('username');
    const userId = localStorage.getItem('userId');

    if (!username || !userId) {
      console.log('[App] No auth data found, skipping initialization');
      return;
    }

    console.log('[App] Auth data found, setting up app');

    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        console.warn('[App] No userId found');
        return;
      }

      // Setup vault
      await this.vault.setCurrentUser(userId);

      // Try to preload private key (don't fail if missing)
      await this.preloadPrivateKey();

      console.log('[App] App initialization complete');

      // Don't force change detection - let Angular handle it
    } catch (error) {
      console.error('[App] Initialization error:', error);
      // Don't fail completely - let user continue
    }
  }

  /**
   * Try to preload private key without failing
   */
  private async preloadPrivateKey(): Promise<void> {
    try {
      if (this.crypto.hasPrivateKey()) {
        return; // Already loaded
      }

      const stored = await this.vault.get<ArrayBuffer | string>(
        VAULT_KEYS.PRIVATE_KEY
      );
      if (stored) {
        await this.crypto.importPrivateKey(stored);
        console.log('[App] Successfully preloaded private key');
      }
    } catch (error) {
      console.warn('[App] Could not preload private key:', error);
      // Clear invalid key
      try {
        await this.vault.set(VAULT_KEYS.PRIVATE_KEY, null);
      } catch (clearError) {
        console.error('[App] Failed to clear invalid key:', clearError);
      }
    }
  }

  ngOnDestroy(): void {
    console.log('[App] Component destroying');
    this.subs.unsubscribe();
    this.ws.disconnect();
    this.loadingService.emergencyStop('app-destroy');
  }
}
