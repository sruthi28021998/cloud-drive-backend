import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createShare, listShares, revokeShare,
  createLinkShare, resolveLinkShare, resolveLinkDownload, deleteLinkShare
} from '../controllers/shareController.js';

const router = Router();

// public link resolution — no auth required
router.get('/link/:token', resolveLinkShare);
router.get('/link/:token/download', resolveLinkDownload);

router.use(requireAuth);
router.post('/', createShare);
router.get('/:resourceType/:resourceId', listShares);
router.delete('/:id', revokeShare);
router.post('/link', createLinkShare);
router.delete('/link/:id', deleteLinkShare);

export default router;