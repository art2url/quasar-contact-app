import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';
import { Router, NavigationEnd } from '@angular/router';
import { filter, takeUntil } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class LoadingService implements OnDestroy {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$: Observable<boolean> = this.loadingSubject.asObservable();

  // Simple state tracking
  private currentTimeout: ReturnType<typeof setTimeout> | null = null;
  private isAuthenticated = false;
  private lastSource = '';

  // Maximum loading time before force stop
  private readonly MAX_LOADING_TIME = 15000; // 15 seconds max

  private destroy$ = new Subject<void>();

  constructor(
    private router: Router,
    private ngZone: NgZone
  ) {
    this.router.events
      .pipe(
        filter(event => event instanceof NavigationEnd),
        takeUntil(this.destroy$)
      )
      .subscribe((event: NavigationEnd) => {
        if (event.url.includes('/auth/login')) {
          this.isAuthenticated = false;
          this.forceHideLoading('navigation-to-login');
        }
      });
  }

  /**
   * Set authentication state - to prevent change detection errors
   */
  /**
   * Set authentication state - to prevent change detection error
   */
  setAuthState(isAuthenticated: boolean): void {
    this.isAuthenticated = isAuthenticated;
    if (!isAuthenticated) {
      // Use setTimeout to prevent change detection error
      setTimeout(() => {
        this.forceHideLoading('auth-state-unauthenticated');
      }, 0);
    }
  }

  /**
   * Show loading - with proper change detection handling
   */
  show(source = 'unknown'): void {
    // Don't show loading for unauthenticated users on protected routes
    if (!this.isAuthenticated && this.router.url.includes('/chat')) {
      console.log(`[Loading] Skipping - unauthenticated user (${source})`);
      return;
    }

    // Use setTimeout to prevent change detection errors
    setTimeout(() => {
      this.showInternal(source, this.MAX_LOADING_TIME);
    }, 0);
  }

  /**
   * Show for auth operations
   */
  showForAuth(source = 'auth'): void {
    setTimeout(() => {
      this.showInternal(source, this.MAX_LOADING_TIME);
    }, 0);
  }

  /**
   * Show for navigation
   */
  showForNavigation(source = 'nav'): void {
    setTimeout(() => {
      this.showInternal(source, 5000); // Shorter timeout for navigation
    }, 0);
  }

  /**
   * Hide loading - with proper change detection
   */
  hide(source = 'unknown'): void {
    console.log(`[Loading] Hide: ${source} (was: ${this.lastSource})`);

    // Use setTimeout to prevent change detection errors
    setTimeout(() => {
      this.clearCurrentTimeout();
      this.loadingSubject.next(false);
    }, 0);
  }

  /**
   * Internal show method
   */
  private showInternal(source: string, timeoutMs: number): void {
    // Clear any existing timeout
    this.clearCurrentTimeout();

    this.lastSource = source;
    console.log(`[Loading] Show: ${source}`);

    // Set loading immediately
    this.loadingSubject.next(true);

    // Set timeout to prevent infinite loading
    this.currentTimeout = setTimeout(() => {
      console.warn(`[Loading] Timeout for ${source} (${timeoutMs}ms)`);
      this.forceHideLoading(`timeout-${source}`);
    }, timeoutMs);
  }

  /**
   * Force hide loading - with proper async handling
   */
  forceHideLoading(source = 'force'): void {
    console.log(`[Loading] Force hide: ${source} (was: ${this.lastSource})`);

    // Use setTimeout to prevent change detection errors
    setTimeout(() => {
      this.clearCurrentTimeout();
      this.loadingSubject.next(false);
    }, 0);
  }

  /**
   * Emergency stop - clear everything
   */
  emergencyStop(reason = 'emergency'): void {
    console.warn(`[Loading] Emergency stop: ${reason}`);
    this.clearCurrentTimeout();

    // Use setTimeout for emergency stops to prevent cascading errors
    setTimeout(() => {
      this.loadingSubject.next(false);
    }, 0);
  }

  /**
   * Clear current timeout
   */
  private clearCurrentTimeout(): void {
    if (this.currentTimeout) {
      clearTimeout(this.currentTimeout);
      this.currentTimeout = null;
    }
  }

  /**
   * Get current loading state
   */
  get isLoading(): boolean {
    return this.loadingSubject.value;
  }

  /**
   * Cleanup
   */
  ngOnDestroy(): void {
    this.clearCurrentTimeout();
    this.destroy$.next();
    this.destroy$.complete();
  }
}
