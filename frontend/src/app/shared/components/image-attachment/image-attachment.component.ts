import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
} from '@angular/core';

export interface CompressedImage {
  file: File;
  preview: string;
  originalSize: number;
  compressedSize: number;
}

@Component({
  selector: 'app-image-attachment',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-attachment.component.html',
  styleUrls: ['./image-attachment.component.css'],
})
export class ImageAttachmentComponent {
  @Input() disabled = false;
  @Output() imageSelected = new EventEmitter<CompressedImage>();
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  isProcessing = false;

  /**
   * Trigger file input click
   */
  onButtonClick(): void {
    if (!this.disabled && !this.isProcessing) {
      this.fileInput.nativeElement.click();
    }
  }

  /**
   * Handle file selection
   */
  async onFileSelected(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];

    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      alert('Please select an image file.');
      return;
    }

    // Validate file size (5MB limit)
    const maxSize = 5 * 1024 * 1024; // 5MB
    if (file.size > maxSize) {
      alert('Image size must be less than  5MB.');
      return;
    }

    this.isProcessing = true;

    try {
      const compressedImage = await this.compressImage(file);
      this.imageSelected.emit(compressedImage);
    } catch (error) {
      console.error('Error processing image:', error);
      alert('Failed to process image. Please try again.');
    } finally {
      this.isProcessing = false;
      // Reset input
      input.value = '';
    }
  }

  /**
   * Compress image to JPEG at 50% quality
   */
  private async compressImage(file: File): Promise<CompressedImage> {
    // Force JPEG conversion for all images, regardless of size
    // This ensures consistent encryption and rendering

    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    const img = new Image();

    // Special handling for SVG files
    let imageSrc: string;
    if (file.type === 'image/svg+xml') {
      // Read SVG as text and convert to data URL
      const svgText = await file.text();
      const svgBlob = new Blob([svgText], { type: 'image/svg+xml' });
      imageSrc = URL.createObjectURL(svgBlob);
    } else {
      imageSrc = URL.createObjectURL(file);
    }

    return new Promise((resolve, reject) => {

        img.onload = () => {
          try {
            // Calculate new dimensions (max 1920px width/height)
            const maxDimension = 1920;
            let { width, height } = img;

            // For SVGs with no intrinsic dimensions, use default size
            if (width === 0 || height === 0) {
              width = 512;
              height = 512;
            }

            if (width > maxDimension || height > maxDimension) {
              if (width > height) {
                height = (height * maxDimension) / width;
                width = maxDimension;
              } else {
                width = (width * maxDimension) / height;
                height = maxDimension;
              }
            }

            // Set canvas dimensions
            canvas.width = width;
            canvas.height = height;

            // Draw and compress
            ctx?.drawImage(img, 0, 0, width, height);

            // Determine quality based on original file size
            let quality = 0.8; // Default high quality
            if (file.size > 1024 * 1024) { // > 1MB
              quality = 0.6;
            } else if (file.size > 2 * 1024 * 1024) { // > 2MB
              quality = 0.4;
            }

            canvas.toBlob(
              blob => {
                // Clean up object URL
                URL.revokeObjectURL(imageSrc);

                if (!blob) {
                  reject(new Error('Failed to compress image'));
                  return;
                }

                // Always use JPEG version for security consistency
                // Create compressed file
                const compressedFile = new File(
                  [blob],
                  `${file.name.replace(/\.[^/.]+$/, '')}.jpg`,
                  { type: 'image/jpeg' }
                );

                // Create preview URL
                const preview = URL.createObjectURL(blob);

                resolve({
                  file: compressedFile,
                  preview,
                  originalSize: file.size,
                  compressedSize: blob.size,
                });
              },
              'image/jpeg',
              quality
            );
          } catch (error) {
            URL.revokeObjectURL(imageSrc);
            reject(error);
          }
        };

        img.onerror = () => {
          URL.revokeObjectURL(imageSrc);
          reject(new Error('Failed to load image'));
        };

        img.src = imageSrc;
      });
  }
}
