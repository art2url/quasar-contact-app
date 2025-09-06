import { ChatTypingService } from './chat-typing.service';
import { ChatSessionService } from '@services/chat-session.service';
import { MobileChatLayoutService } from './mobile-chat-layout.service';
import { NgZone } from '@angular/core';

describe('ChatTypingService (Business Logic)', () => {
  let service: ChatTypingService;
  let mockChatSessionService: jasmine.SpyObj<ChatSessionService>;
  let mockMobileChatLayoutService: jasmine.SpyObj<MobileChatLayoutService>;
  let mockNgZone: jasmine.SpyObj<NgZone>;

  beforeEach(() => {
    mockChatSessionService = jasmine.createSpyObj('ChatSessionService', ['sendTyping']);
    mockMobileChatLayoutService = jasmine.createSpyObj('MobileChatLayoutService', ['updateTypingIndicatorPosition']);
    mockNgZone = jasmine.createSpyObj('NgZone', ['runOutsideAngular', 'run']);
    mockNgZone.runOutsideAngular.and.callFake((fn) => fn());

    service = new ChatTypingService(
      mockChatSessionService,
      mockMobileChatLayoutService,
      mockNgZone
    );
  });

  afterEach(() => {
    service.cleanup();
  });

  // Run: npm test -- --include="**/chat-typing.service.spec.ts"
  describe('Throttling Business Rules', () => {
    it('enforces 1-second throttle rule for typing notifications', () => {
      let mockTime = 1001; // Start at 1001 to be > TYPING_THROTTLE (1000) from initial lastTypingEvent (0)
      spyOn(Date, 'now').and.callFake(() => mockTime);

      // First typing should send notification
      service.onUserTyping();
      expect(mockChatSessionService.sendTyping).toHaveBeenCalledTimes(1);

      // Second typing within 1 second should not send
      mockTime = 1500;
      service.onUserTyping();
      expect(mockChatSessionService.sendTyping).toHaveBeenCalledTimes(1);

      // Third typing after 1 second should send
      mockTime = 2002; // > 1001 + 1000
      service.onUserTyping();
      expect(mockChatSessionService.sendTyping).toHaveBeenCalledTimes(2);
    });

    it('applies throttling rule consistently across methods', () => {
      const mockTime = 1001; // > TYPING_THROTTLE from initial lastTypingEvent (0)
      spyOn(Date, 'now').and.callFake(() => mockTime);

      service.onUserTyping();
      expect(mockChatSessionService.sendTyping).toHaveBeenCalledTimes(1);

      // handleTyping should respect same throttle (same timestamp, should not send again)
      service.handleTyping();
      expect(mockChatSessionService.sendTyping).toHaveBeenCalledTimes(1);
    });
  });

  describe('Typing State Business Logic', () => {
    it('tracks active typing state correctly', () => {
      expect(service.getCurrentTypingState()).toBe(false);

      service.handleTyping();
      expect(service.getCurrentTypingState()).toBe(true);
    });

    it('maintains typing state during active typing session', () => {
      service.handleTyping();
      expect(service.getCurrentTypingState()).toBe(true);

      service.handleTyping();
      expect(service.getCurrentTypingState()).toBe(true);
    });
  });

  describe('Service State Management', () => {
    it('initializes with correct default state', () => {
      expect(service.getCurrentTypingState()).toBe(false);
      expect(service['lastTypingEvent']).toBe(0);
      expect(service['lastTextareaRows']).toBe(1);
    });

    it('resets to initial state when requested', () => {
      service.handleTyping();
      service['lastTypingEvent'] = 5000;
      service['lastTextareaRows'] = 3;

      service.reset();

      expect(service.getCurrentTypingState()).toBe(false);
      expect(service['lastTypingEvent']).toBe(0);
      expect(service['lastTextareaRows']).toBe(1);
    });
  });

  describe('Resource Cleanup Rules', () => {
    it('cleans up active subscriptions when requested', () => {
      service.onUserTyping();
      expect(service['typingThrottle']).toBeTruthy();

      service.cleanup();
      expect(service['typingThrottle']).toBeNull();
    });

    it('handles cleanup safely when already clean', () => {
      expect(() => service.cleanup()).not.toThrow();
      expect(() => service.cleanup()).not.toThrow();
    });
  });

  describe('Configuration Constants', () => {
    it('uses correct throttle duration constant', () => {
      expect(service['TYPING_THROTTLE']).toBe(1000);
    });
  });
});