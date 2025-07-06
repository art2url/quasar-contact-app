import { Request, Response, NextFunction } from 'express';
import fs from 'fs';
import path from 'path';

// Create logs directory if it doesn't exist
const logsDir = path.join(__dirname, '../../logs');
if (!fs.existsSync(logsDir)) {
  fs.mkdirSync(logsDir, { recursive: true });
}

// ─── Helper Functions ──────────────────────────────────────
const getClientIP = (req: Request): string => {
  return (
    req.ip ||
    req.headers['x-forwarded-for']?.toString().split(',')[0] ||
    req.headers['x-real-ip']?.toString() ||
    req.socket.remoteAddress ||
    'unknown'
  );
};

const formatDate = (): string => {
  const now = new Date();
  const month = (now.getMonth() + 1).toString().padStart(2, '0');
  const day = now.getDate().toString().padStart(2, '0');
  const hours = now.getHours().toString().padStart(2, '0');
  const minutes = now.getMinutes().toString().padStart(2, '0');
  const seconds = now.getSeconds().toString().padStart(2, '0');

  return `${now.getFullYear()}-${month}-${day} ${hours}:${minutes}:${seconds}`;
};

// ─── Suspicious Request Logger ─────────────────────────────
export const logSuspiciousRequest = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  const startTime = Date.now();

  // Log response after it's sent
  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const clientIP = getClientIP(req);
    const userAgent = req.get('User-Agent') || 'Unknown';

    // Only log 4xx and 5xx responses or suspicious paths
    if (res.statusCode >= 400 || req.path.includes('admin') || req.path.includes('wp')) {
      const logEntry = {
        timestamp: formatDate(),
        ip: clientIP,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        duration: `${duration}ms`,
        userAgent: userAgent.substring(0, 100),
        referer: req.get('Referer') || 'None',
      };

      // Console log for immediate visibility
      if (res.statusCode >= 400) {
        console.log(
          `[${logEntry.timestamp}] ${logEntry.ip} - ${logEntry.method} ${logEntry.path} - ${logEntry.status} - ${logEntry.duration}`
        );
      }

      // Write to file for analysis
      const logFile = path.join(
        logsDir,
        `suspicious-${new Date().toISOString().split('T')[0]}.log`
      );
      fs.appendFileSync(logFile, `${JSON.stringify(logEntry)}\n`);
    }
  });

  next();
};

// ─── Access Log for All Requests ──────────────────────────
export const accessLogger = (req: Request, res: Response, next: NextFunction): void => {
  const startTime = Date.now();

  res.on('finish', () => {
    const duration = Date.now() - startTime;
    const clientIP = getClientIP(req);

    const logLine = `${formatDate()} ${clientIP} "${req.method} ${req.path}" ${res.statusCode} ${duration}ms "${req.get('User-Agent') || '-'}"\n`;

    const accessLogFile = path.join(
      logsDir,
      `access-${new Date().toISOString().split('T')[0]}.log`
    );
    fs.appendFileSync(accessLogFile, logLine);
  });

  next();
};

// ─── Attack Pattern Analyzer ───────────────────────────────
export const analyzeAttackPatterns = (): void => {
  const analysisInterval = 300000; // 5 minutes

  setInterval(() => {
    try {
      const today = new Date().toISOString().split('T')[0];
      const suspiciousLogFile = path.join(logsDir, `suspicious-${today}.log`);

      if (fs.existsSync(suspiciousLogFile)) {
        const logs = fs
          .readFileSync(suspiciousLogFile, 'utf-8')
          .split('\n')
          .filter(line => line)
          .map(line => JSON.parse(line));

        // Analyze patterns
        const ipCounts = new Map<string, number>();
        const pathCounts = new Map<string, number>();

        logs.forEach(log => {
          ipCounts.set(log.ip, (ipCounts.get(log.ip) || 0) + 1);
          pathCounts.set(log.path, (pathCounts.get(log.path) || 0) + 1);
        });

        // Report top attackers
        const topAttackers = Array.from(ipCounts.entries())
          .sort((a, b) => b[1] - a[1])
          .slice(0, 5);

        if (topAttackers.length > 0) {
          console.log('\n📊 Attack Analysis Report:');
          console.log('Top attacking IPs:');
          topAttackers.forEach(([ip, count]) => {
            console.log(`  ${ip}: ${count} attempts`);
          });

          console.log('\nMost targeted paths:');
          Array.from(pathCounts.entries())
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([path, count]) => {
              console.log(`  ${path}: ${count} attempts`);
            });
        }
      }
    } catch (error) {
      console.error('Error analyzing attack patterns:', error);
    }
  }, analysisInterval);
};
