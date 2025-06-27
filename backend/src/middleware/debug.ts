import { Request, Response, NextFunction } from 'express';

export const debugMiddleware = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  console.log(`
🔍 DEBUG REQUEST:
  Time: ${new Date().toISOString()}
  Method: ${req.method}
  Path: ${req.path}
  URL: ${req.url}
  IP: ${req.ip || req.socket.remoteAddress}
  User-Agent: ${req.get('User-Agent')?.substring(0, 100)}
  Headers: ${JSON.stringify(req.headers, null, 2)}
  `);

  // Log when response finishes
  res.on('finish', () => {
    console.log(`
🔍 DEBUG RESPONSE:
  Status: ${res.statusCode}
  Path: ${req.path}
  `);
  });

  next();
};
