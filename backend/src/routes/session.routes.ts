import { Router } from 'express';
import * as SessionController from '../controllers/SessionController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All session routes require authentication
router.use(authenticate);

// Session management
router.post('/start', SessionController.startSession);
router.post('/:id/end', SessionController.endSession);
router.get('/campaign/:campaignId/active', SessionController.getActiveSession);
router.get('/campaign/:campaignId', SessionController.getCampaignSessions);

// Save states
router.post('/saves', SessionController.createSaveState);
router.get('/saves/:id', SessionController.loadSaveState);
router.get('/campaign/:campaignId/saves', SessionController.getCampaignSaveStates);
router.delete('/saves/:id', SessionController.deleteSaveState);

// Autosaves
router.get('/:sessionId/autosaves/latest', SessionController.getLatestAutoSave);
router.get('/:sessionId/autosaves', SessionController.getSessionAutosaves);

// Chat history
router.get('/:sessionId/history', SessionController.getSessionChatHistory);

export default router;
