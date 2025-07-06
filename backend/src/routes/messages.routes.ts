import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import Message from '../models/Message';
import jwt from 'jsonwebtoken';
import { Types } from 'mongoose';
import env from '../config/env';

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
    const message = new Message({
      senderId: req.user?.userId,
      receiverId,
      ciphertext,
      // Let schema default handle timestamp
    });

    await message.save();

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
    /* aggregate unread counts last message per peer */
    const agg = await Message.aggregate([
      { $match: { receiverId: new Types.ObjectId(me), deleted: false } },
      { $sort: { timestamp: -1 } },
      {
        $group: {
          _id: '$senderId',
          lastText: { $first: '$ciphertext' },
          unread: { $sum: { $cond: [{ $eq: ['$read', false] }, 1, 0] } },
        },
      },
    ]);

    const overview = agg.map(d => ({
      peerId: d._id.toString(),
      lastText: d.lastText,
      unread: d.unread,
    }));

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
    const messages = await Message.find({ receiverId: userId, deleted: false })
      .sort({ timestamp: 1 })
      .select('senderId ciphertext timestamp');

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
    /* Explicitly select timestamp field */
    const docs = await Message.find({
      $or: [
        { senderId: currentUserId, receiverId: otherUserId },
        { senderId: otherUserId, receiverId: currentUserId },
      ],
    })
      .sort({ timestamp: 1 })
      .select(
        // Include timestamp in select
        'senderId receiverId ciphertext timestamp read avatarUrl editedAt deleted deletedAt createdAt'
      );

    console.log('[History Route] Sample message from DB:', docs[0]);

    // Properly map timestamp field
    res.json({
      messages: docs.map(m => ({
        _id: m._id,
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
  const last = await Message.findOne({
    $or: [
      { senderId: me, receiverId: them },
      { senderId: them, receiverId: me },
    ],
    deleted: false,
  })
    .sort({ timestamp: -1 })
    .lean()
    .exec();

  res.json(last || {});
});

// PATCH /api/messages/:id (edit your own message)
router.patch('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  const { ciphertext, avatarUrl } = req.body;

  if (!ciphertext) {
    return res.status(400).json({ message: 'ciphertext required' });
  }
  if (!Types.ObjectId.isValid(id)) {
    return res.status(400).json({ message: 'Invalid message id' });
  }

  try {
    /* only the original sender can edit */
    const msg = await Message.findOneAndUpdate(
      { _id: id, senderId: req.user!.userId },
      { ciphertext, avatarUrl, editedAt: new Date() },
      { new: true }
    );

    if (!msg) return res.status(404).json({ message: 'Message not found' });

    res.json({
      _id: msg._id,
      ciphertext: msg.ciphertext,
      editedAt: msg.editedAt,
      avatarUrl: msg.avatarUrl,
      deleted: msg.deleted,
      deletedAt: msg.deletedAt,
    });
  } catch (err) {
    console.error('[Message Edit Error]', err);
    res.status(500).json({ message: 'Server error while editing message' });
  }
});

// DELETE /api/messages/:id ── soft‑delete (author only)
router.delete('/:id', authenticateToken, async (req: AuthRequest, res) => {
  const { id } = req.params;
  if (!Types.ObjectId.isValid(id))
    return res.status(400).json({ message: 'Invalid message id' });

  try {
    const msg = await Message.findOneAndUpdate(
      { _id: id, senderId: req.user!.userId, deleted: false },
      { deleted: true, deletedAt: new Date(), ciphertext: '' },
      { new: true }
    );
    if (!msg) return res.status(404).json({ message: 'Message not found' });

    res.json({ _id: msg._id, deletedAt: msg.deletedAt });
  } catch (err) {
    console.error('[Message Delete Error]', err);
    res.status(500).json({ message: 'Server error while deleting message' });
  }
});

export default router;
