import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';
import { supabase, BUCKET } from '../config/supabase.js';
import { AppError } from '../middleware/errorHandler.js';
import { getAccessLevel } from '../utils/access.js';
import { logActivity } from '../utils/activity.js';

export const initVersionUpload = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { mimeType, sizeBytes } = req.body;
    const userId = req.user.id;

    const access = await getAccessLevel('file', id, userId);
    if (!access || access === 'viewer') throw new AppError('Not permitted', 403, 'FORBIDDEN');

    const fileResult = await query('SELECT * FROM files WHERE id = $1 AND is_deleted = false', [id]);
    const file = fileResult.rows[0];
    if (!file) throw new AppError('File not found', 404, 'NOT_FOUND');

    const countResult = await query('SELECT COUNT(*)::int AS count FROM file_versions WHERE file_id = $1', [id]);
    const versionNumber = countResult.rows[0].count + 2; // +1 for the archived original, +1 for this new one

    const storageKey = `${file.storage_key}-v${versionNumber}`;
    const { data, error } = await supabase.storage.from(BUCKET).createSignedUploadUrl(storageKey);
    if (error) throw new AppError('Could not create upload URL', 500, 'STORAGE_ERROR');

    res.status(201).json({
      storageKey,
      versionNumber,
      uploadUrl: data.signedUrl,
      token: data.token
    });
  } catch (err) { next(err); }
};

export const completeVersionUpload = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { storageKey, versionNumber, sizeBytes, checksum } = req.body;
    const userId = req.user.id;

    const access = await getAccessLevel('file', id, userId);
    if (!access || access === 'viewer') throw new AppError('Not permitted', 403, 'FORBIDDEN');

    const fileResult = await query('SELECT * FROM files WHERE id = $1 AND is_deleted = false', [id]);
    const file = fileResult.rows[0];
    if (!file) throw new AppError('File not found', 404, 'NOT_FOUND');

    const existing = await query('SELECT COUNT(*)::int AS count FROM file_versions WHERE file_id = $1', [id]);
    if (existing.rows[0].count === 0) {
      // archive the original content as version 1 before overwriting
      await query(
        `INSERT INTO file_versions (id, file_id, version_number, storage_key, size_bytes, checksum)
         VALUES ($1, $2, 1, $3, $4, $5)`,
        [uuidv4(), id, file.storage_key, file.size_bytes, file.checksum]
      );
    }

    const newVersionId = uuidv4();
    await query(
      `INSERT INTO file_versions (id, file_id, version_number, storage_key, size_bytes, checksum)
       VALUES ($1, $2, $3, $4, $5, $6)`,
      [newVersionId, id, versionNumber, storageKey, sizeBytes, checksum || null]
    );

    const updated = await query(
      `UPDATE files SET storage_key = $1, size_bytes = $2, checksum = $3, version_id = $4, updated_at = now()
       WHERE id = $5 RETURNING *`,
      [storageKey, sizeBytes, checksum || null, newVersionId, id]
    );

    await logActivity(userId, 'upload', 'file', id, { versionNumber });
    res.json({ file: updated.rows[0] });
  } catch (err) { next(err); }
};

export const listVersions = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;
    const access = await getAccessLevel('file', id, userId);
    if (!access) throw new AppError('File not found', 404, 'NOT_FOUND');

    const result = await query('SELECT * FROM file_versions WHERE file_id = $1 ORDER BY version_number DESC', [id]);
    const fileResult = await query('SELECT version_id FROM files WHERE id = $1', [id]);

    res.json({ versions: result.rows, currentVersionId: fileResult.rows[0]?.version_id || null });
  } catch (err) { next(err); }
};

export const revertVersion = async (req, res, next) => {
  try {
    const { id, versionId } = req.params;
    const userId = req.user.id;
    const access = await getAccessLevel('file', id, userId);
    if (!access || access === 'viewer') throw new AppError('Not permitted', 403, 'FORBIDDEN');

    const versionResult = await query('SELECT * FROM file_versions WHERE id = $1 AND file_id = $2', [versionId, id]);
    const version = versionResult.rows[0];
    if (!version) throw new AppError('Version not found', 404, 'NOT_FOUND');

    const updated = await query(
      `UPDATE files SET storage_key = $1, size_bytes = $2, checksum = $3, version_id = $4, updated_at = now()
       WHERE id = $5 RETURNING *`,
      [version.storage_key, version.size_bytes, version.checksum, version.id, id]
    );

    await logActivity(userId, 'restore', 'file', id, { revertedToVersion: version.version_number });
    res.json({ file: updated.rows[0] });
  } catch (err) { next(err); }
};