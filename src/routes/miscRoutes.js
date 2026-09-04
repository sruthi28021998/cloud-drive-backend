import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { search, addStar, removeStar, listTrash, restoreFromTrash } from '../controllers/miscController.js';
import { getActivity } from '../controllers/miscController.js';
import { getStorageUsage } from '../controllers/miscController.js';
const router = Router();
router.use(requireAuth);
router.get('/activity', getActivity);
router.get('/search', search);
router.get('/storage-usage', getStorageUsage);
router.post('/stars', addStar);
router.delete('/stars', removeStar);
router.get('/trash', listTrash);
router.post('/trash/restore', restoreFromTrash);

export default router;