import { Router } from 'express';
import { authenticate } from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import { REFRESH_COOKIE, refreshCookieOptions } from '../../utils/tokens.js';
import { ok } from '../../utils/response.js';
import * as usersService from './users.service.js';
import { changePasswordSchema, updateProfileSchema } from './users.validation.js';

const router = Router();

// Profile routes need login only (not an active status), so pending organizers can complete their profile.
router.use(authenticate);

router.patch('/me', validate({ body: updateProfileSchema }), async (req, res) => {
  const user = await usersService.updateProfile(req.user, req.body);
  return ok(res, { user }, 'Profile updated');
});

router.patch('/me/password', validate({ body: changePasswordSchema }), async (req, res) => {
  await usersService.changePassword(req.user.id, req.body, req.ip);
  const { maxAge: _maxAge, ...cookieOptions } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, cookieOptions);
  return ok(res, undefined, 'Password changed. Please log in again.');
});

export default router;
