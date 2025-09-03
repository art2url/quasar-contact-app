import { NgZone } from '@angular/core';
import { ScrollService } from './scroll.service';

describe('ScrollService (Scroll Position Management)', () => {
  let service: ScrollService;
  let mockNgZone: jasmine.SpyObj<NgZone>;
  let mockElement: jasmine.SpyObj<HTMLElement>;

  beforeEach(() => {
    // Mock NgZone
    mockNgZone = jasmine.createSpyObj('NgZone', ['runOutsideAngular']);
    mockNgZone.runOutsideAngular.and.callFake((fn) => fn());

    // Mock window and document objects
    Object.defineProperty(window, 'scrollTo', {
      value: jasmine.createSpy('scrollTo').and.stub(),
      writable: true
    });

    Object.defineProperty(window, 'pageYOffset', {
      value: 0,
      writable: true
    });

    Object.defineProperty(window, 'pageXOffset', {
      value: 0,
      writable: true
    });

    Object.defineProperty(window, 'innerHeight', {
      value: 768,
      writable: true
    });

    Object.defineProperty(window, 'requestAnimationFrame', {
      value: jasmine.createSpy('requestAnimationFrame').and.callFake((fn: FrameRequestCallback) => {
        setTimeout(() => fn(0), 0);
        return 1;
      }),
      writable: true
    });

    // Mock document properties
    Object.defineProperty(document.documentElement, 'scrollTop', {
      value: 0,
      writable: true,
      configurable: true
    });

    Object.defineProperty(document.documentElement, 'scrollLeft', {
      value: 0,
      writable: true,
      configurable: true
    });

    Object.defineProperty(document.documentElement, 'scrollHeight', {
      value: 2000,
      writable: true,
      configurable: true
    });

    Object.defineProperty(document.body, 'scrollTop', {
      value: 0,
      writable: true,
      configurable: true
    });

    // Mock querySelector
    spyOn(document, 'querySelector').and.returnValue(null);

    // Create mock element for testing
    mockElement = jasmine.createSpyObj('HTMLElement', ['scrollIntoView']);

    service = new ScrollService(mockNgZone);
  });

  // Run: npm test -- --include="**/scroll.service.spec.ts"
  describe('Service Initialization', () => {
    it('creates service instance successfully', () => {
      expect(service).toBeDefined();
    });
  });

  describe('Scroll to Top Operations', () => {
    it('scrolls to top using window.scrollTo', () => {
      service.scrollToTop();

      expect(window.scrollTo).toHaveBeenCalled();
      expect((window.scrollTo as jasmine.Spy).calls.count()).toBeGreaterThan(0);
    });

    it('sets document and body scroll positions to zero', () => {
      service.scrollToTop();

      expect(document.documentElement.scrollTop).toBe(0);
      expect(document.body.scrollTop).toBe(0);
    });

    it('queries for potential scroll containers', () => {
      service.scrollToTop();

      expect(document.querySelector).toHaveBeenCalledWith('.main-content');
      expect(document.querySelector).toHaveBeenCalledWith('.chat-list-container');
      expect(document.querySelector).toHaveBeenCalledWith('.settings-container');
      expect(document.querySelector).toHaveBeenCalledWith('app-chat-list');
      expect(document.querySelector).toHaveBeenCalledWith('app-settings');
      expect(document.querySelector).toHaveBeenCalledWith('mat-sidenav-content');
      expect(document.querySelector).toHaveBeenCalledWith('.content-wrapper');
      expect(document.querySelector).toHaveBeenCalledWith('.page-container');
    });

    it('scrolls found containers to top', () => {
      const mockContainer = { scrollTop: 100 };
      (document.querySelector as jasmine.Spy).and.returnValue(mockContainer);

      service.scrollToTop();

      expect(mockContainer.scrollTop).toBe(0);
    });

    it('uses requestAnimationFrame for additional scroll attempts', () => {
      service.scrollToTop();

      expect(window.requestAnimationFrame).toHaveBeenCalled();
    });

    it('handles scroll errors silently without throwing', () => {
      (window.scrollTo as jasmine.Spy).and.throwError('Scroll error');

      expect(() => service.scrollToTop()).not.toThrow();
    });
  });

  describe('Element Scrolling', () => {
    it('scrolls to element with smooth behavior by default', () => {
      service.scrollToElement(mockElement);

      expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
        inline: 'nearest'
      });
    });

    it('scrolls to element with specified behavior', () => {
      service.scrollToElement(mockElement, 'instant');

      expect(mockElement.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'instant',
        block: 'start',
        inline: 'nearest'
      });
    });

    it('falls back to basic scrollIntoView on error', () => {
      let callCount = 0;
      mockElement.scrollIntoView.and.callFake(() => {
        callCount++;
        if (callCount === 1) {
          throw new Error('ScrollIntoView error');
        }
      });

      expect(() => service.scrollToElement(mockElement)).not.toThrow();
      expect(mockElement.scrollIntoView).toHaveBeenCalledTimes(2);
    });
  });

  describe('Scroll Position Detection', () => {
    it('gets current scroll position from window', () => {
      Object.defineProperty(window, 'pageXOffset', { value: 50, writable: true, configurable: true });
      Object.defineProperty(window, 'pageYOffset', { value: 100, writable: true, configurable: true });

      const position = service.getCurrentScrollPosition();

      expect(position).toEqual({ x: 50, y: 100 });
    });

    it('falls back to documentElement scroll properties', () => {
      Object.defineProperty(window, 'pageXOffset', { value: undefined, writable: true, configurable: true });
      Object.defineProperty(window, 'pageYOffset', { value: undefined, writable: true, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollLeft', { value: 75, writable: true, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollTop', { value: 150, writable: true, configurable: true });

      const position = service.getCurrentScrollPosition();

      expect(position).toEqual({ x: 75, y: 150 });
    });

    it('detects when user is at top of page', () => {
      Object.defineProperty(window, 'pageYOffset', { value: 0, writable: true, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollTop', { value: 0, writable: true, configurable: true });

      expect(service.isAtTop()).toBe(true);
    });

    it('detects when user is not at top of page', () => {
      Object.defineProperty(window, 'pageYOffset', { value: 100, writable: true, configurable: true });

      expect(service.isAtTop()).toBe(false);
    });

    it('uses documentElement scrollTop when pageYOffset unavailable', () => {
      Object.defineProperty(window, 'pageYOffset', { value: undefined, writable: true, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollTop', { value: 50, writable: true, configurable: true });

      expect(service.isAtTop()).toBe(false);
    });
  });

  describe('Bottom Detection', () => {
    it('detects when user is at bottom of page', () => {
      Object.defineProperty(window, 'pageYOffset', { value: 1232, writable: true, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });

      expect(service.isAtBottom()).toBe(true);
    });

    it('detects when user is near bottom within tolerance', () => {
      Object.defineProperty(window, 'pageYOffset', { value: 1225, writable: true, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });

      expect(service.isAtBottom()).toBe(true);
    });

    it('detects when user is not at bottom of page', () => {
      Object.defineProperty(window, 'pageYOffset', { value: 500, writable: true, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });

      expect(service.isAtBottom()).toBe(false);
    });

    it('uses documentElement scrollTop when pageYOffset unavailable', () => {
      Object.defineProperty(window, 'pageYOffset', { value: undefined, writable: true, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollTop', { value: 1232, writable: true, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });

      expect(service.isAtBottom()).toBe(true);
    });

    it('handles edge case where scroll height equals viewport height', () => {
      Object.defineProperty(window, 'pageYOffset', { value: 0, writable: true, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollHeight', { value: 768, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768, writable: true, configurable: true });

      expect(service.isAtBottom()).toBe(true);
    });
  });

  describe('Cross-Browser Compatibility', () => {
    it('handles missing pageYOffset gracefully', () => {
      Object.defineProperty(window, 'pageYOffset', { value: undefined, writable: true, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollTop', { value: 100, writable: true, configurable: true });

      const position = service.getCurrentScrollPosition();
      expect(position.y).toBe(100);

      expect(service.isAtTop()).toBe(false);
    });

    it('handles missing pageXOffset gracefully', () => {
      Object.defineProperty(window, 'pageXOffset', { value: undefined, writable: true, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollLeft', { value: 50, writable: true, configurable: true });

      const position = service.getCurrentScrollPosition();
      expect(position.x).toBe(50);
    });

    it('handles scroll operations when containers are missing', () => {
      document.querySelector = jasmine.createSpy('querySelector').and.returnValue(null);

      expect(() => service.scrollToTop()).not.toThrow();
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('continues execution when scroll containers throw errors', () => {
      const mockContainer = {
        get scrollTop() { throw new Error('Scroll error'); },
        set scrollTop(value) { throw new Error('Scroll error'); }
      };
      document.querySelector = jasmine.createSpy('querySelector').and.returnValue(mockContainer);

      expect(() => service.scrollToTop()).not.toThrow();
    });

    it('handles requestAnimationFrame callback errors silently', () => {
      (window.requestAnimationFrame as jasmine.Spy).and.callFake((fn: FrameRequestCallback) => {
        setTimeout(() => {
          try {
            fn(0);
          } catch {
            // Simulate callback error being caught
          }
        }, 0);
        return 1;
      });

      expect(() => service.scrollToTop()).not.toThrow();
    });

    it('calculates bottom detection correctly with floating point numbers', () => {
      Object.defineProperty(window, 'pageYOffset', { value: 1231.7, writable: true, configurable: true });
      Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000.5, writable: true, configurable: true });
      Object.defineProperty(window, 'innerHeight', { value: 768.3, writable: true, configurable: true });

      // Should be within 10px tolerance: |2000.5 - (1231.7 + 768.3)| = 0.5 < 10
      expect(service.isAtBottom()).toBe(true);
    });
  });
});