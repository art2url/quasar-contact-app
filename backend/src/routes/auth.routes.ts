// Note: All encryption/decryption for chat messages is performed on the frontend using crypto.subtle.
// The backend handles only user authentication (via JWT) and data storage.

import axios from 'axios';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { Router, type Request, type Response } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import env from '../config/env';
import { authLimiter } from '../config/ratelimits';
import { validateCSRF } from '../middleware/csrf.middleware';
import { validateHoneypot } from '../middleware/honeypot-captcha';
import { prisma } from '../services/database.service';
import emailService from '../services/email.service';
import {
  clearAuthCookie,
  generateCSRFToken,
  setAuthCookie,
  setCSRFCookie,
} from '../utils/cookie.utils';

const router = Router();

// Turnstile verification function
async function verifyTurnstile(turnstileToken: string): Promise<boolean> {
  if (!turnstileToken) {
    return false;
  }

  try {
    const secretKey = process.env.TURNSTILE_SECRET_KEY;
    if (!secretKey) {
      console.error('[Turnstile] Secret key not configured');
      return false;
    }

    const response = await axios.post(
      'https://challenges.cloudflare.com/turnstile/v0/siteverify',
      {
        secret: secretKey,
        response: turnstileToken,
      },
      {
        headers: {
          'Content-Type': 'application/json',
        },
      },
    );

    const { success } = response.data;

    if (success) {
      // Turnstile verification successful
      return true;
    } else {
      console.error('[Turnstile] Verification failed:', response.data);
      return false;
    }
  } catch (error) {
    console.error('[Turnstile] Verification error:', error);
    return false;
  }
}

