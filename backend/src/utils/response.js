export function ok(res, data, message, statusCode = 200) {
  const body = { success: true };
  if (message) body.message = message;
  if (data !== undefined) body.data = data;
  return res.status(statusCode).json(body);
}

export function created(res, data, message) {
  return ok(res, data, message, 201);
}

/** Builds a pagination block from validated `page`/`limit` and a total row count. */
export function paginate(page, limit, total) {
  return { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) };
}
