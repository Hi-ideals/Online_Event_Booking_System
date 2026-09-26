import bcrypt from 'bcryptjs';
import env from '../../config/env.js';
import { query, withTransaction } from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { generateRefreshToken, hashToken, signAccessToken } from '../../utils/tokens.js';
import { queueEmail } from '../notifications/notifications.service.js';
import { findPublicUserById } from '../users/users.repository.js';

const BCRYPT_ROUNDS = 12;
// Compared against when the email is unknown, so response timing does not reveal which emails exist.
const DUMMY_HASH = bcrypt.hashSync('not-a-real-password', BCRYPT_ROUNDS);

async function issueTokens(user, meta, db = { query }) {
  const refreshToken = generateRefreshToken();
  const expiresAt = new Date(Date.now() + env.jwt.refreshExpiresDays * 24 * 60 * 60 * 1000);
  const { rows } = await db.query(
    `INSERT INTO refresh_tokens (user_id, token_hash, expires_at, user_agent, ip_address)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [user.id, hashToken(refreshToken), expiresAt, meta.userAgent ?? null, meta.ip ?? null]
  );
  return { accessToken: signAccessToken(user), refreshToken, refreshTokenId: rows[0].id };
}

export async function register(input, meta) {
  const existing = await query('SELECT 1 FROM users WHERE LOWER(email) = $1', [input.email]);
  if (existing.rowCount) throw ApiError.conflict('An account with this email already exists');

  const passwordHash = await bcrypt.hash(input.password, BCRYPT_ROUNDS);
  const isOrganizer = input.role === 'organizer';

  return withTransaction(async (db) => {
    const { rows } = await db.query(
      `INSERT INTO users (name, email, password_hash, phone, role, status)
       VALUES ($1, $2, $3, $4, $5, $6)
       RETURNING id, role, status`,
      [input.name, input.email, passwordHash, input.phone ?? null, input.role, isOrganizer ? 'pending_approval' : 'active']
    );
    const user = rows[0];

    if (isOrganizer) {
      const o = input.organizer;
      await db.query(
        `INSERT INTO organizer_profiles
           (user_id, organization_name, contact_phone, website, address, city, gst_number, description)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [user.id, o.organizationName, o.contactPhone ?? null, o.website ?? null, o.address ?? null,
          o.city ?? null, o.gstNumber ?? null, o.description ?? null]
      );
    }

    await queueEmail(db, { template: isOrganizer ? 'organizer_pending' : 'welcome', to: input.email, payload: { name: input.name } });
    await audit({ actorId: user.id, action: 'user.registered', entityType: 'user', entityId: user.id,
      metadata: { role: user.role }, ip: meta.ip }, db);

    const tokens = await issueTokens(user, meta, db);
    return { user: await findPublicUserById(user.id, db), ...tokens };
  });
}

export async function login({ email, password }, meta) {
  const { rows } = await query('SELECT id, role, status, password_hash FROM users WHERE LOWER(email) = $1', [email]);
  const user = rows[0];
  const valid = await bcrypt.compare(password, user?.password_hash ?? DUMMY_HASH);
  if (!user || !valid) throw ApiError.unauthorized('Invalid email or password');
  if (user.status === 'suspended') throw ApiError.forbidden('Your account has been suspended');

  await query('UPDATE users SET last_login_at = NOW() WHERE id = $1', [user.id]);
  const tokens = await issueTokens(user, meta);
  return { user: await findPublicUserById(user.id), ...tokens };
}

/**
 * Rotates a refresh token. Reusing an already-revoked token is treated as theft:
 * every session for that user is revoked.
 */
export async function refresh(rawToken, meta) {
  if (!rawToken) throw ApiError.unauthorized('Refresh token missing');

  return withTransaction(async (db) => {
    const { rows } = await db.query(
      `SELECT rt.id, rt.user_id, rt.expires_at, rt.revoked_at, u.role, u.status
         FROM refresh_tokens rt JOIN users u ON u.id = rt.user_id
        WHERE rt.token_hash = $1
        FOR UPDATE OF rt`,
      [hashToken(rawToken)]
    );
    const stored = rows[0];
    if (!stored) throw ApiError.unauthorized('Invalid refresh token');

    if (stored.revoked_at) {
      await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [stored.user_id]);
      await audit({ actorId: stored.user_id, action: 'auth.refresh_token_reuse', entityType: 'user',
        entityId: stored.user_id, ip: meta.ip }, db);
      return { reuseDetected: true };
    }
    if (new Date(stored.expires_at) < new Date()) throw ApiError.unauthorized('Refresh token expired');
    if (stored.status === 'suspended') throw ApiError.forbidden('Your account has been suspended');

    const user = { id: stored.user_id, role: stored.role };
    const tokens = await issueTokens(user, meta, db);
    await db.query('UPDATE refresh_tokens SET revoked_at = NOW(), replaced_by = $2 WHERE id = $1',
      [stored.id, tokens.refreshTokenId]);

    return { user: await findPublicUserById(user.id, db), ...tokens };
  });
}

export async function logout(rawToken) {
  if (!rawToken) return;
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE token_hash = $1 AND revoked_at IS NULL', [hashToken(rawToken)]);
}

export async function logoutAll(userId) {
  await query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
}
