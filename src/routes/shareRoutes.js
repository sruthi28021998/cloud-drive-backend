import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import {
  createShare, listShares, revokeShare,
  createLinkShare, resolveLinkShare, deleteLinkShare
} from '../controllers/shareController.js';

const router = Router();

// public link resolution — no auth required
router.get('/link/:token', resolveLinkShare);

router.use(requireAuth);
router.post('/', createShare);
router.get('/:resourceType/:resourceId', listShares);
router.delete('/:id', revokeShare);
router.post('/link', createLinkShare);
router.delete('/link/:id', deleteLinkShare);

export default router;