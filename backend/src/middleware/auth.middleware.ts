import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import env from '../config/env';

export interface AuthRequest extends Request {
  user?: { userId: string; username: string };
}

export const authenticateToken = (
  req: AuthRequest,
  res: Response,
  next: NextFunction,
) => {
  // First check for token in cookies (preferred method)
  let token = req.cookies?.auth_token;

  // Fallback to Authorization header for backward compatibility
  if (!token) {
    const authHeader = req.headers.authorization;
    token = authHeader?.split(' ')[1]; // Expecting: "Bearer <token>"
  }

  if (!token) {
    return res.status(401).json({ message: 'Access denied. Token missing.' });
  }

  try {
    const payload = jwt.verify(token, env.JWT_SECRET) as {
      userId: string;
      username: string;
    };

    req.user = { userId: payload.userId, username: payload.username };
    next();
  } catch (err) {
    return res.status(403).json({ message: 'Invalid or expired token.' });
  }
};
