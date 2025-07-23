import { Injectable } from '@angular/core';
import { ChatMsg } from '@models/chat.model';
import { formatDateHeader, getStartOfDay } from '@utils/date.util';
import { BehaviorSubject } from 'rxjs';

export interface MessageGroup {
  date: string;
  dateTimestamp: number;
  messages: ChatMsg[];
}

@Injectable({
  providedIn: 'root',
})
export class ChatMessageService {
  private messageGroups$ = new BehaviorSubject<MessageGroup[]>([]);
  private lastMessageCount = 0;
  private newMessagesCount$ = new BehaviorSubject<number>(0);
  private reported = new Set<string>();

  get messageGroups() {
    return this.messageGroups$.asObservable();
  }

  get newMessagesCount() {
    return this.newMessagesCount$.asObservable();
  }

  /**
   * Group messages by date for better organization
   */
  groupMessagesByDate(messages: ChatMsg[]): void {
    const groups: MessageGroup[] = [];
    let currentGroup: MessageGroup | null = null;

    messages.forEach(message => {
      const messageTimestamp = message.ts;
      const dayStart = getStartOfDay(messageTimestamp);

      // If this is a new day or first message, create a new group
      if (!currentGroup || currentGroup.dateTimestamp !== dayStart) {
        currentGroup = {
          date: formatDateHeader(messageTimestamp),
          dateTimestamp: dayStart,
          messages: [],
        };
        groups.push(currentGroup);
      }

      // Add message to current group
      currentGroup.messages.push(message);
    });

    this.messageGroups$.next(groups);
  }

  /**
   * Handle new messages and calculate count
   */
  handleNewMessages(messages: ChatMsg[], isUserAtBottom: boolean): number {
    const currentMessageCount = messages.length;
    const hasNewMessages = currentMessageCount > this.lastMessageCount;

    if (hasNewMessages) {
      const newMessageCount = currentMessageCount - this.lastMessageCount;

      // If user is not at bottom, increment new messages counter
      if (!isUserAtBottom && this.lastMessageCount > 0) {
        const currentCount = this.newMessagesCount$.value;
        this.newMessagesCount$.next(currentCount + newMessageCount);
      } else {
        // User is at bottom, reset counter
        this.newMessagesCount$.next(0);
      }

      this.lastMessageCount = currentMessageCount;
      return newMessageCount;
    }

    this.lastMessageCount = currentMessageCount;
    return 0;
  }

  /**
   * Reset new messages counter
   */
  resetNewMessagesCount(): void {
    this.newMessagesCount$.next(0);
  }

  /**
   * Get current new messages count value
   */
  getCurrentNewMessagesCount(): number {
    return this.newMessagesCount$.value;
  }

  /**
   * Check if message can be edited/deleted
   */
  canEditMessage(message: ChatMsg): boolean {
    return (
      message.sender === 'You' && !message.deletedAt && !this.isMessageUnreadable(message)
    );
  }

  // TODO: fix this
  /**
   * Check if a message is unreadable (cached message that can't be decrypted)
   */
  isMessageUnreadable(message: ChatMsg): boolean {
    if (message.sender !== 'You') return false;

    return (
      message.text.includes('💬 Message sent') ||
      message.text.includes('🔒 Encrypted message (sent by you)')
    );
  }

  // TODO: fix this
  /**
   * Check if a message is encrypted (from partner)
   */
  isMessageEncrypted(message: ChatMsg): boolean {
    if (message.sender === 'You') return false;

    // Check for exact encrypted message text
    const isEncryptedText = message.text === '🔒 Encrypted message (from partner)';
    return isEncryptedText;
  }

  /**
   * Check if message needs read receipt tracking
   */
  shouldTrackReadReceipt(message: ChatMsg): boolean {
    return (
      message.sender !== 'You' &&
      !message.readAt &&
      !!message.id &&
      !this.reported.has(message.id)
    );
  }

  /**
   * Mark message as reported for read receipt
   */
  markAsReported(messageId: string): void {
    this.reported.add(messageId);
  }

  /**
   * Get unread messages from partner
   */
  getUnreadFromPartner(messages: ChatMsg[]): ChatMsg[] {
    return messages.filter(m => this.shouldTrackReadReceipt(m));
  }

  // TODO: fix this
  /**
   * Format message text by replacing emojis with text-only versions for system messages
   */
  formatMessageText(text: string): string {
    // Replace emoji-based system messages with text-only versions
    if (text === '🔒 Encrypted message (from partner)') {
      return 'Encrypted message (from partner)';
    }
    if (text.includes('🔒 Encrypted message (sent by you)')) {
      return text.replace(
        '🔒 Encrypted message (sent by you)',
        'Encrypted message (sent by you)'
      );
    }
    if (text.includes('💬 Message sent')) {
      return text.replace('💬 Message sent', 'Message sent');
    }
    if (text === '⋯ message deleted ⋯') {
      return 'Message deleted';
    }
    return text;
  }

  // TODO: fix this
  /**
   * Check if message is a system message that needs special icon treatment
   */
  isSystemMessage(text: string): boolean {
    return (
      text === '🔒 Encrypted message (from partner)' ||
      text.includes('🔒 Encrypted message (sent by you)') ||
      text.includes('💬 Message sent') ||
      text === '⋯ message deleted ⋯'
    );
  }

  /**
   * Get the appropriate icon for system messages
   */
  getSystemMessageIcon(text: string): string {
    if (text === '⋯ message deleted ⋯') {
      return 'delete';
    }
    return 'lock';
  }

  /**
   * Get display text with image filename truncation
   */
  getDisplayText(text: string, hasImage?: boolean): string {
    if (
      hasImage &&
      text &&
      (text.includes('.jpg') ||
        text.includes('.jpeg') ||
        text.includes('.png') ||
        text.includes('.gif') ||
        text.includes('.webp'))
    ) {
      // Remove "compressed_" prefix if present and truncate
      const cleanText = text.startsWith('compressed_') ? text.substring(11) : text;
      return this.getTruncatedFilename(cleanText);
    }
    return text;
  }

  /**
   * Get truncated filename for display
   */
  getTruncatedFilename(filename: string): string {
    if (filename.length <= 14) {
      return filename;
    }
    return filename.substring(0, 18) + '...';
  }

  /**
   * Reset service state (useful for component cleanup)
   */
  reset(): void {
    this.lastMessageCount = 0;
    this.newMessagesCount$.next(0);
    this.reported.clear();
    this.messageGroups$.next([]);
  }
}
