import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';
import { getAccessLevel } from '../utils/access.js';
import { cascadeDeleteFolder } from '../utils/cascade.js';
import { logActivity } from '../utils/activity.js';

const createFolderSchema = z.object({
  name: z.string().min(1).max(255),
  parentId: z.string().uuid().nullable().optional()
});

export const createFolder = async (req, res, next) => {
  try {
    const { name, parentId } = createFolderSchema.parse(req.body);
    const id = uuidv4();
    const ownerId = req.user.id;

    if (parentId) {
      const parent = await query(
        'SELECT id FROM folders WHERE id = $1 AND owner_id = $2 AND is_deleted = false',
        [parentId, ownerId]
      );
      if (!parent.rows[0]) throw new AppError('Parent folder not found', 404, 'NOT_FOUND');
    }

    await query(
      `INSERT INTO folders (id, name, owner_id, parent_id) VALUES ($1, $2, $3, $4)`,
      [id, name, ownerId, parentId || null]
    );

    await logActivity(ownerId, 'create', 'folder', id, { name });
    res.status(201).json({ id, name, parentId: parentId || null });
  } catch (err) {
    if (err.code === '23505') return next(new AppError('A folder with this name already exists here', 409, 'CONFLICT'));
    if (err.name === 'ZodError') return next(new AppError('Invalid input', 400, 'VALIDATION_ERROR'));
    next(err);
  }
};

export const getFolder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const access = await getAccessLevel('folder', id, userId);
    if (!access) throw new AppError('Folder not found', 404, 'NOT_FOUND');

    const folderResult = await query('SELECT * FROM folders WHERE id = $1 AND is_deleted = false', [id]);
    const folder = folderResult.rows[0];
    if (!folder) throw new AppError('Folder not found', 404, 'NOT_FOUND');

    const childFolders = await query(
      'SELECT * FROM folders WHERE parent_id = $1 AND is_deleted = false ORDER BY name', [id]
    );
    const childFiles = await query(
      'SELECT * FROM files WHERE folder_id = $1 AND is_deleted = false ORDER BY name', [id]
    );
    const pathResult = await query(
      `WITH RECURSIVE path AS (
         SELECT id, name, parent_id FROM folders WHERE id = $1
         UNION ALL
         SELECT f.id, f.name, f.parent_id FROM folders f JOIN path p ON f.id = p.parent_id
       )
       SELECT id, name FROM path`,
      [id]
    );

    res.json({
      folder,
      children: { folders: childFolders.rows, files: childFiles.rows },
      path: pathResult.rows.reverse(),
      accessLevel: access
    });
  } catch (err) {
    next(err);
  }
};

export const updateFolder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, parentId } = req.body;
    const userId = req.user.id;

    const access = await getAccessLevel('folder', id, userId);
    if (!access || access === 'viewer') throw new AppError('Not permitted', 403, 'FORBIDDEN');

    if (parentId) {
      const cycleCheck = await query(
        `WITH RECURSIVE descendants AS (
           SELECT id FROM folders WHERE parent_id = $1
           UNION ALL
           SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
         )
         SELECT id FROM descendants WHERE id = $2`,
        [id, parentId]
      );
      if (cycleCheck.rows.length > 0) throw new AppError('Cannot move a folder into its own subfolder', 400, 'BAD_REQUEST');
    }

    const fields = [];
    const values = [];
    let idx = 1;
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (parentId !== undefined) { fields.push(`parent_id = $${idx++}`); values.push(parentId); }
    fields.push(`updated_at = now()`);
    values.push(id);

    await query(`UPDATE folders SET ${fields.join(', ')} WHERE id = $${idx}`, values);

    await logActivity(userId, name !== undefined ? 'rename' : 'move', 'folder', id, {});
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return next(new AppError('A folder with this name already exists here', 409, 'CONFLICT'));
    next(err);
  }
};

export const deleteFolder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const userId = req.user.id;

    const access = await getAccessLevel('folder', id, userId);
    if (!access || access === 'viewer') throw new AppError('Not permitted', 403, 'FORBIDDEN');

    const check = await query('SELECT id FROM folders WHERE id = $1 AND is_deleted = false', [id]);
    if (!check.rows[0]) throw new AppError('Folder not found', 404, 'NOT_FOUND');

    await cascadeDeleteFolder(id);

    await logActivity(userId, 'delete', 'folder', id, {});
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};

export const getRoot = async (req, res, next) => {
  try {
    const ownerId = req.user.id;
    const folders = await query(
      'SELECT * FROM folders WHERE owner_id = $1 AND parent_id IS NULL AND is_deleted = false ORDER BY name',
      [ownerId]
    );
    const files = await query(
      'SELECT * FROM files WHERE owner_id = $1 AND folder_id IS NULL AND is_deleted = false ORDER BY name',
      [ownerId]
    );
    res.json({ children: { folders: folders.rows, files: files.rows } });
  } catch (err) {
    next(err);
  }
};