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
      { 
        publicKeyBundle,
        isKeyMissing: false // Keys are now available
      },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({ message: 'User not found.' });
    }

    console.log(`[Keys] User ${updated.username} uploaded public key - marking keys as available`);
    res.status(200).json({ message: 'Public key uploaded successfully.' });
  } catch (error) {
    console.error('[Key Upload Error]', error);
    res.status(500).json({ message: 'Server error during key upload.' });
  }
});

// GET /api/keys/:userId - Get user's public key bundle
router.get('/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const user = await User.findById(userId).select('publicKeyBundle username avatarUrl isKeyMissing');

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Use the stored isKeyMissing flag from database as the source of truth
    const hasPublicKey = !!user.publicKeyBundle;
    
    console.log(`[Keys] User ${user.username} status - hasPublicKey: ${hasPublicKey}, isKeyMissing: ${user.isKeyMissing}`);

    // Always return user info, using the database flag as source of truth
    res.status(200).json({
      username: user.username,
      avatarUrl: user.avatarUrl,
      publicKeyBundle: user.publicKeyBundle || null,
      hasPublicKey,
      isKeyMissing: user.isKeyMissing, // Use database flag directly
    });
  } catch (error) {
    console.error('[Key Fetch Error]', error);
    res.status(500).json({ message: 'Server error while fetching key bundle.' });
  }
});

// POST /api/keys/mark-missing - Mark user's keys as missing (when they lose them)
router.post('/mark-missing', authenticateToken, async (req: AuthRequest, res) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  try {
    const updated = await User.findByIdAndUpdate(
      user.userId,
      { 
        publicKeyBundle: null, // Clear the public key
        isKeyMissing: true     // Mark keys as missing
      },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({ message: 'User not found.' });
    }

    console.log(`[Keys] User ${updated.username} marked keys as missing`);
    res.status(200).json({ message: 'Keys marked as missing successfully.' });
  } catch (error) {
    console.error('[Key Missing Mark Error]', error);
    res.status(500).json({ message: 'Server error marking keys as missing.' });
  }
});

export default router;
