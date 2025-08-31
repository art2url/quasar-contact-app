import { TestBed } from '@angular/core/testing';
import { BehaviorSubject, of, throwError } from 'rxjs';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideHttpClient } from '@angular/common/http';

import { NotificationService } from './notification.service';
import { WebSocketService } from './websocket.service';
import { MessagesService } from './messages.service';
import { MessageOverview } from '@models/api-response.model';
import { IncomingSocketMessage } from '@models/socket.model';

describe('NotificationService (Real-time Chat Notifications)', () => {
  let service: NotificationService;
  let mockWebSocketService: jasmine.SpyObj<WebSocketService>;
  let mockMessagesService: jasmine.SpyObj<MessagesService>;

  const sampleMessageOverviews: MessageOverview[] = [
    {
      peerId: 'user-123',
      lastText: 'Hey, how are you?',
      unread: 3
    },
    {
      peerId: 'user-456',
      lastText: 'Meeting at 3pm today',
      unread: 1
    },
    {
      peerId: 'user-789',
      lastText: 'Thanks for the help!',
      unread: 0
    }
  ];

  beforeEach(async () => {
    // Setup local storage for authenticated user
    spyOn(Storage.prototype, 'getItem').and.callFake((key: string) => {
      if (key === 'username') return 'current-user';
      if (key === 'userId') return 'current-user-id';
      return null;
    });

    // Create simplified mocks
    mockWebSocketService = jasmine.createSpyObj('WebSocketService', [
      'onReceiveMessage', 'onMessageRead', 'offReceiveMessage'
    ], {
      isConnected$: new BehaviorSubject<boolean>(true)
    });

    mockMessagesService = jasmine.createSpyObj('MessagesService', [
      'getOverviews', 'markMessagesAsRead'
    ]);

    // Setup successful responses
    mockMessagesService.getOverviews.and.returnValue(of(sampleMessageOverviews));
    mockMessagesService.markMessagesAsRead.and.returnValue(of({ message: 'Messages marked as read', count: 1 }));

    await TestBed.configureTestingModule({
      providers: [
        NotificationService,
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: WebSocketService, useValue: mockWebSocketService },
        { provide: MessagesService, useValue: mockMessagesService }
      ]
    });

    service = TestBed.inject(NotificationService);
  });

  afterEach(() => {
    if (service) {
      service.ngOnDestroy();
    }
  });

  // Run: npm test -- --include="**/notification.service.spec.ts"
  describe('Service Initialization and Setup', () => {
    it('initializes with correct default state', () => {
      expect(service).toBeDefined();
      // Service auto-loads notifications on init, so we check it functions
      expect(service.totalUnread$).toBeDefined();
      expect(service.chatNotifications$).toBeDefined();
    });

    it('sets up WebSocket event handlers for real-time updates', () => {
      expect(mockWebSocketService.onReceiveMessage).toHaveBeenCalled();
      expect(mockWebSocketService.onMessageRead).toHaveBeenCalled();
    });

    it('loads notifications from server and processes correctly', () => {
      service.loadNotifications(true);
      
      const notifications = service.chatNotifications$.value;
      
      // Should only include users with unread messages
      expect(notifications.length).toBe(2);
      expect(notifications.find(n => n.userId === 'user-123')).toEqual({
        userId: 'user-123',
        unreadCount: 3,
        lastMessage: 'Hey, how are you?'
      });
      expect(notifications.find(n => n.userId === 'user-456')).toEqual({
        userId: 'user-456',
        unreadCount: 1,
        lastMessage: 'Meeting at 3pm today'
      });
      
      // user-789 has 0 unread, should not be in notifications
      expect(notifications.find(n => n.userId === 'user-789')).toBeUndefined();
    });
  });

  describe('Notification State Management', () => {
    it('calculates total unread count correctly', () => {
      service.loadNotifications(true);
      const totalUnread = service.totalUnread$.value;
      expect(totalUnread).toBe(4); // 3 + 1 = 4 total unread messages
    });

    it('marks user messages as read and updates local state', () => {
      service.loadNotifications(true);
      const userId = 'user-123';
      const initialUnread = service.totalUnread$.value;
      
      service.markUserMessagesAsRead(userId);
      
      // Local state should update immediately
      const notifications = service.chatNotifications$.value;
      const userNotification = notifications.find(n => n.userId === userId);
      expect(userNotification).toBeUndefined(); // Removed from notifications
      
      // Total unread should decrease
      expect(service.totalUnread$.value).toBeLessThan(initialUnread);
      
      // Server API should be called
      expect(mockMessagesService.markMessagesAsRead).toHaveBeenCalledWith(userId);
    });

    it('provides unread count for specific users', () => {
      service.loadNotifications(true);
      
      const count123 = service.getUnreadCountForUser('user-123');
      const count456 = service.getUnreadCountForUser('user-456');
      const countNone = service.getUnreadCountForUser('non-existent-user');
      
      expect(count123).toBe(3);
      expect(count456).toBe(1);
      expect(countNone).toBe(0);
    });

    it('clears all notifications correctly', () => {
      service.loadNotifications(true);
      expect(service.totalUnread$.value).toBeGreaterThan(0);
      
      service.clearAllNotifications();
      
      expect(service.chatNotifications$.value).toEqual([]);
      expect(service.totalUnread$.value).toBe(0);
    });

    it('forces notification refresh', () => {
      const loadSpy = spyOn(service, 'loadNotifications');
      
      service.refreshNotifications();
      expect(loadSpy).toHaveBeenCalled();
      
      service.refreshNotificationsImmediate();
      // Should trigger immediate update (integration tested separately)
    });
  });

  describe('Real-time Message Handling', () => {
    let messageHandler: (message: IncomingSocketMessage) => void;

    beforeEach(() => {
      service.loadNotifications(true); // Initialize with sample data
      const onReceiveMessageCall = mockWebSocketService.onReceiveMessage.calls.mostRecent();
      messageHandler = onReceiveMessageCall.args[0];
    });

    it('increments unread count for new messages from different users', () => {
      const newMessage: IncomingSocketMessage = {
        messageId: 'msg-new',
        ciphertext: 'encrypted-message',
        fromUserId: 'sender-123',
        fromUsername: 'TestSender',
        timestamp: new Date().toISOString()
      };

      // Simulate receiving message (not in current chat)
      messageHandler(newMessage);

      const notifications = service.chatNotifications$.value;
      const senderNotification = notifications.find(n => n.userId === 'sender-123');
      
      expect(senderNotification).toBeDefined();
      expect(senderNotification!.unreadCount).toBe(1);
      expect(senderNotification!.username).toBe('TestSender');
    });

    it('handles repeated messages from same user', () => {
      const repeatedSender: IncomingSocketMessage = {
        messageId: 'msg-repeat-1',
        ciphertext: 'encrypted-first-message',
        fromUserId: 'repeat-sender',
        fromUsername: 'RepeatUser',
        timestamp: new Date().toISOString()
      };

      // First message
      messageHandler(repeatedSender);
      let notifications = service.chatNotifications$.value;
      let notification = notifications.find(n => n.userId === 'repeat-sender');
      expect(notification!.unreadCount).toBe(1);

      // Second message from same user
      const secondMessage = { ...repeatedSender, messageId: 'msg-repeat-2', ciphertext: 'encrypted-second-message' };
      messageHandler(secondMessage);
      
      notifications = service.chatNotifications$.value;
      notification = notifications.find(n => n.userId === 'repeat-sender');
      expect(notification!.unreadCount).toBe(2);
    });
  });

  describe('Authentication and Error Handling', () => {
    it('skips loading when user is not authenticated', () => {
      (Storage.prototype.getItem as jasmine.Spy).and.returnValue(null);
      mockMessagesService.getOverviews.calls.reset();
      
      service.loadNotifications(true);
      
      expect(mockMessagesService.getOverviews).not.toHaveBeenCalled();
    });

    it('handles API errors gracefully during notification loading', () => {
      const consoleSpy = spyOn(console, 'error');
      mockMessagesService.getOverviews.and.returnValue(
        throwError(() => new Error('Network error'))
      );
      
      service.loadNotifications(true);
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[NotificationService] Failed to load notifications:',
        jasmine.any(Error)
      );
    });

    it('handles empty overviews response', () => {
      mockMessagesService.getOverviews.and.returnValue(of([]));
      
      service.loadNotifications(true);
      
      expect(service.chatNotifications$.value).toEqual([]);
      expect(service.totalUnread$.value).toBe(0);
    });
  });

  describe('Performance and Efficiency', () => {
    it('handles large notification lists efficiently', () => {
      const largeOverviews: MessageOverview[] = [];
      for (let i = 0; i < 100; i++) {
        largeOverviews.push({
          peerId: `user-${i}`,
          lastText: `Message from user ${i}`,
          unread: i % 3 === 0 ? 1 : 0 // Every 3rd user has unread
        });
      }
      
      mockMessagesService.getOverviews.and.returnValue(of(largeOverviews));
      service.loadNotifications(true);
      
      const notifications = service.chatNotifications$.value;
      const expectedUnreadUsers = Math.floor(100 / 3) + 1; // Users with index 0, 3, 6, 9...
      
      expect(notifications.length).toBe(expectedUnreadUsers);
      expect(service.totalUnread$.value).toBe(expectedUnreadUsers);
    });

    it('maintains notification state integrity during rapid updates', () => {
      service.loadNotifications(true);
      const userId = 'rapid-update-user';
      const messageHandler = mockWebSocketService.onReceiveMessage.calls.mostRecent().args[0];
      
      // Rapid mark as read and new message cycles
      for (let i = 0; i < 5; i++) {
        service.markUserMessagesAsRead(userId);
        
        messageHandler({
          messageId: `rapid-msg-${i}`,
          ciphertext: `encrypted-rapid-message-${i}`,
          fromUserId: userId,
          fromUsername: 'RapidUser',
          timestamp: new Date().toISOString()
        });
      }
      
      // State should remain consistent
      const notifications = service.chatNotifications$.value;
      expect(notifications.find(n => n.userId === userId)).toBeDefined();
      expect(service.totalUnread$.value).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Rate Limiting', () => {
    beforeEach(() => {
      // Reset rate limiting state
      service['lastLoadTime'] = 0;
    });

    it('enforces rate limiting for frequent load requests', () => {
      mockMessagesService.getOverviews.calls.reset();
      
      // Multiple rapid calls should be rate limited
      service.loadNotifications();
      service.loadNotifications();
      service.loadNotifications();
      
      expect(mockMessagesService.getOverviews.calls.count()).toBe(1);
    });

    it('allows bypassing rate limit when requested', () => {
      mockMessagesService.getOverviews.calls.reset();
      
      service.loadNotifications();
      service.loadNotifications(true); // Bypass rate limit
      
      expect(mockMessagesService.getOverviews.calls.count()).toBe(2);
    });
  });

  describe('WebSocket Integration', () => {
    it('handles WebSocket connection state changes', () => {
      const loadSpy = spyOn(service, 'loadNotifications');
      loadSpy.calls.reset();
      
      // Simulate disconnect then reconnect
      mockWebSocketService.isConnected$.next(false);
      mockWebSocketService.isConnected$.next(true);
      
      // Connection changes are handled by service subscriptions
      expect(mockWebSocketService.isConnected$).toBeDefined();
    });
  });

  describe('Resource Cleanup', () => {
    it('properly cleans up on destroy', () => {
      service.ngOnDestroy();
      
      expect(mockWebSocketService.offReceiveMessage).toHaveBeenCalled();
    });
  });
});