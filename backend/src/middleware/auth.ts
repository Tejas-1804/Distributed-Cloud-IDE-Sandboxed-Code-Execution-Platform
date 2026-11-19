import type { NextFunction, Request, Response } from 'express';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const token = authHeader.slice('Bearer '.length).trim();
    if (!token) {
      throw new AppError(401, 'Authentication token missing', 'AUTH_TOKEN_MISSING');
    }

    let decoded;
    try {
      decoded = verifyAccessToken(token);
    } catch {
      throw new AppError(401, 'Invalid or expired access token', 'AUTH_TOKEN_INVALID');
    }

    const user = await User.findById(decoded.sub);
    if (!user) {
      throw new AppError(401, 'Authenticated user no longer exists', 'AUTH_USER_NOT_FOUND');
    }

    req.user = user;
    next();
  } catch (err) {
    next(err);
  }
}
