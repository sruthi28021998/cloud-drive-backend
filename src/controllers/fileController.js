import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';
import { supabase, BUCKET } from '../config/supabase.js';
import { AppError } from '../middleware/errorHandler.js';

const ALLOWED_MIME = new Set([
  'image/png', 'image/jpeg', 'image/webp', 'image/gif',
  'application/pdf', 'text/plain',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
const MAX_SIZE_BYTES = 500 * 1024 * 1024; // 500MB

const slugify = (name) => name.replace(/[^a-zA-Z0-9._-]/g, '_');

export const initUpload = async (req, res, next) => {
  try {
    const { name, mimeType, sizeBytes, folderId } = req.body;
    const ownerId = req.user.id;

    if (!name || !mimeType || !sizeBytes) {
      throw new AppError('name, mimeType, sizeBytes are required', 400, 'VALIDATION_ERROR');
    }
    if (!ALLOWED_MIME.has(mimeType)) {
      throw new AppError('File type not allowed', 400, 'UNSUPPORTED_TYPE');
    }
    if (sizeBytes > MAX_SIZE_BYTES) {
      throw new AppError('File exceeds max size', 400, 'FILE_TOO_LARGE');
    }

    if (folderId) {
      const folder = await query(
        'SELECT id FROM folders WHERE id = $1 AND owner_id = $2 AND is_deleted = false',
        [folderId, ownerId]
      );
      if (!folder.rows[0]) throw new AppError('Folder not found', 404, 'NOT_FOUND');
    }

    const fileId = uuidv4();
    const storageKey = `tenants/${ownerId}/folders/${folderId || 'root'}/files/${fileId}-${slugify(name)}`;

    await query(
      `INSERT INTO files (id, name, mime_type, size_bytes, storage_key, owner_id, folder_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [fileId, name, mimeType, sizeBytes, storageKey, ownerId, folderId || null]
    );

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUploadUrl(storageKey);

    if (error) throw new AppError('Could not create upload URL', 500, 'STORAGE_ERROR');

    res.status(201).json({
      fileId,
      storageKey,
      uploadUrl: data.signedUrl,
      token: data.token
    });
  } catch (err) {
    next(err);
  }
};

export const completeUpload = async (req, res, next) => {
  try {
    const { fileId, checksum } = req.body;
    const ownerId = req.user.id;

    const result = await query(
      'UPDATE files SET checksum = $1, updated_at = now() WHERE id = $2 AND owner_id = $3 RETURNING *',
      [checksum || null, fileId, ownerId]
    );
    if (!result.rows[0]) throw new AppError('File not found', 404, 'NOT_FOUND');

    res.json({ file: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

export const getFile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;

    const result = await query(
      'SELECT * FROM files WHERE id = $1 AND owner_id = $2 AND is_deleted = false',
      [id, ownerId]
    );
    const file = result.rows[0];
    if (!file) throw new AppError('File not found', 404, 'NOT_FOUND');

    const { data, error } = await supabase.storage
      .from(BUCKET)
      .createSignedUrl(file.storage_key, 60 * 5); // 5 min TTL

    if (error) throw new AppError('Could not sign URL', 500, 'STORAGE_ERROR');

    res.json({ file, signedUrl: data.signedUrl });
  } catch (err) {
    next(err);
  }
};

export const updateFile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, folderId } = req.body;
    const ownerId = req.user.id;

    const fields = [];
    const values = [];
    let idx = 1;
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (folderId !== undefined) { fields.push(`folder_id = $${idx++}`); values.push(folderId); }
    fields.push(`updated_at = now()`);
    values.push(id, ownerId);

    const result = await query(
      `UPDATE files SET ${fields.join(', ')} WHERE id = $${idx} AND owner_id = $${idx + 1} RETURNING *`,
      values
    );
    if (!result.rows[0]) throw new AppError('File not found', 404, 'NOT_FOUND');
    res.json({ file: result.rows[0] });
  } catch (err) {
    next(err);
  }
};

export const deleteFile = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;
    const result = await query(
      'UPDATE files SET is_deleted = true WHERE id = $1 AND owner_id = $2 RETURNING id',
      [id, ownerId]
    );
    if (!result.rows[0]) throw new AppError('File not found', 404, 'NOT_FOUND');
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};