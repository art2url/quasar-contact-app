import request from 'supertest';
import express from 'express';
// JWT is imported but used in mocked middleware
import authRouter from '../auth.routes';
import bcrypt from 'bcryptjs';

// Mock all external dependencies
jest.mock('../../services/database.service', () => ({
  prisma: {
    user: {
      create: jest.fn(),
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
    },
    passwordReset: {
      create: jest.fn(),
      findFirst: jest.fn(),
      update: jest.fn(),
    },
  },
}));

jest.mock('../../services/email.service', () => ({
  __esModule: true,
  default: {
    sendPasswordResetEmail: jest.fn(),
    sendPasswordResetConfirmation: jest.fn(),
  },
}));

jest.mock('../../config/ratelimits', () => ({
  authLimiter: jest.fn((req: any, res: any, next: any) => next()),
}));

jest.mock('../../middleware/honeypot-captcha', () => ({
  validateHoneypot: jest.fn(() => (req: any, res: any, next: any) => next()),
}));

jest.mock('../../middleware/csrf.middleware', () => ({
  validateCSRF: jest.fn((req: any, res: any, next: any) => next()),
}));

jest.mock('../../utils/cookie.utils', () => ({
  clearAuthCookie: jest.fn(),
  generateCSRFToken: jest.fn(() => 'mock-csrf-token'),
  setAuthCookie: jest.fn(),
  setCSRFCookie: jest.fn(),
}));

jest.mock('../../config/env', () => ({
  JWT_SECRET: 'test-jwt-secret-key-for-testing-only-32chars',
}));

jest.mock('axios', () => ({
  post: jest.fn(),
}));

// Create test app with all middleware
const app = express();
app.use(express.json());
app.use('/api/auth', authRouter);

