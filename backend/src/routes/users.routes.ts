import { Router } from 'express';
import User from '../models/User';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

/**
 * GET /api/users
 * Returns all users’ {_id, username} so clients can build chat lists.
 * Protected: must present a valid JWT.
 */
router.get('/', authenticateToken, async (_req, res) => {
  try {
    const users = await User.find().select('_id username avatarUrl');
    res.json(users);
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
  await User.findByIdAndUpdate(req.user.userId, { avatarUrl });

  res.sendStatus(204);
});

export default router;
