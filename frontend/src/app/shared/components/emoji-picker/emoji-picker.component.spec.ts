import { ComponentFixture, TestBed } from '@angular/core/testing';

import { EmojiPickerComponent } from './emoji-picker.component';

describe('EmojiPickerComponent', () => {
  let component: EmojiPickerComponent;
  let fixture: ComponentFixture<EmojiPickerComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [EmojiPickerComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(EmojiPickerComponent);
    component = fixture.componentInstance;
  });

  // Run: npm test
  it('creates with defaults', () => {
    expect(component).toBeTruthy();
    expect(component.showPicker).toBe(false);
    expect(component.disabled).toBe(false);
    expect(component.popularEmojis.length).toBeGreaterThan(0);
  });

  it('toggles picker visibility', () => {
    const mockEvent = new Event('click');
    spyOn(mockEvent, 'stopPropagation');
    
    expect(component.showPicker).toBe(false);
    
    component.togglePicker(mockEvent);
    expect(component.showPicker).toBe(true);
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
    
    component.togglePicker(mockEvent);
    expect(component.showPicker).toBe(false);
  });

  it('emits emoji selection', () => {
    spyOn(component.emojiSelected, 'emit');
    const mockEvent = new Event('click');
    spyOn(mockEvent, 'preventDefault');
    spyOn(mockEvent, 'stopPropagation');
    
    component.onEmojiClick('😀', mockEvent);
    
    expect(component.emojiSelected.emit).toHaveBeenCalledWith('😀');
    expect(mockEvent.preventDefault).toHaveBeenCalled();
    expect(mockEvent.stopPropagation).toHaveBeenCalled();
  });

  it('handles keyboard navigation', () => {
    component.showPicker = true;
    const escapeEvent = new KeyboardEvent('keydown', { key: 'Escape' });
    
    component.onKeyDown(escapeEvent);
    expect(component.showPicker).toBe(false);
    
    // Other keys should not close picker
    component.showPicker = true;
    const enterEvent = new KeyboardEvent('keydown', { key: 'Enter' });
    component.onKeyDown(enterEvent);
    expect(component.showPicker).toBe(true);
  });

  it('closes on document click', () => {
    component.showPicker = true;
    
    component.onDocumentClick();
    expect(component.showPicker).toBe(false);
    
    // Should not affect closed picker
    component.onDocumentClick();
    expect(component.showPicker).toBe(false);
  });
});