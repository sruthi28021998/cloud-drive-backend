import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { uploadLimiter } from '../middleware/rateLimit.js';
import { initUpload, completeUpload, getFile, updateFile, deleteFile } from '../controllers/fileController.js';
import { initVersionUpload, completeVersionUpload, listVersions, revertVersion } from '../controllers/versionController.js';
const router = Router();

router.use(requireAuth);
router.post('/:id/versions/init', initVersionUpload);
router.post('/:id/versions/complete', completeVersionUpload);
router.get('/:id/versions', listVersions);
router.post('/:id/versions/:versionId/revert', revertVersion);
router.post('/init', uploadLimiter, initUpload);
router.post('/complete', completeUpload);
router.get('/:id', getFile);
router.patch('/:id', updateFile);
router.delete('/:id', deleteFile);

export default router;