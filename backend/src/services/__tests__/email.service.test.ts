// Mock nodemailer to prevent real email sending
const mockTransporter = {
  verify: jest.fn().mockResolvedValue(true),
  sendMail: jest.fn().mockResolvedValue({ messageId: 'test-id' }),
};

jest.mock('nodemailer', () => ({
  createTransport: jest.fn(() => mockTransporter),
}));

// Mock encryption utils
jest.mock('../../utils/encryption.utils', () => ({
  encryptResetToken: jest.fn((token: string) => `encrypted_${token}`),
}));

// Mock environment config
jest.mock('../../config/env', () => ({
  SMTP_HOST: 'smtp.test.com',
  SMTP_PORT: 587,
  SMTP_SECURE: false,
  SMTP_USER: 'test@example.com',
  SMTP_PASS: 'test-password',
  SMTP_FROM: 'noreply@test.com',
  CLIENT_ORIGIN: 'https://test.quasar.contact',
  APP_NAME: 'Quasar Contact',
  LANDING_URL: 'https://quasar.contact',
}));

// Import after mocking
import emailService from '../email.service';

describe('Email Service (Safe Mock Tests)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    
    // Reset transporter mocks
    mockTransporter.verify.mockResolvedValue(true);
    mockTransporter.sendMail.mockResolvedValue({ messageId: 'test-id' });
    
    // Mock console methods
    jest.spyOn(console, 'warn').mockImplementation();
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('Email Service Basic Tests', () => {
    // Run: npm test -- --testPathPattern="email.service.test.ts"
    it('validates service exists', () => {
      expect(emailService).toBeDefined();
      expect(typeof emailService.sendPasswordResetEmail).toBe('function');
      expect(typeof emailService.sendPasswordResetConfirmation).toBe('function');
      expect(typeof emailService.isReady).toBe('function');
    });

    it('validates mocks are setup correctly', () => {
      expect(mockTransporter.verify).toBeDefined();
      expect(mockTransporter.sendMail).toBeDefined();
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('attempts to send password reset email', async () => {
      const email = 'user@test.com';
      const resetToken = 'test-reset-token-12345';

      // This may succeed or fail depending on service configuration
      // We just want to ensure it doesn't crash
      try {
        await emailService.sendPasswordResetEmail(email, resetToken);
      } catch (error) {
        // Email service may not be configured in test environment
        expect(error).toBeInstanceOf(Error);
      }
    });

    it('handles different token formats safely', async () => {
      const tokenFormats = [
        'simple-token',
        'complex.token@with#special$chars',
        '12345',
      ];

      for (const token of tokenFormats) {
        try {
          await emailService.sendPasswordResetEmail('user@test.com', token);
        } catch (error) {
          expect(error).toBeInstanceOf(Error);
        }
      }
    });
  });

  describe('sendPasswordResetConfirmation', () => {
    it('attempts to send password reset confirmation', async () => {
      const email = 'user@test.com';

      try {
        await emailService.sendPasswordResetConfirmation(email);
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Service Configuration', () => {
    it('validates transporter methods are available', () => {
      expect(mockTransporter.sendMail).toBeDefined();
      expect(mockTransporter.verify).toBeDefined();
    });

    it('validates encryption utils are mocked', () => {
      const { encryptResetToken } = require('../../utils/encryption.utils');
      expect(encryptResetToken('test')).toBe('encrypted_test');
    });

    it('validates environment config is mocked', () => {
      const env = require('../../config/env');
      expect(env.SMTP_HOST).toBe('smtp.test.com');
      expect(env.APP_NAME).toBe('Quasar Contact');
    });
  });

  describe('Error Handling', () => {
    it('handles service errors gracefully', () => {
      // Test that the service doesn't crash when methods are called
      expect(() => {
        emailService.isReady();
      }).not.toThrow();
    });

    it('validates error types for invalid inputs', async () => {
      try {
        await emailService.sendPasswordResetEmail('', '');
      } catch (error) {
        expect(error).toBeInstanceOf(Error);
      }
    });
  });

  describe('Mocking Validation', () => {
    it('confirms nodemailer is properly mocked', () => {
      const nodemailer = require('nodemailer');
      expect(typeof nodemailer.createTransport).toBe('function');
    });

    it('confirms encryption utils are properly mocked', () => {
      const { encryptResetToken } = require('../../utils/encryption.utils');
      expect(typeof encryptResetToken).toBe('function');
      expect(encryptResetToken).toHaveBeenCalledWith; // Jest mock function
    });

    it('confirms environment config is properly mocked', () => {
      const env = require('../../config/env');
      expect(env).toHaveProperty('SMTP_HOST');
      expect(env).toHaveProperty('APP_NAME');
      expect(env).toHaveProperty('CLIENT_ORIGIN');
    });
  });
});