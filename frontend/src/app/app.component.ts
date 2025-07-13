import { AsyncPipe, CommonModule } from '@angular/common';
import { Component, OnDestroy, OnInit } from '@angular/core';
import {
  NavigationCancel,
  NavigationEnd,
  NavigationError,
  NavigationStart,
  Router,
  RouterOutlet,
} from '@angular/router';
import { Subscription } from 'rxjs';

import { FooterComponent } from '@shared/components/footer/footer.component';
import { HeaderComponent } from '@shared/components/header/header.component';
import { LoadingSpinnerComponent } from '@shared/components/loading-spinner/loading-spinner.component';

import { AuthService } from '@services/auth.service';
import { CryptoService } from '@services/crypto.service';
import { LoadingService } from '@services/loading.service';
import { VAULT_KEYS, VaultService } from '@services/vault.service';
import { WebSocketService } from '@services/websocket.service';

interface DebugApp {
  testWebSocket: () => void;
  testPartnerKeyRecovery: () => void;
  triggerStoredProcessing: () => void;
  forceKeyLoss: () => void;
  showRoomInfo: () => void;
}

interface ElementWithContext extends Element {
  __ngContext__?: unknown[];
}

interface ChatRoomComponent {
  chat?: {
    debugForceKeyLoss?: () => void;
  };
}

declare global {
  interface Window {
    debugApp: DebugApp;
  }
}

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
    private crypto: CryptoService
  ) {}

  /**
   * Debug methods for testing
   */
  private debugTestWebSocket(): void {
    try {
      this.ws.debugOnlineStatus();
    } catch (error) {
      console.error('[App] WebSocket debug error:', error);
    }
  }

  private debugTestPartnerKeyRecovery(): void {
    // Get the correct room ID from current URL
    let roomIdMatch = window.location.pathname.match(/\/chat\/([^/]+)$/);
    if (!roomIdMatch) {
      roomIdMatch = window.location.pathname.match(/\/app\/chat-room\/([^/]+)$/);
    }
    if (!roomIdMatch) {
      roomIdMatch = window.location.pathname.match(/\/chat-room\/([^/]+)$/);
    }

    const currentRoomId = roomIdMatch ? roomIdMatch[1] : '686a697292874729d30037b8';

    // Simulate receiving a notification from the current chat partner
    const testPayload = {
      fromUserId: currentRoomId, // Use the actual room/partner ID
      fromUsername: 'Test User',
      timestamp: new Date().toISOString(),
    };

    // Store notification
    localStorage.setItem(
      `partnerKeyRecovery_${testPayload.fromUserId}`,
      JSON.stringify({
        fromUserId: testPayload.fromUserId,
        fromUsername: testPayload.fromUsername,
        timestamp: testPayload.timestamp,
        received: Date.now(),
      })
    );
  }


  private debugTriggerStoredNotificationProcessing(): void {
    // Get the room ID from current URL - try multiple patterns
    let roomIdMatch = window.location.pathname.match(/\/chat\/([^/]+)$/);
    if (!roomIdMatch) {
      roomIdMatch = window.location.pathname.match(/\/app\/chat-room\/([^/]+)$/);
    }
    if (!roomIdMatch) {
      roomIdMatch = window.location.pathname.match(/\/chat-room\/([^/]+)$/);
    }
    const currentRoomId = roomIdMatch ? roomIdMatch[1] : null;

    if (!currentRoomId) {
      return;
    }

    const stored = localStorage.getItem(`partnerKeyRecovery_${currentRoomId}`);

    if (stored) {
      try {
        const notification = JSON.parse(stored);
        // Directly call the global handler callback
        window.dispatchEvent(
          new CustomEvent('partner-key-recovery-received', {
            detail: notification,
          })
        );
      } catch (error) {
        console.error('[App] Error processing stored notification:', error);
      }
    } else {
      // No stored notification found
    }
  }

  ngOnInit(): void {
    // Expose debug methods to window for testing
    window.debugApp = {
      testWebSocket: () => this.debugTestWebSocket(),
      testPartnerKeyRecovery: () => this.debugTestPartnerKeyRecovery(),
      triggerStoredProcessing: () => this.debugTriggerStoredNotificationProcessing(),
      forceKeyLoss: () => {
        // Access chat session service through chat room component
        const chatRoomElements = document.querySelectorAll('app-chat-room');
        if (chatRoomElements.length > 0) {
          // Get the Angular component instance
          const chatRoomComponent = (chatRoomElements[0] as ElementWithContext).__ngContext__?.[8] as ChatRoomComponent;
          if (chatRoomComponent?.chat?.debugForceKeyLoss) {
            chatRoomComponent.chat.debugForceKeyLoss();
          } else {
            console.error('[App] Could not access chat session service');
          }
        } else {
          console.error('[App] No chat room component found - navigate to a chat first');
        }
      },
      showRoomInfo: () => {
        // Try to get the chat room component debug info
        const chatRoomElements = document.querySelectorAll('app-chat-room');
        if (chatRoomElements.length > 0) {
          // Access the component through Angular's debug utilities if available
          let roomIdMatch = window.location.pathname.match(/\/chat\/([^/]+)$/);
          if (!roomIdMatch) {
            roomIdMatch = window.location.pathname.match(/\/app\/chat-room\/([^/]+)$/);
          }
          if (!roomIdMatch) {
            roomIdMatch = window.location.pathname.match(/\/chat-room\/([^/]+)$/);
          }
          if (roomIdMatch) {
            // Room ID found for debugging
          } else {
            // No room ID found in current path
          }
        } else {
          // No chat room component found
        }
      },
    };

    // Ensure global handler is set up early
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
            const userId = localStorage.getItem('userId');
            if (localStorage.getItem('username') && userId) {
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
            this.loadingService.hide();
          }, 0);
        }
      })
    );
  }

  /**
   * Simplified app initialization to prevent change detection errors
   */
  private async initializeApp(): Promise<void> {
    const userId = localStorage.getItem('userId');

    if (!localStorage.getItem('username') || !userId) {
      return;
    }

    try {
      const userId = localStorage.getItem('userId');
      if (!userId) {
        return;
      }

      // Setup vault in READ-ONLY mode to avoid auto-generating AES keys
      // The vault will be properly initialized later when actually needed
      try {
        await this.vault.setCurrentUser(userId, true); // true = read-only mode
        // Try to preload private key (don't fail if missing)
        await this.preloadPrivateKey();
      } catch {
        // This is normal - vault will be created later when user actually needs it
        // This is normal - vault will be created later when user actually needs it
      }

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
      }
    } catch (keyError) {
      // Clear invalid key
      console.error('[App] Failed to preload private key:', keyError);
      try {
        await this.vault.set(VAULT_KEYS.PRIVATE_KEY, null);
      } catch (clearError) {
        console.error('[App] Failed to clear invalid key:', clearError);
      }
    }
  }

  // Removed: Global partner key recovery handler now handled via database flag

  ngOnDestroy(): void {
    this.subs.unsubscribe();
    this.ws.disconnect();
    this.loadingService.emergencyStop('app-destroy');
  }
}
