import { Router } from 'express';
import { prisma } from '../services/database.service';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';

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
    const formattedUsers = users.map((user: typeof users[0]) => ({
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
router.put('/me/avatar', authenticateToken, async (req: AuthRequest, res) => {
  const { avatarUrl } = req.body;
  if (!avatarUrl) return res.status(400).json({ message: 'avatarUrl required' });

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