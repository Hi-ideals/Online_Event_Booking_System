import ApiError from '../utils/ApiError.js';

/**
 * Validates request parts against zod schemas: validate({ body, query, params }).
 * Parsed (coerced, defaulted) values replace req.body / req.params; the parsed query
 * goes to req.validatedQuery because req.query is read-only in Express 5.
 */
export default function validate(schemas) {
  return (req, _res, next) => {
    const errors = [];
    for (const part of ['params', 'query', 'body']) {
      const schema = schemas[part];
      if (!schema) continue;
      const result = schema.safeParse(req[part] ?? {});
      if (!result.success) {
        for (const issue of result.error.issues) {
          errors.push({ field: [part, ...issue.path].join('.'), message: issue.message });
        }
        continue;
      }
      if (part === 'query') req.validatedQuery = result.data;
      else req[part] = result.data;
    }
    if (errors.length) throw ApiError.badRequest('Validation failed', errors);
    next();
  };
}
