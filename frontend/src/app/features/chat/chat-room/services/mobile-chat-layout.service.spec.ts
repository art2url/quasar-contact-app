import { BehaviorSubject } from 'rxjs';
import { MobileChatLayoutService } from './mobile-chat-layout.service';

describe('MobileChatLayoutService (Business Logic)', () => {
  let service: MobileChatLayoutService;

  // Mock data for testing
  const mockContainerAtBottom = {
    scrollTop: 950,
    scrollHeight: 1000,
    clientHeight: 400
  } as HTMLElement;

  const mockContainerNotAtBottom = {
    scrollTop: 100,
    scrollHeight: 1000,
    clientHeight: 400
  } as HTMLElement;

  const mockContainerNearBottom = {
    scrollTop: 980,
    scrollHeight: 1000,
    clientHeight: 400
  } as HTMLElement;

  beforeEach(() => {
    // Create service instance without Angular DI
    service = Object.create(MobileChatLayoutService.prototype);
    
    // Initialize only the properties we need for testing
    const mockMetrics = {
      viewportHeight: 800,
      availableChatHeight: 600,
      chatFormHeight: 70,
      typingIndicatorHeight: 0,
      cacheInfoBannerHeight: 0,
      scrollButtonBottomOffset: 0,
      typingIndicatorBottomOffset: 0,
      attachmentPreviewBottomOffset: 0
    };
    
    service['metrics$'] = new BehaviorSubject(mockMetrics);

    // Mock window properties
    Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
    Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
    Object.defineProperty(window, 'visualViewport', {
      value: { height: 400 },
      configurable: true
    });
  });

  // Run: npm test -- --include="**/mobile-chat-layout.service.spec.ts"
  describe('Mobile View Detection', () => {
    it('detects mobile view when width is 500px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });

      const result = service['isMobileView']();

      expect(result).toBe(true);
    });

    it('detects desktop view when width is 800px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });

      const result = service['isMobileView']();

      expect(result).toBe(false);
    });

    it('detects mobile at exact breakpoint 599px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 599, configurable: true });

      const result = service['isMobileView']();

      expect(result).toBe(true);
    });

    it('detects desktop just above breakpoint 600px', () => {
      Object.defineProperty(window, 'innerWidth', { value: 600, configurable: true });

      const result = service['isMobileView']();

      expect(result).toBe(false);
    });
  });

  describe('Keyboard Visibility Detection', () => {
    beforeEach(() => {
      Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });
    });

    it('detects keyboard visible when visual viewport much smaller', () => {
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
      Object.defineProperty(window, 'visualViewport', {
        value: { height: 400 },
        configurable: true
      });

      const result = service.isKeyboardVisible();

      expect(result).toBe(true);
    });

    it('detects keyboard not visible when heights similar', () => {
      Object.defineProperty(window, 'innerHeight', { value: 800, configurable: true });
      Object.defineProperty(window, 'visualViewport', {
        value: { height: 790 },
        configurable: true
      });

      const result = service.isKeyboardVisible();

      expect(result).toBe(false);
    });

    it('returns false for desktop view', () => {
      Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });

      const result = service.isKeyboardVisible();

      expect(result).toBe(false);
    });
  });

  describe('Scroll Position Calculations', () => {
    it('calculates distance from bottom correctly', () => {
      const distance = service.getDistanceFromBottom(mockContainerNotAtBottom);

      expect(distance).toBe(500); // 1000 - (100 + 400)
    });

    it('calculates zero distance when at exact bottom', () => {
      const mockAtExactBottom = {
        scrollTop: 600,
        scrollHeight: 1000,
        clientHeight: 400
      } as HTMLElement;

      const distance = service.getDistanceFromBottom(mockAtExactBottom);

      expect(distance).toBe(0); // 1000 - (600 + 400)
    });

    it('detects user at actual bottom within desktop threshold', () => {
      Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });

      const result = service.isUserAtActualBottom(mockContainerAtBottom);

      expect(result).toBe(true);
    });

    it('detects user not at bottom outside desktop threshold', () => {
      Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });

      const result = service.isUserAtActualBottom(mockContainerNotAtBottom);

      expect(result).toBe(false);
    });

    it('uses mobile threshold when in mobile view', () => {
      Object.defineProperty(window, 'innerWidth', { value: 500, configurable: true });

      const result = service.isUserAtActualBottom(mockContainerNearBottom);

      expect(result).toBe(true);
    });
  });

  describe('True Bottom Detection', () => {
    it('detects true bottom within 5px tolerance', () => {
      const mockVeryCloseToBottom = {
        scrollTop: 598,
        scrollHeight: 1000,
        clientHeight: 400
      } as HTMLElement;

      const result = service.isUserAtTrueBottom(mockVeryCloseToBottom);

      expect(result).toBe(true);
    });

    it('detects not at true bottom outside 5px tolerance', () => {
      const result = service.isUserAtTrueBottom(mockContainerNotAtBottom);

      expect(result).toBe(false);
    });
  });

  describe('Auto-Scroll Logic', () => {
    it('allows auto-scroll when user at actual bottom', () => {
      const result = service.shouldAutoScroll(mockContainerAtBottom);

      expect(result).toBe(true);
    });

    it('prevents auto-scroll when user not at bottom', () => {
      const result = service.shouldAutoScroll(mockContainerNotAtBottom);

      expect(result).toBe(false);
    });
  });

  describe('Scroll Target Calculation', () => {
    it('calculates target scroll position as scroll height', () => {
      const result = service['calculateTargetScrollPosition'](mockContainerAtBottom);

      expect(result).toBe(1000);
    });

    it('handles containers with different scroll heights', () => {
      const mockSmallContainer = {
        scrollHeight: 500
      } as HTMLElement;

      const result = service['calculateTargetScrollPosition'](mockSmallContainer);

      expect(result).toBe(500);
    });
  });

  describe('Scroll Operations', () => {
    let mockContainer: HTMLElement;

    beforeEach(() => {
      mockContainer = {
        scrollHeight: 1000,
        scrollTo: jasmine.createSpy('scrollTo'),
        scrollTop: 0
      } as unknown as HTMLElement;
    });

    it('sets scroll top directly when not smooth', () => {
      service.scrollToBottomWithLayout(mockContainer, false);

      expect(mockContainer.scrollTop).toBe(1000);
    });

    it('uses smooth scrolling when requested', () => {
      service.scrollToBottomWithLayout(mockContainer, true);

      expect(mockContainer.scrollTo).toHaveBeenCalledTimes(1);
    });
  });

  describe('Metrics Access', () => {
    it('returns current metrics from observable', () => {
      const metrics = service.getMetrics();

      expect(metrics.viewportHeight).toBe(800);
      expect(metrics.chatFormHeight).toBe(70);
    });

    it('provides metrics observable', () => {
      const metrics$ = service.getMetrics$();

      expect(metrics$).toBeDefined();
    });
  });

  describe('Safe Area Calculations', () => {
    beforeEach(() => {
      spyOn(document.body, 'appendChild');
      spyOn(document.body, 'removeChild');
    });

    it('calculates safe area with valid padding value', () => {
      spyOn(window, 'getComputedStyle').and.returnValue({
        paddingBottom: '20px'
      } as CSSStyleDeclaration);

      const safeArea = service['getSafeAreaBottom']();

      expect(safeArea).toBe(20);
    });

    it('handles zero safe area when no padding', () => {
      spyOn(window, 'getComputedStyle').and.returnValue({
        paddingBottom: '0px'
      } as CSSStyleDeclaration);

      const safeArea = service['getSafeAreaBottom']();

      expect(safeArea).toBe(0);
    });

    it('handles invalid padding with fallback', () => {
      spyOn(window, 'getComputedStyle').and.returnValue({
        paddingBottom: 'invalid'
      } as CSSStyleDeclaration);

      const safeArea = service['getSafeAreaBottom']();

      expect(safeArea).toBe(0);
    });
  });
});