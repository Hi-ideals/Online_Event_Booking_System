import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import multer from 'multer';
import ApiError from '../utils/ApiError.js';

// backend/uploads, independent of the directory the server is started from.
export const UPLOAD_ROOT = fileURLToPath(new URL('../../uploads', import.meta.url));

const IMAGE_TYPES = { 'image/jpeg': '.jpg', 'image/png': '.png', 'image/webp': '.webp' };

/** Single-image upload stored on local disk under uploads/<folder>. Swap for S3 storage in production. */
export function imageUpload(folder, field = 'image', maxMb = 5) {
  const dir = path.join(UPLOAD_ROOT, folder);
  fs.mkdirSync(dir, { recursive: true });

  const upload = multer({
    storage: multer.diskStorage({
      destination: dir,
      filename: (_req, file, cb) => cb(null, `${Date.now()}-${crypto.randomBytes(6).toString('hex')}${IMAGE_TYPES[file.mimetype]}`),
    }),
    limits: { fileSize: maxMb * 1024 * 1024, files: 1 },
    fileFilter: (_req, file, cb) => {
      if (IMAGE_TYPES[file.mimetype]) cb(null, true);
      else cb(ApiError.badRequest('Only JPG, PNG or WEBP images are allowed'));
    },
  }).single(field);

  return (req, res, next) =>
    upload(req, res, (err) => {
      if (err instanceof multer.MulterError) {
        const message = err.code === 'LIMIT_FILE_SIZE' ? `Image must be smaller than ${maxMb} MB` : err.message;
        return next(ApiError.badRequest(message));
      }
      if (err) return next(err);
      if (!req.file) return next(ApiError.badRequest(`Attach an image in the "${field}" form field`));
      req.file.publicUrl = `/uploads/${folder}/${req.file.filename}`;
      next();
    });
}

/** Deletes a previously uploaded file given its public /uploads/... URL. Ignores missing files. */
export function removeUploadedFile(publicUrl) {
  if (!publicUrl?.startsWith('/uploads/')) return;
  const filePath = path.join(UPLOAD_ROOT, publicUrl.slice('/uploads/'.length));
  if (!filePath.startsWith(UPLOAD_ROOT)) return;
  fs.promises.unlink(filePath).catch(() => {});
}
