import { Router } from 'express';
import multer from 'multer';
import { authenticateToken, AuthRequest } from '../middleware/auth.middleware';
import { io } from '../server';
import { emitToUser } from '../sockets';

const router = Router();

// Configure multer for memory storage (we'll process images in memory)
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB limit
  },
  fileFilter: (req, file, cb) => {
    // Only allow image files
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  },
});

// POST /api/upload/image - Upload and compress image, return base64
router.post('/image', authenticateToken, upload.single('image'), async (req: AuthRequest, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ 
        success: false, 
        message: 'No image file provided', 
      });
    }

    const { receiverId, encryptedPayload } = req.body;
    
    if (!receiverId || !encryptedPayload) {
      return res.status(400).json({
        success: false,
        message: 'Missing receiverId or encryptedPayload',
      });
    }

    // Check file size to prevent DoS attacks
    if (req.file.size > 5 * 1024 * 1024) { // 5MB limit
      return res.status(413).json({
        success: false,
        message: 'File too large - maximum size is 5MB',
      });
    }

    // Convert buffer to base64 for consistent handling with frontend
    const base64Image = req.file.buffer.toString('base64');
    
    res.json({
      success: true,
      imageData: base64Image,
      size: req.file.size,
      mimeType: req.file.mimetype,
      receiverId,
      encryptedPayload,
    });

  } catch (error) {
    console.error('[Image Upload Error]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to process image upload',
    });
  }
});

// POST /api/upload/message-with-image - Send message with image via HTTP fallback
router.post('/message-with-image', authenticateToken, async (req: AuthRequest, res) => {
  try {
    const { receiverId, encryptedPayload, retryAttempt = 0 } = req.body;
    
    if (!receiverId || !encryptedPayload) {
      return res.status(400).json({
        success: false,
        message: 'Missing receiverId or encryptedPayload',
      });
    }

    // Store the message in database (same as regular message)
    const { prisma } = require('../services/database.service');
    
    const message = await prisma.message.create({
      data: {
        senderId: req.user?.userId!,
        receiverId,
        ciphertext: encryptedPayload,
      },
    });

    const timestamp = message.timestamp || message.createdAt;

    // Get sender info for socket notification
    const sender = await prisma.user.findUnique({
      where: { id: req.user?.userId! },
      select: { username: true, avatarUrl: true },
    });

    // Emit message to recipient via socket (includes offline queueing)
    // This uses the same pattern as the socket 'send-message' handler
    const messageData = {
      fromUserId: req.user?.userId!,
      fromUsername: sender?.username || 'Unknown',
      avatarUrl: sender?.avatarUrl,
      ciphertext: encryptedPayload,
      messageId: message.id,
      timestamp,
    };

    // Use the same emission pattern as socket 'send-message' handler
    // This includes automatic offline queueing
    const delivered = emitToUser(io, receiverId, 'receive-message', messageData);
    
    if (!delivered) {
      // Message queued for offline recipient - will be delivered when they reconnect
    }

    res.json({
      success: true,
      messageId: message.id,
      timestamp,
      retryAttempt,
    });

  } catch (error) {
    console.error('[Image Message Send Error]', error);
    res.status(500).json({
      success: false,
      message: 'Failed to send message with image',
    });
  }
});

export default router;