import { ChatMessageService } from './chat-message.service';
import { ChatMsg } from '@models/chat.model';

describe('ChatMessageService (Business Logic)', () => {
  let service: ChatMessageService;

  beforeEach(() => {
    service = new ChatMessageService();
  });

  // Run: npm test -- --include="**/chat-message.service.spec.ts"
  describe('Message Grouping by Date', () => {
    it('groups messages by date correctly', () => {
      const messages: ChatMsg[] = [
        {
          text: 'Message 1',
          sender: 'You',
          ts: new Date('2023-01-15T10:00:00Z').getTime(),
          avatarUrl: 'avatar.jpg'
        },
        {
          text: 'Message 2', 
          sender: 'Partner',
          ts: new Date('2023-01-15T14:00:00Z').getTime(),
          avatarUrl: 'partner.jpg'
        },
        {
          text: 'Message 3',
          sender: 'You',
          ts: new Date('2023-01-16T09:00:00Z').getTime(),
          avatarUrl: 'avatar.jpg'
        }
      ];

      service.groupMessagesByDate(messages);

      service.messageGroups.subscribe(groups => {
        expect(groups).toHaveSize(2);
        expect(groups[0].messages).toHaveSize(2);
        expect(groups[1].messages).toHaveSize(1);
        expect(groups[0].date).toContain('Jan 15');
        expect(groups[1].date).toContain('Jan 16');
      });
    });

    it('handles single day messages correctly', () => {
      const messages: ChatMsg[] = [
        {
          text: 'Message 1',
          sender: 'You',
          ts: new Date('2023-01-15T10:00:00Z').getTime(),
          avatarUrl: 'avatar.jpg'
        }
      ];

      service.groupMessagesByDate(messages);

      service.messageGroups.subscribe(groups => {
        expect(groups).toHaveSize(1);
        expect(groups[0].messages).toHaveSize(1);
      });
    });
  });

  describe('New Messages Counter Logic', () => {
    it('tracks new messages when user not at bottom', () => {
      const initialMessages: ChatMsg[] = [
        {
          text: 'Initial message',
          sender: 'Partner',
          ts: 123455,
          avatarUrl: 'partner.jpg'
        }
      ];
      
      const newMessages: ChatMsg[] = [
        ...initialMessages,
        {
          text: 'New message',
          sender: 'Partner',
          ts: 123456,
          avatarUrl: 'partner.jpg'
        }
      ];

      service.handleNewMessages(initialMessages, true); // Initial state with messages
      const newCount = service.handleNewMessages(newMessages, false); // User not at bottom

      expect(newCount).toBe(1);
      expect(service.getCurrentNewMessagesCount()).toBe(1);
    });

    it('resets counter when user is at bottom', () => {
      const messages: ChatMsg[] = [
        {
          text: 'Message 1',
          sender: 'Partner',
          ts: 123456,
          avatarUrl: 'partner.jpg'
        }
      ];

      service.handleNewMessages([], true); // Initial state
      service.handleNewMessages(messages, true); // User at bottom

      expect(service.getCurrentNewMessagesCount()).toBe(0);
    });

    it('accumulates new messages count correctly', () => {
      const initialMessages: ChatMsg[] = [
        {
          text: 'Initial message',
          sender: 'Partner', 
          ts: 123455,
          avatarUrl: 'partner.jpg'
        }
      ];
      
      const firstBatch: ChatMsg[] = [
        ...initialMessages,
        {
          text: 'Message 1',
          sender: 'Partner', 
          ts: 123456,
          avatarUrl: 'partner.jpg'
        }
      ];

      const secondBatch: ChatMsg[] = [
        ...firstBatch,
        {
          text: 'Message 2',
          sender: 'Partner',
          ts: 123457,
          avatarUrl: 'partner.jpg'
        }
      ];

      service.handleNewMessages(initialMessages, true); // Initial with messages
      service.handleNewMessages(firstBatch, false); // +1
      service.handleNewMessages(secondBatch, false); // +1

      expect(service.getCurrentNewMessagesCount()).toBe(2);
    });
  });

  describe('Message Edit Permissions', () => {
    it('allows editing own undeleted readable messages', () => {
      const message: ChatMsg = {
        text: 'Normal message',
        sender: 'You',
        ts: 123456,
        avatarUrl: 'avatar.jpg'
      };

      expect(service.canEditMessage(message)).toBe(true);
    });

    it('prevents editing deleted messages', () => {
      const message: ChatMsg = {
        text: 'Deleted message',
        sender: 'You',
        ts: 123456,
        avatarUrl: 'avatar.jpg',
        deletedAt: 123457
      };

      expect(service.canEditMessage(message)).toBe(false);
    });

    it('prevents editing unreadable system messages', () => {
      const message: ChatMsg = {
        text: 'Encrypted message (sent by you)',
        sender: 'You',
        ts: 123456,
        avatarUrl: 'avatar.jpg',
        isSystemMessage: true
      };

      expect(service.canEditMessage(message)).toBe(false);
    });

    it('prevents editing partner messages', () => {
      const message: ChatMsg = {
        text: 'Partner message',
        sender: 'Partner',
        ts: 123456,
        avatarUrl: 'partner.jpg'
      };

      expect(service.canEditMessage(message)).toBe(false);
    });
  });

  describe('System Message Detection', () => {
    it('detects encrypted messages correctly', () => {
      expect(service.isSystemMessage('Encrypted message (sent by you)')).toBe(true);
      expect(service.isSystemMessage('Encrypted message (from partner)')).toBe(true);
      expect(service.isSystemMessage('Message deleted')).toBe(true);
      expect(service.isSystemMessage('Normal message')).toBe(false);
    });

    it('uses isSystemMessage flag when available', () => {
      const systemMessage: ChatMsg = {
        text: 'Some text',
        sender: 'You',
        ts: 123456,
        avatarUrl: 'avatar.jpg',
        isSystemMessage: true
      };

      const regularMessage: ChatMsg = {
        text: 'Encrypted message (sent by you)', // Looks like system message
        sender: 'You',
        ts: 123456,
        avatarUrl: 'avatar.jpg',
        isSystemMessage: false
      };

      expect(service.isSystemMessage(systemMessage)).toBe(true);
      expect(service.isSystemMessage(regularMessage)).toBe(false);
    });

    it('provides correct system message icons', () => {
      expect(service.getSystemMessageIcon('Message deleted')).toBe('delete');
      expect(service.getSystemMessageIcon('Encrypted message (sent by you)')).toBe('lock');
    });
  });

  describe('Read Receipt Tracking', () => {
    it('tracks unread partner messages correctly', () => {
      const unreadMessage: ChatMsg = {
        id: 'msg1',
        text: 'Unread message',
        sender: 'Partner',
        ts: 123456,
        avatarUrl: 'partner.jpg'
      };

      const readMessage: ChatMsg = {
        id: 'msg2',
        text: 'Read message',
        sender: 'Partner',
        ts: 123457,
        avatarUrl: 'partner.jpg',
        readAt: 123458
      };

      expect(service.shouldTrackReadReceipt(unreadMessage)).toBe(true);
      expect(service.shouldTrackReadReceipt(readMessage)).toBe(false);
    });

    it('marks messages as reported and prevents duplicate tracking', () => {
      const message: ChatMsg = {
        id: 'msg1',
        text: 'Test message',
        sender: 'Partner',
        ts: 123456,
        avatarUrl: 'partner.jpg'
      };

      expect(service.shouldTrackReadReceipt(message)).toBe(true);
      
      service.markAsReported('msg1');
      
      expect(service.shouldTrackReadReceipt(message)).toBe(false);
    });

    it('filters unread messages from partner', () => {
      const messages: ChatMsg[] = [
        {
          id: 'msg1',
          text: 'Unread from partner',
          sender: 'Partner',
          ts: 123456,
          avatarUrl: 'partner.jpg'
        },
        {
          id: 'msg2', 
          text: 'My message',
          sender: 'You',
          ts: 123457,
          avatarUrl: 'avatar.jpg'
        }
      ];

      const unreadMessages = service.getUnreadFromPartner(messages);
      
      expect(unreadMessages).toHaveSize(1);
      expect(unreadMessages[0].sender).toBe('Partner');
    });
  });

  describe('Display Text Formatting', () => {
    it('truncates long filenames correctly', () => {
      expect(service.getTruncatedFilename('short.jpg')).toBe('short.jpg');
      expect(service.getTruncatedFilename('very-long-filename-that-exceeds-limit.jpg'))
        .toBe('very-long-filename...');
    });

    it('formats image display text with filename truncation', () => {
      const longImageText = 'very-long-image-filename-that-should-be-truncated.jpg';
      const result = service.getDisplayText(longImageText, true);
      
      expect(result).toBe('very-long-image-fi...');
    });

    it('removes compressed prefix from image filenames', () => {
      const compressedFilename = 'compressed_image.jpg';
      const result = service.getDisplayText(compressedFilename, true);
      
      expect(result).toBe('image.jpg');
    });

    it('leaves non-image text unchanged', () => {
      const regularText = 'This is a regular message';
      const result = service.getDisplayText(regularText, false);
      
      expect(result).toBe(regularText);
    });
  });

  describe('Service State Management', () => {
    it('initializes with correct default state', () => {
      expect(service.getCurrentNewMessagesCount()).toBe(0);
    });

    it('resets all state correctly', () => {
      // Set up some state
      const initialMessages: ChatMsg[] = [
        {
          text: 'Initial message',
          sender: 'Partner',
          ts: 123455,
          avatarUrl: 'partner.jpg'
        }
      ];
      
      const newMessages: ChatMsg[] = [
        ...initialMessages,
        {
          text: 'New message',
          sender: 'Partner',
          ts: 123456,
          avatarUrl: 'partner.jpg'
        }
      ];

      service.handleNewMessages(initialMessages, true); // Set initial state
      service.handleNewMessages(newMessages, false); // Should increment counter
      service.markAsReported('msg1');

      expect(service.getCurrentNewMessagesCount()).toBe(1);

      service.reset();

      expect(service.getCurrentNewMessagesCount()).toBe(0);
      
      service.messageGroups.subscribe(groups => {
        expect(groups).toHaveSize(0);
      });
    });
  });
});