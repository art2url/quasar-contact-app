import { ComponentFixture, TestBed } from '@angular/core/testing';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';

import { CacheInfoBannerComponent } from './cache-info-banner.component';

describe('CacheInfoBannerComponent', () => {
  let component: CacheInfoBannerComponent;
  let fixture: ComponentFixture<CacheInfoBannerComponent>;
  let compiled: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CacheInfoBannerComponent, MatIconModule, MatButtonModule],
    }).compileComponents();

    fixture = TestBed.createComponent(CacheInfoBannerComponent);
    component = fixture.componentInstance;
    compiled = fixture.nativeElement as HTMLElement;
    
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // Run: npm test
  it('creates and toggles banner', () => {
    expect(component).toBeTruthy();
    expect(component.showBanner).toBe(false);
    
    fixture.detectChanges();
    expect(compiled.querySelector('.cache-info-banner')).toBeNull();
    
    component.showBanner = true;
    fixture.detectChanges();
    expect(compiled.querySelector('.cache-info-banner')).toBeTruthy();
  });

  it('displays content', () => {
    component.showBanner = true;
    fixture.detectChanges();
    
    const headerText = compiled.querySelector('.head')?.textContent?.trim();
    const infoIcon = compiled.querySelector('mat-icon:first-child')?.textContent?.trim();
    const closeButton = compiled.querySelector('button[mat-icon-button]');
    
    expect(headerText).toBe('Some older messages may not display their original text.');
    expect(infoIcon).toBe('info');
    expect(closeButton?.getAttribute('title')).toBe('Dismiss');
  });

  it('dismisses banner', () => {
    component.showBanner = true;
    fixture.detectChanges();
    
    const closeButton = compiled.querySelector('button[mat-icon-button]') as HTMLButtonElement;
    closeButton.click();
    fixture.detectChanges();
    
    expect(component.showBanner).toBe(false);
    expect(compiled.querySelector('.cache-info-banner')).toBeNull();
    expect(localStorage.getItem('cacheInfoDismissed')).toBe('true');
  });

  it('handles localStorage errors', () => {
    spyOn(localStorage, 'setItem').and.throwError('LocalStorage error');
    spyOn(console, 'warn');
    
    component.showBanner = true;
    component.dismissBanner();
    
    expect(component.showBanner).toBe(false);
    expect(console.warn).toHaveBeenCalled();
  });

  it('has accessibility attributes', () => {
    component.showBanner = true;
    fixture.detectChanges();
    
    const closeButton = compiled.querySelector('button[mat-icon-button]');
    const icons = compiled.querySelectorAll('mat-icon');
    
    expect(closeButton?.getAttribute('title')).toBe('Dismiss');
    expect(icons.length).toBe(2);
  });
});