import { NextFunction, Request, Response } from 'express';

// ─── Honeypot Field Names ─────────────────────────────────────
// These field names should be generic enough that bots might fill them
// but obvious enough that they're fake to developers
const HONEYPOT_FIELDS = [
  'website', // Common fake field that bots often fill
  'url', // Another common trap field
  'phone', // Fake phone field (when not expected)
  'address', // Fake address field
  'company', // Fake company field
  'firstname', // Misspelled or unexpected field
  'lastname', // Common fake field
];

// ─── Time-based Validation ────────────────────────────────────
const MIN_FORM_TIME = 2000; // Minimum 2 seconds to fill form (humans need time)
const MAX_FORM_TIME = 1800000; // Maximum 30 minutes (session timeout)

interface HoneypotValidationOptions {
  checkTimeValidation?: boolean;
  checkHoneypotFields?: boolean;
  logAttempts?: boolean;
}

// ─── Helper Functions ──────────────────────────────────────────
const getClientIP = (req: Request): string => {
  return (
    req.ip ||
    req.headers['x-forwarded-for']?.toString().split(',')[0] ||
    req.headers['x-real-ip']?.toString() ||
    req.socket.remoteAddress ||
    'unknown'
  );
};

// ─── Honeypot Validation Middleware ────────────────────────────
export const validateHoneypot = (options: HoneypotValidationOptions = {}) => {
  const {
    checkTimeValidation = true,
    checkHoneypotFields = true,
    logAttempts = true,
  } = options;

  return (req: Request, res: Response, next: NextFunction): void => {
    const clientIP = getClientIP(req);
    const userAgent = req.get('User-Agent') || 'unknown';
    const body = req.body;

    try {
      // ─── Check Honeypot Fields ───────────────────────────────
      if (checkHoneypotFields) {
        for (const field of HONEYPOT_FIELDS) {
          if (body[field] && body[field].trim() !== '') {
            if (logAttempts) {
              console.log(
                `🍯 HONEYPOT TRIGGERED: Bot filled field '${field}' with value '${body[field]}' from ${clientIP}`,
              );
              console.log(`   User-Agent: ${userAgent}`);
              console.log(
                `   Request body keys: ${Object.keys(body).join(', ')}`,
              );
            }

            // Return a response that looks like success but isn't
            res.status(200).json({
              success: false,
              message: 'Registration successful! Please check your email.',
            });
            return;
          }
        }
      }

      // ─── Username Character Validation ─────────────────────────
      if (body.username) {
        const validCharacters = /^[a-zA-Z0-9_-]+$/;
        if (!validCharacters.test(body.username)) {
          res.status(400).json({
            success: false,
            message: 'Invalid data format. Please try again.',
          });
          return;
        }
      }

      // ─── Time-based Validation ────────────────────────────────
      if (checkTimeValidation && body.formStartTime) {
        const formStartTime = parseInt(body.formStartTime, 10);
        const currentTime = Date.now();
        const timeDiff = currentTime - formStartTime;

        // Check if form was filled too quickly (likely bot)
        if (timeDiff < MIN_FORM_TIME) {
          if (logAttempts) {
            console.log(
              `⚡ FAST SUBMISSION: Form filled in ${timeDiff}ms (min: ${MIN_FORM_TIME}ms) from ${clientIP}`,
            );
            console.log(`   User-Agent: ${userAgent}`);
          }

          // Return a fake success response
          res.status(200).json({
            success: false,
            message: 'Registration successful! Please check your email.',
          });
          return;
        }

        // Check if form took too long (possible session hijacking)
        if (timeDiff > MAX_FORM_TIME) {
          if (logAttempts) {
            console.log(
              `🐌 SLOW SUBMISSION: Form took ${timeDiff}ms (max: ${MAX_FORM_TIME}ms) from ${clientIP}`,
            );
          }

          res.status(400).json({
            success: false,
            message: 'Session expired. Please refresh the page and try again.',
          });
          return;
        }
      }

      // ─── Additional Bot Detection ─────────────────────────────

      // Check for suspicious patterns in form data
      const allValues = Object.values(body).join(' ').toLowerCase();
      const suspiciousPatterns = [
        /^test[_\-]?user\d*$/i, // Only exact matches like "testuser", "test_user123"
        /bot[_\-]?test/i,
        /admin[_\-]?test/i,
        /admin/i, // Block any username containing "admin"
        /http[s]?:\/\//i, // URLs in unexpected fields
        /<script.*>/i, // Script tags
        /\{.*\}/, // JSON-like structures
        /\[.*\]/, // Array-like structures
      ];

      for (const pattern of suspiciousPatterns) {
        if (pattern.test(allValues)) {
          if (logAttempts) {
            console.log(
              `🔍 SUSPICIOUS PATTERN: Detected pattern '${pattern}' from ${clientIP}`,
            );
            console.log(`   Content: ${allValues.substring(0, 100)}...`);
          }

          res.status(400).json({
            success: false,
            message: 'Invalid data format. Please try again.',
          });
          return;
        }
      }

      // Check for identical repeated values (common bot behavior)
      const values = Object.values(body).filter(
        v => typeof v === 'string' && v.length > 0,
      );
      const uniqueValues = new Set(values);

      if (values.length > 3 && uniqueValues.size === 1) {
        if (logAttempts) {
          console.log(
            `🔄 REPEATED VALUES: All fields have same value '${values[0]}' from ${clientIP}`,
          );
        }

        res.status(400).json({
          success: false,
          message: 'Please fill in the form correctly.',
        });
        return;
      }

      // ─── All Validations Passed ────────────────────────────────
      if (logAttempts && process.env.NODE_ENV === 'development') {
        // Honeypot validation passed for legitimate user
      }

      next();
    } catch (error) {
      console.error('Honeypot validation error:', error);
      // On error, continue to avoid breaking legitimate users
      next();
    }
  };
};

// ─── Generate Honeypot Fields HTML ─────────────────────────────
// This helper can be used to generate the HTML for frontend
export const generateHoneypotFieldsHTML = (): string => {
  return HONEYPOT_FIELDS.map(
    field =>
      `<input type="text" name="${field}" value="" style="position: absolute; left: -9999px; opacity: 0; pointer-events: none;" tabindex="-1" autocomplete="off" />`,
  ).join('\n');
};

// ─── Get Honeypot Field Names ──────────────────────────────────
export const getHoneypotFieldNames = (): string[] => {
  return [...HONEYPOT_FIELDS];
};

// ─── Middleware Factory for Specific Routes ────────────────────
export const createHoneypotValidator = (_routeName: string) => {
  return validateHoneypot({
    checkTimeValidation: true,
    checkHoneypotFields: true,
    logAttempts: true,
  });
};
