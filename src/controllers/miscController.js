import { query } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { cascadeRestoreFolder } from '../utils/cascade.js';
import { logActivity } from '../utils/activity.js';

export const search = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const { q, type, starred, sort } = req.query;

    let sql = `SELECT id, name, 'file' as kind, mime_type, size_bytes, folder_id, updated_at
               FROM files WHERE owner_id = $1 AND is_deleted = false`;
    const params = [ownerId];
    let idx = 2;

    if (q) {
      sql += ` AND name ILIKE $${idx++}`;
      params.push(`%${q}%`);
    }
    if (type && type !== 'all') {
      sql += ` AND mime_type = $${idx++}`;
      params.push(type);
    }
    if (starred === 'true') {
      sql += ` AND id IN (SELECT resource_id FROM stars WHERE user_id = $1 AND resource_type = 'file')`;
    }

    const sortMap = {
      name: 'name ASC',
      date: 'updated_at DESC',
      size: 'size_bytes DESC'
    };
    sql += ` ORDER BY ${sortMap[sort] || 'updated_at DESC'} LIMIT 100`;

    const result = await query(sql, params);
    res.json({ results: result.rows });
  } catch (err) {
    next(err);
  }
};

export const getActivity = async (req, res, next) => {
  try {
    const userId = req.user.id;
    const result = await query(
      `SELECT * FROM activities WHERE actor_id = $1 ORDER BY created_at DESC LIMIT 50`,
      [userId]
    );
    res.json({ activities: result.rows });
  } catch (err) { next(err); }
};

export const addStar = async (req, res, next) => {
  try {
    const { resourceType, resourceId } = req.body;
    const userId = req.user.id;
    await query(
      `INSERT INTO stars (user_id, resource_type, resource_id) VALUES ($1, $2, $3)
       ON CONFLICT DO NOTHING`,
      [userId, resourceType, resourceId]
    );
    res.status(201).json({ ok: true });
  } catch (err) {
    next(err);
  }
};

export const removeStar = async (req, res, next) => {
  try {
    const { resourceType, resourceId } = req.body;
    const userId = req.user.id;
    await query(
      `DELETE FROM stars WHERE user_id = $1 AND resource_type = $2 AND resource_id = $3`,
      [userId, resourceType, resourceId]
    );
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const listTrash = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const files = await query(
      `SELECT id, name, 'file' as kind, updated_at FROM files WHERE owner_id = $1 AND is_deleted = true`,
      [ownerId]
    );
    const folders = await query(
      `SELECT id, name, 'folder' as kind, updated_at FROM folders WHERE owner_id = $1 AND is_deleted = true`,
      [ownerId]
    );
    res.json({ items: [...files.rows, ...folders.rows] });
  } catch (err) {
    next(err);
  }
};

export const restoreFromTrash = async (req, res, next) => {
  try {
    const { resourceType, resourceId } = req.body;
    const ownerId = req.user.id;

    if (resourceType === 'folder') {
      const check = await query(
        'SELECT id FROM folders WHERE id = $1 AND owner_id = $2 AND is_deleted = true',
        [resourceId, ownerId]
      );
      if (!check.rows[0]) throw new AppError('Folder not found in trash', 404, 'NOT_FOUND');

      await cascadeRestoreFolder(resourceId);
      await logActivity(ownerId, 'restore', resourceType, resourceId, {});
      return res.json({ ok: true });
    }

    const result = await query(
      `UPDATE files SET is_deleted = false WHERE id = $1 AND owner_id = $2 RETURNING id`,
      [resourceId, ownerId]
    );
    if (!result.rows[0]) throw new AppError('Item not found in trash', 404, 'NOT_FOUND');
    res.json({ ok: true });
  } catch (err) {
    next(err);
  }
};