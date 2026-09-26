import ApiError from '../../utils/ApiError.js';
import { created, ok } from '../../utils/response.js';
import { REFRESH_COOKIE, refreshCookieOptions } from '../../utils/tokens.js';
import { findPublicUserById } from '../users/users.repository.js';
import * as authService from './auth.service.js';

const requestMeta = (req) => ({ ip: req.ip, userAgent: req.get('user-agent') });

function sendSession(res, { user, accessToken, refreshToken }, statusCode = 200, message) {
  res.cookie(REFRESH_COOKIE, refreshToken, refreshCookieOptions());
  const send = statusCode === 201 ? created : ok;
  return send(res, { user, accessToken }, message);
}

function clearSessionCookie(res) {
  const { maxAge: _maxAge, ...options } = refreshCookieOptions();
  res.clearCookie(REFRESH_COOKIE, options);
}

export async function register(req, res) {
  const session = await authService.register(req.body, requestMeta(req));
  const message =
    session.user.status === 'pending_approval'
      ? 'Registration successful. Your organizer account is awaiting admin approval.'
      : 'Registration successful';
  return sendSession(res, session, 201, message);
}

export async function login(req, res) {
  const session = await authService.login(req.body, requestMeta(req));
  return sendSession(res, session, 200, 'Logged in successfully');
}

export async function refresh(req, res) {
  const result = await authService.refresh(req.cookies[REFRESH_COOKIE], requestMeta(req));
  if (result.reuseDetected) {
    clearSessionCookie(res);
    throw ApiError.unauthorized('Session is no longer valid, please log in again');
  }
  return sendSession(res, result);
}

export async function logout(req, res) {
  await authService.logout(req.cookies[REFRESH_COOKIE]);
  clearSessionCookie(res);
  return ok(res, undefined, 'Logged out');
}

export async function logoutAll(req, res) {
  await authService.logoutAll(req.user.id);
  clearSessionCookie(res);
  return ok(res, undefined, 'Logged out from all devices');
}

export async function me(req, res) {
  return ok(res, { user: await findPublicUserById(req.user.id) });
}
