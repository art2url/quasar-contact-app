import { Request, Response, NextFunction } from 'express';
import { RateLimiterMemory } from 'rate-limiter-flexible';

// ─── Rate Limiter Configuration ────────────────────────────
const rateLimiter = new RateLimiterMemory({
  points: 10, // Number of requests
  duration: 60, // Per 60 seconds
});

const bruteForceRateLimiter = new RateLimiterMemory({
  points: 5, // Even stricter for suspicious paths
  duration: 300, // Per 5 minutes
});

// ─── IP Blacklist (in-memory for now) ─────────────────────
const blacklistedIPs = new Set<string>();
const suspiciousActivity = new Map<string, number>();

// ─── Comprehensive Blocked Paths ───────────────────────────
const BLOCKED_PATHS = [
  // WordPress
  '/wp-admin',
  '/wp-login',
  '/wp-content',
  '/wp-includes',
  '/wordpress',
  '/xmlrpc.php',
  '/wp-json/wp/v2/users',
  '/wp-cron.php',

  // Common admin paths
  '/admin',
  '/administrator',
  '/panel',
  '/manager',
  '/controlpanel',

  // Database management
  '/phpmyadmin',
  '/phpMyAdmin',
  '/pma',
  '/mysql',
  '/myadmin',
  '/MyAdmin',
  '/dbadmin',
  '/db',
  '/database',
  '/sql',
  '/sqladmin',

  // Other CMSs
  '/joomla',
  '/drupal',
  '/magento',
  '/prestashop',
  '/bitrix',

  // Config and sensitive files
  '/.env',
  '/.git',
  '/.svn',
  '/.htaccess',
  '/.htpasswd',
  '/config.php',
  '/configuration.php',
  '/settings.php',
  '/web.config',

  // Shell/backdoor attempts
  '/shell',
  '/cmd',
  '/exec',
  '/system',
  '/backdoor',
  '/c99',
  '/r57',
  '/webshell',
  '/console',

  // Setup/install files
  '/setup',
  '/install',
  '/installer',
  '/installation',
  '/upgrade',
  '/update',
  '/migrate',

  // Common attack vectors
  '/cgi-bin',
  '/scripts',
  '/fckeditor',
  '/tiny_mce',
  '/ckfinder',
  '/connector',
  '/filemanager',
  '/uploadify',
];

