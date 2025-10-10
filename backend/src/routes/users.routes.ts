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
    .isURL({ protocols: ['https'] })
    .isLength({ max: 500 })
    .matches(/^https:\/\//)
    .withMessage('Avatar URL must be a valid HTTPS URL under 500 characters'),
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