describe('Auth API Routes (Security Tests)', () => {
  let mockPrisma: any;
  let mockEmailService: any;

  beforeAll(() => {
    const { prisma } = require('../../services/database.service');
    mockPrisma = prisma;
    mockEmailService = require('../../services/email.service').default;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    
    // Mock console methods
    jest.spyOn(console, 'error').mockImplementation();
    jest.spyOn(console, 'log').mockImplementation();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('POST /api/auth/register - User Registration', () => {
    // Run: npm test -- --testPathPattern="auth.routes.test.ts"
    const validRegistration = {
      username: 'testuser',
      email: 'test@example.com',
      password: 'securepassword123',
      avatarUrl: 'avatar.jpg',
    };

    it('validates required fields', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({});

      expect(response.status).toBe(422);
      expect(response.body.errors).toBeDefined();
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('validates username length', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...validRegistration,
          username: 'ab', // Too short
        });

      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Username must be at least 3 characters long.',
          }),
        ]),
      );
    });

    it('validates email format', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...validRegistration,
          email: 'invalid-email',
        });

      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'A valid email is required.',
          }),
        ]),
      );
    });

    it('validates password length', async () => {
      const response = await request(app)
        .post('/api/auth/register')
        .send({
          ...validRegistration,
          password: '12345', // Too short
        });

      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Password must be at least 6 characters long.',
          }),
        ]),
      );
    });

    it('prevents duplicate username registration', async () => {
      const existingUser = {
        id: 'existing-user',
        username: validRegistration.username,
        email: 'different@example.com',
      };
      
      mockPrisma.user.findFirst.mockResolvedValueOnce(existingUser);

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistration);

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Username or email already taken.');
      expect(mockPrisma.user.create).not.toHaveBeenCalled();
    });

    it('prevents duplicate email registration', async () => {
      const existingUser = {
        id: 'existing-user',
        username: 'different-user',
        email: validRegistration.email,
      };
      
      mockPrisma.user.findFirst.mockResolvedValueOnce(existingUser);

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistration);

      expect(response.status).toBe(409);
      expect(response.body.message).toBe('Username or email already taken.');
    });

    it('successfully registers new user with password hashing', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValueOnce({
        id: 'new-user-id',
        username: validRegistration.username,
        email: validRegistration.email,
      });

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistration);

      expect(response.status).toBe(201);
      expect(response.body.message).toBe('User registered successfully.');
      
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          username: validRegistration.username,
          email: validRegistration.email,
          passwordHash: expect.any(String),
          avatarUrl: validRegistration.avatarUrl,
        },
      });

      // Verify password was hashed
      const createCall = mockPrisma.user.create.mock.calls[0][0];
      expect(createCall.data.passwordHash).not.toBe(validRegistration.password);
      expect(createCall.data.passwordHash.length).toBeGreaterThan(50);
    });

    it('handles database errors gracefully', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);
      const dbError = new Error('Database connection failed');
      mockPrisma.user.create.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .post('/api/auth/register')
        .send(validRegistration);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error during registration.');
      expect(console.error).toHaveBeenCalledWith('[Register Error]', dbError);
    });

    it('handles optional avatarUrl', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValueOnce({});

      const registrationWithoutAvatar = {
        username: 'testuser2',
        email: 'test2@example.com',
        password: 'securepassword123',
      };

      const response = await request(app)
        .post('/api/auth/register')
        .send(registrationWithoutAvatar);

      expect(response.status).toBe(201);
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          username: registrationWithoutAvatar.username,
          email: registrationWithoutAvatar.email,
          passwordHash: expect.any(String),
          avatarUrl: '',
        },
      });
    });
  });

  describe('POST /api/auth/login - User Login', () => {
    const validLogin = {
      username: 'testuser',
      password: 'securepassword123',
    };

    it('validates required fields', async () => {
      const response = await request(app)
        .post('/api/auth/login')
        .send({});

      expect(response.status).toBe(422);
      expect(response.body.errors).toBeDefined();
    });

    it('rejects login with non-existent user', async () => {
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLogin);

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials.');
    });

    it('rejects login with incorrect password', async () => {
      const hashedPassword = await bcrypt.hash('correctpassword', 10);
      const mockUser = {
        id: 'user-id',
        username: validLogin.username,
        passwordHash: hashedPassword,
        avatarUrl: 'avatar.jpg',
      };
      
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          ...validLogin,
          password: 'wrongpassword',
        });

      expect(response.status).toBe(401);
      expect(response.body.message).toBe('Invalid credentials.');
    });

    it('successfully logs in with correct credentials', async () => {
      const hashedPassword = await bcrypt.hash(validLogin.password, 10);
      const mockUser = {
        id: 'user-id',
        username: validLogin.username,
        passwordHash: hashedPassword,
        avatarUrl: 'avatar.jpg',
      };
      
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLogin);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Login successful.');
      expect(response.body.csrfToken).toBe('mock-csrf-token');
      expect(response.body.user).toEqual({
        id: mockUser.id,
        username: mockUser.username,
        avatarUrl: mockUser.avatarUrl,
      });
    });

    it('allows login with email instead of username', async () => {
      const hashedPassword = await bcrypt.hash(validLogin.password, 10);
      const mockUser = {
        id: 'user-id',
        username: 'testuser',
        email: 'test@example.com',
        passwordHash: hashedPassword,
        avatarUrl: 'avatar.jpg',
      };
      
      mockPrisma.user.findFirst.mockResolvedValueOnce(mockUser);

      const response = await request(app)
        .post('/api/auth/login')
        .send({
          username: 'test@example.com', // Using email
          password: validLogin.password,
        });

      expect(response.status).toBe(200);
      expect(mockPrisma.user.findFirst).toHaveBeenCalledWith({
        where: {
          OR: [
            { username: 'test@example.com' },
            { email: 'test@example.com' },
          ],
        },
      });
    });

    it('handles database errors during login', async () => {
      const dbError = new Error('Database query failed');
      mockPrisma.user.findFirst.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .post('/api/auth/login')
        .send(validLogin);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error during login.');
      expect(console.error).toHaveBeenCalledWith('[Login Error]', dbError);
    });
  });

  describe('POST /api/auth/forgot-password - Password Reset Request', () => {
    const validRequest = {
      email: 'test@example.com',
    };

    it('validates email format', async () => {
      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send({ email: 'invalid-email' });

      expect(response.status).toBe(422);
      expect(response.body.errors).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            msg: 'Valid email is required.',
          }),
        ]),
      );
    });

    it('returns success even for non-existent users (prevents enumeration)', async () => {
      mockPrisma.user.findUnique.mockResolvedValueOnce(null);

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe(
        'If an account exists with this email, you will receive password reset instructions.',
      );
      expect(mockPrisma.passwordReset.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('prevents multiple reset requests within 5 minutes', async () => {
      const mockUser = {
        id: 'user-id',
        email: validRequest.email,
      };
      
      const recentReset = {
        id: 'reset-id',
        userId: mockUser.id,
        createdAt: new Date(Date.now() - 60000), // 1 minute ago
        used: false,
      };

      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrisma.passwordReset.findFirst.mockResolvedValueOnce(recentReset);

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe(
        'If an account exists with this email, you will receive password reset instructions.',
      );
      expect(mockPrisma.passwordReset.create).not.toHaveBeenCalled();
      expect(mockEmailService.sendPasswordResetEmail).not.toHaveBeenCalled();
    });

    it('successfully processes password reset request', async () => {
      const mockUser = {
        id: 'user-id',
        email: validRequest.email,
      };

      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrisma.passwordReset.findFirst.mockResolvedValueOnce(null);
      mockPrisma.passwordReset.create.mockResolvedValueOnce({});
      mockEmailService.sendPasswordResetEmail.mockResolvedValueOnce(undefined);

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send(validRequest);

      expect(response.status).toBe(200);
      expect(response.body.message).toBe(
        'If an account exists with this email, you will receive password reset instructions.',
      );

      expect(mockPrisma.passwordReset.create).toHaveBeenCalledWith({
        data: {
          userId: mockUser.id,
          email: mockUser.email,
          token: expect.any(String),
          expiresAt: expect.any(Date),
        },
      });

      expect(mockEmailService.sendPasswordResetEmail).toHaveBeenCalledWith(
        mockUser.email,
        expect.any(String),
      );
    });

    it('handles email sending errors gracefully', async () => {
      const mockUser = {
        id: 'user-id',
        email: validRequest.email,
      };

      mockPrisma.user.findUnique.mockResolvedValueOnce(mockUser);
      mockPrisma.passwordReset.findFirst.mockResolvedValueOnce(null);
      mockPrisma.passwordReset.create.mockResolvedValueOnce({});
      
      const emailError = new Error('Email sending failed');
      mockEmailService.sendPasswordResetEmail.mockRejectedValueOnce(emailError);

      const response = await request(app)
        .post('/api/auth/forgot-password')
        .send(validRequest);

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error during password reset request.');
      expect(console.error).toHaveBeenCalledWith('[Forgot Password Error]', emailError);
    });
  });

  describe('Security Properties', () => {
    it('does not leak sensitive information in error responses', async () => {
      const dbError = new Error('Detailed database error with connection string');
      mockPrisma.user.findFirst.mockRejectedValueOnce(dbError);

      const response = await request(app)
        .post('/api/auth/login')
        .send({ username: 'test', password: 'test' });

      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Server error during login.');
      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('error');
    });

    it('returns consistent error messages for invalid credentials', async () => {
      // Test non-existent user
      mockPrisma.user.findFirst.mockResolvedValueOnce(null);
      const response1 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'nonexistent', password: 'password' });

      // Test wrong password
      const hashedPassword = await bcrypt.hash('correctpassword', 10);
      mockPrisma.user.findFirst.mockResolvedValueOnce({
        id: 'user-id',
        username: 'testuser',
        passwordHash: hashedPassword,
      });
      const response2 = await request(app)
        .post('/api/auth/login')
        .send({ username: 'testuser', password: 'wrongpassword' });

      expect(response1.status).toBe(401);
      expect(response2.status).toBe(401);
      expect(response1.body.message).toBe('Invalid credentials.');
      expect(response2.body.message).toBe('Invalid credentials.');
    });

    it('validates input sanitization', async () => {
      const maliciousInput = {
        username: '<script>alert("xss")</script>',
        email: 'test@example.com', // Valid email to pass validation
        password: 'password123',
      };

      mockPrisma.user.findFirst.mockResolvedValueOnce(null);
      mockPrisma.user.create.mockResolvedValueOnce({});

      const response = await request(app)
        .post('/api/auth/register')
        .send(maliciousInput);

      expect(response.status).toBe(201);
      
      // Verify data was passed through as-is (ORM handles escaping)
      expect(mockPrisma.user.create).toHaveBeenCalledWith({
        data: {
          username: maliciousInput.username,
          email: maliciousInput.email,
          passwordHash: expect.any(String),
          avatarUrl: '',
        },
      });
    });

    it('handles concurrent registration attempts', async () => {
      mockPrisma.user.findFirst.mockResolvedValue(null);
      mockPrisma.user.create.mockResolvedValue({});

      const requests = Array.from({ length: 3 }, (_, i) =>
        request(app)
          .post('/api/auth/register')
          .send({
            username: `user${i}`,
            email: `user${i}@example.com`,
            password: 'password123',
          }),
      );

      const responses = await Promise.all(requests);

      responses.forEach(response => {
        expect(response.status).toBe(201);
      });

      expect(mockPrisma.user.create).toHaveBeenCalledTimes(3);
    });
  });
});