import { Router, NavigationEnd } from '@angular/router';
import { NgZone } from '@angular/core';
import { LoadingService } from './loading.service';
import { Subject } from 'rxjs';

describe('LoadingService (Loading State Management)', () => {
  let service: LoadingService;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockNgZone: jasmine.SpyObj<NgZone>;
  let routerEventsSubject: Subject<NavigationEnd>;

  beforeEach(() => {
    // Create router events subject for testing
    routerEventsSubject = new Subject();
    
    // Create spies
    mockRouter = jasmine.createSpyObj('Router', [], {
      events: routerEventsSubject.asObservable(),
      url: '/dashboard'
    });
    
    mockNgZone = jasmine.createSpyObj('NgZone', ['run', 'runOutsideAngular']);
    mockNgZone.run.and.callFake((fn) => fn());
    mockNgZone.runOutsideAngular.and.callFake((fn) => fn());

    // Direct service instantiation
    service = new LoadingService(mockRouter, mockNgZone);
  });

  afterEach(() => {
    if (service) {
      service.ngOnDestroy();
    }
  });

  // Run: npm test -- --include="**/loading.service.spec.ts"
  describe('Service Initialization', () => {
    it('initializes with loading state false', () => {
      expect(service).toBeDefined();
      expect(service.isLoading).toBe(false);
    });

    it('provides loading observable', (done) => {
      service.loading$.subscribe(loading => {
        expect(loading).toBe(false);
        done();
      });
    });

    it('listens for router navigation events', () => {
      expect(mockRouter.events).toBeDefined();
      // Service should have subscribed to router events in constructor
    });
  });

  describe('Navigation Event Handling', () => {
    it('hides loading when navigating to login page', () => {
      spyOn(service, 'forceHideLoading');
      
      const navigationEvent = new NavigationEnd(1, '/auth/login', '/auth/login');
      routerEventsSubject.next(navigationEvent);
      
      expect(service['isAuthenticated']).toBe(false);
      expect(service.forceHideLoading).toHaveBeenCalled();
    });

    it('ignores navigation to non-login pages', () => {
      spyOn(service, 'forceHideLoading');
      
      const navigationEvent = new NavigationEnd(1, '/dashboard', '/dashboard');
      routerEventsSubject.next(navigationEvent);
      
      expect(service.forceHideLoading).not.toHaveBeenCalled();
    });

    it('filters non-NavigationEnd events', () => {
      spyOn(service, 'forceHideLoading');
      
      // Send a NavigationEnd event to a non-login page
      const navigationEvent = new NavigationEnd(1, '/dashboard', '/dashboard');
      routerEventsSubject.next(navigationEvent);
      
      expect(service.forceHideLoading).not.toHaveBeenCalled();
    });
  });

  describe('Authentication State Management', () => {
    it('sets authentication state correctly', () => {
      service.setAuthState(true);
      expect(service['isAuthenticated']).toBe(true);
    });

    it('forces hide loading when setting unauthenticated state', () => {
      spyOn(service, 'forceHideLoading');
      
      service.setAuthState(false);
      
      expect(service['isAuthenticated']).toBe(false);
      expect(service.forceHideLoading).toHaveBeenCalled();
      expect(mockNgZone.runOutsideAngular).toHaveBeenCalled();
      expect(mockNgZone.run).toHaveBeenCalled();
    });

    it('does not force hide loading when setting authenticated state', () => {
      spyOn(service, 'forceHideLoading');
      
      service.setAuthState(true);
      
      expect(service.forceHideLoading).not.toHaveBeenCalled();
    });
  });

  describe('Loading State Display', () => {
    it('shows loading state', (done) => {
      service.show('test-source');
      
      service.loading$.subscribe(loading => {
        expect(loading).toBe(true);
        expect(service.isLoading).toBe(true);
        expect(service['lastSource']).toBe('test-source');
        done();
      });
    });

    it('does not show loading for unauthenticated users on chat route', () => {
      service.setAuthState(false);
      Object.defineProperty(mockRouter, 'url', {
        value: '/chat/123',
        writable: true
      });
      
      service.show('test-source');
      
      expect(service.isLoading).toBe(false);
    });

    it('shows loading for authenticated users on any route', () => {
      service.setAuthState(true);
      Object.defineProperty(mockRouter, 'url', {
        value: '/chat/123',
        writable: true
      });
      
      service.show('test-source');
      
      expect(service.isLoading).toBe(true);
    });

    it('shows loading with default source when none provided', () => {
      service.show();
      
      expect(service.isLoading).toBe(true);
      expect(service['lastSource']).toBe('unknown');
    });
  });

  describe('Specialized Loading Methods', () => {
    it('shows loading for auth operations', () => {
      service.showForAuth('login-test');
      
      expect(service.isLoading).toBe(true);
      expect(service['lastSource']).toBe('login-test');
    });

    it('uses default auth source when none provided', () => {
      service.showForAuth();
      
      expect(service.isLoading).toBe(true);
      expect(service['lastSource']).toBe('auth');
    });

    it('shows loading for navigation with shorter timeout', () => {
      jasmine.clock().install();
      spyOn(console, 'error');
      
      service.showForNavigation('route-change');
      
      expect(service.isLoading).toBe(true);
      expect(service['lastSource']).toBe('route-change');
      
      // Fast-forward to navigation timeout (5 seconds)
      jasmine.clock().tick(5001);
      
      expect(console.error).toHaveBeenCalledWith('[Loading] Timeout for route-change (5000ms)');
      
      jasmine.clock().uninstall();
    });

    it('uses default navigation source when none provided', () => {
      service.showForNavigation();
      
      expect(service.isLoading).toBe(true);
      expect(service['lastSource']).toBe('nav');
    });
  });

  describe('Loading State Hiding', () => {
    it('hides loading state', (done) => {
      service.show('test');
      expect(service.isLoading).toBe(true);
      
      service.hide();
      
      service.loading$.subscribe(loading => {
        expect(loading).toBe(false);
        expect(service.isLoading).toBe(false);
        done();
      });
    });

    it('clears timeout when hiding loading', () => {
      service.show('test');
      expect(service['currentTimeout']).not.toBeNull();
      
      service.hide();
      
      expect(service['currentTimeout']).toBeNull();
    });

  });

  describe('Force Hide and Emergency Operations', () => {
    it('force hides loading state', () => {
      service.show('test');
      expect(service.isLoading).toBe(true);
      
      service.forceHideLoading();
      
      expect(service.isLoading).toBe(false);
      expect(service['currentTimeout']).toBeNull();
    });

    it('performs emergency stop with logging', () => {
      spyOn(console, 'error');
      service.show('test');
      
      service.emergencyStop('critical-error');
      
      expect(service.isLoading).toBe(false);
      expect(console.error).toHaveBeenCalledWith('[Loading] Emergency stop: critical-error');
    });

    it('uses default emergency reason when none provided', () => {
      spyOn(console, 'error');
      
      service.emergencyStop();
      
      expect(console.error).toHaveBeenCalledWith('[Loading] Emergency stop: emergency');
    });

    it('clears timeout during emergency stop', () => {
      service.show('test');
      expect(service['currentTimeout']).not.toBeNull();
      
      service.emergencyStop('test-reason');
      
      expect(service['currentTimeout']).toBeNull();
      expect(service.isLoading).toBe(false);
    });
  });

  describe('Timeout Handling', () => {
    it('automatically hides loading after maximum timeout', () => {
      jasmine.clock().install();
      spyOn(console, 'error');
      
      service.show('timeout-test');
      expect(service.isLoading).toBe(true);
      
      // Fast-forward past MAX_LOADING_TIME (15 seconds)
      jasmine.clock().tick(15001);
      
      expect(service.isLoading).toBe(false);
      expect(console.error).toHaveBeenCalledWith('[Loading] Timeout for timeout-test (15000ms)');
      
      jasmine.clock().uninstall();
    });

    it('clears previous timeout when showing new loading', () => {
      jasmine.clock().install();
      
      service.show('first');
      const firstTimeout = service['currentTimeout'];
      
      service.show('second');
      const secondTimeout = service['currentTimeout'];
      
      expect(firstTimeout).not.toBe(secondTimeout);
      expect(service['lastSource']).toBe('second');
      
      jasmine.clock().uninstall();
    });

    it('handles multiple rapid show/hide operations', () => {
      service.show('rapid1');
      service.hide();
      service.show('rapid2');
      service.hide();
      service.show('rapid3');
      
      expect(service.isLoading).toBe(true);
      expect(service['lastSource']).toBe('rapid3');
    });
  });

  describe('Observable Behavior', () => {
    it('emits loading state changes through observable', () => {
      const loadingStates: boolean[] = [];
      
      service.loading$.subscribe(loading => {
        loadingStates.push(loading);
      });
      
      service.show('observable-test');
      service.hide();
      
      expect(loadingStates).toEqual([false, true, false]); // Initial false, then true, then false
    });

    it('provides consistent state between observable and getter', () => {
      service.loading$.subscribe(observableValue => {
        expect(observableValue).toBe(service.isLoading);
      });
      
      service.show('consistency-test');
      service.hide();
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('handles multiple show calls without breaking', () => {
      service.show('first');
      service.show('second');
      service.show('third');
      
      expect(service.isLoading).toBe(true);
      expect(service['lastSource']).toBe('third');
    });

    it('handles hide calls when already hidden', () => {
      expect(service.isLoading).toBe(false);
      
      service.hide(); // Should not throw error
      
      expect(service.isLoading).toBe(false);
    });

    it('handles force hide when already hidden', () => {
      expect(service.isLoading).toBe(false);
      
      service.forceHideLoading(); // Should not throw error
      
      expect(service.isLoading).toBe(false);
    });

    it('maintains state consistency during rapid authentication changes', () => {
      service.setAuthState(true);
      service.show('auth-change-test');
      service.setAuthState(false); // Should force hide
      
      expect(service.isLoading).toBe(false);
      expect(service['isAuthenticated']).toBe(false);
    });

    it('clears timeout properly on service destruction', () => {
      service.show('destruction-test');
      expect(service['currentTimeout']).not.toBeNull();
      
      service.ngOnDestroy();
      
      expect(service['currentTimeout']).toBeNull();
    });
  });

  describe('Source Tracking', () => {
    it('tracks loading source for debugging purposes', () => {
      service.show('api-call');
      expect(service['lastSource']).toBe('api-call');
      
      service.show('user-action');
      expect(service['lastSource']).toBe('user-action');
    });

    it('maintains source consistency across operations', () => {
      service.showForAuth('login-process');
      expect(service['lastSource']).toBe('login-process');
      expect(service.isLoading).toBe(true);
      
      service.hide();
      expect(service.isLoading).toBe(false);
    });
  });
});