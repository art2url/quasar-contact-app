import { ActivatedRoute, Router } from '@angular/router';
import { BehaviorSubject } from 'rxjs';
import { ChangeDetectorRef } from '@angular/core';

import { ChatRoomComponent } from './chat-room.component';
import { ChatMsg } from '@models/chat.model';
import { ChatRoomFacadeService } from './services/chat-room-facade.service';
import { CompressedImage } from '@shared/components/image-attachment/image-attachment.component';

describe('ChatRoomComponent (Chat Functionality Tests)', () => {
  let component: ChatRoomComponent;
  let mockRouter: jasmine.SpyObj<Router>;
  let mockActivatedRoute: {
    snapshot: {
      paramMap: {
        get: jasmine.Spy<(key: string) => string | null>;
      };
    };
  };
  let mockFacade: jasmine.SpyObj<ChatRoomFacadeService>;

  const sampleMessages: ChatMsg[] = [
    {
      id: 'msg-1',
      text: 'Hello there!',
      sender: 'Partner',
      ts: Date.now() - 2000,
      hasImage: false,
      avatarUrl: 'partner-avatar.jpg'
    },
    {
      id: 'msg-2', 
      text: 'Hi! How are you?',
      sender: 'You',
      ts: Date.now() - 1000,
      hasImage: false,
      avatarUrl: 'your-avatar.jpg'
    },
    {
      id: 'msg-3',
      text: 'Check this image!',
      sender: 'Partner',
      ts: Date.now(),
      hasImage: true,
      imageUrl: 'https://example.com/image.jpg',
      avatarUrl: 'partner-avatar.jpg'
    }
  ];

  beforeEach(() => {
    mockRouter = jasmine.createSpyObj('Router', ['navigate']);
    mockActivatedRoute = {
      snapshot: {
        paramMap: {
          get: jasmine.createSpy('get').and.returnValue('partner-123')
        }
      }
    };

    // Create comprehensive mock facade that simulates real chat functionality
    mockFacade = jasmine.createSpyObj('ChatRoomFacadeService', [
      'initialize', 'initializeView', 'setChangeDetectionCallback', 'handleViewChecked',
      'cleanup', 'navigateToList', 'onWindowFocus', 'onResize', 'onVisibilityChange',
      'handleScroll', 'onType', 'onTypeEdit', 'onKeydownEnter', 'onKeydownCtrlEnter',
      'onKeydownMetaEnter', 'send', 'beginEdit', 'cancelEdit', 'confirmEdit', 'delete',
      'onEmojiSelected', 'onImageSelected', 'removeAttachedImage', 'scrollToBottomClick'
    ], {
      // Realistic chat service with observable streams
      chat: {
        messages$: new BehaviorSubject<ChatMsg[]>(sampleMessages),
        messagesLoading$: new BehaviorSubject<boolean>(false),
        partnerTyping$: new BehaviorSubject<boolean>(false),
        theirAvatar$: new BehaviorSubject<string>('partner-avatar.jpg'),
        myPrivateKeyMissing$: new BehaviorSubject<boolean>(false),
        keyLoading$: new BehaviorSubject<boolean>(false),
        init: jasmine.createSpy('init').and.returnValue(Promise.resolve()),
        send: jasmine.createSpy('send').and.returnValue(Promise.resolve()),
        editMessage: jasmine.createSpy('editMessage').and.returnValue(Promise.resolve()),
        manuallyCheckKeyStatus: jasmine.createSpy('manuallyCheckKeyStatus')
      },
      // Partner status functionality
      isPartnerOnline: true,
      isPartnerTyping: false,
      
      // UI state functionality
      showCacheInfoBanner: false,
      isLoadingMessages: false,
      newMessagesCount: 0,
      showScrollToBottomButton: false,
      
      // Message composition functionality
      newMessage: '',
      editDraft: '',
      editing: null,
      attachedImage: null,
      
      // Message grouping functionality
      messageGroups: [
        {
          date: 'Today',
          dateTimestamp: Date.now(),
          messages: sampleMessages
        }
      ]
    });

    const mockChangeDetectorRef = jasmine.createSpyObj<ChangeDetectorRef>('ChangeDetectorRef', ['detectChanges']);
    
    component = new ChatRoomComponent(
      mockActivatedRoute as unknown as ActivatedRoute,
      mockRouter,
      mockChangeDetectorRef,
      mockFacade as unknown as ChatRoomFacadeService
    );
  });

  // Run: npm test
  it('initializes chat room with partner and displays messages', async () => {
    expect(component).toBeTruthy();
    expect(component.imageModalVisible).toBe(false);
    
    mockFacade.initialize.and.returnValue(Promise.resolve());
    
    await component.ngOnInit();
    
    expect(mockActivatedRoute.snapshot.paramMap.get).toHaveBeenCalledWith('id');
    expect(mockFacade.initialize).toHaveBeenCalledWith('partner-123');
    
    // Verify chat functionality - accessing messages through facade
    expect(component.chat.messages$.value).toEqual(sampleMessages);
    expect(component.messageGroups).toBeDefined();
    expect(component.messageGroups.length).toBe(1);
    expect(component.messageGroups[0].messages.length).toBe(3);
  });

  it('exposes facade partner status properties correctly', () => {
    // Component should expose facade properties as getters
    expect(component.isPartnerOnline).toBe(mockFacade.isPartnerOnline);
    expect(component.isPartnerTyping).toBe(mockFacade.isPartnerTyping);
    
    // Verify chat service observable access
    expect(component.chat.partnerTyping$).toBe(mockFacade.chat.partnerTyping$);
    expect(mockFacade.chat.partnerTyping$.value).toBe(false);
    
    // Test that observable updates work
    mockFacade.chat.partnerTyping$.next(true);
    expect(mockFacade.chat.partnerTyping$.value).toBe(true);
  });

  it('delegates message composition to facade correctly', () => {
    // Component should expose facade properties
    expect(component.newMessage).toBe(mockFacade.newMessage);
    
    // Test message sending delegation
    component.send();
    expect(mockFacade.send).toHaveBeenCalled();
    
    // Verify component provides access to chat service
    expect(component.chat).toBe(mockFacade.chat);
    expect(component.chat.send).toBe(mockFacade.chat.send);
  });

  it('exposes facade scroll and message state correctly', () => {
    // Component should expose facade properties
    expect(component.newMessagesCount).toBe(mockFacade.newMessagesCount);
    expect(component.showScrollToBottomButton).toBe(mockFacade.showScrollToBottomButton);
    
    // Test scroll functionality delegation
    component.scrollToBottomClick();
    expect(mockFacade.scrollToBottomClick).toHaveBeenCalled();
    
    // Verify message stream access through facade
    expect(component.chat.messages$).toBe(mockFacade.chat.messages$);
    expect(component.chat.messages$.value).toEqual(sampleMessages);
    
    // Test that new messages can be added to stream
    const newMessage: ChatMsg = {
      id: 'msg-4',
      text: 'Just arrived!',
      sender: 'Partner',
      ts: Date.now(),
      hasImage: false
    };
    
    const updatedMessages = [...sampleMessages, newMessage];
    mockFacade.chat.messages$.next(updatedMessages);
    expect(mockFacade.chat.messages$.value.length).toBe(4);
  });

  it('delegates message editing operations to facade', async () => {
    const messageToEdit = sampleMessages[1]; // 'You' sent message
    
    // Test editing delegation
    component.beginEdit(messageToEdit);
    expect(mockFacade.beginEdit).toHaveBeenCalledWith(messageToEdit);
    
    // Component should expose facade editing state
    expect(component.editing).toBe(mockFacade.editing);
    expect(component.editDraft).toBe(mockFacade.editDraft);
    
    // Confirm edit delegation
    await component.confirmEdit();
    expect(mockFacade.confirmEdit).toHaveBeenCalled();
    
    // Cancel edit delegation
    component.cancelEdit();
    expect(mockFacade.cancelEdit).toHaveBeenCalled();
    
    // Verify access to chat service edit method
    expect(component.chat.editMessage).toBe(mockFacade.chat.editMessage);
  });

  it('handles image viewing and modal functionality', () => {
    const testImageUrl = 'https://example.com/chat-image.jpg';
    
    // Initially modal closed
    expect(component.imageModalVisible).toBe(false);
    expect(component.imageModalUrl).toBe('');

    // Open image modal (component's own functionality)
    component.openImageModal(testImageUrl);
    expect(component.imageModalVisible).toBe(true);
    expect(component.imageModalUrl).toBe(testImageUrl);
    expect(component.imageModalAltText).toBe('Image attachment');

    // Close image modal
    component.closeImageModal();
    expect(component.imageModalVisible).toBe(false);
    expect(component.imageModalUrl).toBe('');
    expect(component.imageModalAltText).toBe('');
  });

  it('delegates image attachment operations to facade', () => {
    const mockImage: CompressedImage = {
      file: new File(['test'], 'chat-image.jpg', { type: 'image/jpeg' }),
      preview: 'blob:chat-preview-url',
      originalSize: 2048000,
      compressedSize: 1024000
    };

    // Component should expose facade attachment state
    expect(component.attachedImage).toBe(mockFacade.attachedImage);

    // Test image attachment delegation
    component.onImageSelected(mockImage);
    expect(mockFacade.onImageSelected).toHaveBeenCalledWith(mockImage);

    // Test image removal delegation
    component.removeAttachedImage();
    expect(mockFacade.removeAttachedImage).toHaveBeenCalled();
  });

  it('delegates emoji selection to facade', () => {
    const emoji = '🎉';
    
    // Component should expose facade message state
    expect(component.newMessage).toBe(mockFacade.newMessage);
    
    // Test emoji selection delegation
    component.onEmojiSelected(emoji);
    expect(mockFacade.onEmojiSelected).toHaveBeenCalledWith(emoji);
  });

  it('handles image loading and error states in chat', () => {
    const mockMessage: ChatMsg = {
      id: 'img-msg',
      text: 'Image message',
      sender: 'Partner',  
      ts: Date.now(),
      hasImage: true,
      imageUrl: 'chat-image.jpg'
    };

    spyOn(console, 'log');
    spyOn(console, 'error');

    // Test successful image load
    const loadEvent = new Event('load');
    component.onImageLoad(loadEvent, mockMessage);
    expect(console.log).toHaveBeenCalledWith('[ChatRoom] Image loaded successfully for message:', 'img-msg');

    // Test image error handling
    const errorEvent = new Event('error');
    component.onImageError(errorEvent, mockMessage);
    expect(console.error).toHaveBeenCalledWith('[ChatRoom] Image failed to load:', jasmine.any(Object));
  });

  it('exposes facade loading states correctly', () => {
    // Component should expose facade loading state
    expect(component.isLoadingMessages).toBe(mockFacade.isLoadingMessages);
    
    // Verify access to chat service loading observable
    expect(component.chat.messagesLoading$).toBe(mockFacade.chat.messagesLoading$);
    expect(component.chat.messagesLoading$.value).toBe(false);
    
    // Test that loading observable updates work
    mockFacade.chat.messagesLoading$.next(true);
    expect(mockFacade.chat.messagesLoading$.value).toBe(true);
  });

  it('exposes facade cache banner state correctly', () => {
    // Component should expose facade cache banner state
    expect(component.showCacheInfoBanner).toBe(mockFacade.showCacheInfoBanner);
    
    // This demonstrates that the component is a presentation layer
    // that exposes facade state rather than managing its own state
  });

  it('navigates back when chat partner not found', async () => {
    // Mock no partner ID
    mockActivatedRoute.snapshot.paramMap.get.and.returnValue(null);
    
    await component.ngOnInit();
    
    expect(mockRouter.navigate).toHaveBeenCalledWith(['/chat']);
    expect(mockFacade.initialize).not.toHaveBeenCalled();
  });
});