import { Request, Response, NextFunction } from 'express';
import { securityHeaders } from '../security-headers';

describe('Security Headers Middleware (Security Critical)', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let originalNodeEnv: string | undefined;

  beforeEach(() => {
    // Store original NODE_ENV
    originalNodeEnv = process.env.NODE_ENV;

    // Mock request object
    mockReq = {
      path: '/api/test',
    };

    // Mock response object
    mockRes = {
      removeHeader: jest.fn(),
      setHeader: jest.fn(),
    };

    mockNext = jest.fn();

    // Clear all mocks
    jest.clearAllMocks();
  });

  afterEach(() => {
    // Restore original NODE_ENV
    if (originalNodeEnv !== undefined) {
      process.env.NODE_ENV = originalNodeEnv;
    } else {
      delete process.env.NODE_ENV;
    }
  });

  describe('Basic Security Headers', () => {
    // Run: npm test -- --testPathPattern="security-headers.test.ts"
    it('calls next middleware', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('removes X-Powered-By header', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.removeHeader).toHaveBeenCalledWith('X-Powered-By');
    });

    it('sets X-Content-Type-Options header', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-Content-Type-Options',
        'nosniff',
      );
    });

    it('sets X-Frame-Options header', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-Frame-Options',
        'DENY',
      );
    });

    it('sets X-XSS-Protection header', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-XSS-Protection',
        '1; mode=block',
      );
    });

    it('sets Referrer-Policy header', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Referrer-Policy',
        'strict-origin-when-cross-origin',
      );
    });

    it('sets Permissions-Policy header', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Permissions-Policy',
        'geolocation=(), microphone=(), camera=()',
      );
    });
  });

  describe('HSTS Header (Production Only)', () => {
    it('sets HSTS header in production environment', () => {
      process.env.NODE_ENV = 'production';

      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        'max-age=31536000; includeSubDomains; preload',
      );
    });

    it('does not set HSTS header in development environment', () => {
      process.env.NODE_ENV = 'development';

      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).not.toHaveBeenCalledWith(
        'Strict-Transport-Security',
        expect.any(String),
      );
    });

    it('does not set HSTS header when NODE_ENV is undefined', () => {
      delete process.env.NODE_ENV;

      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).not.toHaveBeenCalledWith(
        'Strict-Transport-Security',
        expect.any(String),
      );
    });

    it('does not set HSTS header in test environment', () => {
      process.env.NODE_ENV = 'test';

      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).not.toHaveBeenCalledWith(
        'Strict-Transport-Security',
        expect.any(String),
      );
    });
  });

  describe('Content Security Policy', () => {
    it('sets CSP header for API endpoints', () => {
      const testReq = { ...mockReq, path: '/api/users' };

      securityHeaders(testReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        'default-src \'none\'; frame-ancestors \'none\'',
      );
    });

    it('sets CSP header for API endpoints with nested paths', () => {
      const testReq = { ...mockReq, path: '/api/v1/users/123' };

      securityHeaders(testReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        'default-src \'none\'; frame-ancestors \'none\'',
      );
    });

    it('does not set CSP header for non-API endpoints', () => {
      const testReq = { ...mockReq, path: '/health' };

      securityHeaders(testReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).not.toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.any(String),
      );
    });

    it('does not set CSP header for root path', () => {
      const testReq = { ...mockReq, path: '/' };

      securityHeaders(testReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).not.toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.any(String),
      );
    });

    it('does not set CSP header for static assets', () => {
      const testReq = { ...mockReq, path: '/static/css/main.css' };

      securityHeaders(testReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).not.toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.any(String),
      );
    });

    it('handles case-sensitive API path checking', () => {
      const testReq = { ...mockReq, path: '/API/users' }; // uppercase API

      securityHeaders(testReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).not.toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.any(String),
      );
    });
  });

  describe('Header Values Validation', () => {
    it('uses secure X-Frame-Options value', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-Frame-Options',
        'DENY',
      );
      
      // Should not use less secure values
      expect(mockRes.setHeader).not.toHaveBeenCalledWith(
        'X-Frame-Options',
        'SAMEORIGIN',
      );
    });

    it('uses proper XSS protection configuration', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'X-XSS-Protection',
        '1; mode=block',
      );
    });

    it('uses strict referrer policy', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Referrer-Policy',
        'strict-origin-when-cross-origin',
      );
    });

    it('uses restrictive permissions policy', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Permissions-Policy',
        'geolocation=(), microphone=(), camera=()',
      );
    });

    it('uses strict CSP for API endpoints', () => {
      const testReq = { ...mockReq, path: '/api/test' };

      securityHeaders(testReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Content-Security-Policy',
        'default-src \'none\'; frame-ancestors \'none\'',
      );
    });
  });

  describe('Production HSTS Configuration', () => {
    beforeEach(() => {
      process.env.NODE_ENV = 'production';
    });

    it('includes proper HSTS max-age', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        expect.stringContaining('max-age=31536000'),
      );
    });

    it('includes includeSubDomains directive', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        expect.stringContaining('includeSubDomains'),
      );
    });

    it('includes preload directive', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith(
        'Strict-Transport-Security',
        expect.stringContaining('preload'),
      );
    });
  });

  describe('Security Best Practices', () => {
    it('sets all required security headers', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      // Verify all critical security headers are set
      const expectedHeaders = [
        'X-Content-Type-Options',
        'X-Frame-Options',
        'X-XSS-Protection',
        'Referrer-Policy',
        'Permissions-Policy',
      ];

      expectedHeaders.forEach(header => {
        expect(mockRes.setHeader).toHaveBeenCalledWith(
          header,
          expect.any(String),
        );
      });
    });

    it('removes potentially revealing headers', () => {
      securityHeaders(mockReq as Request, mockRes as Response, mockNext);

      expect(mockRes.removeHeader).toHaveBeenCalledWith('X-Powered-By');
    });

    it('handles different request paths correctly', () => {
      const testPaths = [
        '/api/auth/login',
        '/api/users/profile',
        '/api/v1/messages',
        '/health',
        '/static/js/app.js',
        '/',
      ];

      testPaths.forEach(path => {
        jest.clearAllMocks();
        const testReq = { ...mockReq, path };

        securityHeaders(testReq as Request, mockRes as Response, mockNext);

        // Basic headers should always be set
        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'X-Content-Type-Options',
          'nosniff',
        );
        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'X-Frame-Options',
          'DENY',
        );

        // CSP should only be set for API paths
        if (path.startsWith('/api/')) {
          expect(mockRes.setHeader).toHaveBeenCalledWith(
            'Content-Security-Policy',
            expect.any(String),
          );
        } else {
          expect(mockRes.setHeader).not.toHaveBeenCalledWith(
            'Content-Security-Policy',
            expect.any(String),
          );
        }
      });
    });
  });

  describe('Error Handling and Edge Cases', () => {
    it('handles undefined request path gracefully', () => {
      const testReq = { ...mockReq, path: undefined as any };

      expect(() => {
        securityHeaders(testReq as Request, mockRes as Response, mockNext);
      }).not.toThrow();

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('handles empty request path', () => {
      const testReq = { ...mockReq, path: '' };

      securityHeaders(testReq as Request, mockRes as Response, mockNext);

      expect(mockRes.setHeader).not.toHaveBeenCalledWith(
        'Content-Security-Policy',
        expect.any(String),
      );
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('handles response header errors gracefully', () => {
      mockRes.setHeader = jest.fn().mockImplementation(() => {
        throw new Error('Header error');
      });

      expect(() => {
        securityHeaders(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow('Header error');
    });

    it('handles remove header errors gracefully', () => {
      mockRes.removeHeader = jest.fn().mockImplementation(() => {
        throw new Error('Remove header error');
      });

      expect(() => {
        securityHeaders(mockReq as Request, mockRes as Response, mockNext);
      }).toThrow('Remove header error');
    });
  });

  describe('Integration with Different Environments', () => {
    const environments = ['development', 'test', 'staging', 'production'];

    environments.forEach(env => {
      it(`works correctly in ${env} environment`, () => {
        process.env.NODE_ENV = env;

        securityHeaders(mockReq as Request, mockRes as Response, mockNext);

        // Basic headers should always be set
        expect(mockRes.setHeader).toHaveBeenCalledWith(
          'X-Content-Type-Options',
          'nosniff',
        );

        // HSTS should only be set in production
        if (env === 'production') {
          expect(mockRes.setHeader).toHaveBeenCalledWith(
            'Strict-Transport-Security',
            expect.any(String),
          );
        } else {
          expect(mockRes.setHeader).not.toHaveBeenCalledWith(
            'Strict-Transport-Security',
            expect.any(String),
          );
        }

        expect(mockNext).toHaveBeenCalledTimes(1);
      });
    });
  });
});