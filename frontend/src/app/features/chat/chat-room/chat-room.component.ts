import { CommonModule } from '@angular/common';
import {
  AfterViewChecked,
  AfterViewInit,
  ChangeDetectorRef,
  Component,
  ElementRef,
  HostListener,
  Injectable,
  OnDestroy,
  OnInit,
  ViewChild,
  ViewEncapsulation,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import {
  HAMMER_GESTURE_CONFIG,
  HammerGestureConfig,
  HammerModule,
} from '@angular/platform-browser';
import { ActivatedRoute, Router, RouterModule } from '@angular/router';
import * as Hammer from 'hammerjs';
import { Subject } from 'rxjs';

import { ChatMsg } from '@models/chat.model';
import { CompressedImage } from '@shared/components/image-attachment/image-attachment.component';
import { MessageGroup } from './services/chat-message.service';

import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

// Import components
import { CacheInfoBannerComponent } from '@shared/components/cache-info-banner/cache-info-banner.component';
import { EmojiPickerComponent } from '@shared/components/emoji-picker/emoji-picker.component';
import { ImageAttachmentComponent } from '@shared/components/image-attachment/image-attachment.component';
import { ImageModalComponent } from '@shared/components/image-modal/image-modal.component';

// Import the facade service that handles all logic
import { ChatRoomFacadeService } from './services/chat-room-facade.service';

// Custom Hammer configuration
@Injectable()
export class MyHammerConfig extends HammerGestureConfig {
  override overrides = {
    swipe: { direction: Hammer.DIRECTION_HORIZONTAL },
    pinch: { enable: false },
    rotate: { enable: false },
  };
}

@Component({
  selector: 'app-chat-room',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    HammerModule,
    CacheInfoBannerComponent,
    EmojiPickerComponent,
    ImageAttachmentComponent,
    ImageModalComponent,
  ],
  providers: [
    {
      provide: HAMMER_GESTURE_CONFIG,
      useClass: MyHammerConfig,
    },
    ChatRoomFacadeService,
  ],
  templateUrl: './chat-room.component.html',
  styleUrls: ['./chat-room.component.css'],
  encapsulation: ViewEncapsulation.None,
})
export class ChatRoomComponent implements OnInit, AfterViewInit, AfterViewChecked, OnDestroy {
  @ViewChild('messageContainer') private messageContainer!: ElementRef;
  @ViewChild('messageInput') private messageInput!: ElementRef;
  @ViewChild('editInput') private editInput!: ElementRef;
  
  private destroy$ = new Subject<void>();

  // All component logic is delegated to the facade service
  constructor(
    private route: ActivatedRoute,
    private router: Router,
    private cdr: ChangeDetectorRef,
    public facade: ChatRoomFacadeService
  ) {}

  // Expose facade properties for template binding
  get chat() { return this.facade.chat; }
  get isPartnerOnline() { return this.facade.isPartnerOnline; }
  get isPartnerTyping() { return this.facade.isPartnerTyping; }
  get showCacheInfoBanner() { return this.facade.showCacheInfoBanner; }
  get isLoadingMessages() { return this.facade.isLoadingMessages; }
  get messageGroups() { return this.facade.messageGroups; }
  get newMessagesCount() { return this.facade.newMessagesCount; }
  get showScrollToBottomButton() { return this.facade.showScrollToBottomButton; }
  get newMessage() { return this.facade.newMessage; }
  set newMessage(value: string) { this.facade.newMessage = value; }
  get editing() { return this.facade.editing; }
  get editDraft() { return this.facade.editDraft; }
  set editDraft(value: string) { this.facade.editDraft = value; }
  get attachedImage() { return this.facade.attachedImage; }

  // Image modal properties
  imageModalVisible = false;
  imageModalUrl = '';
  imageModalAltText = '';

  // Host listeners delegate to facade
  @HostListener('swiperight')
  onSwipeRight() {
    this.facade.navigateToList();
  }

  @HostListener('window:resize')
  onResize() {
    this.facade.onResize(this.messageContainer?.nativeElement);
  }

  @HostListener('window:focus')
  onWindowFocus() {
    this.facade.onWindowFocus();
  }

  @HostListener('window:visibilitychange')
  onVisibilityChange() {
    this.facade.onVisibilityChange();
  }

  // Lifecycle methods
  async ngOnInit(): Promise<void> {
    const receiverId = this.route.snapshot.paramMap.get('id');
    if (!receiverId) {
      this.router.navigate(['/chat']);
      return;
    }
    await this.facade.initialize(receiverId);
  }

  ngAfterViewInit(): void {
    // Set up change detection callback
    this.facade.setChangeDetectionCallback(() => {
      this.cdr.detectChanges();
    });

    if (this.messageContainer?.nativeElement && this.messageInput?.nativeElement) {
      this.facade.initializeView(
        this.messageContainer.nativeElement,
        this.messageInput.nativeElement,
        this.editInput?.nativeElement
      );
    }
  }

  ngAfterViewChecked(): void {
    // Auto-scroll logic handled by facade - intentionally minimal for optimal mobile performance
    if (this.messageContainer?.nativeElement) {
      this.facade.handleViewChecked(this.messageContainer.nativeElement);
    }
  }

