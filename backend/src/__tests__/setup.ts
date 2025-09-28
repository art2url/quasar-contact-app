import * as dotenv from 'dotenv';

// Load test environment variables - SAFELY ONLY FOR TESTING
dotenv.config({ path: '.env.test' });

// SAFETY CHECK: Ensure we're in test environment
const ensureTestEnvironment = (): void => {
  const isTest = process.env.NODE_ENV === 'test' || 
                process.env.DATABASE_URL?.includes('test.db') ||
                process.env.DATABASE_URL?.includes(':memory:');
  
  if (!isTest) {
    throw new Error('DANGER: Database operations only allowed in test environment!');
  }
};

// Mock database functions - NO REAL DATABASE ACCESS
const setupDatabase = async (): Promise<void> => {
  ensureTestEnvironment();
  console.log('Mock database setup - no real database operations');
};

const teardownDatabase = async (): Promise<void> => {
  ensureTestEnvironment();
  console.log('Mock database teardown - no real database operations');
};

const cleanupDatabase = async (): Promise<void> => {
  ensureTestEnvironment();
  console.log('Mock database cleanup - no real database operations');
};

// Export safe mock functions
export { setupDatabase, teardownDatabase, cleanupDatabase };

// Custom Jest matchers (only extend when expect is available)
export const setupCustomMatchers = (): void => {
  if (typeof expect !== 'undefined') {
    expect.extend({
      toBeValidEmail(received: string) {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        const pass = emailRegex.test(received);
        
        return {
          message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid email`,
          pass,
        };
      },
      
      toBeValidUUID(received: string) {
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
        const pass = uuidRegex.test(received);
        
        return {
          message: () => `expected ${received} ${pass ? 'not ' : ''}to be a valid UUID`,
          pass,
        };
      },
    });
  }
};

// Global type declarations for Jest matchers
declare global {
  namespace jest {
    interface Matchers<R> {
      toBeValidEmail(): R;
      toBeValidUUID(): R;
    }
  }
}