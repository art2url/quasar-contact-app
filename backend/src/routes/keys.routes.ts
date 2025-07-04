import { Router } from 'express';
import User from '../models/User';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';

/*
  Note: All encryption and decryption operations are performed on the frontend using crypto.subtle.
  The backend only stores and retrieves the public key bundles.
*/

const router = Router();

// POST /api/keys/upload
router.post('/upload', authenticateToken, async (req: AuthRequest, res) => {
  const user = req.user;
  const { publicKeyBundle } = req.body;

  if (!user || !publicKeyBundle) {
    return res.status(400).json({ message: 'Missing key bundle or user info.' });
  }

  try {
    const updated = await User.findByIdAndUpdate(
      user.userId,
      { publicKeyBundle },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'User not found.' });
    }

    res.status(200).json({ message: 'Public key uploaded successfully.' });
  } catch (error) {
    console.error('[Key Upload Error]', error);
    res.status(500).json({ message: 'Server error during key upload.' });
  }
});

// GET /api/keys/:userId
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId).select('publicKeyBundle username avatarUrl');

    if (!user || !user.publicKeyBundle) {
      return res.status(404).json({ message: 'Public key not found for user.' });
    }

    res.status(200).json({
      username: user.username,
      avatarUrl: user.avatarUrl,
      publicKeyBundle: user.publicKeyBundle,
    });
  } catch (error) {
    console.error('[Key Fetch Error]', error);
    res.status(500).json({ message: 'Server error while fetching key bundle.' });
  }
});

export default router;
