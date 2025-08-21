import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ImageModalComponent } from './image-modal.component';

describe('ImageModalComponent', () => {
  let component: ImageModalComponent;
  let fixture: ComponentFixture<ImageModalComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ImageModalComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(ImageModalComponent);
    component = fixture.componentInstance;
  });

  // Run: npm test
  it('creates with defaults', () => {
    expect(component).toBeTruthy();
    expect(component.imageUrl).toBe('');
    expect(component.isVisible).toBe(false);
    expect(component.zoomLevel).toBe(1);
    expect(component.isLoading).toBe(true);
  });

  it('handles zoom controls', () => {
    // Test zoom in
    component.zoomIn();
    expect(component.zoomLevel).toBe(1.2);
    
    // Test zoom out
    component.zoomOut();
    expect(component.zoomLevel).toBe(1);
    
    // Test max zoom limit
    component.zoomLevel = 2.9;
    component.zoomIn();
    expect(component.zoomLevel).toBe(3);
    
    // Test min zoom limit
    component.zoomLevel = 0.6;
    component.zoomOut();
    expect(component.zoomLevel).toBe(0.5);
  });

  it('emits close events', () => {
    spyOn(component.closeModal, 'emit');
    
    // Test close modal
    component.onCloseModal();
    expect(component.closeModal.emit).toHaveBeenCalled();
    expect(component.zoomLevel).toBe(1);
    expect(component.isLoading).toBe(true);
    
    // Test backdrop click
    const mockEvent = {
      target: document.createElement('div'),
      currentTarget: document.createElement('div')
    };
    mockEvent.target = mockEvent.currentTarget;
    
    component.onBackdropClick(mockEvent as unknown as Event);
    expect(component.closeModal.emit).toHaveBeenCalledTimes(2);
  });

  it('handles keyboard shortcuts', () => {
    component.isVisible = true;
    
    // Test zoom in with +
    const plusEvent = new KeyboardEvent('keydown', { key: '+' });
    spyOn(plusEvent, 'preventDefault');
    component.onKeyDown(plusEvent);
    expect(plusEvent.preventDefault).toHaveBeenCalled();
    expect(component.zoomLevel).toBe(1.2);
    
    // Test reset zoom with 0
    const resetEvent = new KeyboardEvent('keydown', { key: '0' });
    spyOn(resetEvent, 'preventDefault');
    component.onKeyDown(resetEvent);
    expect(resetEvent.preventDefault).toHaveBeenCalled();
    expect(component.zoomLevel).toBe(1);
    
    // Test escape key
    spyOn(component.closeModal, 'emit');
    component.onEscapeKey();
    expect(component.closeModal.emit).toHaveBeenCalled();
  });

  it('handles mouse interactions', () => {
    // Test mouse wheel zoom
    const wheelEvent = new WheelEvent('wheel', { deltaY: -100 });
    spyOn(wheelEvent, 'preventDefault');
    
    component.onWheel(wheelEvent);
    expect(wheelEvent.preventDefault).toHaveBeenCalled();
    expect(component.zoomLevel).toBe(1.2);
    
    // Test dragging when zoomed
    component.zoomLevel = 2;
    const mouseDownEvent = new MouseEvent('mousedown', { clientX: 100, clientY: 100 });
    spyOn(mouseDownEvent, 'preventDefault');
    
    component.onMouseDown(mouseDownEvent);
    expect(component.isDragging).toBe(true);
    expect(mouseDownEvent.preventDefault).toHaveBeenCalled();
    
    // Test mouse move while dragging
    const mouseMoveEvent = new MouseEvent('mousemove', { clientX: 150, clientY: 150 });
    component.onMouseMove(mouseMoveEvent);
    expect(component.imagePosition.x).toBe(50);
    expect(component.imagePosition.y).toBe(50);
    
    // Test mouse up stops dragging
    component.onMouseUp();
    expect(component.isDragging).toBe(false);
  });
});