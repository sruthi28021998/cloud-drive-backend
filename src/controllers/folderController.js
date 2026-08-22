import { v4 as uuidv4 } from 'uuid';
import { query } from '../config/db.js';
import { AppError } from '../middleware/errorHandler.js';
import { z } from 'zod';

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
    const ownerId = req.user.id;

    const folderResult = await query(
      'SELECT * FROM folders WHERE id = $1 AND owner_id = $2 AND is_deleted = false',
      [id, ownerId]
    );
    const folder = folderResult.rows[0];
    if (!folder) throw new AppError('Folder not found', 404, 'NOT_FOUND');

    const childFolders = await query(
      'SELECT * FROM folders WHERE parent_id = $1 AND is_deleted = false ORDER BY name',
      [id]
    );
    const childFiles = await query(
      'SELECT * FROM files WHERE folder_id = $1 AND is_deleted = false ORDER BY name',
      [id]
    );

    // breadcrumb path via recursive CTE
    const pathResult = await query(
      `WITH RECURSIVE path AS (
         SELECT id, name, parent_id FROM folders WHERE id = $1
         UNION ALL
         SELECT f.id, f.name, f.parent_id FROM folders f
         JOIN path p ON f.id = p.parent_id
       )
       SELECT id, name FROM path`,
      [id]
    );

    res.json({
      folder,
      children: { folders: childFolders.rows, files: childFiles.rows },
      path: pathResult.rows.reverse()
    });
  } catch (err) {
    next(err);
  }
};

export const updateFolder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const { name, parentId } = req.body;
    const ownerId = req.user.id;

    const existing = await query(
      'SELECT id FROM folders WHERE id = $1 AND owner_id = $2 AND is_deleted = false',
      [id, ownerId]
    );
    if (!existing.rows[0]) throw new AppError('Folder not found', 404, 'NOT_FOUND');

    if (parentId) {
      // prevent moving a folder into its own descendant
      const cycleCheck = await query(
        `WITH RECURSIVE descendants AS (
           SELECT id FROM folders WHERE parent_id = $1
           UNION ALL
           SELECT f.id FROM folders f JOIN descendants d ON f.parent_id = d.id
         )
         SELECT id FROM descendants WHERE id = $2`,
        [id, parentId]
      );
      if (cycleCheck.rows.length > 0) {
        throw new AppError('Cannot move a folder into its own subfolder', 400, 'BAD_REQUEST');
      }
    }

    const fields = [];
    const values = [];
    let idx = 1;
    if (name !== undefined) { fields.push(`name = $${idx++}`); values.push(name); }
    if (parentId !== undefined) { fields.push(`parent_id = $${idx++}`); values.push(parentId); }
    fields.push(`updated_at = now()`);
    values.push(id);

    await query(`UPDATE folders SET ${fields.join(', ')} WHERE id = $${idx}`, values);
    res.json({ ok: true });
  } catch (err) {
    if (err.code === '23505') return next(new AppError('A folder with this name already exists here', 409, 'CONFLICT'));
    next(err);
  }
};

export const deleteFolder = async (req, res, next) => {
  try {
    const { id } = req.params;
    const ownerId = req.user.id;
    const result = await query(
      'UPDATE folders SET is_deleted = true WHERE id = $1 AND owner_id = $2 RETURNING id',
      [id, ownerId]
    );
    if (!result.rows[0]) throw new AppError('Folder not found', 404, 'NOT_FOUND');
    res.status(204).send();
  } catch (err) {
    next(err);
  }
};