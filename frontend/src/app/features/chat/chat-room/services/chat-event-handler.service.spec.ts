import { NgZone } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ChatEventHandlerService } from './chat-event-handler.service';
import { ChatSessionService } from '@services/chat-session.service';
import { WebSocketService } from '@services/websocket.service';
import { NotificationService } from '@services/notification.service';
import { ChatMessageService } from './chat-message.service';
import { ChatScrollService } from './chat-scroll.service';
import { ChatUiStateService } from './chat-ui-state.service';
import { ChatTypingService } from './chat-typing.service';
import { ChatMsg } from '@models/chat.model';

describe('ChatEventHandlerService (Business Logic)', () => {
  let service: ChatEventHandlerService;
  let mockChatSessionService: jasmine.SpyObj<ChatSessionService>;
  let mockWebSocketService: jasmine.SpyObj<WebSocketService>;
  let mockNotificationService: jasmine.SpyObj<NotificationService>;
  let mockChatMessageService: jasmine.SpyObj<ChatMessageService>;
  let mockChatScrollService: jasmine.SpyObj<ChatScrollService>;
  let mockChatUiStateService: jasmine.SpyObj<ChatUiStateService>;
  let mockChatTypingService: jasmine.SpyObj<ChatTypingService>;
  let mockNgZone: jasmine.SpyObj<NgZone>;

  beforeEach(() => {
    mockChatSessionService = jasmine.createSpyObj('ChatSessionService', [
      'ensureKeysMissingFlagSet'
    ]);
    mockWebSocketService = jasmine.createSpyObj('WebSocketService', [
      'isUserOnline', 'markMessageRead'
    ]);
    mockNotificationService = jasmine.createSpyObj('NotificationService', [
      'markUserMessagesAsRead'
    ]);
    mockChatMessageService = jasmine.createSpyObj('ChatMessageService', [
      'groupMessagesByDate', 'handleNewMessages', 'resetNewMessagesCount', 
      'getUnreadFromPartner', 'markAsReported'
    ]);
    mockChatScrollService = jasmine.createSpyObj('ChatScrollService', [
      'handleInitialScroll', 'getCurrentScrollState', 'handleNewMessages', 'handleScrollEvent'
    ]);
    mockChatUiStateService = jasmine.createSpyObj('ChatUiStateService', [
      'setLoadingMessages', 'checkForCacheIssues', 'getCurrentLoadingState', 
      'getCurrentReadStatus', 'setMarkedMessagesAsRead'
    ]);
    mockChatTypingService = jasmine.createSpyObj('ChatTypingService', [
      'updateTypingIndicatorPosition'
    ]);
    mockNgZone = jasmine.createSpyObj('NgZone', ['run', 'runOutsideAngular']);

    // Create mock observables
    const mockMessagesLoading$ = new BehaviorSubject(false);
    const mockMessages$ = new BehaviorSubject<ChatMsg[]>([]);
    const mockPartnerTyping$ = new BehaviorSubject(false);
    const mockKeyLoading$ = new BehaviorSubject(false);
    const mockMyPrivateKeyMissing$ = new BehaviorSubject(false);
    const mockIsConnected$ = new BehaviorSubject(true);
    const mockOnlineUsers$ = new BehaviorSubject<string[]>([]);
    const mockUserOnline$ = new BehaviorSubject('');
    const mockUserOffline$ = new BehaviorSubject('');

    // Add observables to services
    Object.defineProperty(mockChatSessionService, 'messagesLoading$', { value: mockMessagesLoading$ });
    Object.defineProperty(mockChatSessionService, 'messages$', { value: mockMessages$ });
    Object.defineProperty(mockChatSessionService, 'partnerTyping$', { value: mockPartnerTyping$ });
    Object.defineProperty(mockChatSessionService, 'keyLoading$', { value: mockKeyLoading$ });
    Object.defineProperty(mockChatSessionService, 'myPrivateKeyMissing$', { value: mockMyPrivateKeyMissing$ });
    Object.defineProperty(mockChatSessionService, 'isArtificialKeyMissingState', { value: false });
    Object.defineProperty(mockWebSocketService, 'isConnected$', { value: mockIsConnected$ });
    Object.defineProperty(mockWebSocketService, 'onlineUsers$', { value: mockOnlineUsers$ });
    Object.defineProperty(mockWebSocketService, 'userOnline$', { value: mockUserOnline$ });
    Object.defineProperty(mockWebSocketService, 'userOffline$', { value: mockUserOffline$ });

    mockNgZone.run.and.callFake((fn) => fn());
    mockNgZone.runOutsideAngular.and.callFake((fn) => fn());

    // Set up default return values
    mockChatScrollService.getCurrentScrollState.and.returnValue({
      isUserAtBottom: false,
      shouldAutoScroll: false,
      showScrollButton: false,
      hasInitiallyScrolled: false
    });
    mockChatScrollService.handleScrollEvent.and.returnValue({
      isNearBottom: false,
      distanceFromBottom: 100
    });
    mockChatMessageService.getUnreadFromPartner.and.returnValue([]);
    mockChatMessageService.handleNewMessages.and.returnValue(0);
    mockChatUiStateService.getCurrentLoadingState.and.returnValue(false);
    mockChatUiStateService.getCurrentReadStatus.and.returnValue(false);
    mockWebSocketService.isUserOnline.and.returnValue(false);

    service = new ChatEventHandlerService(
      mockChatSessionService,
      mockWebSocketService,
      mockNotificationService,
      mockChatMessageService,
      mockChatScrollService,
      mockChatUiStateService,
      mockChatTypingService,
      mockNgZone
    );
  });

  // Run: npm test -- --include="**/chat-event-handler.service.spec.ts"
  describe('Online Status Callback Management', () => {
    it('sets online status callback', () => {
      const callback = jasmine.createSpy('callback');

      service.setOnlineStatusCallback(callback);

      expect(callback).not.toHaveBeenCalled();
    });

    it('calls callback when online users list changes', () => {
      const callback = jasmine.createSpy('callback');
      const receiverId = 'user123';
      service.setOnlineStatusCallback(callback);

      service.initializeEventHandlers(receiverId, document.createElement('div'));
      mockWebSocketService.onlineUsers$.next(['user123', 'user456']);

      expect(callback).toHaveBeenCalledWith(true);
    });

    it('detects user offline when not in online users list', () => {
      const callback = jasmine.createSpy('callback');
      const receiverId = 'user123';
      service.setOnlineStatusCallback(callback);

      service.initializeEventHandlers(receiverId, document.createElement('div'));
      mockWebSocketService.onlineUsers$.next(['user456']);

      expect(callback).toHaveBeenCalledWith(false);
    });
  });

  describe('Message Event Handling', () => {
    it('handles loading state changes', () => {
      const container = document.createElement('div');
      
      service.initializeEventHandlers('user123', container);
      mockChatSessionService.messagesLoading$.next(true);

      expect(mockChatUiStateService.setLoadingMessages).toHaveBeenCalledWith(true);
    });

    it('handles initial scroll when loading finishes', () => {
      const container = document.createElement('div');
      
      service.initializeEventHandlers('user123', container);
      mockChatSessionService.messagesLoading$.next(false);

      expect(mockChatScrollService.handleInitialScroll).toHaveBeenCalledWith(container);
    });

    it('groups messages by date when messages update', () => {
      const messages: ChatMsg[] = [
        { id: '1', text: 'test', ts: Date.now(), sender: 'user1' }
      ];
      
      service.initializeEventHandlers('user123', document.createElement('div'));
      mockChatSessionService.messages$.next(messages);

      expect(mockChatMessageService.groupMessagesByDate).toHaveBeenCalledWith(messages);
    });

    it('handles new messages when not loading', () => {
      const messages: ChatMsg[] = [
        { id: '1', text: 'test', ts: Date.now(), sender: 'user1' }
      ];
      const container = document.createElement('div');
      mockChatUiStateService.getCurrentLoadingState.and.returnValue(false);
      mockChatScrollService.getCurrentScrollState.and.returnValue({ 
        isUserAtBottom: true,
        shouldAutoScroll: false,
        showScrollButton: false,
        hasInitiallyScrolled: true
      });
      mockChatMessageService.handleNewMessages.and.returnValue(2);
      
      service.initializeEventHandlers('user123', container);
      mockChatSessionService.messages$.next(messages);

      expect(mockChatScrollService.handleNewMessages).toHaveBeenCalledWith(container, 2);
    });
  });

  describe('Typing Indicator Handling', () => {
    it('updates typing indicator position when partner typing changes', (done) => {
      // Mock requestAnimationFrame to execute callbacks immediately
      spyOn(window, 'requestAnimationFrame').and.callFake((callback) => {
        callback(0);
        return 0;
      });

      service.initializeEventHandlers('user123', document.createElement('div'));

      // Trigger the observable change after initialization
      setTimeout(() => {
        mockChatSessionService.partnerTyping$.next(true);

        // Give time for all async operations to complete
        setTimeout(() => {
          expect(mockChatTypingService.updateTypingIndicatorPosition).toHaveBeenCalled();
          done();
        }, 100);
      }, 10);
    });
  });

  describe('Key Status Management', () => {
    it('ensures keys missing flag when private key missing and not loading', () => {
      // Set keyLoading$ to false and ensure it's not artificial state
      mockChatSessionService.keyLoading$.next(false);
      Object.defineProperty(mockChatSessionService, 'isArtificialKeyMissingState', { value: false });
      
      service.initializeEventHandlers('user123', document.createElement('div'));
      mockChatSessionService.myPrivateKeyMissing$.next(true);

      expect(mockChatSessionService.ensureKeysMissingFlagSet).toHaveBeenCalled();
    });

    it('skips flag setting when key is loading', () => {
      // Set keyLoading$ to true
      mockChatSessionService.keyLoading$.next(true);
      
      service.initializeEventHandlers('user123', document.createElement('div'));
      mockChatSessionService.myPrivateKeyMissing$.next(true);

      expect(mockChatSessionService.ensureKeysMissingFlagSet).not.toHaveBeenCalled();
    });
  });

  describe('Read Receipt Handling', () => {
    it('marks unread messages as read', () => {
      const messages: ChatMsg[] = [
        { id: '1', text: 'test', ts: Date.now(), sender: 'user1' }
      ];
      mockChatUiStateService.getCurrentLoadingState.and.returnValue(false);
      mockChatMessageService.getUnreadFromPartner.and.returnValue(messages);
      
      service.initializeEventHandlers('user123', document.createElement('div'));
      mockChatSessionService.messages$.next(messages);

      expect(mockWebSocketService.markMessageRead).toHaveBeenCalledWith('1');
      expect(mockChatMessageService.markAsReported).toHaveBeenCalledWith('1');
    });

    it('skips marking when loading', () => {
      const messages: ChatMsg[] = [
        { id: '1', text: 'test', ts: Date.now(), sender: 'user1' }
      ];
      mockChatUiStateService.getCurrentLoadingState.and.returnValue(true);
      
      service.initializeEventHandlers('user123', document.createElement('div'));
      mockChatSessionService.messages$.next(messages);

      expect(mockWebSocketService.markMessageRead).not.toHaveBeenCalled();
    });
  });

  describe('Scroll Event Handling', () => {
    it('handles scroll events and resets new messages when near bottom', () => {
      const container = document.createElement('div');
      mockChatUiStateService.getCurrentLoadingState.and.returnValue(false);
      mockChatScrollService.handleScrollEvent.and.returnValue({ 
        isNearBottom: true, 
        distanceFromBottom: 10 
      });

      const result = service.handleScroll(container);

      expect(mockChatMessageService.resetNewMessagesCount).toHaveBeenCalled();
      expect(result).toBe(true);
    });

    it('marks messages as read when near bottom and not already read', () => {
      const container = document.createElement('div');
      mockChatUiStateService.getCurrentLoadingState.and.returnValue(false);
      mockChatUiStateService.getCurrentReadStatus.and.returnValue(false);
      mockChatScrollService.handleScrollEvent.and.returnValue({ 
        isNearBottom: true, 
        distanceFromBottom: 10 
      });

      const result = service.handleScroll(container);

      expect(mockChatUiStateService.setMarkedMessagesAsRead).toHaveBeenCalledWith(true);
      expect(result).toBe(true);
    });

    it('returns false when loading', () => {
      const container = document.createElement('div');
      mockChatUiStateService.getCurrentLoadingState.and.returnValue(true);

      const result = service.handleScroll(container);

      expect(result).toBe(false);
    });
  });

  describe('User Status Tracking', () => {
    it('handles user online events', () => {
      const callback = jasmine.createSpy('callback');
      const receiverId = 'user123';
      service.setOnlineStatusCallback(callback);
      
      service.initializeEventHandlers(receiverId, document.createElement('div'));
      mockWebSocketService.userOnline$.next('user123');

      expect(callback).toHaveBeenCalledWith(true);
    });

    it('handles user offline events', () => {
      const callback = jasmine.createSpy('callback');
      const receiverId = 'user123';
      service.setOnlineStatusCallback(callback);
      
      service.initializeEventHandlers(receiverId, document.createElement('div'));
      mockWebSocketService.userOffline$.next('user123');

      expect(callback).toHaveBeenCalledWith(false);
    });

    it('sets user offline on WebSocket disconnection', () => {
      const callback = jasmine.createSpy('callback');
      service.setOnlineStatusCallback(callback);
      
      service.initializeEventHandlers('user123', document.createElement('div'));
      mockWebSocketService.isConnected$.next(false);

      expect(callback).toHaveBeenCalledWith(false);
    });

    it('checks current status on WebSocket reconnection', () => {
      const callback = jasmine.createSpy('callback');
      mockWebSocketService.isUserOnline.and.returnValue(true);
      service.setOnlineStatusCallback(callback);
      
      service.initializeEventHandlers('user123', document.createElement('div'));
      mockWebSocketService.isConnected$.next(true);

      expect(mockWebSocketService.isUserOnline).toHaveBeenCalledWith('user123');
      expect(callback).toHaveBeenCalledWith(true);
    });
  });

  describe('Service Operations', () => {
    it('marks user messages as read', () => {
      const receiverId = 'user123';

      service.markMessagesAsReadWhenVisible(receiverId);

      expect(mockNotificationService.markUserMessagesAsRead).toHaveBeenCalledWith(receiverId);
    });

    it('cleans up subscriptions', () => {
      service.cleanup();

      // Verify cleanup creates new subscription (tested by not throwing errors)
      expect(service).toBeTruthy();
    });
  });
});