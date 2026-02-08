import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImageAttachmentComponent } from './image-attachment.component';

describe('ImageAttachmentComponent', () => {
  let component: ImageAttachmentComponent;
  let fixture: ComponentFixture<ImageAttachmentComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageAttachmentComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ImageAttachmentComponent);
    component = fixture.componentInstance;
  });

  // Run: npm test
  it('creates with defaults', () => {
    expect(component).toBeTruthy();
    expect(component.disabled).toBe(false);
    expect(component.isProcessing).toBe(false);
    expect(component.currentProgress.status).toBe('completed');
  });

  it('handles button click', () => {
    // Mock file input element
    const mockFileInput = {
      nativeElement: {
        click: jasmine.createSpy('click')
      }
    };
    component.fileInput = mockFileInput as unknown as typeof component.fileInput;
    
    // Test normal click
    component.onButtonClick();
    expect(mockFileInput.nativeElement.click).toHaveBeenCalled();
  });

  it('prevents click when disabled', () => {
    const mockFileInput = {
      nativeElement: {
        click: jasmine.createSpy('click')
      }
    };
    component.fileInput = mockFileInput as unknown as typeof component.fileInput;
    
    component.disabled = true;
    component.onButtonClick();
    expect(mockFileInput.nativeElement.click).not.toHaveBeenCalled();
    
    component.disabled = false;
    component.isProcessing = true;
    component.onButtonClick();
    expect(mockFileInput.nativeElement.click).not.toHaveBeenCalled();
  });

  it('validates file type', async () => {
    spyOn(window, 'alert');
    
    const mockFile = new File(['test'], 'test.txt', { type: 'text/plain' });
    const mockEvent = {
      target: { files: [mockFile] }
    } as unknown as Event & { target: HTMLInputElement };
    
    await component.onFileSelected(mockEvent);
    expect(window.alert).toHaveBeenCalledWith('Please select an image file.');
  });

  it('validates file size', async () => {
    spyOn(window, 'alert');
    
    // Create mock file larger than 4MB
    const largeMockFile = new File(['x'.repeat(5 * 1024 * 1024)], 'large.jpg', { 
      type: 'image/jpeg' 
    });
    const mockEvent = {
      target: { files: [largeMockFile] }
    } as unknown as Event & { target: HTMLInputElement };
    
    await component.onFileSelected(mockEvent);
    expect(window.alert).toHaveBeenCalledWith('Image size must be less than 4MB. Please choose a smaller image.');
  });
});