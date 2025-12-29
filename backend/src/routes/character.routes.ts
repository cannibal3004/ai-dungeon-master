import { Router } from 'express';
import * as CharacterController from '../controllers/CharacterController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All character routes require authentication
router.use(authenticate);

router.get('/my', CharacterController.getMyCharacters);
router.post('/', CharacterController.createCharacter);
router.get('/:id', CharacterController.getCharacter);
router.put('/:id', CharacterController.updateCharacter);
router.post('/:id/level-up', CharacterController.levelUpCharacter);
router.post('/:id/hp', CharacterController.updateHP);
router.delete('/:id', CharacterController.deleteCharacter);

export default router;
