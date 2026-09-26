// Seeds the first admin account (idempotent). Later phases add their own seed data here.
import bcrypt from 'bcryptjs';
import pool from '../config/db.js';
import env from '../config/env.js';

async function seedAdmin() {
  const { email, password, name } = env.admin;
  if (!email || !password) {
    console.log('ADMIN_EMAIL / ADMIN_PASSWORD not set - skipping admin seed.');
    return;
  }
  const existing = await pool.query('SELECT id FROM users WHERE LOWER(email) = LOWER($1)', [email]);
  if (existing.rowCount) {
    console.log(`Admin ${email} already exists.`);
    return;
  }
  const hash = await bcrypt.hash(password, 12);
  await pool.query(
    `INSERT INTO users (name, email, password_hash, role, status) VALUES ($1, $2, $3, 'admin', 'active')`,
    [name, email.toLowerCase(), hash]
  );
  console.log(`Admin ${email} created.`);
}

try {
  await seedAdmin();
} catch (err) {
  console.error('Seeding failed:', err.message);
  process.exitCode = 1;
} finally {
  await pool.end();
}
