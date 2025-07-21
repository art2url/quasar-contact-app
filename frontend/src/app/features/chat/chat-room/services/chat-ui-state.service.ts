import { Injectable } from '@angular/core';
import { BehaviorSubject } from 'rxjs';
import { ChatMsg } from '@models/chat.model';
import { CompressedImage } from '@shared/components/image-attachment/image-attachment.component';

@Injectable({
  providedIn: 'root'
})
export class ChatUiStateService {
  private editing$ = new BehaviorSubject<ChatMsg | null>(null);
  private editDraft$ = new BehaviorSubject<string>('');
  private newMessage$ = new BehaviorSubject<string>('');
  private attachedImage$ = new BehaviorSubject<CompressedImage | null>(null);
  private isLoadingMessages$ = new BehaviorSubject<boolean>(true);
  private hasMarkedMessagesAsRead$ = new BehaviorSubject<boolean>(false);
  private showCacheInfoBanner$ = new BehaviorSubject<boolean>(false);
  
  // Flags for Angular hook-based operations (instead of setTimeout)
  private needsSecondaryEventEmit = false;
  private needsNotificationRefresh = false;

  get editing() {
    return this.editing$.asObservable();
  }

  get editDraft() {
    return this.editDraft$.asObservable();
  }

  get newMessage() {
    return this.newMessage$.asObservable();
  }

  get attachedImage() {
    return this.attachedImage$.asObservable();
  }

  get isLoadingMessages() {
    return this.isLoadingMessages$.asObservable();
  }

  get hasMarkedMessagesAsRead() {
    return this.hasMarkedMessagesAsRead$.asObservable();
  }

  get showCacheInfoBanner() {
    return this.showCacheInfoBanner$.asObservable();
  }

  // Getters for current values
  getCurrentEditingMessage(): ChatMsg | null {
    return this.editing$.value;
  }

  getCurrentEditDraft(): string {
    return this.editDraft$.value;
  }

  getCurrentNewMessage(): string {
    return this.newMessage$.value;
  }

  getCurrentAttachedImage(): CompressedImage | null {
    return this.attachedImage$.value;
  }

  getCurrentLoadingState(): boolean {
    return this.isLoadingMessages$.value;
  }

  getCurrentReadStatus(): boolean {
    return this.hasMarkedMessagesAsRead$.value;
  }

  getCurrentCacheBannerState(): boolean {
    return this.showCacheInfoBanner$.value;
  }

  // Setters
  setEditing(message: ChatMsg | null): void {
    this.editing$.next(message);
  }

  setEditDraft(draft: string): void {
    this.editDraft$.next(draft);
  }

  setNewMessage(message: string): void {
    this.newMessage$.next(message);
  }

  setAttachedImage(image: CompressedImage | null): void {
    this.attachedImage$.next(image);
  }

  setLoadingMessages(loading: boolean): void {
    this.isLoadingMessages$.next(loading);
  }

  setMarkedMessagesAsRead(marked: boolean): void {
    this.hasMarkedMessagesAsRead$.next(marked);
  }

  setShowCacheInfoBanner(show: boolean): void {
    this.showCacheInfoBanner$.next(show);
  }

  /**
   * Begin editing a message
   */
  beginEdit(message: ChatMsg): void {
    this.setEditing(message);
    this.setEditDraft(message.text);
  }

  /**
   * Cancel editing
   */
  cancelEdit(): void {
    this.setEditing(null);
    this.setEditDraft('');
  }

  /**
   * Clear new message and attachment
   */
  clearNewMessage(): void {
    this.setNewMessage('');
    
    // Clean up attachment if exists
    const currentImage = this.getCurrentAttachedImage();
    if (currentImage) {
      URL.revokeObjectURL(currentImage.preview);
      this.setAttachedImage(null);
    }
  }

  /**
   * Handle emoji selection
   */
  onEmojiSelected(emoji: string): void {
    const currentEditing = this.getCurrentEditingMessage();
    if (currentEditing) {
      const currentDraft = this.getCurrentEditDraft();
      this.setEditDraft(currentDraft + emoji);
    } else {
      const currentMessage = this.getCurrentNewMessage();
      this.setNewMessage(currentMessage + emoji);
    }
  }

  /**
   * Handle image selection
   */
  onImageSelected(compressedImage: CompressedImage): void {
    // Store the image for sending
    this.setAttachedImage(compressedImage);

    // Add placeholder text to show attachment
    const imageText = this.getTruncatedFilename(compressedImage.file.name);

    const currentEditing = this.getCurrentEditingMessage();
    if (currentEditing) {
      this.setEditDraft(imageText);
    } else {
      this.setNewMessage(imageText);
    }
  }

  /**
   * Remove attached image
   */
  removeAttachedImage(): void {
    const currentImage = this.getCurrentAttachedImage();
    if (currentImage) {
      URL.revokeObjectURL(currentImage.preview);
      this.setAttachedImage(null);
      this.setNewMessage('');
    }
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
   * Check if we should show the cache info banner
   */
  checkForCacheIssues(messages: ChatMsg[]): void {
    // Don't show if user has already dismissed it
    if (localStorage.getItem('cacheInfoDismissed') === 'true') {
      return;
    }

    // Check if there are any messages sent by me that show cache-related text
    const hasUnreadableSentMessages = messages.some(
      m =>
        m.sender === 'You' &&
        (m.text.includes('💬 Message sent') || m.text.includes('🔒 Encrypted message'))
    );

    if (hasUnreadableSentMessages && !this.getCurrentCacheBannerState()) {
      this.setShowCacheInfoBanner(true);
    }
  }

  /**
   * Handle delayed operations flags
   */
  setNeedsSecondaryEventEmit(needs: boolean): void {
    this.needsSecondaryEventEmit = needs;
  }

  setNeedsNotificationRefresh(needs: boolean): void {
    this.needsNotificationRefresh = needs;
  }

  getNeedsSecondaryEventEmit(): boolean {
    return this.needsSecondaryEventEmit;
  }

  getNeedsNotificationRefresh(): boolean {
    return this.needsNotificationRefresh;
  }

  /**
   * Prepare message for sending
   */
  prepareMessageForSending(): { content: string; image: CompressedImage | null } {
    const content = this.getCurrentNewMessage() || '';
    const image = this.getCurrentAttachedImage();
    
    // Clear the UI state immediately for better UX
    this.clearNewMessage();
    
    return { content, image };
  }

  /**
   * Restore message after send failure
   */
  restoreMessageAfterFailure(content: string, image: CompressedImage | null): void {
    this.setNewMessage(content);
    this.setAttachedImage(image);
  }

  /**
   * Reset all UI state
   */
  reset(): void {
    this.cancelEdit();
    this.clearNewMessage();
    this.setLoadingMessages(true);
    this.setMarkedMessagesAsRead(false);
    this.setShowCacheInfoBanner(false);
    this.needsSecondaryEventEmit = false;
    this.needsNotificationRefresh = false;
  }
}