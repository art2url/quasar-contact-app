import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService (Theme Management)', () => {
  let service: ThemeService;
  
  beforeEach(() => {
    // Clear localStorage and reset DOM
    localStorage.clear();
    document.documentElement.className = '';
    
    // Clear any existing theme-color meta tag
    const existingMeta = document.querySelector('meta[name="theme-color"]');
    if (existingMeta) {
      existingMeta.remove();
    }
    
    // Add fresh theme-color meta tag for testing
    const metaTag = document.createElement('meta');
    metaTag.setAttribute('name', 'theme-color');
    metaTag.setAttribute('content', '#000000');
    document.head.appendChild(metaTag);

    TestBed.configureTestingModule({
      providers: [ThemeService]
    });
    
    service = TestBed.inject(ThemeService);
  });

  afterEach(() => {
    // Clean up
    localStorage.clear();
    document.documentElement.className = '';
    const metaTag = document.querySelector('meta[name="theme-color"]');
    if (metaTag) {
      metaTag.remove();
    }
  });

  // Run: npm test -- --include="**/theme.service.spec.ts"
  describe('Service Initialization', () => {
    it('initializes with dark theme by default', () => {
      expect(service).toBeDefined();
      expect(service.getCurrentTheme()).toBe('dark');
      expect(service.isDarkTheme()).toBe(true);
      expect(service.isLightTheme()).toBe(false);
    });

    it('applies theme class to document root on initialization', () => {
      expect(document.documentElement.classList.contains('dark-theme')).toBe(true);
    });

    it('sets theme-color meta tag on initialization', () => {
      const metaTag = document.querySelector('meta[name="theme-color"]');
      expect(metaTag?.getAttribute('content')).toBe('#0c2524'); // dark theme color
    });
  });

  describe('Theme Detection and Loading', () => {
    it('loads saved theme from localStorage', () => {
      localStorage.setItem('theme', 'light');
      
      // Create new service instance to test initialization
      const newService = new ThemeService();
      
      expect(newService.getCurrentTheme()).toBe('light');
      expect(document.documentElement.classList.contains('light-theme')).toBe(true);
    });

    it('ignores invalid saved theme values', () => {
      localStorage.setItem('theme', 'invalid-theme');
      
      const newService = new ThemeService();
      
      // Should fall back to default dark theme
      expect(newService.getCurrentTheme()).toBe('dark');
    });

    it('falls back to dark theme when no saved preference exists', () => {
      // Mock system preference detection
      Object.defineProperty(window, 'matchMedia', {
        writable: true,
        value: jasmine.createSpy('matchMedia').and.returnValue({
          matches: false, // System prefers light but service defaults to dark
          media: '(prefers-color-scheme: dark)'
        })
      });
      
      const newService = new ThemeService();
      
      expect(newService.getCurrentTheme()).toBe('dark');
    });
  });

  describe('Theme Switching', () => {
    it('toggles from dark to light theme', () => {
      expect(service.getCurrentTheme()).toBe('dark');
      
      service.toggleTheme();
      
      expect(service.getCurrentTheme()).toBe('light');
      expect(service.isLightTheme()).toBe(true);
      expect(service.isDarkTheme()).toBe(false);
    });

    it('toggles from light to dark theme', () => {
      service.setTheme('light');
      expect(service.getCurrentTheme()).toBe('light');
      
      service.toggleTheme();
      
      expect(service.getCurrentTheme()).toBe('dark');
    });

    it('sets specific theme directly', () => {
      service.setTheme('light');
      
      expect(service.getCurrentTheme()).toBe('light');
      expect(service.isLightTheme()).toBe(true);
    });
  });

  describe('DOM Manipulation', () => {
    it('applies correct CSS class when setting light theme', () => {
      service.setTheme('light');
      
      expect(document.documentElement.classList.contains('light-theme')).toBe(true);
      expect(document.documentElement.classList.contains('dark-theme')).toBe(false);
    });

    it('applies correct CSS class when setting dark theme', () => {
      service.setTheme('light'); // Start with light
      service.setTheme('dark');   // Switch to dark
      
      expect(document.documentElement.classList.contains('dark-theme')).toBe(true);
      expect(document.documentElement.classList.contains('light-theme')).toBe(false);
    });

    it('removes old theme class when switching themes', () => {
      service.setTheme('light');
      expect(document.documentElement.classList.contains('light-theme')).toBe(true);
      
      service.setTheme('dark');
      expect(document.documentElement.classList.contains('light-theme')).toBe(false);
      expect(document.documentElement.classList.contains('dark-theme')).toBe(true);
    });

    it('updates theme-color meta tag when switching to light theme', () => {
      service.setTheme('light');
      
      const metaTag = document.querySelector('meta[name="theme-color"]');
      expect(metaTag?.getAttribute('content')).toBe('#0077cc');
    });

    it('updates theme-color meta tag when switching to dark theme', () => {
      service.setTheme('light');
      service.setTheme('dark');
      
      const metaTag = document.querySelector('meta[name="theme-color"]');
      expect(metaTag?.getAttribute('content')).toBe('#0c2524');
    });

    it('handles missing theme-color meta tag gracefully', () => {
      // Remove the meta tag
      const metaTag = document.querySelector('meta[name="theme-color"]');
      metaTag?.remove();
      
      // Should not throw error
      expect(() => service.setTheme('light')).not.toThrow();
    });
  });

  describe('localStorage Persistence', () => {
    it('saves theme to localStorage when setting theme', () => {
      service.setTheme('light');
      
      expect(localStorage.getItem('theme')).toBe('light');
    });

    it('saves theme to localStorage when toggling theme', () => {
      service.toggleTheme(); // dark -> light
      
      expect(localStorage.getItem('theme')).toBe('light');
    });

    it('updates localStorage on multiple theme changes', () => {
      service.setTheme('light');
      expect(localStorage.getItem('theme')).toBe('light');
      
      service.setTheme('dark');
      expect(localStorage.getItem('theme')).toBe('dark');
    });
  });


  describe('Theme Query Methods', () => {
    it('correctly identifies dark theme state', () => {
      service.setTheme('dark');
      
      expect(service.isDarkTheme()).toBe(true);
      expect(service.isLightTheme()).toBe(false);
    });

    it('correctly identifies light theme state', () => {
      service.setTheme('light');
      
      expect(service.isDarkTheme()).toBe(false);
      expect(service.isLightTheme()).toBe(true);
    });

    it('returns current theme consistently', () => {
      service.setTheme('light');
      
      expect(service.getCurrentTheme()).toBe('light');
      expect(service.getCurrentTheme()).toBe('light'); // Multiple calls should be consistent
    });
  });

  describe('Edge Cases and Error Handling', () => {
    it('handles multiple rapid theme changes', () => {
      // Rapid theme changes should all be applied correctly
      service.setTheme('light');
      service.setTheme('dark');
      service.setTheme('light');
      service.setTheme('dark');
      
      expect(service.getCurrentTheme()).toBe('dark');
      expect(document.documentElement.classList.contains('dark-theme')).toBe(true);
      expect(localStorage.getItem('theme')).toBe('dark');
    });

    it('maintains consistency between all theme indicators', () => {
      service.setTheme('light');
      
      // All methods should be consistent
      expect(service.getCurrentTheme()).toBe('light');
      expect(service.isLightTheme()).toBe(true);
      expect(service.isDarkTheme()).toBe(false);
      expect(document.documentElement.classList.contains('light-theme')).toBe(true);
      expect(localStorage.getItem('theme')).toBe('light');
    });

    it('works correctly when initialized multiple times', () => {
      localStorage.setItem('theme', 'light');
      
      // Create multiple instances
      const service1 = new ThemeService();
      const service2 = new ThemeService();
      
      // Both should load the same saved theme
      expect(service1.getCurrentTheme()).toBe('light');
      expect(service2.getCurrentTheme()).toBe('light');
    });
  });
});