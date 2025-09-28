import { NgZone } from '@angular/core';
import { ChatScrollService } from './chat-scroll.service';
import { MobileChatLayoutService } from './mobile-chat-layout.service';

describe('ChatScrollService (Business Logic)', () => {
  let service: ChatScrollService;
  let mockMobileChatLayoutService: jasmine.SpyObj<MobileChatLayoutService>;
  let mockNgZone: jasmine.SpyObj<NgZone>;

  beforeEach(() => {
    mockMobileChatLayoutService = jasmine.createSpyObj('MobileChatLayoutService', [
      'getDistanceFromBottom',
      'isUserAtActualBottom',
      'scrollToBottomWithLayout',
      'shouldAutoScroll',
      'forceUpdate'
    ]);
    
    mockNgZone = jasmine.createSpyObj('NgZone', ['run', 'runOutsideAngular']);
    mockNgZone.runOutsideAngular.and.callFake((fn) => fn());
    mockNgZone.run.and.callFake((fn) => fn());

    service = new ChatScrollService(mockMobileChatLayoutService, mockNgZone);
  });

  // Run: npm test -- --include="**/chat-scroll.service.spec.ts"
  describe('Scroll State Management', () => {
    it('initializes with correct default state', () => {
      const state = service.getCurrentScrollState();
      
      expect(state.isUserAtBottom).toBe(true);
      expect(state.shouldAutoScroll).toBe(true);
      expect(state.showScrollButton).toBe(false);
      expect(state.hasInitiallyScrolled).toBe(false);
    });

    it('tracks scroll state changes correctly', () => {
      const mockContainer = document.createElement('div');
      mockMobileChatLayoutService.getDistanceFromBottom.and.returnValue(150);
      mockMobileChatLayoutService.isUserAtActualBottom.and.returnValue(false);

      const result = service.handleScrollEvent(mockContainer);

      expect(result.isNearBottom).toBe(false);
      expect(result.distanceFromBottom).toBe(150);
      expect(service.getCurrentScrollState().showScrollButton).toBe(true);
    });

    it('shows scroll button only when distance exceeds threshold', () => {
      const mockContainer = document.createElement('div');
      
      // Distance below threshold
      mockMobileChatLayoutService.getDistanceFromBottom.and.returnValue(50);
      mockMobileChatLayoutService.isUserAtActualBottom.and.returnValue(true);
      
      service.handleScrollEvent(mockContainer);
      expect(service.getCurrentScrollState().showScrollButton).toBe(false);

      // Distance above threshold
      mockMobileChatLayoutService.getDistanceFromBottom.and.returnValue(150);
      mockMobileChatLayoutService.isUserAtActualBottom.and.returnValue(false);
      
      service.handleScrollEvent(mockContainer);
      expect(service.getCurrentScrollState().showScrollButton).toBe(true);
    });
  });

  describe('Scroll to Bottom Logic', () => {
    it('scrolls to bottom and updates state correctly', () => {
      const mockContainer = document.createElement('div');
      
      const result = service.scrollToBottom(mockContainer, true, true);

      expect(mockMobileChatLayoutService.scrollToBottomWithLayout).toHaveBeenCalledWith(mockContainer, true);
      expect(service.getCurrentScrollState().isUserAtBottom).toBe(true);
      expect(service.getCurrentScrollState().shouldAutoScroll).toBe(false);
      expect(service.getCurrentScrollState().showScrollButton).toBe(false);
      expect(result).toBe(true);
    });

    it('handles scroll errors gracefully', () => {
      const mockContainer = document.createElement('div');
      mockMobileChatLayoutService.scrollToBottomWithLayout.and.throwError('Scroll error');
      spyOn(console, 'error');

      const result = service.scrollToBottom(mockContainer, false, false);

      expect(result).toBe(false);
      expect(console.error).toHaveBeenCalledWith('Error scrolling to bottom:', jasmine.any(Error));
    });
  });

  describe('Initial Scroll Handling', () => {
    it('performs initial scroll only once', () => {
      const mockContainer = document.createElement('div');
      
      expect(service.getCurrentScrollState().hasInitiallyScrolled).toBe(false);

      service.handleInitialScroll(mockContainer);
      expect(service.getCurrentScrollState().hasInitiallyScrolled).toBe(true);
      expect(service.getCurrentScrollState().shouldAutoScroll).toBe(true);

      // Reset call count and try again
      mockMobileChatLayoutService.scrollToBottomWithLayout.calls.reset();
      service.handleInitialScroll(mockContainer);
      expect(mockMobileChatLayoutService.scrollToBottomWithLayout).not.toHaveBeenCalled();
    });

    it('sets initial scroll flags correctly', () => {
      const mockContainer = document.createElement('div');
      
      service.handleInitialScroll(mockContainer);
      
      expect(service.getCurrentScrollState().hasInitiallyScrolled).toBe(true);
      expect(service.getCurrentScrollState().shouldAutoScroll).toBe(true);
    });
  });

  describe('New Messages Auto-scroll Logic', () => {
    it('auto-scrolls when user is at bottom', () => {
      const mockContainer = document.createElement('div');
      mockMobileChatLayoutService.shouldAutoScroll.and.returnValue(true);
      
      // Mock getCurrentScrollState to return user at bottom
      spyOn(service, 'getCurrentScrollState').and.returnValue({
        isUserAtBottom: true,
        shouldAutoScroll: false,
        showScrollButton: false,
        hasInitiallyScrolled: false
      });

      const result = service.handleNewMessages(mockContainer, 2);

      expect(result).toBe(true);
    });

    it('does not auto-scroll when user is not at bottom', () => {
      const mockContainer = document.createElement('div');
      
      // Mock getCurrentScrollState to return user not at bottom
      spyOn(service, 'getCurrentScrollState').and.returnValue({
        isUserAtBottom: false,
        shouldAutoScroll: false,
        showScrollButton: false,
        hasInitiallyScrolled: false
      });

      const result = service.handleNewMessages(mockContainer, 2);

      expect(result).toBe(false);
    });

    it('does not auto-scroll when no new messages', () => {
      const mockContainer = document.createElement('div');
      
      // Mock getCurrentScrollState to return user at bottom
      spyOn(service, 'getCurrentScrollState').and.returnValue({
        isUserAtBottom: true,
        shouldAutoScroll: false,
        showScrollButton: false,
        hasInitiallyScrolled: false
      });

      const result = service.handleNewMessages(mockContainer, 0);

      expect(result).toBe(false);
    });
  });

  describe('Scroll Button Click Handling', () => {
    it('handles scroll button click correctly', () => {
      const mockContainer = document.createElement('div');
      
      const result = service.scrollToBottomClick(mockContainer);

      expect(service.getCurrentScrollState().isUserAtBottom).toBe(true);
      expect(service.getCurrentScrollState().shouldAutoScroll).toBe(false); // scrollToBottom sets this to false
      expect(service.getCurrentScrollState().showScrollButton).toBe(false);
      expect(mockMobileChatLayoutService.scrollToBottomWithLayout).toHaveBeenCalledWith(mockContainer, true);
      expect(result).toBe(true); // Returns markAsRead parameter from scrollToBottom
    });
  });

  describe('Auto-scroll Conditions', () => {
    it('auto-scrolls during view check when conditions are met', () => {
      const mockContainer = document.createElement('div');
      mockMobileChatLayoutService.shouldAutoScroll.and.returnValue(true);
      
      // Mock getCurrentScrollState to return conditions for auto-scroll
      spyOn(service, 'getCurrentScrollState').and.returnValue({
        isUserAtBottom: true,
        shouldAutoScroll: true,
        showScrollButton: false,
        hasInitiallyScrolled: true
      });

      const result = service.shouldAutoScrollInViewChecked(mockContainer, false);

      expect(mockMobileChatLayoutService.scrollToBottomWithLayout).toHaveBeenCalledWith(mockContainer, false);
      expect(result).toBe(false); // scrollToBottom returns markAsRead=false
    });

    it('does not auto-scroll when loading messages', () => {
      const mockContainer = document.createElement('div');
      
      // Mock getCurrentScrollState to return conditions but loading is true
      spyOn(service, 'getCurrentScrollState').and.returnValue({
        isUserAtBottom: true,
        shouldAutoScroll: true,
        showScrollButton: false,
        hasInitiallyScrolled: true
      });

      const result = service.shouldAutoScrollInViewChecked(mockContainer, true);

      expect(result).toBe(false);
    });
  });

  describe('Textarea Resize Auto-scroll', () => {
    it('auto-scrolls on textarea resize when user is at bottom', (done) => {
      const mockContainer = document.createElement('div');
      
      // Set user at bottom by accessing the private property
      (service as unknown as { isUserAtBottom$: { next: (value: boolean) => void } }).isUserAtBottom$.next(true);

      service.autoScrollOnTextareaResize(mockContainer);

      // Since this uses async operations, we need to wait for the callback
      setTimeout(() => {
        expect(mockMobileChatLayoutService.scrollToBottomWithLayout).toHaveBeenCalledWith(mockContainer, false);
        done();
      }, 50);
    });

    it('does not auto-scroll on textarea resize when user is not at bottom', () => {
      const mockContainer = document.createElement('div');
      
      // Set user not at bottom
      (service as unknown as { isUserAtBottom$: { next: (value: boolean) => void } }).isUserAtBottom$.next(false);

      service.autoScrollOnTextareaResize(mockContainer);

      expect(mockMobileChatLayoutService.scrollToBottomWithLayout).not.toHaveBeenCalled();
    });
  });

  describe('Service State Management', () => {
    it('resets all state to initial values', () => {
      const mockContainer = document.createElement('div');
      
      // Set up non-default state
      service.handleScrollEvent(mockContainer);
      (service as unknown as { shouldAutoScroll$: { next: (value: boolean) => void }; hasInitiallyScrolled: boolean }).shouldAutoScroll$.next(false);
      (service as unknown as { shouldAutoScroll$: { next: (value: boolean) => void }; hasInitiallyScrolled: boolean }).hasInitiallyScrolled = true;

      service.reset();

      const state = service.getCurrentScrollState();
      expect(state.isUserAtBottom).toBe(true);
      expect(state.shouldAutoScroll).toBe(true);
      expect(state.showScrollButton).toBe(false);
      expect(state.hasInitiallyScrolled).toBe(false);
    });

    it('cleans up resources correctly', () => {
      const mockContainer = document.createElement('div');
      spyOn(mockContainer, 'removeEventListener');
      
      // Set up timeout
      (service as unknown as { scrollTimeout: ReturnType<typeof setTimeout> | null }).scrollTimeout = setTimeout(() => { /* test timeout */ }, 100);

      service.cleanup(mockContainer);

      expect(mockContainer.removeEventListener).toHaveBeenCalledWith('scroll', jasmine.any(Function));
      expect((service as unknown as { scrollTimeout: ReturnType<typeof setTimeout> | null }).scrollTimeout).toBeNull();
    });
  });
});