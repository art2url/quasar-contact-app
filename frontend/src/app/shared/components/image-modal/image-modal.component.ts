import { CommonModule } from '@angular/common';
import { Component, ElementRef, EventEmitter, HostListener, Input, Output, ViewChild } from '@angular/core';
import { MatIconModule } from '@angular/material/icon';

@Component({
  selector: 'app-image-modal',
  standalone: true,
  imports: [CommonModule, MatIconModule],
  templateUrl: './image-modal.component.html',
  styleUrls: ['./image-modal.component.css']
})
export class ImageModalComponent {
  @Input() imageUrl = '';
  @Input() isVisible = false;
  @Input() altText = 'Image';
  @Output() closeModal = new EventEmitter<void>();
  @ViewChild('imageElement') imageElement!: ElementRef<HTMLImageElement>;

  zoomLevel = 1;
  minZoom = 0.5;
  maxZoom = 3;
  isDragging = false;
  dragStart = { x: 0, y: 0 };
  imagePosition = { x: 0, y: 0 };
  isLoading = true;

  /**
   * Close modal when clicking outside the image
   */
  onBackdropClick(event: Event): void {
    if (event.target === event.currentTarget) {
      this.onCloseModal();
    }
  }

  /**
   * Handle backdrop keyboard events for accessibility
   */
  onBackdropKeydown(event: KeyboardEvent): void {
    if (event.target === event.currentTarget && (event.key === 'Enter' || event.key === ' ')) {
      event.preventDefault();
      this.onCloseModal();
    }
  }

  /**
   * Close modal
   */
  onCloseModal(): void {
    this.closeModal.emit();
    this.resetImageState();
  }

  /**
   * Handle image click - close on mobile, nothing on desktop when zoomed
   */
  onImageClick(_event: Event): void {
    // Only close if not zoomed (mobile behavior)
    if (this.zoomLevel <= 1) {
      this.onCloseModal();
    }
  }

  /**
   * Handle escape key to close modal
   */
  @HostListener('document:keydown.escape')
  onEscapeKey(): void {
    if (this.isVisible) {
      this.onCloseModal();
    }
  }

  /**
   * Handle keyboard shortcuts
   */
  @HostListener('document:keydown', ['$event'])
  onKeyDown(event: KeyboardEvent): void {
    if (!this.isVisible) return;

    switch (event.key) {
      case '+':
      case '=':
        event.preventDefault();
        this.zoomIn();
        break;
      case '-':
        event.preventDefault();
        this.zoomOut();
        break;
      case '0':
        event.preventDefault();
        this.resetZoom();
        break;
    }
  }

  /**
   * Handle mouse wheel for zooming
   */
  onWheel(event: WheelEvent): void {
    event.preventDefault();
    
    if (event.deltaY < 0) {
      this.zoomIn();
    } else {
      this.zoomOut();
    }
  }

  /**
   * Handle image load
   */
  onImageLoad(): void {
    this.isLoading = false;
  }

  /**
   * Handle image error
   */
  onImageError(): void {
    this.isLoading = false;
  }

  /**
   * Zoom in
   */
  zoomIn(): void {
    const newZoom = Math.min(this.zoomLevel * 1.2, this.maxZoom);
    this.setZoom(newZoom);
  }

  /**
   * Zoom out
   */
  zoomOut(): void {
    const newZoom = Math.max(this.zoomLevel / 1.2, this.minZoom);
    this.setZoom(newZoom);
  }

  /**
   * Reset zoom to 1x
   */
  resetZoom(): void {
    this.setZoom(1);
    this.imagePosition = { x: 0, y: 0 };
  }

  /**
   * Set zoom level
   */
  private setZoom(zoom: number): void {
    this.zoomLevel = zoom;
  }

  /**
   * Handle mouse down for dragging
   */
  onMouseDown(event: MouseEvent): void {
    if (this.zoomLevel > 1) {
      this.isDragging = true;
      this.dragStart = {
        x: event.clientX - this.imagePosition.x,
        y: event.clientY - this.imagePosition.y
      };
      event.preventDefault();
    }
  }

  /**
   * Handle mouse move for dragging
   */
  @HostListener('document:mousemove', ['$event'])
  onMouseMove(event: MouseEvent): void {
    if (this.isDragging && this.zoomLevel > 1) {
      this.imagePosition = {
        x: event.clientX - this.dragStart.x,
        y: event.clientY - this.dragStart.y
      };
    }
  }

  /**
   * Handle mouse up to stop dragging
   */
  @HostListener('document:mouseup')
  onMouseUp(): void {
    this.isDragging = false;
  }

  /**
   * Get image transform style
   */
  getImageTransform(): string {
    return `scale(${this.zoomLevel}) translate(${this.imagePosition.x / this.zoomLevel}px, ${this.imagePosition.y / this.zoomLevel}px)`;
  }

  /**
   * Reset image state when modal closes
   */
  private resetImageState(): void {
    this.zoomLevel = 1;
    this.imagePosition = { x: 0, y: 0 };
    this.isDragging = false;
    this.isLoading = true;
  }

  /**
   * Get cursor style based on state
   */
  getCursorStyle(): string {
    if (this.isDragging) return 'grabbing';
    if (this.zoomLevel > 1) return 'grab';
    return 'default';
  }
}