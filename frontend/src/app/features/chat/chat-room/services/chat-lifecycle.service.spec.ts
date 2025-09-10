import { NgZone } from '@angular/core';
import { Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ChatLifecycleService } from './chat-lifecycle.service';
import { ChatSessionService } from '@services/chat-session.service';
import { LoadingService } from '@services/loading.service';
import { ThemeService } from '@services/theme.service';
import { MobileChatLayoutService } from './mobile-chat-layout.service';
import { ChatEventHandlerService } from './chat-event-handler.service';
import { ChatUiStateService } from './chat-ui-state.service';

describe('ChatLifecycleService (Business Logic)', () => {
  let service: ChatLifecycleService;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockChatSessionService: jasmine.SpyObj<ChatSessionService>;
  let mockLoadingService: jasmine.SpyObj<LoadingService>;
  let mockThemeService: jasmine.SpyObj<ThemeService>;
  let mockMobileChatLayoutService: jasmine.SpyObj<MobileChatLayoutService>;
  let mockChatEventHandlerService: jasmine.SpyObj<ChatEventHandlerService>;
  let mockChatUiStateService: jasmine.SpyObj<ChatUiStateService>;
  let mockNgZone: jasmine.SpyObj<NgZone>;

  beforeEach(() => {
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    mockChatSessionService = jasmine.createSpyObj('ChatSessionService', [
      'init', 'regenerateKeys', 'manuallyCheckKeyStatus'
    ]);
    
    mockLoadingService = jasmine.createSpyObj('LoadingService', ['show', 'hide']);
    mockThemeService = jasmine.createSpyObj('ThemeService', ['isDarkTheme']);
    mockMobileChatLayoutService = jasmine.createSpyObj('MobileChatLayoutService', ['forceUpdate']);
    mockChatEventHandlerService = jasmine.createSpyObj('ChatEventHandlerService', ['initializeEventHandlers', 'cleanup']);
    mockChatUiStateService = jasmine.createSpyObj('ChatUiStateService', [
      'getCurrentLoadingState', 'setMarkedMessagesAsRead'
    ]);
    
    mockNgZone = jasmine.createSpyObj('NgZone', ['run', 'runOutsideAngular']);
    mockNgZone.runOutsideAngular.and.callFake((fn) => fn());
    mockNgZone.run.and.callFake((fn) => fn());

    // Create mock BehaviorSubjects
    const mockTheirAvatar$ = new BehaviorSubject('avatar.jpg');
    const mockTheirUsername$ = new BehaviorSubject('TestUser');
    const mockMyPrivateKeyMissing$ = new BehaviorSubject(false);
    const mockKeyMissing$ = new BehaviorSubject(false);
    const mockShowPartnerKeyRegeneratedNotification$ = new BehaviorSubject(false);
    const mockTheme$ = new BehaviorSubject('light');

    // Use Object.defineProperty to add readonly properties
    Object.defineProperty(mockChatSessionService, 'theirAvatar$', { value: mockTheirAvatar$ });
    Object.defineProperty(mockChatSessionService, 'theirUsername$', { value: mockTheirUsername$ });
    Object.defineProperty(mockChatSessionService, 'myPrivateKeyMissing$', { value: mockMyPrivateKeyMissing$ });
    Object.defineProperty(mockChatSessionService, 'keyMissing$', { value: mockKeyMissing$ });
    Object.defineProperty(mockChatSessionService, 'showPartnerKeyRegeneratedNotification$', { value: mockShowPartnerKeyRegeneratedNotification$ });
    Object.defineProperty(mockChatSessionService, 'artificialKeyMissingState', { value: false, writable: true });
    Object.defineProperty(mockThemeService, 'theme$', { value: mockTheme$ });

    mockThemeService.isDarkTheme.and.returnValue(false);

    // Mock window properties
    Object.defineProperty(window, 'innerWidth', { value: 800, configurable: true });
    
    service = new ChatLifecycleService(
      mockRouter,
      mockChatSessionService,
      mockLoadingService,
      mockThemeService,
      mockMobileChatLayoutService,
      mockChatEventHandlerService,
      mockChatUiStateService,
      mockNgZone
    );
  });

  // Run: npm test -- --include="**/chat-lifecycle.service.spec.ts"
  describe('Chat Room Initialization', () => {
    it('initializes chat room successfully', async () => {
      mockChatSessionService.init.and.returnValue(Promise.resolve());
      const mockContainer = document.createElement('div');

      const result = await service.initializeChatRoom('receiver123', mockContainer);

      expect(result).toBe(true);
      expect(mockLoadingService.show).toHaveBeenCalledWith('chat-room-init');
      expect(mockChatSessionService.init).toHaveBeenCalledWith('receiver123');
      expect(mockChatEventHandlerService.initializeEventHandlers).toHaveBeenCalledWith('receiver123', mockContainer);
      expect(mockLoadingService.hide).toHaveBeenCalled();
    });

    it('handles missing receiver ID', async () => {
      spyOn(service, 'navigateToList');

      const result = await service.initializeChatRoom('');

      expect(result).toBe(false);
      expect(service.navigateToList).toHaveBeenCalled();
    });

    it('handles initialization failure', async () => {
      mockChatSessionService.init.and.returnValue(Promise.reject(new Error('Init failed')));
      spyOn(service, 'navigateToList');
      spyOn(console, 'error');

      const result = await service.initializeChatRoom('receiver123');

      expect(result).toBe(false);
      expect(service.navigateToList).toHaveBeenCalled();
      expect(console.error).toHaveBeenCalledWith('Chat initialization failed:', jasmine.any(Error));
      expect(mockLoadingService.hide).toHaveBeenCalled();
    });
  });

  describe('Navigation Handling', () => {
    it('navigates to chat list successfully', (done) => {
      mockRouter.navigate.and.returnValue(Promise.resolve(true));
      
      // Mock requestAnimationFrame to execute callback immediately
      spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      });

      service.navigateToList();

      setTimeout(() => {
        expect(mockLoadingService.show).toHaveBeenCalledWith('navigation');
        expect(mockRouter.navigate).toHaveBeenCalledWith(['/chat']);
        done();
      }, 10);
    });

    it('prevents default event when provided', (done) => {
      const mockEvent = jasmine.createSpyObj('Event', ['preventDefault']);
      mockRouter.navigate.and.returnValue(Promise.resolve(true));
      
      // Mock requestAnimationFrame to execute callback immediately
      spyOn(window, 'requestAnimationFrame').and.callFake((callback: FrameRequestCallback) => {
        callback(0);
        return 0;
      });

      service.navigateToList(mockEvent);

      setTimeout(() => {
        expect(mockEvent.preventDefault).toHaveBeenCalled();
        done();
      }, 10);
    });
  });

  describe('Chat Blocked Status Logic', () => {
    it('blocks chat when loading messages', () => {
      mockChatUiStateService.getCurrentLoadingState.and.returnValue(true);

      expect(service.isChatBlocked()).toBe(true);
    });

    it('blocks chat when private key missing', () => {
      mockChatUiStateService.getCurrentLoadingState.and.returnValue(false);
      mockChatSessionService.myPrivateKeyMissing$.next(true);

      expect(service.isChatBlocked()).toBe(true);
    });

    it('allows chat when no blocking conditions', () => {
      mockChatUiStateService.getCurrentLoadingState.and.returnValue(false);
      mockChatSessionService.myPrivateKeyMissing$.next(false);
      mockChatSessionService.keyMissing$.next(false);
      mockChatSessionService.showPartnerKeyRegeneratedNotification$.next(false);

      expect(service.isChatBlocked()).toBe(false);
    });
  });

  describe('Chat Input Placeholder Logic', () => {
    it('shows loading placeholder when messages loading', () => {
      mockChatUiStateService.getCurrentLoadingState.and.returnValue(true);

      expect(service.getChatInputPlaceholder()).toBe('Loading messages...');
    });

    it('shows private key missing placeholder', () => {
      mockChatUiStateService.getCurrentLoadingState.and.returnValue(false);
      mockChatSessionService.myPrivateKeyMissing$.next(true);
      mockChatSessionService.artificialKeyMissingState = false;

      expect(service.getChatInputPlaceholder()).toBe('Cannot send messages - you need to regenerate your encryption keys');
    });

    it('shows default placeholder when no blocking conditions', () => {
      mockChatUiStateService.getCurrentLoadingState.and.returnValue(false);
      mockChatSessionService.myPrivateKeyMissing$.next(false);
      mockChatSessionService.showPartnerKeyRegeneratedNotification$.next(false);
      mockChatSessionService.keyMissing$.next(false);

      expect(service.getChatInputPlaceholder()).toBe('Type a message...');
    });
  });

  describe('Key Management Operations', () => {
    it('regenerates keys with user confirmation', async () => {
      spyOn(window, 'confirm').and.returnValue(true);
      mockChatSessionService.regenerateKeys.and.returnValue(Promise.resolve());

      await service.regenerateEncryptionKeys();

      expect(window.confirm).toHaveBeenCalledWith(jasmine.stringContaining('Your encryption keys are missing'));
      expect(mockChatSessionService.regenerateKeys).toHaveBeenCalled();
    });

    it('skips regeneration when user cancels', async () => {
      spyOn(window, 'confirm').and.returnValue(false);

      await service.regenerateEncryptionKeys();

      expect(mockChatSessionService.regenerateKeys).not.toHaveBeenCalled();
    });

    it('handles key regeneration failure', async () => {
      spyOn(window, 'confirm').and.returnValue(true);
      spyOn(window, 'alert');
      spyOn(console, 'error');
      mockChatSessionService.regenerateKeys.and.returnValue(Promise.reject(new Error('Regen failed')));

      await service.regenerateEncryptionKeys();

      expect(console.error).toHaveBeenCalledWith('[ChatRoom] Failed to regenerate keys:', jasmine.any(Error));
      expect(window.alert).toHaveBeenCalledWith('Failed to regenerate encryption keys. Please try again or contact support.');
    });

    it('checks partner key status', () => {
      service.checkPartnerKeyStatus();

      expect(mockChatSessionService.manuallyCheckKeyStatus).toHaveBeenCalled();
    });
  });

  describe('Service Cleanup', () => {
    it('cleans up and resets state', () => {
      service.cleanup();

      expect(mockChatUiStateService.setMarkedMessagesAsRead).toHaveBeenCalledWith(false);
      expect(mockChatEventHandlerService.cleanup).toHaveBeenCalled();
    });
  });
});