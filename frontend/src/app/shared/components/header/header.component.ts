import { CommonModule } from '@angular/common';
import { Subscription, filter } from 'rxjs';
import { Component, OnInit, OnDestroy, ChangeDetectorRef, NgZone } from '@angular/core';
import { Router, RouterModule, NavigationEnd } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { WebSocketService } from '@services/websocket.service';
import { LoadingService } from '@services/loading.service';
import { AuthService } from '@services/auth.service';
import { NotificationService } from '@services/notification.service';
import { ThemeService } from '@services/theme.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule],
  templateUrl: './header.component.html',
  styleUrls: ['./header.component.css'],
})
export class HeaderComponent implements OnInit, OnDestroy {
  // Better online status tracking
  public online = false;
  private sub: Subscription;

  public menuOpen = false;

  // Use NotificationService as single source of truth
  public unreadTotal = 0;
  private subs = new Subscription();

  constructor(
    public authService: AuthService,
    public router: Router,
    public wsService: WebSocketService,
    private loadingService: LoadingService,
    private cdr: ChangeDetectorRef,
    private ngZone: NgZone,
    private notificationService: NotificationService,
    private themeService: ThemeService
  ) {
    // Keep the header status in sync with WebSocket connection
    this.sub = this.wsService.isConnected$.subscribe(status => {
      console.log('[Header] WebSocket connection status changed:', status);
      this.online = status;
    });
  }

  toggleMenu() {
    this.menuOpen = !this.menuOpen;
    console.log('[Header] Menu toggled:', this.menuOpen);
  }

  // Close menu when navigation occurs
  closeMenu() {
    if (this.menuOpen) {
      console.log('[Header] Closing mobile menu');
      this.menuOpen = false;
    }
  }

  // Handle navigation with smart menu closing
  navigateToChats() {
    if (this.router.url === '/chat' || this.router.url === '/') {
      // User is already on chats page, just close menu
      this.closeMenu();
    } else {
      // Navigate to chats and close menu
      this.router.navigate(['/chat']);
      this.closeMenu();
    }
  }

  navigateToSettings() {
    if (this.router.url === '/settings') {
      // User is already on settings page, just close menu
      this.closeMenu();
    } else {
      // Navigate to settings and close menu
      this.router.navigate(['/settings']);
      this.closeMenu();
    }
  }

  /* ───────── lifecycle ─────────────────────────────── */
  ngOnInit(): void {
    console.log('[Header] Component initializing');

    // Subscribe to NotificationService for badge count
    this.subs.add(
      this.notificationService.totalUnread$.subscribe(total => {
        console.log('[Header] Unread total updated from NotificationService:', total);
        console.log('[Header] Previous unread total was:', this.unreadTotal);
        this.ngZone.run(() => {
          this.unreadTotal = total;
          console.log('[Header] Badge count set to:', this.unreadTotal);
          this.cdr.detectChanges(); // Ensure UI updates on mobile
        });
      })
    );

    // Handle navigation for menu closing
    this.subs.add(
      this.router.events
        .pipe(filter((e): e is NavigationEnd => e instanceof NavigationEnd))
        .subscribe(e => {
          console.log('[Header] Navigation to:', e.url);
          // Close mobile menu when navigating
          this.closeMenu();
        })
    );

    // Subscribe to WebSocket connection changes for better status tracking
    this.subs.add(
      this.wsService.isConnected$.subscribe(connected => {
        this.online = connected;
        console.log('[Header] Connection status updated:', connected);
      })
    );
  }

  logout(): void {
    console.log('[Header] User initiated logout');

    // Close mobile menu first
    this.closeMenu();

    // Show loading indicator with specific source
    this.loadingService.show('header.logout');

    // First disconnect websocket to prevent reconnection attempts
    this.wsService.disconnect();

    // Then logout from auth service
    this.authService.logout();

    // Navigate to login page
    this.router
      .navigate(['/auth/login'])
      .then(() => {
        console.log('[Header] Navigation to login complete');

        // Ensure loading is hidden after navigation completes
        this.loadingService.forceHideLoading('header.navigation.complete');
      })
      .catch(error => {
        console.error('[Header] Navigation to login failed:', error);
        this.loadingService.forceHideLoading('header.navigation.error');
      });
  }

  // Show logout button only when logged in and not on auth pages.
  get showLogout(): boolean {
    return this.authService.isAuthenticated() && !this.router.url.startsWith('/auth');
  }

  // Check if user is currently on an auth page
  isAuthPage(): boolean {
    return this.router.url.startsWith('/auth');
  }

  // Theme toggle methods
  toggleTheme(): void {
    console.log('[Header] Theme toggle clicked');
    this.themeService.toggleTheme();
  }

  isDarkTheme(): boolean {
    return this.themeService.isDarkTheme();
  }

  ngOnDestroy(): void {
    console.log('[Header] Component destroying');
    this.sub.unsubscribe();
    this.subs.unsubscribe();
  }
}
