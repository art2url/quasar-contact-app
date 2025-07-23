import { Injectable, OnDestroy, NgZone } from '@angular/core';
import { BehaviorSubject, Observable, Subject, timer, Subscription } from 'rxjs';
import { Router, NavigationEnd } from '@angular/router';
import { filter, takeUntil } from 'rxjs';

@Injectable({
  providedIn: 'root',
})
export class LoadingService implements OnDestroy {
  private loadingSubject = new BehaviorSubject<boolean>(false);
  public loading$: Observable<boolean> = this.loadingSubject.asObservable();

  // Simple state tracking
  private currentTimeout: Subscription | null = null;
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
          this.forceHideLoading();
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
      // Use NgZone to prevent change detection error
      this.ngZone.runOutsideAngular(() => {
        this.ngZone.run(() => this.forceHideLoading());
      });
    }
  }

  /**
   * Show loading - with proper change detection handling
   */
  show(source = 'unknown'): void {
    // Don't show loading for unauthenticated users on protected routes
    if (!this.isAuthenticated && this.router.url.includes('/chat')) {
      return;
    }

    // Use NgZone to prevent change detection errors
    this.ngZone.runOutsideAngular(() => {
      this.ngZone.run(() => this.showInternal(source, this.MAX_LOADING_TIME));
    });
  }

  /**
   * Show for auth operations
   */
  showForAuth(source = 'auth'): void {
    this.ngZone.runOutsideAngular(() => {
      this.ngZone.run(() => this.showInternal(source, this.MAX_LOADING_TIME));
    });
  }

  /**
   * Show for navigation
   */
  showForNavigation(source = 'nav'): void {
    this.ngZone.runOutsideAngular(() => {
      this.ngZone.run(() => this.showInternal(source, 5000)); // Shorter timeout for navigation
    });
  }

  /**
   * Hide loading - with proper change detection
   */
  hide(): void {
    // Use NgZone to prevent change detection errors
    this.ngZone.runOutsideAngular(() => {
      this.ngZone.run(() => {
        this.clearCurrentTimeout();
        this.loadingSubject.next(false);
      });
    });
  }

  /**
   * Internal show method
   */
  private showInternal(source: string, timeoutMs: number): void {
    // Clear any existing timeout
    this.clearCurrentTimeout();

    this.lastSource = source;

    // Set loading immediately
    this.loadingSubject.next(true);

    // Set timeout to prevent infinite loading
    this.currentTimeout = timer(timeoutMs).subscribe(() => {
      console.error(`[Loading] Timeout for ${source} (${timeoutMs}ms)`);
      this.forceHideLoading();
    });
  }

  /**
   * Force hide loading - with proper async handling
   */
  forceHideLoading(): void {
    // Use NgZone to prevent change detection errors
    this.ngZone.runOutsideAngular(() => {
      this.ngZone.run(() => {
        this.clearCurrentTimeout();
        this.loadingSubject.next(false);
      });
    });
  }

  /**
   * Emergency stop - clear everything
   */
  emergencyStop(reason = 'emergency'): void {
    console.error(`[Loading] Emergency stop: ${reason}`);
    this.clearCurrentTimeout();

    // Use NgZone for emergency stops to prevent cascading errors
    this.ngZone.runOutsideAngular(() => {
      this.ngZone.run(() => {
        this.loadingSubject.next(false);
      });
    });
  }

  /**
   * Clear current timeout
   */
  private clearCurrentTimeout(): void {
    if (this.currentTimeout) {
      this.currentTimeout.unsubscribe();
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
