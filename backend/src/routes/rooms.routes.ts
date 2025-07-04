import { Router } from 'express';
import Room from '../models/Room';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';

const router = Router();

/**
 * POST /api/rooms/dm
 * Body: { userId }  → ensures a DM room exists and returns its _id.
 */
router.post('/dm', authenticateToken, async (req: AuthRequest, res) => {
  const me = req.user?.userId;
  const other = req.body.userId;

  if (!me || !other) {
    return res.status(400).json({ message: 'userId missing' });
  }

  try {
    let room = await Room.findOne({
      isDm: true,
      members: { $all: [me, other] },
    });

    if (!room) {
      room = await Room.create({ isDm: true, members: [me, other] });
    }

    res.json({ roomId: room._id });
  } catch (err) {
    console.error('[DM room error]', err);
    res.status(500).json({ message: 'Server error while creating DM' });
  }
});

/**
 * GET /api/rooms/my-dms
 * Return the other member’s _id, username & avatar for each DM I’m in.
 */
router.get('/my-dms', authenticateToken, async (req: AuthRequest, res) => {
  const me = req.user?.userId;
  if (!me) return res.sendStatus(401);

  try {
    const rooms = await Room.find({ isDm: true, members: me })
      .populate({
        path: 'members',
        match: { _id: { $ne: me } }, // only the other person
        select: '_id username avatarUrl',
      })
      .lean();

    const list = rooms.map(r => r.members[0]).filter(Boolean); // drop empty (shouldn’t happen)

    res.json(list);
  } catch (err) {
    console.error('[list my dms]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;
