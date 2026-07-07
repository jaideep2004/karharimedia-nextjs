import express from 'express';
import {
  createRights,
  getRights,
  updateRights,
  deleteRights,
  validateRights
} from '../controllers/rightsController';

const router = express.Router();

router.post('/', createRights);
router.get('/', getRights);
router.put('/:id', updateRights);
router.delete('/:id', deleteRights);
router.post('/validate', validateRights);

export default router;
