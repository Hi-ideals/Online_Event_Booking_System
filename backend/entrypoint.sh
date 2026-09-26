#!/bin/sh
set -e

echo "Waiting for postgres..."
until nc -z $DB_HOST $DB_PORT; do
  sleep 1
done
echo "Postgres is up"

# Run once (idempotent scripts recommended)
npm run migrate
npm run seed

echo "Starting server..."
exec node src/server.js