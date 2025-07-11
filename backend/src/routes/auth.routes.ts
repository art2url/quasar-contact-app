// Note: All encryption/decryption for chat messages is performed on the frontend using crypto.subtle.
// The backend handles only user authentication (via JWT) and data storage.

import { Router, type Request, type Response } from 'express';
import { body, validationResult } from 'express-validator';
import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import axios from 'axios';
import User from '../models/User';
import Message from '../models/Message';
import PasswordReset from '../models/PasswordReset';
import { authLimiter } from '../config/ratelimits';
import env from '../config/env';
import emailService from '../services/email.service';
import {
  setAuthCookie,
  clearAuthCookie,
  generateCSRFToken,
  setCSRFCookie,
} from '../utils/cookie.utils';
import { validateCSRF } from '../middleware/csrf.middleware';
import { validateHoneypot } from '../middleware/honeypot-captcha';

const router = Router();

// reCAPTCHA verification function
async function verifyRecaptcha(recaptchaToken: string): Promise<boolean> {
  if (!recaptchaToken) {
    return false;
  }

  try {
    const secretKey = process.env.RECAPTCHA_SECRET_KEY;
    if (!secretKey) {
      console.error('[reCAPTCHA] Secret key not configured');
      return false;
    }

    const response = await axios.post(
      'https://www.google.com/recaptcha/api/siteverify',
      null,
      {
        params: {
          secret: secretKey,
          response: recaptchaToken,
        },
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    const { success } = response.data;

    // For reCAPTCHA v2, check if success is true
    // For reCAPTCHA v3, you might also want to check the score (score >= 0.5)
    if (success) {
      console.log('[reCAPTCHA] Verification successful');
      return true;
    } else {
      console.log('[reCAPTCHA] Verification failed:', response.data);
      return false;
    }
  } catch (error) {
    console.error('[reCAPTCHA] Verification error:', error);
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
    body('recaptchaToken').optional().isString().withMessage('Invalid reCAPTCHA token.'),
  ],
  authLimiter,
  validateHoneypot(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    // Destructure email along with username and password.
    const { username, email, password, avatarUrl, recaptchaToken } = req.body;

    try {
      // Verify reCAPTCHA if token is provided
      if (recaptchaToken) {
        const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
        if (!isRecaptchaValid) {
          return res.status(400).json({
            message: 'reCAPTCHA verification failed. Please try again.',
          });
        }
      }

      // Optionally check if username or email already exists.
      const existingUser = await User.findOne({
        $or: [{ username }, { email }],
      });
      if (existingUser) {
        return res.status(409).json({ message: 'Username or email already taken.' });
      }

      // Hash password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Create new user with email included.
      const newUser = new User({
        username,
        email,
        passwordHash,
        avatarUrl: avatarUrl || '',
      });
      await newUser.save();

      res.status(201).json({ message: 'User registered successfully.' });
    } catch (error) {
      console.error('[Register Error]', error);
      res.status(500).json({ message: 'Server error during registration.' });
    }
  }
);

// POST /api/auth/login
router.post(
  '/login',
  [
    body('username').notEmpty().withMessage('Username or email is required.'),
    body('password').notEmpty().withMessage('Password is required.'),
    body('recaptchaToken').optional().isString().withMessage('Invalid reCAPTCHA token.'),
  ],
  authLimiter,
  validateHoneypot(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const { username, password, recaptchaToken } = req.body;

    try {
      // Verify reCAPTCHA if token is provided
      if (recaptchaToken) {
        const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
        if (!isRecaptchaValid) {
          return res.status(400).json({
            message: 'reCAPTCHA verification failed. Please try again.',
          });
        }
      }

      // Search for a user by either username or email.
      const user = await User.findOne({
        $or: [{ username }, { email: username }],
      });
      if (!user) {
        // Consider removing these console.logs in production
        console.log('User not found for:', username);
        return res.status(401).json({ message: 'Invalid credentials.' });
      }

      // Consider removing these console.logs in production - they expose sensitive info
      console.log('Received password:', password);
      console.log('Stored hash:', user.passwordHash);

      const isMatch = await bcrypt.compare(password, user.passwordHash);
      if (!isMatch) {
        console.log('Password mismatch for user:', username);
        return res.status(401).json({ message: 'Invalid credentials.' });
      }

      const token = jwt.sign(
        {
          userId: user._id,
          username: user.username,
          avatarUrl: user.avatarUrl,
        },
        env.JWT_SECRET,
        { expiresIn: '7d' }
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
          id: user._id,
          username: user.username,
          avatarUrl: user.avatarUrl,
        },
      });
    } catch (error) {
      console.error('[Login Error]', error);
      res.status(500).json({ message: 'Server error during login.' });
    }
  }
);

