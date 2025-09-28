import { CsrfService } from './csrf.service';

describe('CsrfService (Business Logic)', () => {
  let service: CsrfService;

  beforeEach(() => {
    service = new CsrfService();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  // Run: npm test -- --include="**/csrf.service.spec.ts"
  describe('Token Storage', () => {
    it('sets token in memory and localStorage', () => {
      const token = 'csrf-token-123';

      service.setToken(token);

      expect(service.getToken()).toBe(token);
      expect(localStorage.getItem('csrf_token')).toBe(token);
    });

    it('overwrites existing token', () => {
      service.setToken('old-token');
      service.setToken('new-token');

      expect(service.getToken()).toBe('new-token');
      expect(localStorage.getItem('csrf_token')).toBe('new-token');
    });
  });

  describe('Token Retrieval', () => {
    it('returns token from memory when available', () => {
      const token = 'memory-token';
      service.setToken(token);

      expect(service.getToken()).toBe(token);
    });

    it('falls back to localStorage when memory is empty', () => {
      const token = 'stored-token';
      localStorage.setItem('csrf_token', token);

      const newService = new CsrfService();
      expect(newService.getToken()).toBe(token);
    });

    it('returns null when no token exists', () => {
      expect(service.getToken()).toBeNull();
    });

    it('loads token from localStorage to memory on first access', () => {
      const token = 'persistent-token';
      localStorage.setItem('csrf_token', token);

      const newService = new CsrfService();
      expect(newService.getToken()).toBe(token);
      // Should now be in memory
      localStorage.removeItem('csrf_token');
      expect(newService.getToken()).toBe(token);
    });
  });

  describe('Token Clearing', () => {
    it('clears token from memory and localStorage', () => {
      service.setToken('test-token');
      service.clearToken();

      expect(service.getToken()).toBeNull();
      expect(localStorage.getItem('csrf_token')).toBeNull();
    });

    it('handles clearing when no token exists', () => {
      service.clearToken();

      expect(service.getToken()).toBeNull();
      expect(localStorage.getItem('csrf_token')).toBeNull();
    });
  });

  describe('Token Existence Check', () => {
    it('returns true when token exists in memory', () => {
      service.setToken('test-token');

      expect(service.hasToken()).toBe(true);
    });

    it('returns true when token exists in localStorage', () => {
      localStorage.setItem('csrf_token', 'stored-token');
      const newService = new CsrfService();

      expect(newService.hasToken()).toBe(true);
    });

    it('returns false when no token exists', () => {
      expect(service.hasToken()).toBe(false);
    });

    it('returns false after token is cleared', () => {
      service.setToken('test-token');
      service.clearToken();

      expect(service.hasToken()).toBe(false);
    });
  });

  describe('Persistence Behavior', () => {
    it('persists token across service instances', () => {
      const token = 'persistent-token';
      service.setToken(token);

      const newService = new CsrfService();
      expect(newService.getToken()).toBe(token);
    });

    it('handles empty localStorage gracefully', () => {
      localStorage.removeItem('csrf_token');

      expect(service.getToken()).toBeNull();
      expect(service.hasToken()).toBe(false);
    });
  });
});