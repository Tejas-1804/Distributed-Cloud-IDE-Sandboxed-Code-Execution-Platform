import bcrypt from 'bcrypt';
import type { CookieOptions, NextFunction, Request, Response } from 'express';
import { env } from '../config/env.js';
import { User } from '../models/User.js';
import { AppError } from '../utils/AppError.js';
import { sendSuccess } from '../utils/apiResponse.js';
import {
  hashToken,
  signAccessToken,
  signRefreshToken,
  verifyRefreshToken,
} from '../utils/jwt.js';

const BCRYPT_ROUNDS = 12;
const REFRESH_COOKIE_NAME = 'cloud_ide_refresh_token';

function getRefreshCookieOptions(req: Request): CookieOptions {
  const isHttps = req.secure || req.headers['x-forwarded-proto'] === 'https';
  return {
    httpOnly: true,
    secure: isHttps || env.NODE_ENV === 'production',
    sameSite: isHttps ? 'none' : 'lax',
    path: '/api/auth',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  };
}

function clearRefreshCookie(req: Request, res: Response): void {
  const { maxAge: _maxAge, ...clearOpts } = getRefreshCookieOptions(req);
  res.clearCookie(REFRESH_COOKIE_NAME, clearOpts);
}

function serializeUser(user: {
  _id: unknown;
  name: string;
  email: string;
  role: 'user' | 'admin';
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: String(user._id),
    name: user.name,
    email: user.email,
    role: user.role,
    createdAt: user.createdAt,
    updatedAt: user.updatedAt,
  };
}

export async function register(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    const { name, email, password } = req.body as {
      name: string;
      email: string;
      password: string;
    };

    const normalizedEmail = email.trim().toLowerCase();
    const existing = await User.findOne({ email: normalizedEmail });
    if (existing) {
      throw new AppError(409, 'An account with this email already exists.', 'EMAIL_ALREADY_EXISTS');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const user = await User.create({
      name: name.trim(),
      email: normalizedEmail,
      passwordHash,
      role: 'user',
    });

    const accessToken = signAccessToken({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });
    const { token: refreshToken } = signRefreshToken(user._id.toString());
    user.refreshTokenHash = hashToken(refreshToken);
    await user.save();

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(req));

    sendSuccess(res, 201, 'Account registered successfully', {
      user: serializeUser(user),
      accessToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function login(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const { email, password } = req.body as { email: string; password: string };
    const normalizedEmail = email.trim().toLowerCase();

    const user = await User.findOne({ email: normalizedEmail }).select('+passwordHash');
    if (!user) {
      throw new AppError(401, 'Invalid email or password.', 'AUTH_INVALID_CREDENTIALS');
    }

    const passwordMatches = await bcrypt.compare(password, user.passwordHash);
    if (!passwordMatches) {
      throw new AppError(401, 'Invalid email or password.', 'AUTH_INVALID_CREDENTIALS');
    }

    const accessToken = signAccessToken({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });
    const { token: refreshToken } = signRefreshToken(user._id.toString());
    user.refreshTokenHash = hashToken(refreshToken);
    await user.save();

    res.cookie(REFRESH_COOKIE_NAME, refreshToken, getRefreshCookieOptions(req));

    sendSuccess(res, 200, 'Logged in successfully', {
      user: serializeUser(user),
      accessToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawCookie = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (!rawCookie) {
      throw new AppError(401, 'Refresh session not found.', 'REFRESH_TOKEN_MISSING');
    }

    let payload;
    try {
      payload = verifyRefreshToken(rawCookie);
    } catch {
      clearRefreshCookie(req, res);
      throw new AppError(401, 'Invalid or expired refresh session.', 'REFRESH_TOKEN_INVALID');
    }

    const user = await User.findById(payload.sub).select('+refreshTokenHash');
    if (!user || !user.refreshTokenHash) {
      clearRefreshCookie(req, res);
      throw new AppError(401, 'Refresh session has been invalidated.', 'REFRESH_SESSION_REVOKED');
    }

    if (user.refreshTokenHash !== hashToken(rawCookie)) {
      user.refreshTokenHash = null;
      await user.save();
      clearRefreshCookie(req, res);
      throw new AppError(401, 'Refresh token mismatch.', 'REFRESH_TOKEN_MISMATCH');
    }

    const accessToken = signAccessToken({
      sub: user._id.toString(),
      email: user.email,
      role: user.role,
    });
    const { token: nextRefreshToken } = signRefreshToken(user._id.toString());
    user.refreshTokenHash = hashToken(nextRefreshToken);
    await user.save();

    res.cookie(REFRESH_COOKIE_NAME, nextRefreshToken, getRefreshCookieOptions(req));

    sendSuccess(res, 200, 'Access token refreshed', {
      user: serializeUser(user),
      accessToken,
    });
  } catch (err) {
    next(err);
  }
}

export async function logout(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    const rawCookie = req.cookies?.[REFRESH_COOKIE_NAME] as string | undefined;
    if (rawCookie) {
      try {
        const decoded = verifyRefreshToken(rawCookie);
        await User.findByIdAndUpdate(decoded.sub, { $set: { refreshTokenHash: null } });
      } catch {
        // Ignore invalid token during logout
      }
    } else if (req.user) {
      await User.findByIdAndUpdate(req.user._id, { $set: { refreshTokenHash: null } });
    }

    clearRefreshCookie(req, res);
    sendSuccess(res, 200, 'Logged out successfully', null);
  } catch (err) {
    next(err);
  }
}

export async function getMe(req: Request, res: Response, next: NextFunction): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }
    sendSuccess(res, 200, 'Profile retrieved', { user: serializeUser(req.user) });
  } catch (err) {
    next(err);
  }
}

export async function updateProfile(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const { name, email } = req.body as { name: string; email: string };
    const normalizedEmail = email.trim().toLowerCase();

    if (normalizedEmail !== req.user.email) {
      const existing = await User.findOne({
        email: normalizedEmail,
        _id: { $ne: req.user._id },
      });
      if (existing) {
        throw new AppError(409, 'Email is already in use by another account.', 'EMAIL_ALREADY_EXISTS');
      }
    }

    req.user.name = name.trim();
    req.user.email = normalizedEmail;
    await req.user.save();

    sendSuccess(res, 200, 'Profile updated successfully', { user: serializeUser(req.user) });
  } catch (err) {
    next(err);
  }
}

export async function changePassword(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  try {
    if (!req.user) {
      throw new AppError(401, 'Authentication required', 'AUTH_REQUIRED');
    }

    const { currentPassword, newPassword } = req.body as {
      currentPassword: string;
      newPassword: string;
    };

    const user = await User.findById(req.user._id).select('+passwordHash');
    if (!user) {
      throw new AppError(404, 'User not found', 'USER_NOT_FOUND');
    }

    const valid = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!valid) {
      throw new AppError(400, 'Current password is incorrect.', 'INVALID_CURRENT_PASSWORD');
    }

    user.passwordHash = await bcrypt.hash(newPassword, BCRYPT_ROUNDS);
    const { token: nextRefreshToken } = signRefreshToken(user._id.toString());
    user.refreshTokenHash = hashToken(nextRefreshToken);
    await user.save();

    res.cookie(REFRESH_COOKIE_NAME, nextRefreshToken, getRefreshCookieOptions(req));

    sendSuccess(res, 200, 'Password updated successfully', null);
  } catch (err) {
    next(err);
  }
}