// POST /api/auth/forgot-password
router.post(
  '/forgot-password',
  [
    body('email').isEmail().withMessage('Valid email is required.'),
    body('recaptchaToken').optional().isString().withMessage('Invalid reCAPTCHA token.'),
  ],
  authLimiter,
  validateHoneypot(),
  async (req: Request, res: Response) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(422).json({ errors: errors.array() });
    }

    const { email, recaptchaToken } = req.body;

    try {
      // Verify reCAPTCHA if token is provided
      if (recaptchaToken) {
        const isRecaptchaValid = await verifyRecaptcha(recaptchaToken);
        if (!isRecaptchaValid) {
          return res.status(400).json({
            message: 'reCAPTCHA verification failed. Please try again.',
          });
        }
      }

      // Find user by email
      const user = await User.findOne({ email });

      // Always return success to prevent email enumeration
      if (!user) {
        console.log('[Forgot Password] No user found for email:', email);
        return res.status(200).json({
          message:
            'If an account exists with this email, you will receive password reset instructions.',
        });
      }

      // Check if there's a recent reset request (rate limiting)
      const recentReset = await PasswordReset.findOne({
        userId: user._id,
        createdAt: { $gte: new Date(Date.now() - 5 * 60 * 1000) }, // 5 minutes
        used: false,
      });

      if (recentReset) {
        console.log('[Forgot Password] Recent reset request exists for:', email);
        return res.status(200).json({
          message:
            'If an account exists with this email, you will receive password reset instructions.',
        });
      }

      // Generate reset token
      const resetToken = crypto.randomBytes(32).toString('hex');
      const hashedToken = crypto.createHash('sha256').update(resetToken).digest('hex');

      // Create password reset record
      await PasswordReset.create({
        userId: user._id,
        email: user.email,
        token: hashedToken,
        expiresAt: new Date(Date.now() + 60 * 60 * 1000), // 1 hour
      });

      // Send email with just the token (email service will build the URL)
      await emailService.sendPasswordResetEmail(user.email, resetToken);

      console.log('[Forgot Password] Reset email sent to:', email);

      res.status(200).json({
        message:
          'If an account exists with this email, you will receive password reset instructions.',
      });
    } catch (error) {
      console.error('[Forgot Password Error]', error);
      res.status(500).json({ message: 'Server error during password reset request.' });
    }
  }
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
    const resetRecord = await PasswordReset.findOne({
      token: hashedToken,
      expiresAt: { $gt: new Date() },
      used: false,
    });

    if (!resetRecord) {
      return res.status(400).json({ valid: false, message: 'Invalid or expired token.' });
    }

    res.status(200).json({ valid: true });
  } catch (error) {
    console.error('[Validate Reset Token Error]', error);
    res.status(500).json({ valid: false, message: 'Server error.' });
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
      const hashedToken = crypto.createHash('sha256').update(token).digest('hex');

      // Find valid reset record
      const resetRecord = await PasswordReset.findOne({
        token: hashedToken,
        expiresAt: { $gt: new Date() },
        used: false,
      });

      if (!resetRecord) {
        return res.status(400).json({ message: 'Invalid or expired reset token.' });
      }

      // Find the user
      const user = await User.findById(resetRecord.userId);
      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      // Hash new password
      const salt = await bcrypt.genSalt(10);
      const passwordHash = await bcrypt.hash(password, salt);

      // Update user password
      user.passwordHash = passwordHash;
      // DO NOT clear public key - password reset should not affect encryption keys
      // user.publicKeyBundle = null; // REMOVED - this was wrong!
      await user.save();

      // Mark reset token as used
      resetRecord.used = true;
      await resetRecord.save();

      // Delete all messages for this user (both sent and received)
      // Since messages are encrypted with the old password-derived keys
      await Message.deleteMany({
        $or: [{ senderId: user._id }, { receiverId: user._id }],
      });

      console.log('[Reset Password] Password reset successful for user:', user.username);
      console.log('[Reset Password] Deleted all messages for user:', user._id);

      // Send confirmation e-mail
      await emailService.sendPasswordResetConfirmation(user.email);

      res.status(200).json({
        message: 'Password reset successful. All previous messages have been deleted.',
      });
    } catch (error) {
      console.error('[Reset Password Error]', error);
      res.status(500).json({ message: 'Server error during password reset.' });
    }
  }
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
