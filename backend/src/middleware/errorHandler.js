import env from '../config/env.js';
import ApiError from '../utils/ApiError.js';

export function notFound(req, _res, next) {
  next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`));
}

// PostgreSQL error codes worth translating into client-friendly responses.
const PG_ERRORS = {
  23505: [409, 'A record with the same unique value already exists'],
  23503: [400, 'Referenced record does not exist'],
  '22P02': [400, 'Invalid identifier or value format'],
};

// eslint-disable-next-line no-unused-vars
export function errorHandler(err, _req, res, _next) {
  let status = err instanceof ApiError ? err.statusCode : 500;
  let message = err instanceof ApiError ? err.message : 'Internal server error';

  if (err.type === 'entity.parse.failed') {
    status = 400;
    message = 'Malformed JSON body';
  } else if (err.code && PG_ERRORS[err.code]) {
    [status, message] = PG_ERRORS[err.code];
  }

  if (status >= 500) console.error(err);

  const body = { success: false, message };
  if (err.errors) body.errors = err.errors;
  if (!env.isProd && status >= 500) body.stack = err.stack;
  res.status(status).json(body);
}
