import app from './app.js';
import pool from './config/db.js';
import env from './config/env.js';
import { startJobs } from './jobs/index.js';

const server = app.listen(env.port, () => {
  console.log(`API running on http://localhost:${env.port} (${env.nodeEnv})`);
});
const stopJobs = startJobs();

async function shutdown(signal) {
  console.log(`${signal} received, shutting down...`);
  stopJobs();
  server.close(async () => {
    await pool.end();
    process.exit(0);
  });
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
