import { CommonModule } from '@angular/common';
import {
  Component,
  ElementRef,
  EventEmitter,
  Input,
  Output,
  ViewChild,
  OnDestroy,
} from '@angular/core';
import { timer, Subscription } from 'rxjs';

export interface CompressedImage {
  file: File;
  preview: string;
  originalSize: number;
  compressedSize: number;
}

export interface UploadProgress {
  uploading: boolean;
  progress: number; // 0-100
  status: 'compressing' | 'uploading' | 'completed' | 'failed';
  error?: string;
}

@Component({
  selector: 'app-image-attachment',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './image-attachment.component.html',
  styleUrls: ['./image-attachment.component.css'],
})
export class ImageAttachmentComponent implements OnDestroy {
  @Input() disabled = false;
  @Output() imageSelected = new EventEmitter<CompressedImage>();
  @Output() uploadProgress = new EventEmitter<UploadProgress>();
  @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;

  isProcessing = false;
  currentProgress: UploadProgress = {
    uploading: false,
    progress: 0,
    status: 'completed'
  };

  private progressResetSubscription?: Subscription;

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
    this.updateProgress({
      uploading: true,
      progress: 0,
      status: 'compressing'
    });

    try {
      const compressedImage = await this.compressImage(file);
      
      this.updateProgress({
        uploading: false,
        progress: 100,
        status: 'completed'
      });
      
      this.imageSelected.emit(compressedImage);
    } catch (error) {
      console.error('Error processing image:', error);
      
      this.updateProgress({
        uploading: false,
        progress: 0,
        status: 'failed',
        error: 'Failed to process image. Please try again.'
      });
      
      alert('Failed to process image. Please try again.');
    } finally {
      this.isProcessing = false;
      // Reset input
      input.value = '';
      
      // Clear progress after a delay using RxJS timer
      this.progressResetSubscription = timer(2000).subscribe(() => {
        this.updateProgress({
          uploading: false,
          progress: 0,
          status: 'completed'
        });
      });
    }
  }

  /**
   * Update progress and emit to parent
   */
  private updateProgress(progress: Partial<UploadProgress>): void {
    this.currentProgress = { ...this.currentProgress, ...progress };
    this.uploadProgress.emit(this.currentProgress);
  }

  ngOnDestroy(): void {
    this.progressResetSubscription?.unsubscribe();
  }

  /**
   * Compress image to JPEG at 50% quality
   */
  private async compressImage(file: File): Promise<CompressedImage> {
    // Force JPEG conversion for all images, regardless of size
    // This ensures consistent encryption and rendering

    this.updateProgress({
      uploading: true,
      progress: 20,
      status: 'compressing'
    });

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
        // Add timeout to prevent hanging
        const timeout = setTimeout(() => {
          URL.revokeObjectURL(imageSrc);
          reject(new Error('Image processing timeout'));
        }, 30000); // 30 second timeout

        img.onload = () => {
          clearTimeout(timeout);
          try {
            this.updateProgress({
              uploading: true,
              progress: 50,
              status: 'compressing'
            });

            // Calculate new dimensions - use smaller max for mobile photo library images
            const maxDimension = file.size > 3 * 1024 * 1024 ? 1280 : 1920; // 1280px for large files
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

            // Determine quality based on original file size - more aggressive for photo library
            let quality = 0.8; // Default high quality
            if (file.size > 1024 * 1024) { // > 1MB
              quality = 0.7;
            }
            if (file.size > 2 * 1024 * 1024) { // > 2MB
              quality = 0.6;
            }
            if (file.size > 3 * 1024 * 1024) { // > 3MB
              quality = 0.5;
            }
            if (file.size > 4 * 1024 * 1024) { // > 4MB
              quality = 0.4;
            }

            this.updateProgress({
              uploading: true,
              progress: 80,
              status: 'compressing'
            });

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

                const result = {
                  file: compressedFile,
                  preview,
                  originalSize: file.size,
                  compressedSize: blob.size,
                };


                resolve(result);
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
          clearTimeout(timeout);
          URL.revokeObjectURL(imageSrc);
          reject(new Error('Failed to load image'));
        };

        img.src = imageSrc;
      });
  }
}
