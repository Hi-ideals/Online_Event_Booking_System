// Creates the application database if it does not exist yet.
import pg from 'pg';
import env from '../config/env.js';

const client = new pg.Client({
  host: env.db.host,
  port: env.db.port,
  user: env.db.user,
  password: env.db.password,
  database: 'postgres',
});

try {
  await client.connect();
  const { rowCount } = await client.query('SELECT 1 FROM pg_database WHERE datname = $1', [env.db.name]);
  if (rowCount === 0) {
    // Database names cannot be parameterized; escape as an identifier.
    await client.query(`CREATE DATABASE "${env.db.name.replace(/"/g, '""')}"`);
    console.log(`Database "${env.db.name}" created.`);
  } else {
    console.log(`Database "${env.db.name}" already exists.`);
  }
} catch (err) {
  console.error('Could not create database:', err.message);
  process.exitCode = 1;
} finally {
  await client.end();
}
