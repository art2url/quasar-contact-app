import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { provideHttpClient } from '@angular/common/http';
import { of } from 'rxjs';

import { ChatListComponent } from './chat-list.component';
import { ScrollService } from '@services/scroll.service';
import { AuthService } from '@services/auth.service';
import { WebSocketService } from '@services/websocket.service';
import { NotificationService } from '@services/notification.service';
import { MessagesService } from '@services/messages.service';
import { UserService } from '@services/user.service';
import { CryptoService } from '@services/crypto.service';
import { VaultService } from '@services/vault.service';
import { LoadingService } from '@services/loading.service';
import { ChatMessageService } from '../chat-room/services/chat-message.service';

describe('ChatListComponent', () => {
  let component: ChatListComponent;
  let fixture: ComponentFixture<ChatListComponent>;

  beforeEach(async () => {
    // Mock window.matchMedia for BreakpointObserver
    Object.defineProperty(window, 'matchMedia', {
      writable: true,
      value: (query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addListener: jasmine.createSpy('addListener'),
        removeListener: jasmine.createSpy('removeListener'),
        addEventListener: jasmine.createSpy('addEventListener'),
        removeEventListener: jasmine.createSpy('removeEventListener'),
        dispatchEvent: jasmine.createSpy('dispatchEvent'),
      }),
    });

    // Mock localStorage
    spyOn(localStorage, 'getItem').and.returnValue('currentUserId');

    await TestBed.configureTestingModule({
      imports: [ChatListComponent],
      providers: [
        provideRouter([]),
        provideHttpClient(),
        { provide: ScrollService, useValue: jasmine.createSpyObj('ScrollService', ['scrollToTop']) },
        { provide: AuthService, useValue: jasmine.createSpyObj('AuthService', ['getCurrentUser']) },
        { provide: WebSocketService, useValue: jasmine.createSpyObj('WebSocketService', ['onReceiveMessage', 'onMessageSent', 'offReceiveMessage', 'offMessageSent'], {
          onlineUsers$: of([]),
          userOnline$: of('user1'),
          userOffline$: of('user2'),
          isConnected$: of(true)
        })},
        { provide: NotificationService, useValue: jasmine.createSpyObj('NotificationService', ['refreshNotifications'], {
          chatNotifications$: of([])
        })},
        // Add remaining required services with minimal implementations
        { provide: MessagesService, useValue: jasmine.createSpyObj('MessagesService', ['getMessageHistory']) },
        { provide: UserService, useValue: jasmine.createSpyObj('UserService', ['listMyDms', 'createDm']) },
        { provide: CryptoService, useValue: jasmine.createSpyObj('CryptoService', ['hasPrivateKey', 'decryptMessage']) },
        { provide: VaultService, useValue: jasmine.createSpyObj('VaultService', ['get']) },
        { provide: LoadingService, useValue: jasmine.createSpyObj('LoadingService', ['show', 'hide']) },
        { provide: ChatMessageService, useValue: jasmine.createSpyObj('ChatMessageService', ['isSystemMessage', 'getSystemMessageIcon']) }
      ]
    }).compileComponents();

    fixture = TestBed.createComponent(ChatListComponent);
    component = fixture.componentInstance;
  });

  // Run: npm test
  it('creates with defaults', () => {
    expect(component).toBeTruthy();
    expect(component.chats).toEqual([]);
    expect(component.searchTerm).toBe('');
    expect(component.isLoadingChats).toBe(false);
    expect(component.chatLoadingFinished).toBe(false);
  });

  it('handles message display formatting correctly', () => {
    // Test normal message
    expect(component.getDisplayMessage('Hello world')).toBe('Hello world');
    
    // Test empty message
    expect(component.getDisplayMessage('')).toBe('— no messages yet —');
    expect(component.getDisplayMessage(undefined)).toBe('— no messages yet —');
    
    // Test image message
    const imageMessage = '{"text":"Check this out","hasImage":true,"imageData":"base64data"}';
    expect(component.getDisplayMessage(imageMessage)).toBe('📷 Check this out');
    
    // Test image without text
    const imageOnlyMessage = '{"text":"","hasImage":true,"imageData":"base64data"}';
    expect(component.getDisplayMessage(imageOnlyMessage)).toBe('📷 Image');
  });

  it('handles search functionality correctly', () => {
    // Test search clearing
    component.searchTerm = 'test search';
    component.searchResults = [{ _id: 'test', username: 'test', avatarUrl: 'test.png' }];
    
    component.clearSearch();
    
    expect(component.searchTerm).toBe('');
    expect(component.searchResults).toEqual([]);
    
    // Test empty search handling
    component.onSearch('');
    expect(component.searchResults).toEqual([]);
    
    component.onSearch('   ');
    expect(component.searchResults).toEqual([]);
  });

  it('tracks chats by ID correctly', () => {
    const chat = { id: 'test-id', name: 'Test', avatar: 'test.png', unread: 0, online: false };
    expect(component.trackByChatId(0, chat)).toBe('test-id');
  });

  it('handles system messages correctly', () => {
    const systemMessage = 'System: User joined the chat';
    
    // Test system message detection
    const chatMessageService = TestBed.inject(ChatMessageService);
    (chatMessageService.isSystemMessage as jasmine.Spy).and.returnValue(true);
    (chatMessageService.getSystemMessageIcon as jasmine.Spy).and.returnValue('info');
    
    expect(component.isSystemMessage(systemMessage)).toBe(true);
    expect(component.getSystemMessageIcon(systemMessage)).toBe('info');
    
    // Test with undefined/empty messages
    expect(component.isSystemMessage(undefined)).toBe(false);
    expect(component.getSystemMessageIcon(undefined)).toBe('lock');
  });
  
  it('handles chat navigation correctly', () => {
    const mockEvent = new Event('click');
    spyOn(mockEvent, 'preventDefault');
    spyOn(component['router'], 'navigate').and.returnValue(Promise.resolve(true));
    
    component.navigateToChatRoom('test-chat-id', mockEvent);
    
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(component['router'].navigate).toHaveBeenCalledWith(['/chat-room', 'test-chat-id']);
  });
});