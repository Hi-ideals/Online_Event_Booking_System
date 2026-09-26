import jwt from 'jsonwebtoken';
import { query } from '../config/db.js';
import ApiError from '../utils/ApiError.js';
import { verifyAccessToken } from '../utils/tokens.js';

/**
 * Verifies the Bearer access token and loads the current user from the database,
 * so suspensions and role changes take effect immediately.
 */
export async function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const [scheme, token] = header.split(' ');
  if (scheme !== 'Bearer' || !token) throw ApiError.unauthorized();

  let payload;
  try {
    payload = verifyAccessToken(token);
  } catch (err) {
    if (err instanceof jwt.TokenExpiredError) throw new ApiError(401, 'Access token expired');
    throw ApiError.unauthorized('Invalid access token');
  }

  const { rows } = await query('SELECT id, name, email, phone, role, status FROM users WHERE id = $1', [payload.sub]);
  const user = rows[0];
  if (!user) throw ApiError.unauthorized('Account no longer exists');
  if (user.status === 'suspended') throw ApiError.forbidden('Your account has been suspended');

  req.user = user;
  next();
}

/**
 * Role-based authorization. Also requires the account to be active, which keeps
 * pending or rejected organizers out of organizer features until an admin approves them.
 */
export function authorize(...roles) {
  return (req, _res, next) => {
    if (!req.user) throw ApiError.unauthorized();
    if (roles.length && !roles.includes(req.user.role)) throw ApiError.forbidden();
    if (req.user.status !== 'active') {
      const reason =
        req.user.status === 'pending_approval'
          ? 'Your organizer account is awaiting admin approval'
          : 'Your account is not active';
      throw ApiError.forbidden(reason);
    }
    next();
  };
}
