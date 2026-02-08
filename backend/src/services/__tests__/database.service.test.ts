// Mock PrismaClient to prevent real database access
const mockPrisma = {
  $connect: jest.fn(),
  $disconnect: jest.fn(),
  $queryRaw: jest.fn(),
};

jest.mock('@prisma/client', () => ({
  PrismaClient: jest.fn(() => mockPrisma),
}));

// Import after mocking
import { connectDatabase, healthCheck, disconnectDatabase } from '../database.service';
import { PrismaClient } from '@prisma/client';

describe('Database Service (Safe Mock Tests)', () => {
  
  // Store original environment
  const originalEnv = process.env.DATABASE_PUBLIC_URL;
  
  beforeEach(() => {
    jest.clearAllMocks();
    jest.clearAllTimers();
    jest.useFakeTimers();
    
    // Reset the mock functions
    
    // Mock console methods to avoid noise in tests
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
    
    // Set safe test environment
    process.env.DATABASE_PUBLIC_URL = 'postgresql://test:test@localhost:5432/test_db';
  });

  afterEach(() => {
    jest.useRealTimers();
    jest.restoreAllMocks();
    // Restore original environment
    if (originalEnv) {
      process.env.DATABASE_PUBLIC_URL = originalEnv;
    }
  });

  describe('connectDatabase', () => {
    // Run: npm test -- --testPathPattern="database.service.test.ts"
    it('connects to database successfully', async () => {
      mockPrisma.$connect.mockResolvedValueOnce(undefined);

      await expect(connectDatabase()).resolves.toBeUndefined();
      expect(mockPrisma.$connect).toHaveBeenCalledTimes(1);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('handles database connection errors', async () => {
      const connectionError = new Error('Connection failed');
      mockPrisma.$connect.mockRejectedValueOnce(connectionError);

      await expect(connectDatabase()).rejects.toThrow('Connection failed');
      expect(mockPrisma.$connect).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith('❌ Database connection error:', connectionError);
    });

    it('handles network timeout errors', async () => {
      const timeoutError = new Error('Connection timeout');
      timeoutError.name = 'ConnectionTimeoutError';
      mockPrisma.$connect.mockRejectedValueOnce(timeoutError);

      await expect(connectDatabase()).rejects.toThrow('Connection timeout');
      expect(console.error).toHaveBeenCalledWith('❌ Database connection error:', timeoutError);
    });

    it('handles authentication errors', async () => {
      const authError = new Error('Authentication failed');
      authError.name = 'AuthenticationError';
      mockPrisma.$connect.mockRejectedValueOnce(authError);

      await expect(connectDatabase()).rejects.toThrow('Authentication failed');
      expect(console.error).toHaveBeenCalledWith('❌ Database connection error:', authError);
    });
  });

  describe('healthCheck', () => {
    it('passes health check on first attempt', async () => {
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);

      const result = await healthCheck();
      
      expect(result).toBe(true);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('handles different types of database errors', async () => {
      const errorTypes = [
        new Error('Connection lost'),
        new Error('Query timeout'),
        new Error('Database locked'),
      ];

      for (const error of errorTypes) {
        jest.clearAllMocks();
        mockPrisma.$queryRaw.mockRejectedValueOnce(error);

        const healthCheckPromise = healthCheck(1);
        await expect(healthCheckPromise).rejects.toThrow(error.message);
        expect(console.error).toHaveBeenCalledWith(
          'Database health check failed (attempt 1):',
          error,
        );
      }
    });
  });

  describe('disconnectDatabase', () => {
    it('disconnects from database successfully', async () => {
      mockPrisma.$disconnect.mockResolvedValueOnce(undefined);

      await expect(disconnectDatabase()).resolves.toBeUndefined();
      expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
      expect(console.error).not.toHaveBeenCalled();
    });

    it('handles database disconnection errors', async () => {
      const disconnectionError = new Error('Disconnection failed');
      mockPrisma.$disconnect.mockRejectedValueOnce(disconnectionError);

      await expect(disconnectDatabase()).rejects.toThrow('Disconnection failed');
      expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
      expect(console.error).toHaveBeenCalledWith(
        '❌ Database disconnection error:', 
        disconnectionError,
      );
    });

    it('handles graceful shutdown scenarios', async () => {
      mockPrisma.$disconnect.mockResolvedValueOnce(undefined);

      // Simulate graceful shutdown
      await expect(disconnectDatabase()).resolves.toBeUndefined();
      expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
    });

    it('handles forced disconnection scenarios', async () => {
      const forceError = new Error('Connection already closed');
      mockPrisma.$disconnect.mockRejectedValueOnce(forceError);

      await expect(disconnectDatabase()).rejects.toThrow('Connection already closed');
      expect(console.error).toHaveBeenCalledWith(
        '❌ Database disconnection error:', 
        forceError,
      );
    });
  });

  describe('Database Configuration', () => {
    it('validates PrismaClient mock is available', () => {
      expect(PrismaClient).toBeDefined();
      expect(typeof PrismaClient).toBe('function');
    });
  });

  describe('Integration Scenarios', () => {
    it('handles complete database lifecycle', async () => {
      // Setup successful mocks for full lifecycle
      mockPrisma.$connect.mockResolvedValueOnce(undefined);
      mockPrisma.$queryRaw.mockResolvedValueOnce([{ '?column?': 1 }]);
      mockPrisma.$disconnect.mockResolvedValueOnce(undefined);

      // Connect
      await expect(connectDatabase()).resolves.toBeUndefined();
      
      // Health check
      const isHealthy = await healthCheck();
      expect(isHealthy).toBe(true);
      
      // Disconnect
      await expect(disconnectDatabase()).resolves.toBeUndefined();

      // Verify all operations completed
      expect(mockPrisma.$connect).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$queryRaw).toHaveBeenCalledTimes(1);
      expect(mockPrisma.$disconnect).toHaveBeenCalledTimes(1);
    });

    it('handles partial failure scenarios gracefully', async () => {
      // Connect succeeds, health check fails, disconnect succeeds
      mockPrisma.$connect.mockResolvedValueOnce(undefined);
      mockPrisma.$queryRaw.mockRejectedValue(new Error('Health check failed'));
      mockPrisma.$disconnect.mockResolvedValueOnce(undefined);

      await expect(connectDatabase()).resolves.toBeUndefined();
      
      const healthCheckPromise = healthCheck(1);
      await expect(healthCheckPromise).rejects.toThrow('Health check failed');
      
      await expect(disconnectDatabase()).resolves.toBeUndefined();
    });
  });

  describe('Error Handling Edge Cases', () => {
    it('handles null and undefined errors gracefully', async () => {
      mockPrisma.$connect.mockRejectedValueOnce(null);

      await expect(connectDatabase()).rejects.toBeNull();
      expect(console.error).toHaveBeenCalledWith('❌ Database connection error:', null);
    });

    it('handles circular reference errors', async () => {
      const circularError: any = new Error('Circular reference');
      circularError.circular = circularError;
      
      mockPrisma.$connect.mockRejectedValueOnce(circularError);

      await expect(connectDatabase()).rejects.toThrow('Circular reference');
      expect(console.error).toHaveBeenCalledWith(
        '❌ Database connection error:', 
        circularError,
      );
    });

    it('handles very large error objects', async () => {
      const largeError = new Error('Large error');
      (largeError as any).largeData = 'x'.repeat(10000);
      
      mockPrisma.$connect.mockRejectedValueOnce(largeError);

      await expect(connectDatabase()).rejects.toThrow('Large error');
      expect(console.error).toHaveBeenCalledWith(
        '❌ Database connection error:', 
        largeError,
      );
    });
  });
});