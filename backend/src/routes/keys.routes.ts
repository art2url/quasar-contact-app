import { Router } from 'express';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import { prisma } from '../services/database.service';

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
    return res
      .status(400)
      .json({ message: 'Missing key bundle or user info.' });
  }

  try {
    const updated = await prisma.user.update({
      where: { id: user.userId },
      data: {
        publicKeyBundle,
        isKeyMissing: false, // Keys are now available
      },
    });

    if (!updated) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // User uploaded public key - marking keys as available
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
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: {
        publicKeyBundle: true,
        username: true,
        avatarUrl: true,
        isKeyMissing: true,
      },
    });

    if (!user) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // Use the stored isKeyMissing flag from database as the source of truth
    const hasPublicKey = !!user.publicKeyBundle;

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
    res
      .status(500)
      .json({ message: 'Server error while fetching key bundle.' });
  }
});

// POST /api/keys/mark-missing - Mark user's keys as missing (when they lose them)
// SECURITY: This route is protected with multiple security measures to prevent abuse
router.post(
  '/mark-missing',
  authenticateToken,
  async (req: AuthRequest, res) => {
    const user = req.user;

    if (!user) {
      return res.status(401).json({ message: 'Unauthorized.' });
    }

    try {
      // SECURITY CHECK 1: Get current user state
      const currentUser = await prisma.user.findUnique({
        where: { id: user.userId },
      });

      if (!currentUser) {
        return res.status(404).json({ message: 'User not found.' });
      }

      // SECURITY CHECK 2: Rate limiting - prevent rapid successive calls
      const now = Date.now();
      const lastMarkTime = currentUser.lastKeyMarkTime
        ? Number(currentUser.lastKeyMarkTime)
        : 0;
      const timeSinceLastMark = now - lastMarkTime;
      const MIN_MARK_INTERVAL = 60000; // 1 minute minimum between calls

      if (timeSinceLastMark < MIN_MARK_INTERVAL) {
        const remainingTime = Math.ceil(
          (MIN_MARK_INTERVAL - timeSinceLastMark) / 1000,
        );
        console.log(
          `[Keys] SECURITY: User ${currentUser.username} rate limited - ${remainingTime}s remaining`,
        );
        return res.status(429).json({
          message: `Rate limited. Please wait ${remainingTime} seconds before marking keys as missing again.`,
        });
      }

      // SECURITY CHECK 3: Prevent unnecessary calls if already marked as missing
      if (currentUser.isKeyMissing) {
        console.log(
          `[Keys] SECURITY: User ${currentUser.username} already marked as missing keys`,
        );
        return res
          .status(409)
          .json({ message: 'Keys are already marked as missing.' });
      }

      // SECURITY CHECK 4: Validate that user actually has legitimate reason to mark keys as missing
      // This is a soft check - log warnings but don't block (for now)
      if (currentUser.publicKeyBundle) {
        console.log(
          `[Keys] WARNING: User ${currentUser.username} has public key but marking as missing`,
        );
        console.log(
          '[Keys] This might indicate: 1) Lost private key, 2) Vault corruption, 3) Potential abuse',
        );
      }

      // SECURITY CHECK 5: Add audit trail
      const clientIP = req.ip || req.socket.remoteAddress;
      const userAgent = req.headers['user-agent'];
      console.log(
        `[Keys] AUDIT: User ${currentUser.username} (${user.userId}) marked keys as missing`,
        {
          ip: clientIP,
          userAgent,
          timestamp: new Date().toISOString(),
          hadPublicKey: !!currentUser.publicKeyBundle,
        },
      );

      // Update user with security tracking
      const updated = await prisma.user.update({
        where: { id: user.userId },
        data: {
          // DO NOT clear publicKeyBundle - other users still need it to encrypt messages
          isKeyMissing: true, // Mark keys as missing (user can't decrypt, but others can still encrypt)
          lastKeyMarkTime: BigInt(now), // Track when this was last called (for rate limiting)
          keyMarkCount: (currentUser.keyMarkCount || 0) + 1, // Track how many times user has marked keys as missing
        },
      });

      if (!updated) {
        return res.status(404).json({ message: 'User not found.' });
      }

      res.status(200).json({ message: 'Keys marked as missing successfully.' });
    } catch (error) {
      console.error('[Key Missing Mark Error]', error);
      res
        .status(500)
        .json({ message: 'Server error marking keys as missing.' });
    }
  },
);

export default router;
