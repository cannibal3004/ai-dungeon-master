import { Router } from 'express';
import * as CampaignController from '../controllers/CampaignController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All campaign routes require authentication
router.use(authenticate);

// Campaign CRUD
router.post('/', CampaignController.createCampaign);
router.get('/', CampaignController.getAllCampaigns);
router.get('/my', CampaignController.getUserCampaigns);
router.get('/:id', CampaignController.getCampaign);
router.put('/:id', CampaignController.updateCampaign);
router.delete('/:id', CampaignController.deleteCampaign);

// Player management
router.post('/:id/players', CampaignController.addPlayer);
router.delete('/:id/players/:userId', CampaignController.removePlayer);
router.get('/:id/players', CampaignController.getCampaignPlayers);

// World entities
router.get('/:id/entities', CampaignController.getCampaignEntities);
// Quests
router.get('/:id/quests', CampaignController.getCampaignQuests);

export default router;
