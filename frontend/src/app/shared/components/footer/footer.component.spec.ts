import { ComponentFixture, TestBed } from '@angular/core/testing';

import { FooterComponent } from './footer.component';

describe('FooterComponent', () => {
  let component: FooterComponent;
  let fixture: ComponentFixture<FooterComponent>;
  let compiled: HTMLElement;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [FooterComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(FooterComponent);
    component = fixture.componentInstance;
    compiled = fixture.nativeElement as HTMLElement;
  });

  // Run: npm test
  it('creates with current year', () => {
    expect(component).toBeTruthy();
    expect(component.currentYear).toBe(new Date().getFullYear());
  });

  it('displays copyright', () => {
    fixture.detectChanges();
    
    const copyright = compiled.querySelector('.footer-copyright');
    const currentYear = new Date().getFullYear();
    
    expect(copyright?.textContent?.trim()).toContain(`© ${currentYear} Quasar Contact`);
    expect(copyright?.textContent?.trim()).toContain('Artem Turlenko');
  });

  it('shows social links', () => {
    fixture.detectChanges();
    
    const links = compiled.querySelectorAll('.footer-social a');
    
    expect(links.length).toBe(3);
    expect(links[0].getAttribute('href')).toContain('github.com/art2url/quasar-contact-app');
    expect(links[1].getAttribute('href')).toContain('github.com/art2url');
    expect(links[2].getAttribute('href')).toContain('linkedin.com/in/artem-turlenko');
  });

  it('has accessibility attributes', () => {
    fixture.detectChanges();
    
    const footer = compiled.querySelector('footer');
    const links = compiled.querySelectorAll('.footer-social a');
    
    expect(footer?.getAttribute('role')).toBe('contentinfo');
    expect(links[0].getAttribute('aria-label')).toBe('Source code of project');
    expect(links[1].getAttribute('aria-label')).toBe('Author of the Project');
    expect(links[2].getAttribute('aria-label')).toContain('LinkedIn');
  });

  it('has secure link attributes', () => {
    fixture.detectChanges();
    
    const links = compiled.querySelectorAll('.footer-social a');
    
    links.forEach(link => {
      expect(link.getAttribute('target')).toBe('_blank');
      expect(link.getAttribute('rel')).toBe('noopener noreferrer');
    });
  });
});