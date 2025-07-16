import { Router } from 'express';
import { prisma } from '../services/database.service';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import { User } from '@prisma/client';

const router = Router();

/**
 * POST /api/rooms/dm
 * Body: { userId }  → ensures a DM room exists and returns its id.
 */
router.post('/dm', authenticateToken, async (req: AuthRequest, res) => {
  const me = req.user?.userId;
  const other = req.body.userId;

  if (!me || !other) {
    return res.status(400).json({ message: 'userId missing' });
  }

  try {
    // Check if a DM room already exists between these two users
    let room = await prisma.room.findFirst({
      where: {
        isDm: true,
        members: {
          every: {
            id: { in: [me, other] },
          },
        },
      },
      include: {
        members: true,
      },
    });

    // Make sure the room has exactly 2 members and contains both users
    if (room && room.members.length === 2) {
      const memberIds = room.members.map((m: User) => m.id);
      if (memberIds.includes(me) && memberIds.includes(other)) {
        return res.json({ roomId: room.id });
      }
    }

    // Create a new DM room
    room = await prisma.room.create({
      data: {
        isDm: true,
        members: {
          connect: [{ id: me }, { id: other }],
        },
      },
      include: {
        members: true,
      },
    });

    res.json({ roomId: room.id });
  } catch (err) {
    console.error('[DM room error]', err);
    res.status(500).json({ message: 'Server error while creating DM' });
  }
});

/**
 * GET /api/rooms/my-dms
 * Return the other member's id, username & avatar for each DM I'm in.
 */
router.get('/my-dms', authenticateToken, async (req: AuthRequest, res) => {
  const me = req.user?.userId;
  if (!me) return res.sendStatus(401);

  try {
    const rooms = await prisma.room.findMany({
      where: {
        isDm: true,
        members: {
          some: {
            id: me,
          },
        },
      },
      include: {
        members: {
          where: {
            id: { not: me },
          },
          select: {
            id: true,
            username: true,
            avatarUrl: true,
          },
        },
      },
    });

    // Extract the other member from each room
    const list = rooms.map((room: typeof rooms[0]) => {
      const otherMember = room.members[0];
      return otherMember ? {
        _id: otherMember.id,
        username: otherMember.username,
        avatarUrl: otherMember.avatarUrl,
      } : null;
    }).filter(Boolean);

    res.json(list);
  } catch (err) {
    console.error('[list my dms]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

export default router;