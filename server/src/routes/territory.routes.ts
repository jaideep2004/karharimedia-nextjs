import express from 'express';
import {
  createTerritory,
  getTerritories,
  updateTerritory,
  deleteTerritory,
  validateTerritory
} from '../controllers/territoryController';

const router = express.Router();

router.post('/', createTerritory);
router.get('/', getTerritories);
router.put('/:id', updateTerritory);
router.delete('/:id', deleteTerritory);
router.post('/validate', validateTerritory);

export default router; 
