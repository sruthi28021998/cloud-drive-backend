import { query } from '../config/db.js';

export const logActivity = async (actorId, action, resourceType, resourceId, context = {}) => {
  try {
    await query(
      `INSERT INTO activities (actor_id, action, resource_type, resource_id, context)
       VALUES ($1, $2, $3, $4, $5)`,
      [actorId, action, resourceType, resourceId, JSON.stringify(context)]
    );
  } catch (err) {
    console.error('Failed to log activity:', err.message);
  }
};