// ─── Suspicious Patterns ───────────────────────────────────
const SUSPICIOUS_PATTERNS = [
  /\.(php|asp|aspx|jsp|cgi|pl|py|rb|sh|bash|exe|dll|bat|cmd)$/i,
  /\.\./g, // Directory traversal
  /%2e%2e/gi, // URL encoded directory traversal
  /union.*select/i, // SQL injection
  /script.*>/i, // XSS attempts
  /eval\(/i, // Code execution
  /base64_/i, // Encoding attempts
  /<\?php/i, // PHP injection
  /system\(/i, // System calls
  /exec\(/i, // Exec calls
];

// ─── Blocked User Agents ───────────────────────────────────
const BLOCKED_USER_AGENTS = [
  // Scanners - exact matches only
  'masscan',
  'zmap',
  'nmap',
  'sqlmap',
  'nikto',
  'wpscan',
  'joomscan',
  'uniscan',
  'gobuster',
  'dirb',
  'dirbuster',
  'wfuzz',
  'httpx',
  'nuclei',
  'ffuf',
  'feroxbuster',

  // Malicious tools
  'havij',
  'acunetix',
  'netsparker',
  'w3af',
  'metasploit',
  'burpsuite',
  'owasp',
  'zaproxy',
  'vega',
  'sqlninja',

  // Known bad bots (specific, not generic)
  'ahrefsbot',
  'semrushbot',
  'dotbot',
  'mj12bot',
  'blexbot',
  'yandexbot/3.0',
  'aiohttpbot',

  // Empty or suspicious
  '-',
  'null',
  'undefined',
];

// ─── Whitelisted User Agents ──────────────────────────────
// Allow Google and other legitimate crawlers
const WHITELISTED_BOTS = [
  'googlebot',
  'bingbot',
  'slurp',
  'duckduckbot',
  'baiduspider',
  'yandexbot',
  'facebookexternalhit',
  'twitterbot',
  'linkedinbot',
  'whatsapp',
  'telegram',
];

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

const isPathBlocked = (path: string): boolean => {
  const lowerPath = path.toLowerCase();
  return BLOCKED_PATHS.some(
    blocked => lowerPath.startsWith(blocked) || lowerPath.endsWith(blocked),
  );
};

const containsSuspiciousPattern = (path: string): boolean => {
  return SUSPICIOUS_PATTERNS.some(pattern => pattern.test(path));
};

const isUserAgentBlocked = (userAgent: string): boolean => {
  const lowerUA = userAgent.toLowerCase();

  // First check if whitelisted
  if (WHITELISTED_BOTS.some(bot => lowerUA.includes(bot))) {
    return false;
  }

  // Then check if blocked
  return BLOCKED_USER_AGENTS.some(blocked => lowerUA.includes(blocked));
};

// ─── Whitelisted Paths - Never Block These ────────────────
const WHITELISTED_PATHS = [
  '/app',
  '/api',
  '/assets',
  '/favicon.ico',
  '/health',
  '/manifest.json',
  '/robots.txt',
  '/sitemap.xml',
  '/about',
  '/faq',
  '/legal',
  '/author',
  '/404',
];

// ─── Main Bot Blocker Middleware ───────────────────────────
export const blockBots = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> => {
  const clientIP = getClientIP(req);
  const userAgent = req.get('User-Agent') || '';
  const path = req.path;
  const method = req.method;

  try {
    // Skip bot blocking for whitelisted paths
    if (
      WHITELISTED_PATHS.some(whitePath => path.startsWith(whitePath)) ||
      path === '/'
    ) {
      return next();
    }
    // Check if IP is blacklisted
    if (blacklistedIPs.has(clientIP)) {
      console.log(`🚫 BLACKLISTED IP: ${clientIP}`);
      res.status(403).end();
      return;
    }

    // Check for blocked paths
    if (isPathBlocked(path)) {
      console.log(`🛡️  BLOCKED PATH: ${method} ${path} from ${clientIP}`);

      // Track suspicious activity
      const count = (suspiciousActivity.get(clientIP) || 0) + 1;
      suspiciousActivity.set(clientIP, count);

      // Auto-blacklist after 10 attempts
      if (count >= 10) {
        blacklistedIPs.add(clientIP);
        console.log(`⛔ AUTO-BLACKLISTED: ${clientIP} after ${count} attempts`);
      }

      // Apply rate limiting for suspicious paths
      try {
        await bruteForceRateLimiter.consume(clientIP);
      } catch {
        res.status(429).json({ error: 'Too many requests' });
        return;
      }

      res.status(404).end();
      return;
    }

    // Check for suspicious patterns in path
    if (containsSuspiciousPattern(path)) {
      console.log(`⚠️  SUSPICIOUS PATTERN: ${path} from ${clientIP}`);
      const count = (suspiciousActivity.get(clientIP) || 0) + 1;
      suspiciousActivity.set(clientIP, count);

      res.status(400).end();
      return;
    }

    // Check user agent
    if (isUserAgentBlocked(userAgent)) {
      console.log(
        `🤖 BLOCKED BOT: ${userAgent.substring(0, 50)} from ${clientIP}`,
      );
      res.status(403).end();
      return;
    }

    // Apply general rate limiting only for non-static resources
    if (
      !path.match(
        /\.(js|css|png|jpg|jpeg|gif|svg|ico|woff|woff2|ttf|eot|webmanifest)$/,
      )
    ) {
      try {
        await rateLimiter.consume(clientIP);
      } catch {
        res.status(429).json({ error: 'Too many requests' });
        return;
      }
    }

    // All checks passed
    next();
  } catch (error) {
    console.error('Bot blocker error:', error);
    next();
  }
};

// ─── Honeypot Endpoint ─────────────────────────────────────
export const honeypot = (req: Request, res: Response): void => {
  const clientIP = getClientIP(req);
  blacklistedIPs.add(clientIP);
  console.log(`🍯 HONEYPOT TRIGGERED: ${clientIP} caught in trap`);

  // Respond slowly to waste bot's time
  setTimeout(() => {
    res.status(404).end();
  }, 5000);
};

// ─── Clean up old entries periodically ─────────────────────
setInterval(() => {
  // Clear suspicious activity older than 1 hour
  suspiciousActivity.clear();

  // Optional: Clear blacklist if it gets too large
  if (blacklistedIPs.size > 10000) {
    blacklistedIPs.clear();
    console.log('🧹 Cleared IP blacklist');
  }
}, 3600000); // Every hour
