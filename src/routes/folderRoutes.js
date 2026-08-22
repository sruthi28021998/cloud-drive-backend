import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { createFolder, getFolder, updateFolder, deleteFolder } from '../controllers/folderController.js';

const router = Router();

router.use(requireAuth);
router.post('/', createFolder);
router.get('/:id', getFolder);
router.patch('/:id', updateFolder);
router.delete('/:id', deleteFolder);

export default router;