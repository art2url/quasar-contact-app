import { ChatUiStateService } from './chat-ui-state.service';
import { ChatMsg } from '@models/chat.model';
import { CompressedImage } from '@shared/components/image-attachment/image-attachment.component';

describe('ChatUiStateService (Business Logic)', () => {
  let service: ChatUiStateService;

  beforeEach(() => {
    service = new ChatUiStateService();
  });

  // Run: npm test -- --include="**/chat-ui-state.service.spec.ts"
  describe('Message Editing Business Rules', () => {
    it('begins and cancels edit mode correctly', () => {
      const message: ChatMsg = {
        text: 'Original message',
        sender: 'You',
        ts: 123456,
        avatarUrl: 'avatar.jpg'
      };

      service.beginEdit(message);
      expect(service.getCurrentEditingMessage()).toBe(message);
      expect(service.getCurrentEditDraft()).toBe('Original message');

      service.cancelEdit();
      expect(service.getCurrentEditingMessage()).toBeNull();
      expect(service.getCurrentEditDraft()).toBe('');
    });
  });

  describe('Message State Management', () => {
    it('manages new message content and clearing', () => {
      service.setNewMessage('Hello world');
      expect(service.getCurrentNewMessage()).toBe('Hello world');

      service.clearNewMessage();
      expect(service.getCurrentNewMessage()).toBe('');
    });

    it('clears attached images with URL cleanup', () => {
      const mockImage: CompressedImage = {
        file: new File([''], 'test.jpg'),
        preview: 'blob:test-url',
        originalSize: 1024,
        compressedSize: 512
      };

      spyOn(URL, 'revokeObjectURL');
      
      service.setAttachedImage(mockImage);
      service.clearNewMessage();

      expect(service.getCurrentAttachedImage()).toBeNull();
      expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    });
  });

  describe('Emoji and Image Attachment Logic', () => {
    it('adds emoji to correct context (editing vs new message)', () => {
      const message: ChatMsg = {
        text: 'Original',
        sender: 'You',
        ts: 123456,
        avatarUrl: 'avatar.jpg'
      };

      service.setNewMessage('New');
      service.beginEdit(message);
      
      service.onEmojiSelected('😊');
      
      expect(service.getCurrentEditDraft()).toBe('Original😊');
      expect(service.getCurrentNewMessage()).toBe('New');
    });

    it('handles image attachment with filename placeholder', () => {
      const mockImage: CompressedImage = {
        file: new File([''], 'test-image.jpg'),
        preview: 'blob:test-url',
        originalSize: 2048,
        compressedSize: 1024
      };

      service.onImageSelected(mockImage);

      expect(service.getCurrentAttachedImage()).toBe(mockImage);
      expect(service.getCurrentNewMessage()).toBe('test-image.jpg');
    });
  });

  describe('Filename Truncation Rules', () => {
    it('truncates long filenames correctly', () => {
      expect(service.getTruncatedFilename('short.jpg')).toBe('short.jpg');
      expect(service.getTruncatedFilename('very-long-filename-that-exceeds-limit.jpg')).toBe('very-long-filename...');
    });
  });

  describe('Cache Issue Detection', () => {
    beforeEach(() => {
      spyOn(localStorage, 'getItem').and.returnValue(null);
    });

    it('detects unreadable sent messages', () => {
      const messages: ChatMsg[] = [{
        text: 'Encrypted message (sent by you)',
        sender: 'You',
        ts: 123456,
        avatarUrl: 'avatar.jpg'
      }];

      service.checkForCacheIssues(messages);
      expect(service.getCurrentCacheBannerState()).toBe(true);
    });

    it('respects user dismissal preference', () => {
      (localStorage.getItem as jasmine.Spy).and.returnValue('true');
      
      const messages: ChatMsg[] = [{
        text: 'Encrypted message (sent by you)',
        sender: 'You',
        ts: 123456,
        avatarUrl: 'avatar.jpg'
      }];

      service.checkForCacheIssues(messages);
      expect(service.getCurrentCacheBannerState()).toBe(false);
    });
  });

  describe('Message Preparation and State Management', () => {
    it('prepares message for sending and clears UI state', () => {
      const mockImage: CompressedImage = {
        file: new File([''], 'test.jpg'),
        preview: 'blob:test-url',
        originalSize: 1024,
        compressedSize: 512
      };

      service.setNewMessage('Test message');
      service.setAttachedImage(mockImage);

      const result = service.prepareMessageForSending();

      expect(result.content).toBe('Test message');
      expect(result.image).toBe(mockImage);
      expect(service.getCurrentNewMessage()).toBe('');
      expect(service.getCurrentAttachedImage()).toBeNull();
    });

    it('manages loading and notification flags', () => {
      expect(service.getCurrentLoadingState()).toBe(true);
      expect(service.getNeedsSecondaryEventEmit()).toBe(false);

      service.setLoadingMessages(false);
      service.setNeedsSecondaryEventEmit(true);

      expect(service.getCurrentLoadingState()).toBe(false);
      expect(service.getNeedsSecondaryEventEmit()).toBe(true);
    });
  });

  describe('Complete State Reset', () => {
    it('resets all state to initial values', () => {
      const message: ChatMsg = {
        text: 'Test',
        sender: 'You',
        ts: 123456,
        avatarUrl: 'avatar.jpg'
      };
      
      const mockImage: CompressedImage = {
        file: new File([''], 'test.jpg'),
        preview: 'blob:test-url',
        originalSize: 1024,
        compressedSize: 512
      };

      service.beginEdit(message);
      service.setNewMessage('New message');
      service.setAttachedImage(mockImage);
      service.setLoadingMessages(false);
      service.setNeedsSecondaryEventEmit(true);

      service.reset();

      expect(service.getCurrentEditingMessage()).toBeNull();
      expect(service.getCurrentNewMessage()).toBe('');
      expect(service.getCurrentAttachedImage()).toBeNull();
      expect(service.getCurrentLoadingState()).toBe(true);
      expect(service.getNeedsSecondaryEventEmit()).toBe(false);
    });
  });
});