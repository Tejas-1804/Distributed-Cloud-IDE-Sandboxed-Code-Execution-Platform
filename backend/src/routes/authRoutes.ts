import { Router } from 'express';
import {
  changePassword,
  getMe,
  login,
  logout,
  refresh,
  register,
  updateProfile,
} from '../controllers/authController.js';
import { requireAuth } from '../middleware/auth.js';
import { authRateLimiter } from '../middleware/rateLimiter.js';
import { validateBody } from '../middleware/validate.js';
import {
  changePasswordSchema,
  loginSchema,
  registerSchema,
  updateProfileSchema,
} from '../validators/authValidators.js';

const router = Router();

router.post('/register', authRateLimiter, validateBody(registerSchema), register);
router.post('/login', authRateLimiter, validateBody(loginSchema), login);
router.post('/refresh', authRateLimiter, refresh);
router.post('/logout', logout);

router.get('/me', requireAuth, getMe);
router.put('/profile', requireAuth, validateBody(updateProfileSchema), updateProfile);
router.put('/change-password', requireAuth, validateBody(changePasswordSchema), changePassword);

export default router;
