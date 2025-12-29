import { Request, Response, NextFunction } from 'express';
import { SessionService } from '../services/SessionService';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';

let sessionService: SessionService;

function getSessionService(): SessionService {
  if (!sessionService) {
    sessionService = new SessionService();
  }
  return sessionService;
}

// Validation schemas
const startSessionSchema = z.object({
  campaignId: z.string().uuid(),
  dmNotes: z.string().optional(),
});

const endSessionSchema = z.object({
  dmNotes: z.string().optional(),
});

const createSaveSchema = z.object({
  sessionId: z.string().uuid(),
  saveName: z.string().min(1).max(100),
  stateData: z.any(),
  turnNumber: z.number().optional(),
  slotNumber: z.number().optional(),
});

export async function startSession(req: Request, res: Response, next: NextFunction) {
  try {
    const data = startSessionSchema.parse(req.body);
    const userId = (req as any).userId;

    if (!userId) {
      throw new AppError(401, 'User not authenticated');
    }

    const session = await getSessionService().startSession(data.campaignId, userId, data.dmNotes);

    res.status(201).json({
      status: 'success',
      data: { session },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function endSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;
    const data = endSessionSchema.parse(req.body);

    const session = await getSessionService().endSession(id, data.dmNotes);

    res.json({
      status: 'success',
      data: { session },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function getActiveSession(req: Request, res: Response, next: NextFunction) {
  try {
    const { campaignId } = req.params;

    const session = await getSessionService().getActiveSession(campaignId);

    res.json({
      status: 'success',
      data: { session },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCampaignSessions(req: Request, res: Response, next: NextFunction) {
  try {
    const { campaignId } = req.params;

    const sessions = await getSessionService().getCampaignSessions(campaignId);

    res.json({
      status: 'success',
      data: { sessions },
    });
  } catch (error) {
    next(error);
  }
}

export async function createSaveState(req: Request, res: Response, next: NextFunction) {
  try {
    const data = createSaveSchema.parse(req.body);

    const saveState = await getSessionService().createSaveState(
      data.sessionId,
      data.saveName,
      data.stateData,
      data.turnNumber,
      data.slotNumber
    );

    res.status(201).json({
      status: 'success',
      data: { saveState },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function loadSaveState(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    const saveState = await getSessionService().loadSaveState(id);

    res.json({
      status: 'success',
      data: { saveState },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCampaignSaveStates(req: Request, res: Response, next: NextFunction) {
  try {
    const { campaignId } = req.params;

    const saveStates = await getSessionService().getCampaignSaveStates(campaignId);

    res.json({
      status: 'success',
      data: { saveStates },
    });
  } catch (error) {
    next(error);
  }
}

export async function deleteSaveState(req: Request, res: Response, next: NextFunction) {
  try {
    const { id } = req.params;

    await getSessionService().deleteSaveState(id);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function getLatestAutoSave(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;

    const autosave = await getSessionService().getLatestAutoSave(sessionId);

    res.json({
      status: 'success',
      data: { autosave },
    });
  } catch (error) {
    next(error);
  }
}

export async function getSessionAutosaves(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit as string) || 10;

    const autosaves = await getSessionService().getSessionAutosaves(sessionId, limit);

    res.json({
      status: 'success',
      data: { autosaves },
    });
  } catch (error) {
    next(error);
  }
}

export async function getSessionChatHistory(req: Request, res: Response, next: NextFunction) {
  try {
    const { sessionId } = req.params;
    const limit = parseInt(req.query.limit as string) || 100;

    const messages = await getSessionService().getSessionChatHistory(sessionId, limit);

    res.json({
      status: 'success',
      data: { messages },
    });
  } catch (error) {
    next(error);
  }
}
