import { query } from '../config/db.js';

export const getAccessLevel = async (resourceType, resourceId, userId) => {
  const table = resourceType === 'file' ? 'files' : 'folders';

  const owned = await query(
    `SELECT id FROM ${table} WHERE id = $1 AND owner_id = $2 AND is_deleted = false`,
    [resourceId, userId]
  );
  if (owned.rows[0]) return 'owner';

  const shared = await query(
    `SELECT role FROM shares WHERE resource_type = $1 AND resource_id = $2 AND grantee_user_id = $3`,
    [resourceType, resourceId, userId]
  );
  return shared.rows[0]?.role || null;
};