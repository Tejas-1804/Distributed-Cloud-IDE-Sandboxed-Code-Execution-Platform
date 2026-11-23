import crypto from 'crypto';
import bcrypt from 'bcrypt';
import type { NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { User, type IUser } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { verifyAccessToken } from '../utils/jwt.js';

const LOCAL_DEV_USER_EMAIL = 'local-dev@cloudide.local';

export async function resolveDevAccessUser(): Promise<IUser> {
  let user = await User.findOne({ email: LOCAL_DEV_USER_EMAIL });
  if (!user) {
    const randomPassword = crypto.randomBytes(32).toString('hex');
    const passwordHash = await bcrypt.hash(randomPassword, 10);
    user = await User.create({
      name: 'Local Developer',
      email: LOCAL_DEV_USER_EMAIL,
      passwordHash,
      role: 'user',
    });
  }
  return user;
}

export async function authenticateBearerToken(token: string): Promise<IUser> {
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
  return user;
}

export async function requireAuth(
  req: Request,
  _res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.slice('Bearer '.length).trim();
      if (!token) {
        throw new AppError(401, 'Authentication token missing', 'AUTH_TOKEN_MISSING');
      }
      req.user = await authenticateBearerToken(token);
      next();
      return;
    }

    // Explicitly documented local single-user development mode (disabled by default in production)
    if (env.DEV_ACCESS_MODE && env.NODE_ENV !== 'production') {
      req.user = await resolveDevAccessUser();
      next();
      return;
    }

    throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
  } catch (err) {
    next(err);
  }
}
