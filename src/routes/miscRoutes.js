import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { search, addStar, removeStar, listTrash, restoreFromTrash } from '../controllers/miscController.js';

const router = Router();
router.use(requireAuth);

router.get('/search', search);
router.post('/stars', addStar);
router.delete('/stars', removeStar);
router.get('/trash', listTrash);
router.post('/trash/restore', restoreFromTrash);

export default router;