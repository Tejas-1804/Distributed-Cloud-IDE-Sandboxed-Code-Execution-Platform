import { env } from '../config/env.js';

type Request = {
  ip?: string;
  user?: { _id: { toString(): string } };
};

type Response = {
  setHeader(name: string, value: string | number): void;
  status(code: number): Response;
  json(body: object): void;
};

type NextFunction = () => void;

const isTest = env.NODE_ENV === 'test';

type RateLimitOptions = {
  windowMs: number;
  max: number;
  standardHeaders: boolean;
  legacyHeaders: boolean;
  message: object;
  keyGenerator?: (req: Request) => string;
};

function rateLimit({ windowMs, max, message, keyGenerator }: RateLimitOptions) {
  const requests = new Map<string, { count: number; resetAt: number }>();

  return (req: Request, res: Response, next: NextFunction): void => {
    const now = Date.now();
    const key = keyGenerator?.(req) ?? req.ip ?? 'unknown';
    let entry = requests.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      requests.set(key, entry);
    }

    entry.count += 1;
    const remaining = Math.max(0, max - entry.count);
    const resetSeconds = Math.ceil((entry.resetAt - now) / 1000);

    if (entry.count > max) {
      res.setHeader('Retry-After', resetSeconds);
      res.status(429).json(message);
      return;
    }

    if (true) {
      res.setHeader('RateLimit-Policy', `${max};w=${Math.ceil(windowMs / 1000)}`);
      res.setHeader('RateLimit-Limit', max);
      res.setHeader('RateLimit-Remaining', remaining);
      res.setHeader('RateLimit-Reset', resetSeconds);
    }

    next();
  };
}

export const authRateLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: isTest ? 1000 : 30,
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many authentication attempts. Please try again shortly.',
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
    },
  },
});

export const executionRateLimiter = rateLimit({
  windowMs: 60 * 1000, // 1 minute
  max: env.NODE_ENV === 'test' ? 1000 : 10,
  keyGenerator: (req: Request) => req.user?._id.toString() ?? req.ip ?? 'unknown',
  standardHeaders: true,
  legacyHeaders: false,
  message: {
    success: false,
    message: 'Too many code executions. Please wait a minute and try again.',
    error: {
      code: 'EXECUTION_RATE_LIMIT_EXCEEDED',
    },
  },
});