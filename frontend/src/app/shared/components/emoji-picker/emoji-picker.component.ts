import { Component, EventEmitter, Output, Input, HostListener, ViewEncapsulation } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-emoji-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './emoji-picker.component.html',
  styleUrls: ['./emoji-picker.component.css'],
  encapsulation: ViewEncapsulation.None
})
export class EmojiPickerComponent {
  @Input() disabled = false;
  @Output() emojiSelected = new EventEmitter<string>();

  showPicker = false;

  popularEmojis = [
    '😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣',
    '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰',
    '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜',
    '🤪', '🤨', '🧐', '🤓', '😎', '🤩', '🥳', '😏',
    '😒', '😞', '😔', '😟', '😕', '🙁', '☹️', '😣',
    '😖', '😫', '😩', '🥺', '😢', '😭', '😤', '😠',
    '😡', '🤬', '🤯', '😳', '🥵', '🥶', '😱', '😨',
    '😰', '😥', '😓', '🤗', '🤔', '🤭', '🤫', '🤥',
    '😶', '😐', '😑', '😬', '🙄', '😯', '😦', '😧',
    '😮', '😲', '🥱', '😴', '🤤', '😪', '😵', '🤐',
    '🥴', '🤢', '🤮', '🤧', '😷', '🤒', '🤕', '🤑',
    '🤠', '😈', '👿', '👹', '👺', '🤡', '💩', '👻',
    '💀', '☠️', '👽', '👾', '🤖', '🎃', '😺', '😸',
    '😹', '😻', '😼', '😽', '🙀', '😿', '😾', '❤️',
    '🧡', '💛', '💚', '💙', '💜', '🤎', '🖤', '🤍',
    '💯', '💢', '💥', '💫', '💦', '💨', '🕳️', '💣',
    '💬', '👁️‍🗨️', '🗨️', '🗯️', '💭', '💤', '👋', '🤚',
    '🖐️', '✋', '🖖', '👌', '🤌', '🤏', '✌️', '🤞',
    '🤟', '🤘', '🤙', '👈', '👉', '👆', '🖕', '👇',
    '☝️', '👍', '👎', '👊', '✊', '🤛', '🤜', '👏',
    '🙌', '👐', '🤲', '🤝', '🙏', '✍️', '💅', '🤳'
  ];

  /**
   * Toggle emoji picker visibility
   */
  togglePicker(event: Event): void {
    event.stopPropagation();
    this.showPicker = !this.showPicker;
  }

  /**
   * Handle emoji selection
   */
  onEmojiClick(emoji: string, event?: Event): void {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }
    this.emojiSelected.emit(emoji);
    // Don't close picker automatically - let user pick multiple emojis
  }

  /**
   * Handle escape key to close picker
   */
  onKeyDown(event: KeyboardEvent): void {
    if (event.key === 'Escape') {
      this.showPicker = false;
    }
  }

  /**
   * Close picker when clicking outside
   */
  @HostListener('document:click')
  onDocumentClick(): void {
    if (this.showPicker) {
      this.showPicker = false;
    }
  }

  /**
   * Prevent event propagation when clicking inside picker
   */
  onPickerClick(event: Event): void {
    event.stopPropagation();
  }
}