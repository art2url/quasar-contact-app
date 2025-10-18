import { Response, Router } from 'express';
import { body, validationResult } from 'express-validator';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../services/database.service';

const router = Router();

/**
 * GET /api/users
 * Returns all users' {id, username} so clients can build chat lists.
 * Protected: must present a valid JWT.
 */
router.get('/', authenticateToken, async (_req, res) => {
  try {
    const users = await prisma.user.findMany({
      select: {
        id: true,
        username: true,
        avatarUrl: true,
      },
    });

    // Convert to match expected frontend format
    const formattedUsers = users.map((user: (typeof users)[0]) => ({
      _id: user.id,
      username: user.username,
      avatarUrl: user.avatarUrl,
    }));

    res.json(formattedUsers);
  } catch (err) {
    console.error('[Users Fetch Error]', err);
    res.status(500).json({ message: 'Server error while fetching users.' });
  }
});

/**
 * PUT /api/users/me/avatar
 * Body: { avatarUrl: string }
 */
router.put('/me/avatar', [
  body('avatarUrl')
    .trim()
    .notEmpty()
    .withMessage('Avatar URL is required')
    .isLength({ max: 500 })
    .withMessage('Avatar URL must be under 500 characters')
    .custom((value) => {
      // Allow either:
      // 1. HTTPS URLs for external avatars (e.g., https://example.com/avatar.jpg)
      // 2. Relative paths for local assets (e.g., assets/images/avatars/01.svg)

      // Check for HTTPS URLs - strict validation
      const isHttpsUrl = /^https:\/\/[a-zA-Z0-9\-\.]+\.[a-zA-Z]{2,}(\/[a-zA-Z0-9\-\._~:\/?#\[\]@!$&'()*+,;=%]*)?$/i.test(value);

      // Check for safe relative paths - no path traversal, no absolute paths
      // Format: word/word/file.ext or word/file.ext or file.ext
      const isRelativePath = /^[a-zA-Z0-9_\-]+([\/][a-zA-Z0-9_\-]+)*\.(svg|png|jpg|jpeg|gif|webp)$/i.test(value);

      if (!isHttpsUrl && !isRelativePath) {
        throw new Error('Avatar URL must be either a valid HTTPS URL or a relative path to an image');
      }

      return true;
    }),
], authenticateToken, async (req: AuthRequest, res: Response) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(422).json({ errors: errors.array() });
  }

  const { avatarUrl } = req.body;
  if (!req.user) return res.sendStatus(401); // safety check

  try {
    await prisma.user.update({
      where: { id: req.user.userId },
      data: { avatarUrl },
    });

    res.sendStatus(204);
  } catch (err) {
    console.error('[Avatar Update Error]', err);
    res.status(500).json({ message: 'Server error while updating avatar.' });
  }
});

export default router;
