import bcrypt from 'bcryptjs';
import { query, withTransaction } from '../../config/db.js';
import ApiError from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { buildSet } from '../../utils/sql.js';
import { findPublicUserById } from './users.repository.js';

// Maps API field names to organizer_profiles columns.
const ORGANIZER_COLUMNS = {
  organizationName: 'organization_name',
  contactPhone: 'contact_phone',
  website: 'website',
  address: 'address',
  city: 'city',
  gstNumber: 'gst_number',
  description: 'description',
  // Merge so a partial update keeps existing payout fields.
  payoutDetails: (p) => `payout_details = payout_details || $${p}::jsonb`,
};

export async function updateProfile(currentUser, input) {
  if (input.organizer && currentUser.role !== 'organizer') {
    throw ApiError.badRequest('Only organizers have an organization profile');
  }

  return withTransaction(async (db) => {
    const userUpdate = buildSet(input, { name: 'name', phone: 'phone' });
    if (userUpdate.sets.length) {
      userUpdate.params.push(currentUser.id);
      await db.query(`UPDATE users SET ${userUpdate.sets.join(', ')} WHERE id = $${userUpdate.params.length}`, userUpdate.params);
    }

    if (input.organizer) {
      const orgUpdate = buildSet(input.organizer, ORGANIZER_COLUMNS);
      if (orgUpdate.sets.length) {
        orgUpdate.params.push(currentUser.id);
        await db.query(
          `UPDATE organizer_profiles SET ${orgUpdate.sets.join(', ')} WHERE user_id = $${orgUpdate.params.length}`,
          orgUpdate.params
        );
      }
    }
    return findPublicUserById(currentUser.id, db);
  });
}

export async function changePassword(userId, { currentPassword, newPassword }, ip) {
  const { rows } = await query('SELECT password_hash FROM users WHERE id = $1', [userId]);
  const valid = await bcrypt.compare(currentPassword, rows[0].password_hash);
  if (!valid) throw ApiError.badRequest('Current password is incorrect');

  const hash = await bcrypt.hash(newPassword, 12);
  await withTransaction(async (db) => {
    await db.query('UPDATE users SET password_hash = $1 WHERE id = $2', [hash, userId]);
    // Sign out every other session after a password change.
    await db.query('UPDATE refresh_tokens SET revoked_at = NOW() WHERE user_id = $1 AND revoked_at IS NULL', [userId]);
    await audit({ actorId: userId, action: 'user.password_changed', entityType: 'user', entityId: userId, ip }, db);
  });
}
