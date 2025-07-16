import { Router } from 'express';
import jwt from 'jsonwebtoken';
import env from '../config/env';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../services/database.service';

/*
  Note: This backend route handles only storing and retrieving encrypted data.
  All encryption and decryption operations are performed on the client side using crypto.subtle.
  The 'ciphertext' field in messages is treated as an opaque encrypted payload.
*/

const router = Router();

// POST /api/messages/send
router.post('/send', authenticateToken, async (req: AuthRequest, res) => {
  const { receiverId, ciphertext } = req.body;

  if (!receiverId || !ciphertext) {
    return res.status(400).json({ message: 'Missing receiverId or ciphertext.' });
  }

  try {
    await prisma.message.create({
      data: {
        senderId: req.user?.userId!,
        receiverId,
        ciphertext,
      },
    });

    res.status(201).json({ message: 'Message sent successfully.' });
  } catch (error) {
    console.error('[Message Send Error]', error);
    res.status(500).json({ message: 'Server error while sending message.' });
  }
});

// GET /api/messages/overview → list of peers + last ciphertext + unread count (for header badge)
router.get('/overview', authenticateToken, async (req: AuthRequest, res) => {
  const me = req.user!.userId;

  try {
    // Get all messages received by the user, grouped by sender
    const messages = await prisma.message.findMany({
      where: {
        receiverId: me,
        deleted: false,
      },
      orderBy: {
        timestamp: 'desc',
      },
      include: {
        sender: true,
      },
    });

    // Group messages by sender and calculate unread count
    const peerMap = new Map();
    
    messages.forEach(msg => {
      const senderId = msg.senderId;
      if (!peerMap.has(senderId)) {
        peerMap.set(senderId, {
          peerId: senderId,
          lastText: msg.ciphertext,
          unread: 0,
        });
      }
      
      if (!msg.read) {
        peerMap.get(senderId).unread++;
      }
    });

    const overview = Array.from(peerMap.values());

    res.json(overview);
  } catch (err) {
    console.error('[Overview Error]', err);
    res.status(500).json({ message: 'Server error' });
  }
});

// GET /api/messages/:userId
router.get('/:userId', authenticateToken, async (req: AuthRequest, res) => {
  const { userId } = req.params;

  // Only allow access to messages received by the authenticated user
  if (req.user?.userId !== userId) {
    return res.status(403).json({ message: 'Access denied.' });
  }

  try {
    const messages = await prisma.message.findMany({
      where: {
        receiverId: userId,
        deleted: false,
      },
      orderBy: {
        timestamp: 'asc',
      },
      select: {
        senderId: true,
        ciphertext: true,
        timestamp: true,
      },
    });

    res.status(200).json({ messages });
  } catch (error) {
    console.error('[Message Fetch Error]', error);
    res.status(500).json({ message: 'Server error while fetching messages.' });
  }
});

// GET /api/messages/history/:userId - FIXED TO PROPERLY RETURN TIMESTAMP
router.get('/history/:userId', authenticateToken, async (req: AuthRequest, res) => {
  const currentUserId = req.user?.userId;
  const otherUserId = req.params.userId;

  if (!currentUserId) return res.status(401).json({ message: 'Unauthorized' });

  try {
    const messages = await prisma.message.findMany({
      where: {
        OR: [
          { senderId: currentUserId, receiverId: otherUserId },
          { senderId: otherUserId, receiverId: currentUserId },
        ],
      },
      orderBy: {
        timestamp: 'asc',
      },
      select: {
        id: true,
        senderId: true,
        receiverId: true,
        ciphertext: true,
        timestamp: true,
        read: true,
        avatarUrl: true,
        editedAt: true,
        deleted: true,
        deletedAt: true,
        createdAt: true,
      },
    });

    res.json({
      messages: messages.map(m => ({
        _id: m.id,
        senderId: m.senderId,
        receiverId: m.receiverId,
        ciphertext: m.ciphertext,
        timestamp: m.timestamp,
        createdAt: m.timestamp || m.createdAt,
        read: m.read,
        avatarUrl: m.avatarUrl ?? null,
        editedAt: m.editedAt ?? null,
        deleted: m.deleted,
        deletedAt: m.deletedAt ?? null,
      })),
    });
  } catch (err) {
    console.error('[Message History Error]', err);
    res.status(500).json({ message: 'Server error while fetching history.' });
  }
});