  ngOnDestroy(): void {
    this.facade.cleanup(
      this.messageContainer?.nativeElement,
      this.messageInput?.nativeElement
    );
    this.destroy$.next();
    this.destroy$.complete();
  }

  // Event handlers - all delegate to facade
  handleScroll(): void {
    if (this.messageContainer?.nativeElement) {
      this.facade.handleScroll(this.messageContainer.nativeElement);
    }
  }

  onType(): void {
    if (this.messageInput?.nativeElement) {
      this.facade.onType(this.messageInput.nativeElement);
    }
  }

  onTypeEdit(): void {
    if (this.editInput?.nativeElement) {
      this.facade.onTypeEdit(this.editInput.nativeElement);
    }
  }

  // All other methods are simple delegations to facade
  onKeydownEnter = (event: Event) => this.facade.onKeydownEnter(event);
  onKeydownCtrlEnter = (event: Event) => this.facade.onKeydownCtrlEnter(event);
  onKeydownMetaEnter = (event: Event) => this.facade.onKeydownMetaEnter(event);
  onKeydownEnterEdit = (event: Event) => this.facade.onKeydownEnterEdit(event);
  onKeydownCtrlEnterEdit = (event: Event) => this.facade.onKeydownCtrlEnterEdit(event);
  onKeydownMetaEnterEdit = (event: Event) => this.facade.onKeydownMetaEnterEdit(event);
  
  send = () => this.facade.send();
  scrollToBottomClick = () => this.facade.scrollToBottomClick();
  beginEdit = (m: ChatMsg) => this.facade.beginEdit(m);
  cancelEdit = () => this.facade.cancelEdit();
  confirmEdit = () => this.facade.confirmEdit();
  delete = (m: ChatMsg) => this.facade.delete(m);
  
  onEmojiSelected = (emoji: string) => this.facade.onEmojiSelected(emoji);
  onImageSelected = (image: CompressedImage) => this.facade.onImageSelected(image);
  removeAttachedImage = () => this.facade.removeAttachedImage();
  
  // Image modal methods
  openImageModal = (url: string) => {
    this.imageModalUrl = url;
    this.imageModalAltText = 'Image attachment';
    this.imageModalVisible = true;
  };

  closeImageModal = () => {
    this.imageModalVisible = false;
    this.imageModalUrl = '';
    this.imageModalAltText = '';
  };

  // Image error handling
  onImageError = (_event: Event, message: ChatMsg) => {
    console.error('[ChatRoom] Image failed to load:', {
      messageId: message.id,
      imageUrl: message.imageUrl?.substring(0, 50) + '...',
      hasImage: message.hasImage
    });
    
    // Mark message as having image error
    const messages = this.facade.chat.messages$.value;
    const messageIndex = messages.findIndex(m => m.id === message.id || m.ts === message.ts);
    
    if (messageIndex !== -1) {
      const updatedMessage = { ...messages[messageIndex], imageError: true };
      const updatedMessages = [
        ...messages.slice(0, messageIndex),
        updatedMessage,
        ...messages.slice(messageIndex + 1)
      ];
      this.facade.chat.messages$.next(updatedMessages);
    }
  };

  onImageLoad = (_event: Event, message: ChatMsg) => {
    console.log('[ChatRoom] Image loaded successfully for message:', message.id);
  };
  
  // Template helpers
  trackByTs = (i: number, m: { ts: number }) => this.facade.trackByTs(i, m);
  trackByDate = (i: number, g: MessageGroup) => this.facade.trackByDate(i, g);
  formatMessageTime = (ts: number) => this.facade.formatMessageTime(ts);
  getFullTimestamp = (ts: number) => this.facade.getFullTimestamp(ts);
  getMessageAvatar = (m: ChatMsg) => this.facade.getMessageAvatar(m);
  getPartnerAvatar = () => this.facade.getPartnerAvatar();
  onAvatarError = (e: Event) => this.facade.onAvatarError(e);
  onMessageAvatarError = (e: Event, m: ChatMsg) => this.facade.onMessageAvatarError(e, m);
  
  // Message utilities
  isMessageUnreadable = (m: ChatMsg) => this.facade.isMessageUnreadable(m);
  isMessageEncrypted = (m: ChatMsg) => this.facade.isMessageEncrypted(m);
  canEditMessage = (m: ChatMsg) => this.facade.canEditMessage(m);
  isSystemMessage = (message: ChatMsg | string) => this.facade.isSystemMessage(message);
  getSystemMessageIcon = (text: string) => this.facade.getSystemMessageIcon(text);
  getTruncatedFilename = (name: string) => this.facade.getTruncatedFilename(name);
  getDisplayText = (text: string, hasImage?: boolean) => this.facade.getDisplayText(text, hasImage);
  
  // Navigation and state
  navigateToList = (e?: Event) => this.facade.navigateToList(e);
  isChatBlocked = () => this.facade.isChatBlocked();
  getChatInputPlaceholder = () => this.facade.getChatInputPlaceholder();
  regenerateEncryptionKeys = () => this.facade.regenerateEncryptionKeys();
  reloadPage = () => this.facade.reloadPage();
  checkPartnerKeyStatus = () => this.facade.checkPartnerKeyStatus();
}