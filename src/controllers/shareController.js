import { v4 as uuidv4 } from 'uuid';
import bcrypt from 'bcryptjs';
import { query } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { generateLinkToken } from '../utils/tokens.js';
import { logActivity } from '../utils/activity.js';
import { supabase, BUCKET } from '../config/supabase.js';

const assertOwnership = async (resourceType, resourceId, ownerId) => {
  const table = resourceType === 'file' ? 'files' : 'folders';
  const result = await query(
    `SELECT id FROM ${table} WHERE id = $1 AND owner_id = $2 AND is_deleted = false`,
    [resourceId, ownerId]
  );
  if (!result.rows[0]) throw new AppError(`${resourceType} not found`, 404, 'NOT_FOUND');
};

export const createShare = async (req, res, next) => {
  try {
    const { resourceType, resourceId, granteeUserId, role } = req.body;
    const ownerId = req.user.id;

    if (!['file', 'folder'].includes(resourceType)) throw new AppError('Invalid resourceType', 400, 'VALIDATION_ERROR');
    if (!['viewer', 'editor'].includes(role)) throw new AppError('Invalid role', 400, 'VALIDATION_ERROR');

    await assertOwnership(resourceType, resourceId, ownerId);

    const id = uuidv4();
    await query(
      `INSERT INTO shares (id, resource_type, resource_id, grantee_user_id, role, created_by)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (resource_type, resource_id, grantee_user_id)
       DO UPDATE SET role = $5`,
      [id, resourceType, resourceId, granteeUserId, role, ownerId]
    );

    await logActivity(ownerId, 'share', resourceType, resourceId, { granteeUserId, role });
    res.status(201).json({ id, resourceType, resourceId, granteeUserId, role });
  } catch (err) {
    next(err);
  }
};

export const listShares = async (req, res, next) => {
  try {
    const { resourceType, resourceId } = req.params;
    const ownerId = req.user.id;
    await assertOwnership(resourceType, resourceId, ownerId);

    const result = await query(
      `SELECT s.*, u.email, u.name FROM shares s
       JOIN users u ON u.id = s.grantee_user_id
       WHERE s.resource_type = $1 AND s.resource_id = $2`,
      [resourceType, resourceId]
    );
    res.json({ shares: result.rows });
  } catch (err) {
    next(err);
  }
};

export const revokeShare = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;
    const result = await query(
      `DELETE FROM shares WHERE id = $1 AND created_by = $2 RETURNING id`,
      [id, ownerId]
    );
    if (!result.rows[0]) throw new AppError('Share not found', 404, 'NOT_FOUND');
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const createLinkShare = async (req, res, next) => {
  try {
    const { resourceType, resourceId, expiresAt, password } = req.body;
    const ownerId = req.user.id;

    await assertOwnership(resourceType, resourceId, ownerId);

    const id = uuidv4();
    const token = generateLinkToken();
    const passwordHash = password ? await bcrypt.hash(password, 10) : null;

    await query(
      `INSERT INTO link_shares (id, resource_type, resource_id, token, password_hash, expires_at, created_by)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, resourceType, resourceId, token, passwordHash, expiresAt || null, ownerId]
    );

    await logActivity(ownerId, 'share', resourceType, resourceId, { link: true });
    res.status(201).json({ id, token, expiresAt: expiresAt || null });
  } catch (err) {
    next(err);
  }
};

export const resolveLinkShare = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.query;

    const result = await query('SELECT * FROM link_shares WHERE token = $1', [token]);
    const link = result.rows[0];
    if (!link) throw new AppError('Link not found', 404, 'NOT_FOUND');
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      throw new AppError('Link has expired', 410, 'GONE');
    }
    if (link.password_hash) {
      if (!password || !(await bcrypt.compare(password, link.password_hash))) {
        throw new AppError('Password required or incorrect', 401, 'UNAUTHORIZED');
      }
    }

    const table = link.resource_type === 'file' ? 'files' : 'folders';
    const resource = await query(`SELECT * FROM ${table} WHERE id = $1 AND is_deleted = false`, [link.resource_id]);
    if (!resource.rows[0]) throw new AppError('Resource not found', 404, 'NOT_FOUND');

    res.json({ resourceType: link.resource_type, resource: resource.rows[0] });
  } catch (err) {
    next(err);
  }
};

export const resolveLinkDownload = async (req, res, next) => {
  try {
    const { token } = req.params;
    const { password } = req.query;

    const result = await query('SELECT * FROM link_shares WHERE token = $1', [token]);
    const link = result.rows[0];
    if (!link) throw new AppError('Link not found', 404, 'NOT_FOUND');
    if (link.expires_at && new Date(link.expires_at) < new Date()) {
      throw new AppError('Link has expired', 410, 'GONE');
    }
    if (link.password_hash) {
      if (!password || !(await bcrypt.compare(password, link.password_hash))) {
        throw new AppError('Password required or incorrect', 401, 'UNAUTHORIZED');
      }
    }
    if (link.resource_type !== 'file') {
      throw new AppError('Only files can be downloaded directly', 400, 'BAD_REQUEST');
    }

    const fileResult = await query('SELECT * FROM files WHERE id = $1 AND is_deleted = false', [link.resource_id]);
    const file = fileResult.rows[0];
    if (!file) throw new AppError('File not found', 404, 'NOT_FOUND');

    const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(file.storage_key, 60 * 5);
    if (error) throw new AppError('Could not sign URL', 500, 'STORAGE_ERROR');

    res.json({ signedUrl: data.signedUrl });
  } catch (err) {
    next(err);
  }
};

export const deleteLinkShare = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;
    const result = await query(
      'DELETE FROM link_shares WHERE id = $1 AND created_by = $2 RETURNING id',
      [id, ownerId]
    );
    if (!result.rows[0]) throw new AppError('Link not found', 404, 'NOT_FOUND');
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};