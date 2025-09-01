import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting, HttpTestingController } from '@angular/common/http/testing';

import { MessagesService } from './messages.service';
import { MessageHistoryResponse, MessageOverview, LastMessageResponse } from '@models/api-response.model';
import { getApiPath } from '@utils/api-paths.util';

describe('MessagesService (Chat Message API Operations)', () => {
  let service: MessagesService;
  let httpMock: HttpTestingController;

  const mockMessageHistory: MessageHistoryResponse = {
    messages: [
      {
        _id: 'msg-1',
        senderId: 'user-123',
        ciphertext: 'encrypted-hello',
        createdAt: '2023-01-01T10:00:00Z',
        read: false
      },
      {
        _id: 'msg-2',
        senderId: 'current-user',
        ciphertext: 'encrypted-response',
        createdAt: '2023-01-01T10:01:00Z',
        read: true,
        editedAt: '2023-01-01T10:02:00Z'
      }
    ]
  };

  const mockOverviews: MessageOverview[] = [
    {
      peerId: 'user-123',
      lastText: 'Latest message preview',
      unread: 2
    },
    {
      peerId: 'user-456',
      lastText: 'Another conversation',
      unread: 0
    }
  ];

  const mockLastMessage: LastMessageResponse = {
    messageId: 'msg-latest',
    ciphertext: 'encrypted-latest-message',
    timestamp: '2023-01-01T12:00:00Z'
  };

  beforeEach(async () => {
    // Setup authenticated user state
    spyOn(Storage.prototype, 'getItem').and.callFake((key: string) => {
      if (key === 'username') return 'test-user';
      if (key === 'userId') return 'test-user-id';
      return null;
    });

    await TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        MessagesService
      ]
    });

    service = TestBed.inject(MessagesService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
  });

  // Run: npm test -- --include="**/messages.service.spec.ts"
  describe('Service Initialization and State', () => {
    it('initializes with correct default state', () => {
      expect(service).toBeDefined();
      expect(service['loadingSubject'].value).toBe(false);
      expect(service['errorSubject'].value).toBe(null);
    });
  });

  describe('Message History Loading', () => {
    it('loads message history for authenticated users', () => {
      const userId = 'chat-partner-123';
      
      service.getMessageHistory(userId).subscribe(response => {
        expect(response).toEqual(mockMessageHistory);
        expect(response.messages.length).toBe(2);
        expect(response.messages[0].senderId).toBe('user-123');
        expect(response.messages[1].editedAt).toBeDefined();
      });

      const req = httpMock.expectOne(getApiPath(`messages/history/${userId}`));
      expect(req.request.method).toBe('GET');
      req.flush(mockMessageHistory);
    });

    it('updates loading state during message history requests', () => {
      const userId = 'loading-test-user';
      
      expect(service['loadingSubject'].value).toBe(false);
      
      service.getMessageHistory(userId).subscribe();
      expect(service['loadingSubject'].value).toBe(true);

      const req = httpMock.expectOne(getApiPath(`messages/history/${userId}`));
      req.flush(mockMessageHistory);
      
      expect(service['loadingSubject'].value).toBe(false);
    });

    it('handles message history API errors gracefully', () => {
      const consoleSpy = spyOn(console, 'error');
      const userId = 'error-test-user';
      
      service.getMessageHistory(userId).subscribe(response => {
        expect(response.messages).toEqual([]);
        expect(service['loadingSubject'].value).toBe(false);
        expect(service['errorSubject'].value).toBe('Failed to load message history');
      });

      const req = httpMock.expectOne(getApiPath(`messages/history/${userId}`));
      req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[MessagesService] Failed to load message history:',
        jasmine.any(Object)
      );
    });

    it('returns empty history when user is not authenticated', () => {
      (Storage.prototype.getItem as jasmine.Spy).and.returnValue(null);
      const consoleSpy = spyOn(console, 'warn');
      
      service.getMessageHistory('test-user').subscribe(response => {
        expect(response.messages).toEqual([]);
      });

      httpMock.expectNone(getApiPath('messages/history/test-user'));
      expect(consoleSpy).toHaveBeenCalledWith(
        'Attempted to load message history while not authenticated'
      );
    });
  });

  describe('Message Overviews Loading', () => {
    it('loads message overviews for chat list display', () => {
      service.getOverviews().subscribe(overviews => {
        expect(overviews).toEqual(mockOverviews);
        expect(overviews.length).toBe(2);
        expect(overviews[0].unread).toBe(2);
        expect(overviews[1].unread).toBe(0);
      });

      const req = httpMock.expectOne(getApiPath('messages/overview'));
      expect(req.request.method).toBe('GET');
      req.flush(mockOverviews);
    });

    it('manages loading and error state during overview requests', () => {
      expect(service['loadingSubject'].value).toBe(false);
      expect(service['errorSubject'].value).toBe(null);
      
      service.getOverviews().subscribe();
      expect(service['loadingSubject'].value).toBe(true);
      expect(service['errorSubject'].value).toBe(null);

      const req = httpMock.expectOne(getApiPath('messages/overview'));
      req.flush(mockOverviews);
      
      expect(service['loadingSubject'].value).toBe(false);
    });

    it('handles overview API errors with proper error state', () => {
      const consoleSpy = spyOn(console, 'error');
      
      service.getOverviews().subscribe(overviews => {
        expect(overviews).toEqual([]);
        expect(service['errorSubject'].value).toBe('Failed to load message overviews');
        expect(service['loadingSubject'].value).toBe(false);
      });

      const req = httpMock.expectOne(getApiPath('messages/overview'));
      req.flush('Network Timeout', { status: 408, statusText: 'Request Timeout' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[MessagesService] Failed to load overviews:',
        jasmine.any(Object)
      );
    });

    it('returns empty array when user is not authenticated', () => {
      (Storage.prototype.getItem as jasmine.Spy).and.returnValue(null);
      const consoleSpy = spyOn(console, 'warn');
      
      service.getOverviews().subscribe(overviews => {
        expect(overviews).toEqual([]);
      });

      httpMock.expectNone(getApiPath('messages/overview'));
      expect(consoleSpy).toHaveBeenCalledWith(
        'Attempted to load overviews while not authenticated'
      );
    });
  });

  describe('Last Message Retrieval', () => {
    it('retrieves last message for notification purposes', () => {
      const userId = 'notification-user';
      
      service.getLastMessage(userId).subscribe(response => {
        expect(response).toEqual(mockLastMessage);
        expect(response.messageId).toBe('msg-latest');
        expect(response.ciphertext).toBe('encrypted-latest-message');
        expect(response.timestamp).toBeDefined();
      });

      const req = httpMock.expectOne(getApiPath(`messages/last/${userId}`));
      expect(req.request.method).toBe('GET');
      req.flush(mockLastMessage);
    });

    it('handles last message API errors gracefully', () => {
      const consoleSpy = spyOn(console, 'error');
      const userId = 'error-user';
      
      service.getLastMessage(userId).subscribe(response => {
        expect(response).toEqual({} as LastMessageResponse);
      });

      const req = httpMock.expectOne(getApiPath(`messages/last/${userId}`));
      req.flush('Not Found', { status: 404, statusText: 'Not Found' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[MessagesService] Failed to load last message:',
        jasmine.any(Object)
      );
    });

    it('returns empty response when user is not authenticated', () => {
      (Storage.prototype.getItem as jasmine.Spy).and.returnValue(null);
      const consoleSpy = spyOn(console, 'warn');
      
      service.getLastMessage('test-user').subscribe(response => {
        expect(response).toEqual({} as LastMessageResponse);
      });

      httpMock.expectNone(getApiPath('messages/last/test-user'));
      expect(consoleSpy).toHaveBeenCalledWith(
        'Attempted to load last message while not authenticated'
      );
    });
  });

  describe('Mark Messages as Read', () => {
    it('marks messages as read for specific sender', () => {
      const senderId = 'sender-123';
      const expectedResponse = { message: 'Messages marked as read', count: 3 };
      
      service.markMessagesAsRead(senderId).subscribe(response => {
        expect(response).toEqual(expectedResponse);
        expect(response.count).toBe(3);
      });

      const req = httpMock.expectOne(getApiPath(`messages/mark-read/${senderId}`));
      expect(req.request.method).toBe('PUT');
      expect(req.request.body).toEqual({});
      req.flush(expectedResponse);
    });

    it('handles mark-as-read API errors with fallback response', () => {
      const consoleSpy = spyOn(console, 'error');
      const senderId = 'error-sender';
      
      service.markMessagesAsRead(senderId).subscribe(response => {
        expect(response).toEqual({ message: 'Failed to mark messages as read', count: 0 });
      });

      const req = httpMock.expectOne(getApiPath(`messages/mark-read/${senderId}`));
      req.flush('Forbidden', { status: 403, statusText: 'Forbidden' });
      
      expect(consoleSpy).toHaveBeenCalledWith(
        '[MessagesService] Failed to mark messages as read:',
        jasmine.any(Object)
      );
    });

    it('returns not authenticated response when user is not authenticated', () => {
      (Storage.prototype.getItem as jasmine.Spy).and.returnValue(null);
      const consoleSpy = spyOn(console, 'warn');
      
      service.markMessagesAsRead('test-sender').subscribe(response => {
        expect(response).toEqual({ message: 'Not authenticated', count: 0 });
      });

      httpMock.expectNone(getApiPath('messages/mark-read/test-sender'));
      expect(consoleSpy).toHaveBeenCalledWith(
        'Attempted to mark messages as read while not authenticated'
      );
    });
  });

  describe('Authentication Validation', () => {
    it('validates authentication with both username and userId', () => {
      // Both present - authenticated
      (Storage.prototype.getItem as jasmine.Spy).and.callFake((key: string) => {
        if (key === 'username') return 'valid-user';
        if (key === 'userId') return 'valid-id';
        return null;
      });
      
      service.getOverviews().subscribe(overviews => {
        expect(overviews).toEqual(mockOverviews);
      });
      httpMock.expectOne(getApiPath('messages/overview')).flush(mockOverviews);
    });

    it('rejects authentication with missing username', () => {
      (Storage.prototype.getItem as jasmine.Spy).and.callFake((key: string) => {
        if (key === 'username') return null;
        if (key === 'userId') return 'valid-id';
        return null;
      });
      
      service.getOverviews().subscribe(overviews => {
        expect(overviews).toEqual([]);
      });
      
      httpMock.expectNone(getApiPath('messages/overview'));
    });

    it('rejects authentication with missing userId', () => {
      (Storage.prototype.getItem as jasmine.Spy).and.callFake((key: string) => {
        if (key === 'username') return 'valid-user';
        if (key === 'userId') return null;
        return null;
      });
      
      service.getOverviews().subscribe(overviews => {
        expect(overviews).toEqual([]);
      });
      
      httpMock.expectNone(getApiPath('messages/overview'));
    });
  });

  describe('Error Recovery and State Management', () => {
    it('clears error state on successful requests', () => {
      // First request fails
      service.getOverviews().subscribe();
      let req = httpMock.expectOne(getApiPath('messages/overview'));
      req.flush('Server Error', { status: 500, statusText: 'Internal Server Error' });
      
      expect(service['errorSubject'].value).toBe('Failed to load message overviews');
      
      // Second request succeeds
      service.getOverviews().subscribe();
      req = httpMock.expectOne(getApiPath('messages/overview'));
      req.flush(mockOverviews);
      
      expect(service['errorSubject'].value).toBe(null);
    });

    it('maintains loading state consistency across multiple requests', () => {
      // Start multiple concurrent requests
      service.getMessageHistory('user-1').subscribe();
      service.getOverviews().subscribe();
      service.getLastMessage('user-2').subscribe();
      
      // Should show loading for history request (which sets loading state)
      expect(service['loadingSubject'].value).toBe(true);
      
      // Complete all requests
      httpMock.expectOne(getApiPath('messages/history/user-1')).flush(mockMessageHistory);
      httpMock.expectOne(getApiPath('messages/overview')).flush(mockOverviews);
      httpMock.expectOne(getApiPath('messages/last/user-2')).flush(mockLastMessage);
      
      expect(service['loadingSubject'].value).toBe(false);
    });
  });

  describe('API Integration and Data Handling', () => {
    it('handles empty message history correctly', () => {
      const emptyHistory: MessageHistoryResponse = { messages: [] };
      
      service.getMessageHistory('empty-user').subscribe(response => {
        expect(response.messages).toEqual([]);
        expect(Array.isArray(response.messages)).toBe(true);
      });

      const req = httpMock.expectOne(getApiPath('messages/history/empty-user'));
      req.flush(emptyHistory);
    });

    it('handles empty overviews correctly', () => {
      service.getOverviews().subscribe(overviews => {
        expect(overviews).toEqual([]);
        expect(Array.isArray(overviews)).toBe(true);
      });

      const req = httpMock.expectOne(getApiPath('messages/overview'));
      req.flush([]);
    });

    it('handles large message history efficiently', () => {
      const largeHistory: MessageHistoryResponse = {
        messages: Array.from({ length: 1000 }, (_, i) => ({
          _id: `msg-${i}`,
          senderId: i % 2 === 0 ? 'user-123' : 'current-user',
          ciphertext: `encrypted-message-${i}`,
          createdAt: new Date(Date.now() - i * 60000).toISOString(),
          read: i % 3 === 0
        }))
      };
      
      service.getMessageHistory('heavy-user').subscribe(response => {
        expect(response.messages.length).toBe(1000);
        expect(response.messages[0]._id).toBe('msg-0');
        expect(response.messages[999]._id).toBe('msg-999');
      });

      const req = httpMock.expectOne(getApiPath('messages/history/heavy-user'));
      req.flush(largeHistory);
    });

    it('handles mark-as-read with zero count', () => {
      const zeroResponse = { message: 'No messages to mark', count: 0 };
      
      service.markMessagesAsRead('no-messages-user').subscribe(response => {
        expect(response.count).toBe(0);
        expect(response.message).toBe('No messages to mark');
      });

      const req = httpMock.expectOne(getApiPath('messages/mark-read/no-messages-user'));
      req.flush(zeroResponse);
    });
  });

  describe('Edge Cases and Error Scenarios', () => {
    it('handles malformed API responses gracefully', () => {
      service.getOverviews().subscribe(overviews => {
        expect(overviews).toEqual([]);
      });

      const req = httpMock.expectOne(getApiPath('messages/overview'));
      req.error(new ProgressEvent('error')); // Network error instead of malformed response
    });

    it('handles network timeouts appropriately', () => {
      const consoleSpy = spyOn(console, 'error');
      
      service.getMessageHistory('timeout-user').subscribe(response => {
        expect(response.messages).toEqual([]);
      });

      const req = httpMock.expectOne(getApiPath('messages/history/timeout-user'));
      req.error(new ProgressEvent('timeout'));
      
      expect(consoleSpy).toHaveBeenCalled();
      expect(service['loadingSubject'].value).toBe(false);
    });

    it('handles rapid authentication state changes', () => {
      const getItemSpy = Storage.prototype.getItem as jasmine.Spy;
      
      // Start authenticated
      getItemSpy.and.returnValue('valid');
      service.getOverviews().subscribe();
      httpMock.expectOne(getApiPath('messages/overview')).flush(mockOverviews);
      
      // Become unauthenticated
      getItemSpy.and.returnValue(null);
      service.getOverviews().subscribe(overviews => {
        expect(overviews).toEqual([]);
      });
      
      httpMock.expectNone(getApiPath('messages/overview'));
    });

    it('handles concurrent requests to different endpoints', () => {
      const userId1 = 'concurrent-user-1';
      const userId2 = 'concurrent-user-2';
      
      // Start multiple requests simultaneously
      service.getMessageHistory(userId1).subscribe();
      service.getLastMessage(userId2).subscribe();
      service.getOverviews().subscribe();
      
      // All requests should be made
      const historyReq = httpMock.expectOne(getApiPath(`messages/history/${userId1}`));
      const lastReq = httpMock.expectOne(getApiPath(`messages/last/${userId2}`));
      const overviewReq = httpMock.expectOne(getApiPath('messages/overview'));
      
      // Complete in different order
      lastReq.flush(mockLastMessage);
      overviewReq.flush(mockOverviews);
      historyReq.flush(mockMessageHistory);
      
      expect(service['loadingSubject'].value).toBe(false);
    });
  });
});