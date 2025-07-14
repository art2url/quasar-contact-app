import { Component, EventEmitter, Output, Input, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-emoji-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './emoji-picker.component.html',
  styleUrls: ['./emoji-picker.component.css']
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
  onEmojiClick(emoji: string): void {
    this.emojiSelected.emit(emoji);
    this.showPicker = false;
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