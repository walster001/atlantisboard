import { Router } from 'express';
import { requireAuth } from '../middleware/auth.js';
import { prewarmMalwareScanner, shouldSkipMalwareScan } from '../utils/uploadMalwareScan.js';
import { hasClamSignatureDatabase } from '../utils/clamSignatures.js';

const router = Router();

router.use(requireAuth);

/** Pre-warm ClamAV signatures when the user opens the attachment picker (on-demand clamscan). */
router.post('/prewarm', async (_req, res) => {
  if (shouldSkipMalwareScan()) {
    res.json({ ok: true, skipped: true, ready: true });
    return;
  }
  prewarmMalwareScanner();
  const ready = await hasClamSignatureDatabase();
  res.json({ ok: true, skipped: false, ready });
});

export const scanRoutes = router;
