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
// SECURITY: This route is protected with multiple security measures to prevent abuse
router.post('/mark-missing', authenticateToken, async (req: AuthRequest, res) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  try {
    // SECURITY CHECK 1: Get current user state
    const currentUser = await User.findById(user.userId);
    if (!currentUser) {
      return res.status(404).json({ message: 'User not found.' });
    }

    // SECURITY CHECK 2: Rate limiting - prevent rapid successive calls
    const now = Date.now();
    const lastMarkTime = currentUser.lastKeyMarkTime || 0;
    const timeSinceLastMark = now - lastMarkTime;
    const MIN_MARK_INTERVAL = 60000; // 1 minute minimum between calls

    if (timeSinceLastMark < MIN_MARK_INTERVAL) {
      const remainingTime = Math.ceil((MIN_MARK_INTERVAL - timeSinceLastMark) / 1000);
      console.log(`[Keys] SECURITY: User ${currentUser.username} rate limited - ${remainingTime}s remaining`);
      return res.status(429).json({ 
        message: `Rate limited. Please wait ${remainingTime} seconds before marking keys as missing again.` 
      });
    }

    // SECURITY CHECK 3: Prevent unnecessary calls if already marked as missing
    if (currentUser.isKeyMissing) {
      console.log(`[Keys] SECURITY: User ${currentUser.username} already marked as missing keys`);
      return res.status(409).json({ message: 'Keys are already marked as missing.' });
    }

    // SECURITY CHECK 4: Validate that user actually has legitimate reason to mark keys as missing
    // This is a soft check - log warnings but don't block (for now)
    if (currentUser.publicKeyBundle) {
      console.log(`[Keys] WARNING: User ${currentUser.username} has public key but marking as missing`);
      console.log(`[Keys] This might indicate: 1) Lost private key, 2) Vault corruption, 3) Potential abuse`);
    }

    // SECURITY CHECK 5: Add audit trail
    const clientIP = req.ip || req.connection.remoteAddress;
    const userAgent = req.headers['user-agent'];
    console.log(`[Keys] AUDIT: User ${currentUser.username} (${user.userId}) marked keys as missing`, {
      ip: clientIP,
      userAgent,
      timestamp: new Date().toISOString(),
      hadPublicKey: !!currentUser.publicKeyBundle
    });

    // Update user with security tracking
    const updated = await User.findByIdAndUpdate(
      user.userId,
      { 
        // DO NOT clear publicKeyBundle - other users still need it to encrypt messages
        isKeyMissing: true,     // Mark keys as missing (user can't decrypt, but others can still encrypt)
        lastKeyMarkTime: now,   // Track when this was last called (for rate limiting)
        keyMarkCount: (currentUser.keyMarkCount || 0) + 1  // Track how many times user has marked keys as missing
      },
      { new: true },
    );

    if (!updated) {
      return res.status(404).json({ message: 'User not found.' });
    }

    console.log(`[Keys] User ${updated.username} marked keys as missing (count: ${updated.keyMarkCount})`);
    res.status(200).json({ message: 'Keys marked as missing successfully.' });
  } catch (error) {
    console.error('[Key Missing Mark Error]', error);
    res.status(500).json({ message: 'Server error marking keys as missing.' });
  }
});

// DEBUG/ADMIN: GET /api/keys/debug/all-users - Check all users' key status
router.get('/debug/all-users', async (req, res) => {
  try {
    const users = await User.find().select('username publicKeyBundle isKeyMissing');
    
    const userStatus = users.map(user => ({
      username: user.username,
      hasPublicKey: !!user.publicKeyBundle,
      isKeyMissing: user.isKeyMissing,
      inconsistent: !!user.publicKeyBundle && user.isKeyMissing // Has key but marked as missing
    }));
    
    console.log('[Keys] DEBUG: All users key status:', userStatus);
    res.status(200).json(userStatus);
  } catch (error) {
    console.error('[Keys] DEBUG: Error fetching all users key status:', error);
    res.status(500).json({ message: 'Server error while fetching debug info.' });
  }
});

