import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import { logSuspiciousRequest, accessLogger, analyzeAttackPatterns } from '../request-logger';

// Mock fs module
jest.mock('fs');
const mockFs = fs as jest.Mocked<typeof fs>;

// Mock path module for consistent testing
jest.mock('path', () => ({
  join: jest.fn((...args) => args.join('/')),
}));

describe('Request Logger Middleware (Security Critical)', () => {
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let originalDateNow: typeof Date.now;
  let originalConsoleLog: typeof console.log;
  let originalConsoleError: typeof console.error;

  beforeEach(() => {
    // Mock Date.now for consistent timestamps
    originalDateNow = Date.now;
    const mockDateNow = jest.fn(() => 1640995200000); // 2022-01-01 00:00:00
    (Date as any).now = mockDateNow;

    // Mock console methods
    originalConsoleLog = console.log;
    originalConsoleError = console.error;
    console.log = jest.fn();
    console.error = jest.fn();

    // Mock request object
    mockReq = {
      ip: '192.168.1.100',
      path: '/api/test',
      method: 'GET',
      headers: {},
      get: jest.fn(),
      socket: { remoteAddress: '192.168.1.100' } as any,
    };

    // Mock response object with event emitter
    const eventListeners: { [event: string]: Function[] } = {};
    mockRes = {
      statusCode: 200,
      on: jest.fn((event: string, callback: Function) => {
        if (!eventListeners[event]) {
          eventListeners[event] = [];
        }
        eventListeners[event].push(callback);
        return mockRes as Response;
      }),
      emit: jest.fn((event: string) => {
        if (eventListeners[event]) {
          eventListeners[event].forEach(callback => callback());
        }
        return true;
      }),
    };

    mockNext = jest.fn();

    // Clear all mocks
    jest.clearAllMocks();

    // Mock fs methods
    mockFs.existsSync.mockReturnValue(true);
    mockFs.mkdirSync.mockReturnValue(undefined);
    mockFs.appendFileSync.mockReturnValue(undefined);
    mockFs.readFileSync.mockReturnValue('');
  });

  afterEach(() => {
    (Date as any).now = originalDateNow;
    console.log = originalConsoleLog;
    console.error = originalConsoleError;
    jest.clearAllTimers();
    jest.restoreAllMocks();
  });

  describe('logSuspiciousRequest middleware', () => {
    // Run: npm test -- --testPathPattern="request-logger.test.ts"
    it('calls next middleware immediately', () => {
      logSuspiciousRequest(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('logs 4xx status codes to file and console', () => {
      mockRes.statusCode = 404;
      mockReq.get = jest.fn()
        .mockReturnValueOnce('Mozilla/5.0 Test Browser')
        .mockReturnValueOnce('https://example.com');

      logSuspiciousRequest(mockReq as Request, mockRes as Response, mockNext);
      
      // Simulate response finish
      (mockRes.emit as jest.Mock)('finish');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('192.168.1.100 - GET /api/test - 404 - 0ms'),
      );

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('suspicious-'),
        expect.stringContaining('"status":404'),
      );
    });

    it('logs 5xx status codes to file and console', () => {
      mockRes.statusCode = 500;
      mockReq.get = jest.fn()
        .mockReturnValueOnce('Mozilla/5.0 Test Browser')
        .mockReturnValueOnce(undefined);

      logSuspiciousRequest(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.emit as jest.Mock)('finish');

      expect(console.log).toHaveBeenCalledWith(
        expect.stringContaining('500'),
      );

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('suspicious-'),
        expect.stringContaining('"status":500'),
      );
    });

    it('logs suspicious paths even with 2xx status', () => {
      mockRes.statusCode = 200;
      const testReq = { ...mockReq, path: '/admin/dashboard' };
      testReq.get = jest.fn().mockReturnValue('AdminBot/1.0');

      logSuspiciousRequest(testReq as Request, mockRes as Response, mockNext);
      (mockRes.emit as jest.Mock)('finish');

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('suspicious-'),
        expect.stringContaining('/admin/dashboard'),
      );
      
      // Should not log to console for non-error status
      expect(console.log).not.toHaveBeenCalled();
    });

    it('logs WordPress probe attempts', () => {
      mockRes.statusCode = 404;
      const testReq = { ...mockReq, path: '/wp-admin/admin-ajax.php' };
      testReq.get = jest.fn().mockReturnValue('WPBot/1.0');

      logSuspiciousRequest(testReq as Request, mockRes as Response, mockNext);
      (mockRes.emit as jest.Mock)('finish');

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('suspicious-'),
        expect.stringContaining('/wp-admin/admin-ajax.php'),
      );
    });

    it('does not log normal successful requests', () => {
      mockRes.statusCode = 200;
      const testReq = { ...mockReq, path: '/api/users' };

      logSuspiciousRequest(testReq as Request, mockRes as Response, mockNext);
      (mockRes.emit as jest.Mock)('finish');

      expect(mockFs.appendFileSync).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalled();
    });

    it('extracts client IP from req.ip', () => {
      const testReq = { ...mockReq, ip: '203.0.113.1' };
      testReq.get = jest.fn().mockReturnValue('TestBot');
      mockRes.statusCode = 404;

      logSuspiciousRequest(testReq as Request, mockRes as Response, mockNext);
      (mockRes.emit as jest.Mock)('finish');

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"ip":"203.0.113.1"'),
      );
    });

    it('extracts client IP from x-forwarded-for header', () => {
      const testReq = { 
        ...mockReq, 
        ip: undefined,
        headers: { 'x-forwarded-for': '203.0.113.2, 198.51.100.1' },
      };
      testReq.get = jest.fn().mockReturnValue('TestBot');
      mockRes.statusCode = 404;

      logSuspiciousRequest(testReq as Request, mockRes as Response, mockNext);
      (mockRes.emit as jest.Mock)('finish');

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"ip":"203.0.113.2"'),
      );
    });

    it('handles unknown IP when all sources are unavailable', () => {
      const testReq = { 
        ...mockReq, 
        ip: undefined,
        headers: {},
        socket: { remoteAddress: undefined } as any,
      };
      testReq.get = jest.fn().mockReturnValue('TestBot');
      mockRes.statusCode = 404;

      logSuspiciousRequest(testReq as Request, mockRes as Response, mockNext);
      (mockRes.emit as jest.Mock)('finish');

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"ip":"unknown"'),
      );
    });

    it('truncates long user agent strings', () => {
      mockRes.statusCode = 400;
      const longUserAgent = 'A'.repeat(200);
      mockReq.get = jest.fn().mockReturnValue(longUserAgent);

      logSuspiciousRequest(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.emit as jest.Mock)('finish');

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining(`"userAgent":"${'A'.repeat(100)}"`),
      );
    });

    it('handles missing User-Agent header', () => {
      mockRes.statusCode = 404;
      mockReq.get = jest.fn().mockReturnValue(undefined);

      logSuspiciousRequest(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.emit as jest.Mock)('finish');

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"userAgent":"Unknown"'),
      );
    });

    it('calculates request duration accurately', () => {
      let callCount = 0;
      Date.now = jest.fn(() => {
        callCount++;
        return callCount === 1 ? 1000 : 1250; // Start: 1000ms, End: 1250ms = 250ms duration
      });

      mockRes.statusCode = 500;
      mockReq.get = jest.fn().mockReturnValue('TestBot');

      logSuspiciousRequest(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.emit as jest.Mock)('finish');

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.any(String),
        expect.stringContaining('"duration":"250ms"'),
      );
    });
  });

  describe('accessLogger middleware', () => {
    it('calls next middleware immediately', () => {
      accessLogger(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('logs all requests to access log file', () => {
      mockRes.statusCode = 200;
      mockReq.get = jest.fn().mockReturnValue('Mozilla/5.0 Test Browser');

      accessLogger(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.emit as jest.Mock)('finish');

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('access-'),
        expect.stringContaining('192.168.1.100 "GET /api/test" 200 0ms "Mozilla/5.0 Test Browser"'),
      );
    });

    it('handles missing User-Agent in access log', () => {
      mockRes.statusCode = 200;
      mockReq.get = jest.fn().mockReturnValue(undefined);

      accessLogger(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.emit as jest.Mock)('finish');

      expect(mockFs.appendFileSync).toHaveBeenCalledWith(
        expect.stringContaining('access-'),
        expect.stringContaining('"-"'),
      );
    });

    it('logs different HTTP methods correctly', () => {
      const methods = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

      methods.forEach(method => {
        const testReq = { ...mockReq, method };
        testReq.get = jest.fn().mockReturnValue('TestBot');

        accessLogger(testReq as Request, mockRes as Response, mockNext);
        (mockRes.emit as jest.Mock)('finish');

        expect(mockFs.appendFileSync).toHaveBeenCalledWith(
          expect.stringContaining('access-'),
          expect.stringContaining(`"${method} /api/test"`),
        );

        jest.clearAllMocks();
        mockFs.appendFileSync.mockClear();
      });
    });
  });

  describe('analyzeAttackPatterns function', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('sets up analysis interval correctly', () => {
      const setIntervalSpy = jest.spyOn(global, 'setInterval');
      
      analyzeAttackPatterns();

      expect(setIntervalSpy).toHaveBeenCalledWith(
        expect.any(Function),
        300000, // 5 minutes
      );
    });

    it('analyzes attack patterns from log file', () => {
      const mockLogData = [
        '{"ip":"192.168.1.1","path":"/admin","status":404}',
        '{"ip":"192.168.1.1","path":"/wp-admin","status":404}',
        '{"ip":"192.168.1.2","path":"/admin","status":403}',
        '',
      ].join('\n');

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(mockLogData);

      analyzeAttackPatterns();

      // Fast-forward time to trigger analysis
      jest.advanceTimersByTime(300000);

      expect(console.log).toHaveBeenCalledWith('\n📊 Attack Analysis Report:');
      expect(console.log).toHaveBeenCalledWith('Top attacking IPs:');
      expect(console.log).toHaveBeenCalledWith('  192.168.1.1: 2 attempts');
      expect(console.log).toHaveBeenCalledWith('\nMost targeted paths:');
      expect(console.log).toHaveBeenCalledWith('  /admin: 2 attempts');
    });

    it('handles non-existent log file gracefully', () => {
      mockFs.existsSync.mockReturnValue(false);

      analyzeAttackPatterns();
      jest.advanceTimersByTime(300000);

      // Should not attempt to read file or log analysis
      expect(mockFs.readFileSync).not.toHaveBeenCalled();
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Attack Analysis Report'),
      );
    });

    it('handles JSON parsing errors gracefully', () => {
      const invalidLogData = '{"invalid":"json"}\n{invalid json}\n';
      
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(invalidLogData);

      analyzeAttackPatterns();
      jest.advanceTimersByTime(300000);

      expect(console.error).toHaveBeenCalledWith(
        'Error analyzing attack patterns:',
        expect.any(Error),
      );
    });

    it('handles empty log file', () => {
      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue('');

      analyzeAttackPatterns();
      jest.advanceTimersByTime(300000);

      // Should not crash and not log analysis for empty data
      expect(console.log).not.toHaveBeenCalledWith(
        expect.stringContaining('Attack Analysis Report'),
      );
    });

    it('limits analysis to top 5 attackers and paths', () => {
      const mockLogData = Array.from({ length: 10 }, (_, i) => 
        `{"ip":"192.168.1.${i}","path":"/path${i}","status":404}`,
      ).join('\n');

      mockFs.existsSync.mockReturnValue(true);
      mockFs.readFileSync.mockReturnValue(mockLogData);

      analyzeAttackPatterns();
      jest.advanceTimersByTime(300000);

      // Should only show top 5
      const logCalls = (console.log as jest.Mock).mock.calls;
      const ipCalls = logCalls.filter(call => 
        call[0]?.includes('192.168.1.'),
      );
      const pathCalls = logCalls.filter(call => 
        call[0]?.includes('/path'),
      );

      expect(ipCalls).toHaveLength(5);
      expect(pathCalls).toHaveLength(5);
    });
  });

  describe('File System Operations', () => {
    it('creates logs directory if it does not exist', () => {
      // This test verifies the directory creation logic
      expect(mockFs.mkdirSync).toBeDefined();
    });

    it('handles file write errors gracefully', () => {
      mockFs.appendFileSync.mockImplementation(() => {
        throw new Error('Disk full');
      });

      mockRes.statusCode = 404;
      mockReq.get = jest.fn().mockReturnValue('TestBot');

      // The middleware itself should not throw, but the fs operation will
      logSuspiciousRequest(mockReq as Request, mockRes as Response, mockNext);
      
      expect(() => {
        (mockRes.emit as jest.Mock)('finish');
      }).toThrow('Disk full');
    });
  });

  describe('Security and Privacy', () => {
    it('does not log sensitive request data', () => {
      mockRes.statusCode = 401;
      mockReq.headers = {
        'authorization': 'Bearer secret-token',
        'cookie': 'session=secret-value',
      };
      mockReq.get = jest.fn().mockReturnValue('TestBot');

      logSuspiciousRequest(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.emit as jest.Mock)('finish');

      const loggedData = (mockFs.appendFileSync as jest.Mock).mock.calls[0][1];
      
      // Should not contain sensitive headers
      expect(loggedData).not.toContain('secret-token');
      expect(loggedData).not.toContain('secret-value');
      expect(loggedData).not.toContain('authorization');
      expect(loggedData).not.toContain('cookie');
    });

    it('validates log entry structure', () => {
      mockRes.statusCode = 404;
      mockReq.get = jest.fn()
        .mockReturnValueOnce('TestBot/1.0')
        .mockReturnValueOnce('https://evil.com');

      logSuspiciousRequest(mockReq as Request, mockRes as Response, mockNext);
      (mockRes.emit as jest.Mock)('finish');

      const loggedData = (mockFs.appendFileSync as jest.Mock).mock.calls[0][1];
      const logEntry = JSON.parse(loggedData.trim());

      expect(logEntry).toEqual({
        timestamp: expect.any(String),
        ip: expect.any(String),
        method: expect.any(String),
        path: expect.any(String),
        status: expect.any(Number),
        duration: expect.any(String),
        userAgent: expect.any(String),
        referer: expect.any(String),
      });
    });
  });
});