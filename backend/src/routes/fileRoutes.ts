import { Router } from 'express';
import {
  deleteEntry,
  getFileById,
  renameEntry,
  updateFileContent,
} from '../controllers/fileController.js';
import { requireAuth } from '../middleware/auth.js';
import { validateBody } from '../middleware/validate.js';
import { renameEntrySchema, updateFileContentSchema } from '../validators/fileValidators.js';

const router = Router();

router.use(requireAuth);

router.get('/:fileId', getFileById);
router.put('/:fileId', validateBody(updateFileContentSchema), updateFileContent);
router.patch('/:fileId/rename', validateBody(renameEntrySchema), renameEntry);
router.delete('/:fileId', deleteEntry);

export default router;
