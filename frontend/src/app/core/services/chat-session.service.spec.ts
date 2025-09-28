import { ChatSessionService } from './chat-session.service';
import { WebSocketService } from './websocket.service';
import { MessagesService } from './messages.service';
import { UserService } from './user.service';
import { CryptoService } from './crypto.service';
import { VaultService } from './vault.service';
import { NgZone } from '@angular/core';
import { of, Subject, BehaviorSubject } from 'rxjs';

describe('ChatSessionService (Chat State Management)', () => {
  let service: ChatSessionService;
  let mockWebSocketService: jasmine.SpyObj<WebSocketService>;
  let mockMessagesService: jasmine.SpyObj<MessagesService>;
  let mockUserService: jasmine.SpyObj<UserService>;
  let mockCryptoService: jasmine.SpyObj<CryptoService>;
  let mockVaultService: jasmine.SpyObj<VaultService>;
  let mockNgZone: jasmine.SpyObj<NgZone>;

  beforeEach(() => {
    // Mock localStorage
    spyOn(Storage.prototype, 'getItem').and.callFake((key: string) => {
      if (key === 'userId') return 'test-user-123';
      if (key === 'myAvatar') return 'test-avatar.jpg';
      if (key === 'authToken') return 'test-auth-token';
      return null;
    });

    // Create service mocks
    mockWebSocketService = jasmine.createSpyObj('WebSocketService', [
      'onReceiveMessage', 'onMessageEdited', 'onMessageDeleted', 'onMessageSent', 
      'onMessageRead', 'onKeyRegenerated', 'offReceiveMessage', 'offMessageEdited',
      'offMessageDeleted', 'offMessageRead', 'offKeyRegenerated', 'sendMessage',
      'sendTyping', 'markMessageRead', 'sendEditMessage', 'sendDeleteMessage',
      'notifyKeyRegenerated', 'isConnected', 'isUserOnline'
    ], {
      isConnected$: new BehaviorSubject<boolean>(true),
      typing$: new Subject()
    });

    mockMessagesService = jasmine.createSpyObj('MessagesService', ['getMessageHistory']);
    mockUserService = jasmine.createSpyObj('UserService', ['getPublicKey', 'uploadPublicKey', 'markKeysAsMissing']);
    mockCryptoService = jasmine.createSpyObj('CryptoService', [
      'hasPrivateKeyInVault', 'importPrivateKey', 'hasPrivateKey', 'clearPrivateKey',
      'encryptWithPublicKey', 'decryptMessage', 'generateKeyPair', 'exportPrivateKey',
      'exportCurrentPublicKey'
    ]);
    mockVaultService = jasmine.createSpyObj('VaultService', [
      'setCurrentUser', 'waitUntilReady', 'get', 'set', 'keysStartingWith'
    ]);
    mockNgZone = jasmine.createSpyObj('NgZone', ['run', 'runOutsideAngular']);

    // Setup default mock behaviors
    mockWebSocketService.isConnected.and.returnValue(true);
    mockWebSocketService.isUserOnline.and.returnValue(false);
    mockNgZone.run.and.callFake((fn) => fn());
    mockNgZone.runOutsideAngular.and.callFake((fn) => fn());

    service = new ChatSessionService(
      mockWebSocketService,
      mockMessagesService,
      mockUserService,
      mockCryptoService,
      mockVaultService,
      mockNgZone
    );
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  // Run: npm test -- --include="**/chat-session.service.spec.ts"
  describe('Service Initialization', () => {
    it('creates service instance with initial state', () => {
      expect(service).toBeDefined();
      expect(service.theirUsername$.value).toBe('');
      expect(service.theirAvatar$.value).toBe('assets/images/avatars/01.svg');
      expect(service.messages$.value).toEqual([]);
      expect(service.keyLoading$.value).toBe(true);
      expect(service.keyMissing$.value).toBe(false);
    });

    it('initializes with correct default observable states', () => {
      expect(service.partnerTyping$.value).toBe(false);
      expect(service.messagesLoading$.value).toBe(true);
      expect(service.myPrivateKeyMissing$.value).toBe(false);
    });

    it('sets up WebSocket event handlers during initialization', () => {
      // Event handlers are set up in constructor, so they should already be called
      expect(mockWebSocketService.onMessageEdited).toHaveBeenCalled();
      expect(mockWebSocketService.onMessageDeleted).toHaveBeenCalled();
      expect(mockWebSocketService.onMessageSent).toHaveBeenCalled();
    });
  });

  describe('Partner Online Status', () => {
    it('tracks partner online status', () => {
      expect(service.getPartnerOnlineStatus()).toBe(false);
    });

    it('provides online status through getter', () => {
      const status = service.getPartnerOnlineStatus();
      expect(typeof status).toBe('boolean');
    });
  });

  describe('Typing Functionality', () => {
    it('sends typing indicator when connected', () => {
      mockWebSocketService.isConnected.and.returnValue(true);
      service['roomId'] = 'test-room';
      
      service.sendTyping();
      
      expect(mockWebSocketService.sendTyping).toHaveBeenCalledWith('test-room');
    });

    it('does not send typing when disconnected', () => {
      mockWebSocketService.isConnected.and.returnValue(false);
      service['roomId'] = 'test-room';
      
      service.sendTyping();
      
      expect(mockWebSocketService.sendTyping).not.toHaveBeenCalled();
    });

    it('does not send typing when room ID is not set', () => {
      mockWebSocketService.isConnected.and.returnValue(true);
      service['roomId'] = '';
      
      service.sendTyping();
      
      expect(mockWebSocketService.sendTyping).not.toHaveBeenCalled();
    });
  });

  describe('Key State Management', () => {
    it('provides artificial key missing state getter', () => {
      expect(service.isArtificialKeyMissingState).toBe(false);
    });

    it('tracks artificial key missing state changes', () => {
      service['artificialKeyMissingState'] = true;
      expect(service.isArtificialKeyMissingState).toBe(true);
    });

    it('provides automatic key generation state getter', () => {
      expect(service.isGeneratingKeysAutomatically).toBe(false);
    });

    it('tracks automatic key generation state', () => {
      service['isGeneratingKeysForNewUser'] = true;
      expect(service.isGeneratingKeysAutomatically).toBe(true);
    });
  });

  describe('Partner Key Regeneration Notifications', () => {
    it('initializes with notification dismissed', () => {
      expect(service.showPartnerKeyRegeneratedNotification$.value).toBe(false);
    });

    it('dismisses partner key regeneration notification', () => {
      service.showPartnerKeyRegeneratedNotification$.next(true);
      expect(service.showPartnerKeyRegeneratedNotification$.value).toBe(true);
      
      service.dismissPartnerKeyRegeneratedNotification();
      
      expect(service.showPartnerKeyRegeneratedNotification$.value).toBe(false);
    });
  });

  describe('Manual Key Status Check', () => {
    it('triggers manual key status check', () => {
      service['roomId'] = 'test-room';
      mockUserService.getPublicKey.and.returnValue(of({
        publicKeyBundle: 'test-key',
        username: 'partner',
        avatarUrl: 'partner-avatar.jpg',
        hasPublicKey: true,
        isKeyMissing: false
      }));
      
      service.manuallyCheckKeyStatus();
      
      expect(mockUserService.getPublicKey).toHaveBeenCalledWith('test-room');
    });

    it('handles manual check when room ID not set', () => {
      service['roomId'] = '';
      
      service.manuallyCheckKeyStatus();
      
      expect(mockUserService.getPublicKey).not.toHaveBeenCalled();
    });
  });

  describe('Message Status Updates', () => {
    it('handles message status updates for pending messages', () => {
      const pendingMessage = {
        sender: 'You',
        text: 'test message',
        ts: 12345,
        status: 'pending' as const,
        avatarUrl: 'avatar.jpg'
      };
      
      service.messages$.next([pendingMessage]);
      service['updateMessageStatus']('pending::12345', 'sent');
      
      const updatedMessages = service.messages$.value;
      expect(updatedMessages[0].status).toBe('sent');
    });

    it('handles failed message status', () => {
      const pendingMessage = {
        sender: 'You',
        text: 'test message',
        ts: 12345,
        status: 'pending' as const,
        avatarUrl: 'avatar.jpg'
      };
      
      service.messages$.next([pendingMessage]);
      service['updateMessageStatus']('pending::12345', 'failed');
      
      const updatedMessages = service.messages$.value;
      expect(updatedMessages[0].status).toBe('failed');
    });
  });

  describe('Base64 Validation', () => {
    it('validates correct base64 strings', () => {
      const validBase64 = 'SGVsbG8gV29ybGQ='; // "Hello World"
      expect(service['isValidBase64'](validBase64)).toBe(true);
    });

    it('rejects invalid base64 strings', () => {
      expect(service['isValidBase64']('invalid-base64!')).toBe(false);
      expect(service['isValidBase64']('not@valid#base64')).toBe(false);
    });

    it('rejects strings with incorrect length', () => {
      expect(service['isValidBase64']('abc')).toBe(false); // Length not multiple of 4
    });

    it('handles null and undefined values', () => {
      expect(service['isValidBase64'](null as unknown as string)).toBe(false);
      expect(service['isValidBase64'](undefined as unknown as string)).toBe(false);
    });

    it('handles empty strings', () => {
      expect(service['isValidBase64']('')).toBe(false); // Empty string is not valid base64
    });
  });

  describe('System Message Detection', () => {
    it('identifies system message texts correctly', () => {
      expect(service['isSystemMessageText']('Message deleted')).toBe(true);
      expect(service['isSystemMessageText']('Encrypted message (from partner)')).toBe(true);
      expect(service['isSystemMessageText']('Encrypted message (sent by you)')).toBe(true);
      expect(service['isSystemMessageText']('Message encrypted with previous keys (unreadable after key regeneration)')).toBe(true);
    });

    it('identifies regular user messages correctly', () => {
      expect(service['isSystemMessageText']('Hello there!')).toBe(false);
      expect(service['isSystemMessageText']('How are you doing?')).toBe(false);
      expect(service['isSystemMessageText']('Regular chat message')).toBe(false);
    });

    it('handles empty and whitespace messages', () => {
      expect(service['isSystemMessageText']('')).toBe(false);
      expect(service['isSystemMessageText']('   ')).toBe(false);
      expect(service['isSystemMessageText']('\n\t')).toBe(false);
    });
  });

  describe('Time Ago Message Generation', () => {
    it('generates appropriate time messages for different intervals', () => {
      const now = Date.now();
      
      // Recent message (over 30 minutes but under 1 hour)
      const recentTimestamp = now - (45 * 60 * 1000);
      expect(service['getTimeAgoMessage'](recentTimestamp)).toBe('Message sent recently');
      
      // Very recent message (under 30 minutes)
      const momentsTimestamp = now - (5 * 60 * 1000);
      expect(service['getTimeAgoMessage'](momentsTimestamp)).toBe('Message sent moments ago');
    });

    it('generates hour-based messages correctly', () => {
      const now = Date.now();
      const hoursAgo = now - (2 * 60 * 60 * 1000); // 2 hours ago
      
      expect(service['getTimeAgoMessage'](hoursAgo)).toBe('Message sent 2 hours ago');
    });

    it('generates day-based messages correctly', () => {
      const now = Date.now();
      const daysAgo = now - (3 * 24 * 60 * 60 * 1000); // 3 days ago
      
      expect(service['getTimeAgoMessage'](daysAgo)).toBe('Message sent 3 days ago');
    });

    it('handles singular vs plural time units', () => {
      const now = Date.now();
      const oneHourAgo = now - (1 * 60 * 60 * 1000);
      const oneDayAgo = now - (1 * 24 * 60 * 60 * 1000);
      
      expect(service['getTimeAgoMessage'](oneHourAgo)).toBe('Message sent 1 hour ago');
      expect(service['getTimeAgoMessage'](oneDayAgo)).toBe('Message sent 1 day ago');
    });
  });

  describe('Message Duplicate Detection', () => {
    it('prevents duplicate messages by ID', () => {
      const message1 = {
        id: 'msg-123',
        sender: 'You',
        text: 'test message',
        ts: 12345,
        avatarUrl: 'avatar.jpg'
      };
      
      const message2 = {
        id: 'msg-123',
        sender: 'You', 
        text: 'different text',
        ts: 54321,
        avatarUrl: 'avatar.jpg'
      };
      
      service['push'](message1);
      service['push'](message2);
      
      const messages = service.messages$.value;
      expect(messages).toHaveSize(1);
      expect(messages[0]).toEqual(message1);
    });

    it('prevents duplicate messages by timestamp and sender', () => {
      const message1 = {
        sender: 'Partner',
        text: 'test message',
        ts: 12345,
        avatarUrl: 'avatar.jpg'
      };
      
      const message2 = {
        sender: 'Partner',
        text: 'test message',
        ts: 12345,
        avatarUrl: 'avatar.jpg'
      };
      
      service['push'](message1);
      service['push'](message2);
      
      const messages = service.messages$.value;
      expect(messages).toHaveSize(1);
    });

    it('allows messages with same timestamp but different content', () => {
      const message1 = {
        sender: 'Partner',
        text: 'first message',
        ts: 12345,
        avatarUrl: 'avatar.jpg'
      };
      
      const message2 = {
        sender: 'Partner',
        text: 'second message',
        ts: 12345,
        avatarUrl: 'avatar.jpg'
      };
      
      service['push'](message1);
      service['push'](message2);
      
      const messages = service.messages$.value;
      expect(messages).toHaveSize(2);
    });
  });

  describe('Message Sorting and Ordering', () => {
    it('sorts messages by timestamp in ascending order', () => {
      const message1 = {
        sender: 'You',
        text: 'first',
        ts: 12345,
        avatarUrl: 'avatar.jpg'
      };
      
      const message2 = {
        sender: 'Partner',
        text: 'second',
        ts: 11111,
        avatarUrl: 'avatar.jpg'
      };
      
      const message3 = {
        sender: 'You',
        text: 'third',
        ts: 13579,
        avatarUrl: 'avatar.jpg'
      };
      
      service['push'](message1);
      service['push'](message2);
      service['push'](message3);
      
      const messages = service.messages$.value;
      expect(messages[0].ts).toBe(11111);
      expect(messages[1].ts).toBe(12345);
      expect(messages[2].ts).toBe(13579);
    });
  });

  describe('Vault Key Generation', () => {
    it('generates vault keys with correct format', () => {
      service['roomId'] = 'room456';
      
      const key = service['key']('test-suffix');
      expect(key).toBe('sent_test-user-123_room456/test-suffix');
    });

    it('handles different suffix types', () => {
      service['roomId'] = 'room456';
      
      expect(service['key']('pending::12345')).toBe('sent_test-user-123_room456/pending::12345');
      expect(service['key']('server::67890')).toBe('sent_test-user-123_room456/server::67890');
      expect(service['key']('msg-id-123')).toBe('sent_test-user-123_room456/msg-id-123');
    });
  });

  describe('State Reset Operations', () => {
    it('force resets blocking state', () => {
      mockUserService.getPublicKey.and.returnValue(of({
        publicKeyBundle: 'test-key',
        username: 'test-user',
        avatarUrl: 'avatar.jpg',
        hasPublicKey: true,
        isKeyMissing: false
      }));
      
      service['artificialKeyMissingState'] = true;
      service.myPrivateKeyMissing$.next(true);
      service.keyLoading$.next(true);
      service.keyMissing$.next(true);
      service['roomId'] = 'test-room';
      
      service.forceResetBlockingState();
      
      expect(service['artificialKeyMissingState']).toBe(false);
      expect(service.myPrivateKeyMissing$.value).toBe(false);
      expect(service.keyLoading$.value).toBe(false);
      expect(service.keyMissing$.value).toBe(false);
    });
  });

  describe('Loading Operations Management', () => {
    it('tracks loading operations count', () => {
      expect(service['loadingOperations']).toBe(0);
      
      service['startLoadingOperation']();
      expect(service['loadingOperations']).toBe(1);
      
      service['startLoadingOperation']();
      expect(service['loadingOperations']).toBe(2);
    });

    it('finishes loading operations and updates messages when count reaches zero', () => {
      service['tempMessages'] = [{
        sender: 'Partner',
        text: 'temp message',
        ts: 12345,
        avatarUrl: 'avatar.jpg'
      }];
      
      service['startLoadingOperation']();
      service['finishLoadingOperation']();
      
      expect(service['loadingOperations']).toBe(0);
      expect(service.messagesLoading$.value).toBe(false);
      expect(service.messages$.value).toHaveSize(1);
    });

    it('does not finish loading until all operations complete', () => {
      service['startLoadingOperation']();
      service['startLoadingOperation']();
      
      service['finishLoadingOperation']();
      expect(service['loadingOperations']).toBe(1);
      expect(service.messagesLoading$.value).toBe(true);
      
      service['finishLoadingOperation']();
      expect(service['loadingOperations']).toBe(0);
      expect(service.messagesLoading$.value).toBe(false);
    });
  });

  describe('Service Cleanup', () => {
    it('cleans up subscriptions on destroy', () => {
      service.ngOnDestroy();
      
      expect(mockWebSocketService.offMessageEdited).toHaveBeenCalled();
      expect(mockWebSocketService.offReceiveMessage).toHaveBeenCalled();
      expect(mockWebSocketService.offMessageDeleted).toHaveBeenCalled();
    });

    it('resets initialization flags on destroy', () => {
      service['isInitialized'] = true;
      service['isInitializing'] = true;
      
      service.ngOnDestroy();
      
      expect(service['isInitialized']).toBe(false);
      expect(service['isInitializing']).toBe(false);
    });

    it('cleans up loading state on destroy', () => {
      service['loadingOperations'] = 5;
      service['tempMessages'] = [{ sender: 'Test', text: 'test', ts: 123, avatarUrl: '' }];
      
      service.ngOnDestroy();
      
      expect(service['loadingOperations']).toBe(0);
      expect(service['tempMessages']).toEqual([]);
    });
  });

  describe('Delay Utility', () => {
    it('provides delay functionality', async () => {
      const startTime = Date.now();
      await service['delay'](100);
      const endTime = Date.now();
      
      expect(endTime - startTime).toBeGreaterThanOrEqual(90); // Allow some tolerance
    });
  });
});