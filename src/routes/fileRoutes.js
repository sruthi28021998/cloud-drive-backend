import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { initUpload, completeUpload, getFile, updateFile, deleteFile } from '../controllers/fileController.js';

const router = Router();

router.use(requireAuth);
router.post('/init', uploadLimiter, initUpload);
router.post('/complete', completeUpload);
router.get('/:id', getFile);
router.patch('/:id', updateFile);
router.delete('/:id', deleteFile);

export default router;