// DEBUG/ADMIN: POST /api/keys/debug/fix-inconsistent - Fix users who have keys but are marked as missing
router.post('/debug/fix-inconsistent', async (req, res) => {
  try {
    const inconsistentUsers = await User.find({
      publicKeyBundle: { $ne: null },
      isKeyMissing: true
    });
    
    console.log(`[Keys] DEBUG: Found ${inconsistentUsers.length} users with inconsistent key status`);
    
    const fixedUsers = [];
    for (const user of inconsistentUsers) {
      console.log(`[Keys] DEBUG: Fixing user ${user.username} - has key but marked as missing`);
      
      const updated = await User.findByIdAndUpdate(
        user._id,
        { isKeyMissing: false },
        { new: true }
      );
      
      if (updated) {
        fixedUsers.push(updated.username);
      }
    }
    
    console.log(`[Keys] DEBUG: Fixed ${fixedUsers.length} users:`, fixedUsers);
    res.status(200).json({ 
      message: `Fixed ${fixedUsers.length} users with inconsistent key status`,
      fixedUsers 
    });
  } catch (error) {
    console.error('[Keys] DEBUG: Error fixing inconsistent users:', error);
    res.status(500).json({ message: 'Server error while fixing inconsistent users.' });
  }
});

// DEBUG: POST /api/keys/debug-clear-missing - Clear current user's key missing flag
router.post('/debug-clear-missing', authenticateToken, async (req: AuthRequest, res) => {
  const user = req.user;

  if (!user) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  try {
    const updated = await User.findByIdAndUpdate(
      user.userId,
      { isKeyMissing: false },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'User not found.' });
    }

    console.log(`[Keys] DEBUG: Cleared key missing flag for user ${updated.username}`);
    res.status(200).json({ message: 'Key missing flag cleared successfully.' });
  } catch (error) {
    console.error('[Keys] DEBUG: Error clearing key missing flag:', error);
    res.status(500).json({ message: 'Server error while clearing key missing flag.' });
  }
});

// DEBUG: POST /api/keys/debug-clear-all-missing - Clear isKeyMissing flag for ALL users (emergency cleanup)
router.post('/debug-clear-all-missing', async (req, res) => {
  try {
    const result = await User.updateMany(
      { isKeyMissing: true },
      { $set: { isKeyMissing: false } }
    );

    console.log(`[Keys] DEBUG: Cleared isKeyMissing flag for ${result.modifiedCount} users`);
    res.status(200).json({ 
      message: `Cleared isKeyMissing flag for ${result.modifiedCount} users`,
      modifiedCount: result.modifiedCount
    });
  } catch (error) {
    console.error('[Keys] DEBUG: Error clearing all missing flags:', error);
    res.status(500).json({ message: 'Server error while clearing all missing flags.' });
  }
});

// DEBUG: POST /api/keys/debug-force-regenerate - Force regenerate public keys for current user (for testing)
router.post('/debug-force-regenerate', authenticateToken, async (req: AuthRequest, res) => {
  const user = req.user;
  const { publicKeyBundle } = req.body;

  if (!user) {
    return res.status(401).json({ message: 'Unauthorized.' });
  }

  if (!publicKeyBundle) {
    return res.status(400).json({ message: 'Public key bundle is required.' });
  }

  try {
    const updated = await User.findByIdAndUpdate(
      user.userId,
      { 
        publicKeyBundle,
        isKeyMissing: false
      },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ message: 'User not found.' });
    }

    console.log(`[Keys] DEBUG: Force regenerated public key for user ${updated.username}`);
    res.status(200).json({ message: 'Public key force regenerated successfully.' });
  } catch (error) {
    console.error('[Keys] DEBUG: Error force regenerating public key:', error);
    res.status(500).json({ message: 'Server error while force regenerating public key.' });
  }
});

export default router;
