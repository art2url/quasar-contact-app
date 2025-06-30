// ─── Analytics Routes ─────────────────────────────────────
import { Router, Request, Response } from 'express';

const router = Router();

// ─── Analytics Event Handler ──────────────────────────────
router.post('/', async (req: Request, res: Response) => {
  const GA_MEASUREMENT_ID = process.env.GA_MEASUREMENT_ID;
  const GA_API_SECRET = process.env.GA_API_SECRET;

  if (!GA_MEASUREMENT_ID || !GA_API_SECRET) {
    console.error('Analytics not configured - missing environment variables');
    return res.status(500).json({
      error: 'Analytics not configured',
      type: 'config_error',
    });
  }

  try {
    let body = req.body;

    // Handle sendBeacon requests (sent as text)
    if (typeof req.body === 'string') {
      body = JSON.parse(req.body);
    }

    const { client_id, events } = body;

    // Validate request
    if (!client_id || !events || !Array.isArray(events)) {
      return res.status(400).json({
        error: 'Invalid request format',
        type: 'validation_error',
      });
    }

    // Log analytics batch (remove in production if needed)
    if (process.env.NODE_ENV !== 'production') {
      console.log(`📊 Analytics batch: ${events.length} events from ${req.ip}`);
    }

    // Send to Google Analytics Measurement Protocol
    const gaResponse = await fetch(
      `https://www.google-analytics.com/mp/collect?measurement_id=${GA_MEASUREMENT_ID}&api_secret=${GA_API_SECRET}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ client_id, events }),
      }
    );

    if (!gaResponse.ok) {
      throw new Error(`GA API error: ${gaResponse.status}`);
    }

    res.json({ success: true, processed: events.length });
  } catch (error) {
    console.error('Analytics proxy error:', {
      error: error instanceof Error ? error.message : 'Unknown error',
      ip: req.ip,
      path: req.path,
    });

    res.status(500).json({
      error: 'Failed to send analytics',
      type: 'proxy_error',
    });
  }
});

export default router;
