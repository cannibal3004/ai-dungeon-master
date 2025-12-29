import { Request, Response, NextFunction } from 'express';
import { AIDMService } from '../services/AIDMService';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { getLLMManager } from '../llm/manager';

let aiDMService: AIDMService;

function getAIDMService(): AIDMService {
  if (!aiDMService) {
    aiDMService = new AIDMService();
  }
  return aiDMService;
}

// Validation schemas
const narrativeSchema = z.object({
  campaignId: z.string().uuid(),
  action: z.string().min(1).max(2000),
});

const npcDialogueSchema = z.object({
  campaignId: z.string().uuid(),
  npcId: z.string().uuid(),
  message: z.string().min(1).max(1000),
});

const encounterSchema = z.object({
  partyLevel: z.number().min(1).max(20),
  partySize: z.number().min(1).max(10),
  difficulty: z.enum(['easy', 'medium', 'hard', 'deadly']),
  terrain: z.string().optional(),
  enemyTypes: z.array(z.string()).optional(),
}).strict();

const locationSchema = z.object({
  locationType: z.string().min(1).max(100),
  atmosphere: z.string().min(1).max(500),
  details: z.string().max(1000).optional(),
});

export async function generateNarrative(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const data = narrativeSchema.parse(req.body);

    const result = await getAIDMService().generateNarrative(
      data.campaignId,
      data.action,
      userId
    );

    res.json({
      status: 'success',
      data: result,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function generateNPCDialogue(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const data = npcDialogueSchema.parse(req.body);

    const dialogue = await getAIDMService().generateNPCDialogue(
      data.campaignId,
      data.npcId,
      data.message,
      userId
    );

    res.json({
      status: 'success',
      data: { dialogue, npcId: data.npcId },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function generateEncounter(req: Request, res: Response, next: NextFunction) {
  try {
    const data = encounterSchema.parse(req.body) as any;

    const encounter = await getAIDMService().generateEncounter(data);

    res.json({
      status: 'success',
      data: { encounter },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function generateLocation(req: Request, res: Response, next: NextFunction) {
  try {
    const data = locationSchema.parse(req.body);

    const description = await getAIDMService().generateLocationDescription(
      data.locationType,
      data.atmosphere,
      data.details
    );

    res.json({
      status: 'success',
      data: { description },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function generateSummary(req: Request, res: Response, next: NextFunction) {
  try {
    const { campaignId } = req.params;

    const summary = await getAIDMService().generateSessionSummary(campaignId);

    res.json({
      status: 'success',
      data: { summary },
    });
  } catch (error) {
    next(error);
  }
}

export async function providersStatus(_req: Request, res: Response, next: NextFunction) {
  try {
    const manager = getLLMManager();
    const providers = manager.getAvailableProviders();
    res.json({ status: 'success', data: { providers } });
  } catch (error) {
    next(error);
  }
}
