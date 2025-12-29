import { Router } from 'express';
import * as AIDMController from '../controllers/AIDMController';
import { authenticate } from '../middleware/auth';

const router = Router();

// All AI DM routes require authentication
router.use(authenticate);

// Narrative generation
router.post('/narrative', AIDMController.generateNarrative);

// NPC dialogue
router.post('/npc-dialogue', AIDMController.generateNPCDialogue);

// Encounter generation
router.post('/encounter', AIDMController.generateEncounter);

// Location description
router.post('/location', AIDMController.generateLocation);

// Session summary
router.post('/summary/:campaignId', AIDMController.generateSummary);

// Providers diagnostics
router.get('/providers/status', AIDMController.providersStatus);

export default router;
