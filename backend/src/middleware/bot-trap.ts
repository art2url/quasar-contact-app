import { Request, Response, NextFunction } from 'express';

// ─── Bot Trap Configuration ────────────────────────────────
const TRAP_PATHS = [
  '/admin/config.php',
  '/wp-login.php',
  '/.git/config',
  '/wp-admin/install.php',
  '/phpmyadmin/index.php',
  '/.env.backup',
  '/backup.sql',
  '/database.sql',
  '/config/database.yml',
  '/api/admin/users',
];

// Tracking trapped IPs
const trappedIPs = new Set<string>();

// ─── Helper Function ───────────────────────────────────────
const getClientIP = (req: Request): string => {
  return (
    req.ip ||
    req.headers['x-forwarded-for']?.toString().split(',')[0] ||
    req.headers['x-real-ip']?.toString() ||
    req.socket.remoteAddress ||
    'unknown'
  );
};

// ─── Bot Trap Middleware ───────────────────────────────────
export const setupBotTraps = (app: any): void => {
  // Set up trap endpoints
  TRAP_PATHS.forEach(trapPath => {
    app.get(trapPath, (req: Request, res: Response) => {
      const clientIP = getClientIP(req);
      trappedIPs.add(clientIP);

      console.log(`🪤 TRAP TRIGGERED: ${trapPath} by ${clientIP}`);

      // Log detailed info for analysis
      console.log({
        timestamp: new Date().toISOString(),
        ip: clientIP,
        path: trapPath,
        userAgent: req.get('User-Agent'),
        referer: req.get('Referer'),
      });

      // Respond with fake delay to waste bot time
      setTimeout(
        () => {
          res.status(404).send(`
          <!DOCTYPE html>
          <html>
          <head><title>404 Not Found</title></head>
          <body>
            <h1>Not Found</h1>
            <p>The requested URL was not found on this server.</p>
          </body>
          </html>
        `);
        },
        Math.random() * 3000 + 2000,
      ); // 2-5 second delay
    });
  });
};

// ─── Check if IP is trapped ────────────────────────────────
export const isIPTrapped = (ip: string): boolean => {
  return trappedIPs.has(ip);
};

// ─── Trap Check Middleware ─────────────────────────────────
export const checkTrappedIP = (
  req: Request,
  res: Response,
  next: NextFunction,
): void => {
  const clientIP = getClientIP(req);

  if (isIPTrapped(clientIP)) {
    console.log(`🚫 TRAPPED IP BLOCKED: ${clientIP} attempting ${req.path}`);
    res.status(403).json({ error: 'Access denied' });
    return;
  }

  next();
};

// ─── Export trapped IPs for bot blocker ────────────────────
export const getTrappedIPs = (): Set<string> => trappedIPs;

// ─── Clean up periodically ─────────────────────────────────
setInterval(() => {
  if (trappedIPs.size > 5000) {
    trappedIPs.clear();
    console.log('🧹 Cleared trapped IPs');
  }
}, 7200000); // Every 2 hours
