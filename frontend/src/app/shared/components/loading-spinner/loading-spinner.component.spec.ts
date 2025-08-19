import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';

import { LoadingSpinnerComponent } from './loading-spinner.component';

describe('LoadingSpinnerComponent', () => {
  let component: LoadingSpinnerComponent;
  let fixture: ComponentFixture<LoadingSpinnerComponent>;
  let compiled: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LoadingSpinnerComponent, MatProgressSpinnerModule],
    }).compileComponents();

    fixture = TestBed.createComponent(LoadingSpinnerComponent);
    component = fixture.componentInstance;
    compiled = fixture.nativeElement as HTMLElement;
  });

  // Run: npm test
  it('creates with defaults', () => {
    expect(component).toBeTruthy();
    expect(component.diameter).toBe(50);
    expect(component.overlay).toBe(false);
  });

  it('renders spinner', () => {
    fixture.detectChanges();
    
    const spinner = compiled.querySelector('mat-spinner');
    expect(spinner).toBeTruthy();
  });

  it('toggles overlay class', () => {
    // Default: container class
    fixture.detectChanges();
    expect(compiled.querySelector('.spinner-container')).toBeTruthy();
    expect(compiled.querySelector('.spinner-overlay')).toBeNull();
    
    // Change to overlay
    component.overlay = true;
    fixture.detectChanges();
    expect(compiled.querySelector('.spinner-overlay')).toBeTruthy();
    expect(compiled.querySelector('.spinner-container')).toBeNull();
  });

  it('accepts diameter input', () => {
    component.diameter = 100;
    fixture.detectChanges();
    
    expect(component.diameter).toBe(100);
    const spinner = compiled.querySelector('mat-spinner');
    expect(spinner).toBeTruthy();
  });

  it('has proper structure', () => {
    fixture.detectChanges();
    
    const container = compiled.querySelector('div');
    const spinner = container?.querySelector('mat-spinner');
    
    expect(container).toBeTruthy();
    expect(spinner).toBeTruthy();
  });
});