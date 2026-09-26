import { Router } from 'express';
import { z } from 'zod';
import { query } from '../../config/db.js';
import { authenticate, authorize } from '../../middleware/auth.js';
import validate from '../../middleware/validate.js';
import ApiError from '../../utils/ApiError.js';
import { audit } from '../../utils/audit.js';
import { created, ok } from '../../utils/response.js';
import { clearable, queryBoolean } from '../../utils/schemas.js';
import { slugify } from '../../utils/slug.js';
import { buildSet } from '../../utils/sql.js';

// ---------- validation ----------
const idParam = z.object({ id: z.coerce.number().int().positive() });

const categoryFields = {
  name: z.string().trim().min(2).max(60),
  description: clearable(z.string().trim().max(300)),
  icon: clearable(z.string().trim().max(40)),
  sortOrder: z.number().int().min(0).optional(),
  isActive: z.boolean().optional(),
};
const createSchema = z.object(categoryFields);
const updateSchema = z
  .object({ ...categoryFields, name: categoryFields.name.optional() })
  .refine((v) => Object.keys(v).length > 0, { message: 'Nothing to update' });

// ---------- data ----------
const SELECT = `
  SELECT c.id, c.name, c.slug, c.description, c.icon, c.is_active AS "isActive", c.sort_order AS "sortOrder",
         (SELECT COUNT(*)::int FROM events e
           WHERE e.category_id = c.id AND e.status = 'published' AND e.is_blocked = FALSE AND e.end_at > NOW()) AS "upcomingEvents"
    FROM categories c`;

async function getCategory(id) {
  const { rows } = await query(`${SELECT} WHERE c.id = $1`, [id]);
  if (!rows[0]) throw ApiError.notFound('Category not found');
  return rows[0];
}

// ---------- public routes: /categories ----------
export const publicRouter = Router();

publicRouter.get('/', validate({ query: z.object({ includeInactive: queryBoolean.optional() }) }), async (req, res) => {
  const where = req.validatedQuery.includeInactive ? '' : 'WHERE c.is_active = TRUE';
  const { rows } = await query(`${SELECT} ${where} ORDER BY c.sort_order, c.name`);
  return ok(res, { items: rows });
});

// ---------- admin routes: /admin/categories ----------
export const adminRouter = Router();
adminRouter.use(authenticate, authorize('admin'));

adminRouter.post('/', validate({ body: createSchema }), async (req, res) => {
  const b = req.body;
  const { rows } = await query(
    `INSERT INTO categories (name, slug, description, icon, sort_order, is_active)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
    [b.name, slugify(b.name), b.description ?? null, b.icon ?? null, b.sortOrder ?? 0, b.isActive ?? true]
  );
  await audit({ actorId: req.user.id, action: 'category.created', entityType: 'category', entityId: rows[0].id, ip: req.ip });
  return created(res, { category: await getCategory(rows[0].id) }, 'Category created');
});

adminRouter.patch('/:id', validate({ params: idParam, body: updateSchema }), async (req, res) => {
  const fields = { ...req.body };
  if (fields.name) fields.slug = slugify(fields.name);
  const { sets, params } = buildSet(fields, {
    name: 'name', slug: 'slug', description: 'description', icon: 'icon', sortOrder: 'sort_order', isActive: 'is_active',
  });
  params.push(req.params.id);
  const result = await query(`UPDATE categories SET ${sets.join(', ')} WHERE id = $${params.length}`, params);
  if (!result.rowCount) throw ApiError.notFound('Category not found');
  await audit({ actorId: req.user.id, action: 'category.updated', entityType: 'category', entityId: req.params.id,
    metadata: req.body, ip: req.ip });
  return ok(res, { category: await getCategory(req.params.id) }, 'Category updated');
});

adminRouter.delete('/:id', validate({ params: idParam }), async (req, res) => {
  const used = await query('SELECT 1 FROM events WHERE category_id = $1 LIMIT 1', [req.params.id]);
  if (used.rowCount) throw ApiError.conflict('Category has events; deactivate it instead of deleting');
  const result = await query('DELETE FROM categories WHERE id = $1', [req.params.id]);
  if (!result.rowCount) throw ApiError.notFound('Category not found');
  await audit({ actorId: req.user.id, action: 'category.deleted', entityType: 'category', entityId: req.params.id, ip: req.ip });
  return ok(res, undefined, 'Category deleted');
});