// POST /api/auth/register
router.post(
  '/register',
  [
    body('username')
      .isLength({ min: 3 })
      .withMessage('Username must be at least 3 characters long.'),
    // Require a valid email address.
    body('email').isEmail().withMessage('A valid email is required.'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long.'),
    body('turnstileToken')
      .optional()
      .isString()
      .withMessage('Invalid Turnstile token.'),
  ],
  authLimiter,
  validateHoneypot(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    // Destructure email along with username and password.
    const { username, email, password, avatarUrl, turnstileToken } = req.body;

    try {
      // Verify Turnstile if token is provided
      if (turnstileToken) {
        const isTurnstileValid = await verifyTurnstile(turnstileToken);
        if (!isTurnstileValid) {
          return res.status(400).json({
            message: 'Turnstile verification failed. Please try again.',
          });
        }
      }

      // Optionally check if username or email already exists.
      const existingUser = await prisma.user.findFirst({
        where: {
          OR: [{ username }, { email }],
        },
      });
      if (existingUser) {
        return res
          .status(409)
          .json({ message: 'Username or email already taken.' });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Create new user with email included.
      await prisma.user.create({
        data: {
          username,
          email,
          passwordHash,
          avatarUrl: avatarUrl || '',
        },
      });

      res.status(201).json({ message: 'User registered successfully.' });
    } catch (error) {
      console.error('[Register Error]', error);
      res.status(500).json({ message: 'Server error during registration.' });
    }
  },
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('username').notEmpty().withMessage('Username or email is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
    body('turnstileToken')
      .optional()
      .isString()
      .withMessage('Invalid Turnstile token.'),
  ],
  authLimiter,
  validateHoneypot(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const { username, password, turnstileToken } = req.body;

    try {
      // Verify Turnstile if token is provided
      if (turnstileToken) {
        const isTurnstileValid = await verifyTurnstile(turnstileToken);
        if (!isTurnstileValid) {
          return res.status(400).json({
            message: 'Turnstile verification failed. Please try again.',
          });
        }
      }

      // Search for a user by either username or email.
      const user = await prisma.user.findFirst({
        where: {
          OR: [{ username }, { email: username }],
        },
      });
      if (!user) {
        // User not found for login attempt
        return res.status(401).json({ message: 'Invalid credentials.' });
      }

      // Password verification in progress

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        // Password mismatch for user
        return res.status(401).json({ message: 'Invalid credentials.' });
      }

      const token = jwt.sign(
        {
          userId: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
        },
        env.JWT_SECRET,
        { expiresIn: '7d' },
      );

      // Generate CSRF token for additional security
      const csrfToken = generateCSRFToken();

      // Set secure cookies
      setAuthCookie(res, token);
      setCSRFCookie(res, csrfToken);

      res.status(200).json({
        message: 'Login successful.',
        csrfToken, // Send CSRF token to client
        user: {
          id: user.id,
          username: user.username,
          avatarUrl: user.avatarUrl,
        },
      });
    } catch (error) {
      console.error('[Login Error]', error);
      res.status(500).json({ message: 'Server error during login.' });
    }
  },
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  [
    body('email').isEmail().withMessage('Valid email is required.'),
    body('turnstileToken')
      .optional()
      .isString()
      .withMessage('Invalid Turnstile token.'),
  ],
  authLimiter,
  validateHoneypot(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const { email, turnstileToken } = req.body;

    try {
      // Verify Turnstile if token is provided
      if (turnstileToken) {
        const isTurnstileValid = await verifyTurnstile(turnstileToken);
        if (!isTurnstileValid) {
          return res.status(400).json({
            message: 'Turnstile verification failed. Please try again.',
          });
        }
      }

      // Find user by email
      const user = await prisma.user.findUnique({ where: { email } });

      // Always return success to prevent email enumeration
      if (!user) {
        // No user found for password reset email
        return res.status(200).json({
          message:
            'If an account exists with this email, you will receive password reset instructions.',
        });
      }

      // Check if there's a recent reset request (rate limiting)
      const recentReset = await prisma.passwordReset.findFirst({
        where: {
          userId: user.id,
          createdAt: { gte: new Date(Date.now() - 5 * 60 * 1000) }, // 5 minutes
          used: false,
        },
      });

      if (recentReset) {
        // Recent password reset request exists
        return res.status(200).json({
          message:
            'If an account exists with this email, you will receive password reset instructions.',
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto
        .createHash('sha256')
        .update(resetToken)
        .digest('hex');

      // Create password reset record
      await prisma.passwordReset.create({
        data: {
          userId: user.id,
          email: user.email,
          token: hashedToken,
          expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
        },
      });

      // Send email with just the token (email service will build the URL)
      await emailService.sendPasswordResetEmail(user.email, resetToken);

      // Password reset email sent

      res.status(200).json({
        message:
          'If an account exists with this email, you will receive password reset instructions.',
      });
    } catch (error) {
      console.error('[Forgot Password Error]', error);
      res
        .status(500)
        .json({ message: 'Server error during password reset request.' });
    }
  },
);

// GET /api/auth/reset-password/validate
router.get('/reset-password/validate', async (req: Request, res: Response) => {
  const { token } = req.query;

  if (!token || typeof token !== 'string') {
    return res.status(400).json({ valid: false, message: 'Invalid token.' });
  }

  try {
    // Hash the token to compare with stored version
    const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

    // Find valid reset record
    const resetRecord = await prisma.passwordReset.findFirst({
      where: {
        token: hashedToken,
        expiresAt: { gt: new Date() },
        used: false,
      },
    });

    if (!resetRecord) {
      return res
        .status(400)
        .json({ valid: false, message: 'Invalid or expired token.' });
    }

    res.status(200).json({ valid: true });
  } catch (error) {
    console.error('[Validate Reset Token Error]', error);
    res.status(500).json({ valid: false, message: 'Server error.' });
  }
});

// POST /api/auth/claim-reset-token - Secure session-based token retrieval
router.post('/claim-reset-token', async (req: Request, res: Response) => {
  try {
    // Import password reset utility
    const { getPendingResetFromSession, markResetTokenAsUsed } = require('../utils/password-reset.utils');
    
    const pendingReset = getPendingResetFromSession(req);
    
    if (!pendingReset) {
      return res.status(400).json({ 
        success: false, 
        message: 'No valid reset session found. Session may have expired or already been used.', 
      });
    }
    
    // Mark as used (one-time use)
    markResetTokenAsUsed(req);
    
    // Return the token securely
    res.status(200).json({ 
      success: true, 
      token: pendingReset.token, 
    });
    
  } catch (error) {
    console.error('[Claim Reset Token Error]', error);
    res.status(500).json({ 
      success: false, 
      message: 'Server error while claiming reset token.', 
    });
  }
});

// POST /api/auth/reset-password
router.post(
  '/reset-password',
  [
    body('token').notEmpty().withMessage('Reset token is required.'),
    body('password')
      .isLength({ min: 6 })
      .withMessage('Password must be at least 6 characters long.'),
  ],
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const { token, password } = req.body;

    try {
      // Hash the token to compare with stored version
      const hashedToken = crypto
        .createHash('sha256')
        .update(token)
        .digest('hex');

      // Find valid reset record
      const resetRecord = await prisma.passwordReset.findFirst({
        where: {
          token: hashedToken,
          expiresAt: { gt: new Date() },
          used: false,
        },
      });

      if (!resetRecord) {
        return res
          .status(400)
          .json({ message: 'Invalid or expired reset token.' });
      }

      // Find the user
      const user = await prisma.user.findUnique({
        where: { id: resetRecord.userId },
      });
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Update user password
      await prisma.user.update({
        where: { id: user.id },
        data: { passwordHash },
      });

      // Mark reset token as used
      await prisma.passwordReset.update({
        where: { id: resetRecord.id },
        data: { used: true },
      });

      // Delete all messages for this user (both sent and received)
      // Since messages are encrypted with the old password-derived keys
      await prisma.message.deleteMany({
        where: {
          OR: [{ senderId: user.id }, { receiverId: user.id }],
        },
      });

      // Password reset successful
      // Deleted all messages for user

      // Send confirmation e-mail
      await emailService.sendPasswordResetConfirmation(user.email);

      res.status(200).json({
        message:
          'Password reset successful. All previous messages have been deleted.',
      });
    } catch (error) {
      console.error('[Reset Password Error]', error);
      res.status(500).json({ message: 'Server error during password reset.' });
    }
  },
);

// POST /api/auth/logout
router.post('/logout', validateCSRF, async (req: Request, res: Response) => {
  try {
    // Clear authentication cookies
    clearAuthCookie(res);
    res.clearCookie('csrf_token', {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: process.env.NODE_ENV === 'production' ? 'strict' : 'lax',
      path: '/',
      ...(process.env.NODE_ENV === 'production' && {
        domain: '.quasar.contact',
      }),
    });

    res.status(200).json({
      message: 'Logout successful.',
    });
  } catch (error) {
    console.error('[Logout Error]', error);
    res.status(500).json({ message: 'Server error during logout.' });
  }
});

export default router;
