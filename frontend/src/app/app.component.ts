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
import { ThemeService } from '@services/theme.service';

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
  // Removed: globalHandlerSetup property no longer needed

  constructor(
    private router: Router,
    public loadingService: LoadingService,
    private ws: WebSocketService,
    private authService: AuthService,
    private vault: VaultService,
    private crypto: CryptoService,
    private cdr: ChangeDetectorRef,
    private themeService: ThemeService
  ) {
    // Initialize theme service - this will load saved theme from localStorage
    console.log('[App] Theme service initialized');
  }

  /**
   * Debug methods for testing
   */
  private debugTestWebSocket(): void {
    console.log('=== [App] WebSocket Debug Info ===');
    console.log('[App] WebSocket connected:', this.ws.isConnected());
    console.log('[App] Current online users:', this.ws.getCurrentOnlineUsers());
    // Removed: Global handler setup debug no longer needed
    
    try {
      this.ws.debugOnlineStatus();
    } catch (error) {
      console.error('[App] WebSocket debug error:', error);
    }
  }

  private debugTestPartnerKeyRecovery(): void {
    console.log('[App] DEBUG: Manually testing partner key recovery');
    
    // Get the correct room ID from current URL
    let roomIdMatch = window.location.pathname.match(/\/chat\/([^\/]+)$/);
    if (!roomIdMatch) {
      roomIdMatch = window.location.pathname.match(/\/app\/chat-room\/([^\/]+)$/);
    }
    if (!roomIdMatch) {
      roomIdMatch = window.location.pathname.match(/\/chat-room\/([^\/]+)$/);
    }
    
    const currentRoomId = roomIdMatch ? roomIdMatch[1] : '686a697292874729d30037b8';
    console.log('[App] Using room ID:', currentRoomId);
    
    // Simulate receiving a notification from the current chat partner
    const testPayload = {
      fromUserId: currentRoomId, // Use the actual room/partner ID
      fromUsername: 'Test User',
      timestamp: new Date().toISOString()
    };
    
    console.log('[App] Simulating notification with payload:', testPayload);
    
    // Store notification
    localStorage.setItem(`partnerKeyRecovery_${testPayload.fromUserId}`, JSON.stringify({
      fromUserId: testPayload.fromUserId,
      fromUsername: testPayload.fromUsername,
      timestamp: testPayload.timestamp,
      received: Date.now()
    }));
    
    console.log('[App] Test notification stored in localStorage');
  }

  private debugCheckHandlerSetup(): void {
    console.log('=== [App] Handler Setup Debug ===');
    // Removed: Global handler setup debug no longer needed
    console.log('[App] WebSocket service exists:', !!this.ws);
    console.log('[App] WebSocket connected:', this.ws?.isConnected());
    
    // Check if there are any stored notifications
    const userId = '686a697a92874729d30037bb'; // User 1's ID
    const stored = localStorage.getItem(`partnerKeyRecovery_${userId}`);
    console.log('[App] Stored notification for User 1:', stored);
  }

  private debugTriggerStoredNotificationProcessing(): void {
    console.log('[App] DEBUG: Manually triggering stored notification processing');
    
    // Get the room ID from current URL - try multiple patterns
    let roomIdMatch = window.location.pathname.match(/\/chat\/([^\/]+)$/);
    if (!roomIdMatch) {
      roomIdMatch = window.location.pathname.match(/\/app\/chat-room\/([^\/]+)$/);
    }
    if (!roomIdMatch) {
      roomIdMatch = window.location.pathname.match(/\/chat-room\/([^\/]+)$/);
    }
    const currentRoomId = roomIdMatch ? roomIdMatch[1] : null;
    console.log('[App] Current room ID from URL:', currentRoomId);
    
    if (!currentRoomId) {
      console.log('[App] No room ID found, cannot process stored notifications');
      return;
    }
    
    const stored = localStorage.getItem(`partnerKeyRecovery_${currentRoomId}`);
    
    if (stored) {
      try {
        const notification = JSON.parse(stored);
        console.log('[App] Found stored notification:', notification);
        console.log('[App] Notification fromUserId:', notification.fromUserId);
        console.log('[App] Current room ID:', currentRoomId);
        console.log('[App] IDs match?', notification.fromUserId === currentRoomId);
        
        // Directly call the global handler callback
        console.log('[App] Triggering immediate processing...');
        window.dispatchEvent(new CustomEvent('partner-key-recovery-received', {
          detail: notification
        }));
      } catch (error) {
        console.error('[App] Error processing stored notification:', error);
      }
    } else {
      console.log('[App] No stored notification found');
    }
  }

  ngOnInit(): void {

    // Expose debug methods to window for testing
    (window as any).debugApp = {
      testWebSocket: () => this.debugTestWebSocket(),
      testPartnerKeyRecovery: () => this.debugTestPartnerKeyRecovery(),
      checkHandlerSetup: () => this.debugCheckHandlerSetup(),
      triggerStoredProcessing: () => this.debugTriggerStoredNotificationProcessing(),
      showRoomInfo: () => {
        // Try to get the chat room component debug info
        const chatRoomElements = document.querySelectorAll('app-chat-room');
        if (chatRoomElements.length > 0) {
          console.log('[App] Found chat room component, showing debug info');
          // Access the component through Angular's debug utilities if available
          console.log('[App] Current URL:', window.location.pathname);
          let roomIdMatch = window.location.pathname.match(/\/chat\/([^\/]+)$/);
          if (!roomIdMatch) {
            roomIdMatch = window.location.pathname.match(/\/app\/chat-room\/([^\/]+)$/);
          }
          if (!roomIdMatch) {
            roomIdMatch = window.location.pathname.match(/\/chat-room\/([^\/]+)$/);
          }
          if (roomIdMatch) {
            console.log('[App] Room ID from URL:', roomIdMatch[1]);
          } else {
            console.log('[App] No room ID found in URL');
          }
        } else {
          console.log('[App] No chat room component found');
        }
      }
    };

    // Ensure global handler is set up early
    const username = localStorage.getItem('username');
    const userId = localStorage.getItem('userId');
    // Removed: Global partner key recovery handler now handled via database flag

    // Delay initialization to prevent change detection error
    setTimeout(() => {
      this.initializeApp();
    }, 100); // Slightly longer delay

    // Subscribe to authentication changes
    this.subs.add(
      this.authService.isAuthenticated$.subscribe(isAuthenticated => {
        // Auth state changed

        // Use longer setTimeout to prevent change detection errors
        setTimeout(() => {
          this.loadingService.setAuthState(isAuthenticated);

          if (isAuthenticated) {
            const username = localStorage.getItem('username');
            const userId = localStorage.getItem('userId');
            if (username && userId) {
              // Removed: Global partner key recovery handler now handled via database flag
              
              if (!this.ws.isConnected()) {
                // Connecting WebSocket for authenticated user
                this.ws.connect(); // Uses cookies for auth
                // Reconnection is now handled automatically by enhanced WebSocketService
              }
            }
          } else {
            // Disconnecting WebSocket for unauthenticated user
            this.ws.disconnect();

            if (!this.router.url.includes('/auth/')) {
              // Redirecting unauthenticated user to login
              this.router.navigate(['/auth/login']);
            }
          }
        }, 100); // Longer delay
      })
    );

    // Simple navigation loading
    this.subs.add(
      this.router.events.subscribe(event => {
        if (event instanceof NavigationStart) {
          // Only show for authenticated users or auth pages
          if (this.authService.isAuthenticated() || event.url.includes('/auth/')) {
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

      // Setup vault in READ-ONLY mode to avoid auto-generating AES keys
      // The vault will be properly initialized later when actually needed
      try {
        await this.vault.setCurrentUser(userId, true); // true = read-only mode
        // Try to preload private key (don't fail if missing)
        await this.preloadPrivateKey();
      } catch (vaultError) {
        console.log('[App] Vault not available in read-only mode (expected if keys missing):', vaultError);
        // This is normal - vault will be created later when user actually needs it
      }

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

      const stored = await this.vault.get<ArrayBuffer | string>(VAULT_KEYS.PRIVATE_KEY);
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

  // Removed: Global partner key recovery handler now handled via database flag

  ngOnDestroy(): void {
    console.log('[App] Component destroying');
    this.subs.unsubscribe();
    this.ws.disconnect();
    this.loadingService.emergencyStop('app-destroy');
  }
}