// GET /api/messages/last/:withUserId
router.get('/last/:id', async (req, res) => {
  /* 1️⃣ extract caller's ID from Bearer token */
  const auth = req.header('authorization') || '';
  const token = auth.replace(/^Bearer\s+/i, '');
  if (!token) return res.status(401).json({ message: 'Auth token missing' });

  let me: string;
  try {
    const { userId } = jwt.verify(token, env.JWT_SECRET) as {
      userId: string;
    };
    me = userId;
  } catch {
    return res.status(401).json({ message: 'Invalid token' });
  }

  /* 2️⃣ find the last message between me ↔︎ them */
  const them = req.params.id;
  
  try {
    const last = await prisma.message.findFirst({
      where: {
        OR: [
          { senderId: me, receiverId: them },
          { senderId: them, receiverId: me },
        ],
        deleted: false,
      },
      orderBy: {
        timestamp: 'desc',
      },
    });

    res.json(last || {});
  } catch (err) {
    console.error('[Last Message Error]', err);
    res.status(500).json({ message: 'Server error while fetching last message.' });
  }
});

// PATCH /api/messages/:id (edit your own message)
router.patch('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { ciphertext, avatarUrl } = req.body;

  if (!ciphertext) {
    return res.status(400).json({ message: 'ciphertext required' });
  }

  try {
    /* only the original sender can edit */
    const msg = await prisma.message.findUnique({
      where: {
        id,
        senderId: req.user!.userId,
      },
    });

    if (!msg) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const updatedMsg = await prisma.message.update({
      where: {
        id,
      },
      data: {
        ciphertext,
        avatarUrl,
        editedAt: new Date(),
      },
    });

    res.json({
      _id: updatedMsg.id,
      ciphertext: updatedMsg.ciphertext,
      editedAt: updatedMsg.editedAt,
      avatarUrl: updatedMsg.avatarUrl,
      deleted: updatedMsg.deleted,
      deletedAt: updatedMsg.deletedAt,
    });
  } catch (err) {
    console.error('[Message Edit Error]', err);
    res.status(500).json({ message: 'Server error while editing message' });
  }
});

// DELETE /api/messages/:id ── soft‑delete (author only)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;

  try {
    const msg = await prisma.message.findUnique({
      where: {
        id,
        senderId: req.user!.userId,
        deleted: false,
      },
    });

    if (!msg) {
      return res.status(404).json({ message: 'Message not found' });
    }

    const updatedMsg = await prisma.message.update({
      where: {
        id,
      },
      data: {
        deleted: true,
        deletedAt: new Date(),
        ciphertext: '',
      },
    });

    res.json({ _id: updatedMsg.id, deletedAt: updatedMsg.deletedAt });
  } catch (err) {
    console.error('[Message Delete Error]', err);
    res.status(500).json({ message: 'Server error while deleting message' });
  }
});

// PUT /api/messages/mark-read/:senderId - Mark all messages from a specific sender as read
router.put('/mark-read/:senderId', authenticateToken, async (req: AuthRequest, res) => {
  const receiverId = req.user!.userId;
  const senderId = req.params.senderId;

  try {
    // Mark all unread messages from the sender as read
    const result = await prisma.message.updateMany({
      where: {
        senderId,
        receiverId,
        read: false,
        deleted: false,
      },
      data: {
        read: true,
      },
    });

    res.json({
      message: 'Messages marked as read',
      count: result.count,
    });
  } catch (err) {
    console.error('[Mark Read Error]', err);
    res.status(500).json({ message: 'Server error while marking messages as read' });
  }
});

export default router;