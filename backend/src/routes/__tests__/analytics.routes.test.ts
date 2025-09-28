import request from 'supertest';
import express from 'express';
import analyticsRoutes from '../analytics.routes';

// Mock fetch globally
global.fetch = jest.fn();

describe('Analytics Routes (Privacy Critical)', () => {
  let app: express.Application;
  let originalEnv: NodeJS.ProcessEnv;

  beforeEach(() => {
    // Store original environment
    originalEnv = { ...process.env };
    
    app = express();
    app.use(express.json());
    app.use(express.text());
    app.use('/analytics', analyticsRoutes);

    // Clear all mocks
    jest.clearAllMocks();

    // Mock console methods
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    // Restore original environment
    process.env = originalEnv;
    jest.restoreAllMocks();
  });

  describe('Analytics Configuration', () => {
    // Run: npm test -- --testPathPattern="analytics.routes.test.ts"
    it('returns error when GA_MEASUREMENT_ID is missing', async () => {
      delete process.env.GA_MEASUREMENT_ID;
      process.env.GA_API_SECRET = 'test-secret';

      const response = await request(app)
        .post('/analytics')
        .send({
          client_id: 'test-client-id',
          events: [{ name: 'page_view' }],
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Analytics not configured',
        type: 'config_error',
      });
      expect(console.error).toHaveBeenCalledWith(
        'Analytics not configured - missing environment variables',
      );
    });

    it('returns error when GA_API_SECRET is missing', async () => {
      process.env.GA_MEASUREMENT_ID = 'G-TEST123';
      delete process.env.GA_API_SECRET;

      const response = await request(app)
        .post('/analytics')
        .send({
          client_id: 'test-client-id',
          events: [{ name: 'page_view' }],
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Analytics not configured',
        type: 'config_error',
      });
    });

    it('returns error when both environment variables are missing', async () => {
      delete process.env.GA_MEASUREMENT_ID;
      delete process.env.GA_API_SECRET;

      const response = await request(app)
        .post('/analytics')
        .send({
          client_id: 'test-client-id',
          events: [{ name: 'page_view' }],
        });

      expect(response.status).toBe(500);
      expect(response.body.type).toBe('config_error');
    });
  });

  describe('Request Validation', () => {
    beforeEach(() => {
      process.env.GA_MEASUREMENT_ID = 'G-TEST123';
      process.env.GA_API_SECRET = 'test-secret';
    });

    it('validates client_id is present', async () => {
      const response = await request(app)
        .post('/analytics')
        .send({
          events: [{ name: 'page_view' }],
        });

      expect(response.status).toBe(400);
      expect(response.body).toEqual({
        error: 'Invalid request format',
        type: 'validation_error',
      });
    });

    it('validates events array is present', async () => {
      const response = await request(app)
        .post('/analytics')
        .send({
          client_id: 'test-client-id',
        });

      expect(response.status).toBe(400);
      expect(response.body.type).toBe('validation_error');
    });

    it('validates events is an array', async () => {
      const response = await request(app)
        .post('/analytics')
        .send({
          client_id: 'test-client-id',
          events: 'not-an-array',
        });

      expect(response.status).toBe(400);
      expect(response.body.type).toBe('validation_error');
    });

    it('handles empty events array', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const response = await request(app)
        .post('/analytics')
        .send({
          client_id: 'test-client-id',
          events: [],
        });

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        processed: 0,
      });
    });
  });

  describe('SendBeacon Text Parsing', () => {
    beforeEach(() => {
      process.env.GA_MEASUREMENT_ID = 'G-TEST123';
      process.env.GA_API_SECRET = 'test-secret';
    });

    it('parses JSON string from sendBeacon', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const analyticsData = {
        client_id: 'test-client-id',
        events: [{ name: 'page_view', parameters: { page_title: 'Test' } }],
      };

      const response = await request(app)
        .post('/analytics')
        .set('Content-Type', 'text/plain')
        .send(JSON.stringify(analyticsData));

      expect(response.status).toBe(200);
      expect(response.body.processed).toBe(1);
      expect(global.fetch).toHaveBeenCalledWith(
        expect.stringContaining('https://www.google-analytics.com/mp/collect'),
        expect.objectContaining({
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(analyticsData),
        }),
      );
    });

    it('handles invalid JSON from sendBeacon', async () => {
      const response = await request(app)
        .post('/analytics')
        .set('Content-Type', 'text/plain')
        .send('invalid-json-{');

      expect(response.status).toBe(500);
      expect(response.body.type).toBe('proxy_error');
      expect(console.error).toHaveBeenCalledWith(
        'Analytics proxy error:',
        expect.objectContaining({
          error: expect.any(String),
        }),
      );
    });
  });

  describe('Google Analytics Integration', () => {
    beforeEach(() => {
      process.env.GA_MEASUREMENT_ID = 'G-TEST123';
      process.env.GA_API_SECRET = 'test-secret';
    });

    it('successfully sends analytics to Google Analytics', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        status: 200,
      });

      const analyticsData = {
        client_id: 'test-client-id-123',
        events: [
          { name: 'page_view', parameters: { page_title: 'Home' } },
          { name: 'click', parameters: { element_id: 'header-logo' } },
        ],
      };

      const response = await request(app)
        .post('/analytics')
        .send(analyticsData);

      expect(response.status).toBe(200);
      expect(response.body).toEqual({
        success: true,
        processed: 2,
      });

      expect(global.fetch).toHaveBeenCalledWith(
        'https://www.google-analytics.com/mp/collect?measurement_id=G-TEST123&api_secret=test-secret',
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(analyticsData),
        },
      );
    });

    it('handles Google Analytics API errors', async () => {
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 400,
      });

      const response = await request(app)
        .post('/analytics')
        .send({
          client_id: 'test-client-id',
          events: [{ name: 'page_view' }],
        });

      expect(response.status).toBe(500);
      expect(response.body).toEqual({
        error: 'Failed to send analytics',
        type: 'proxy_error',
      });
      expect(console.error).toHaveBeenCalledWith(
        'Analytics proxy error:',
        expect.objectContaining({
          error: 'GA API error: 400',
        }),
      );
    });

    it('handles network errors', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Network error'),
      );

      const response = await request(app)
        .post('/analytics')
        .send({
          client_id: 'test-client-id',
          events: [{ name: 'page_view' }],
        });

      expect(response.status).toBe(500);
      expect(response.body.type).toBe('proxy_error');
      expect(console.error).toHaveBeenCalledWith(
        'Analytics proxy error:',
        expect.objectContaining({
          error: 'Network error',
        }),
      );
    });
  });

  describe('Privacy and Security', () => {
    beforeEach(() => {
      process.env.GA_MEASUREMENT_ID = 'G-TEST123';
      process.env.GA_API_SECRET = 'test-secret';
    });

    it('logs IP and path for security monitoring', async () => {
      (global.fetch as jest.Mock).mockRejectedValueOnce(
        new Error('Test error'),
      );

      const response = await request(app)
        .post('/analytics')
        .set('X-Forwarded-For', '192.168.1.1')
        .send({
          client_id: 'test-client-id',
          events: [{ name: 'page_view' }],
        });

      expect(response.status).toBe(500);
      expect(console.error).toHaveBeenCalledWith(
        'Analytics proxy error:',
        expect.objectContaining({
          ip: expect.any(String),
          path: '/',
        }),
      );
    });

    it('handles malformed client_id gracefully', async () => {
      // Test empty string
      let response = await request(app)
        .post('/analytics')
        .send({
          client_id: '',
          events: [{ name: 'page_view' }],
        });

      expect(response.status).toBe(400);
      expect(response.body.type).toBe('validation_error');

      // Test null
      response = await request(app)
        .post('/analytics')
        .send({
          client_id: null,
          events: [{ name: 'page_view' }],
        });

      expect(response.status).toBe(400);
      expect(response.body.type).toBe('validation_error');
    });

    it('handles various event structures safely', async () => {
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
      });

      const eventStructures = [
        [{ name: 'simple_event' }],
        [{ name: 'event_with_params', parameters: { key: 'value' } }],
        [
          { name: 'event1' },
          { name: 'event2', parameters: { count: 1 } },
        ],
      ];

      for (const events of eventStructures) {
        const response = await request(app)
          .post('/analytics')
          .send({
            client_id: 'test-client-id',
            events,
          });

        expect(response.status).toBe(200);
        expect(response.body.processed).toBe(events.length);
      }
    });

    it('prevents analytics configuration leakage in errors', async () => {
      delete process.env.GA_MEASUREMENT_ID;
      delete process.env.GA_API_SECRET;

      const response = await request(app)
        .post('/analytics')
        .send({
          client_id: 'test-client-id',
          events: [{ name: 'page_view' }],
        });

      expect(response.status).toBe(500);
      expect(response.body.error).not.toContain('GA_MEASUREMENT_ID');
      expect(response.body.error).not.toContain('GA_API_SECRET');
      expect(response.body.error).toBe('Analytics not configured');
    });
  });
});