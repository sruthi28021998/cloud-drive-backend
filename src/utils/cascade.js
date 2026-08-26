import { query } from '../config/db.js';

const getSubtreeFolderIds = async (folderId) => {
  const result = await query(
    `WITH RECURSIVE subtree AS (
       SELECT id FROM folders WHERE id = $1
       UNION ALL
       SELECT f.id FROM folders f JOIN subtree s ON f.parent_id = s.id
     )
     SELECT id FROM subtree`,
    [folderId]
  );
  return result.rows.map((r) => r.id);
};

export const cascadeDeleteFolder = async (folderId) => {
  const folderIds = await getSubtreeFolderIds(folderId);

  await query(
    `UPDATE folders SET is_deleted = true WHERE id = ANY($1::uuid[])`,
    [folderIds]
  );
  await query(
    `UPDATE files SET is_deleted = true WHERE folder_id = ANY($1::uuid[])`,
    [folderIds]
  );

  return folderIds;
};

export const cascadeRestoreFolder = async (folderId) => {
  const folderIds = await getSubtreeFolderIds(folderId);

  await query(
    `UPDATE folders SET is_deleted = false WHERE id = ANY($1::uuid[])`,
    [folderIds]
  );
  await query(
    `UPDATE files SET is_deleted = false WHERE folder_id = ANY($1::uuid[])`,
    [folderIds]
  );

  await query(
    `UPDATE folders SET parent_id = NULL
     WHERE id = $1 AND parent_id IN (
       SELECT id FROM folders WHERE is_deleted = true
       UNION SELECT $1 WHERE NOT EXISTS (SELECT 1 FROM folders WHERE id = (SELECT parent_id FROM folders WHERE id = $1))
     )`,
    [folderId]
  );

  return folderIds;
};