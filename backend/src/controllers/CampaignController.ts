import { Request, Response, NextFunction } from 'express';
import { CampaignService } from '../services/CampaignService';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { WorldEntityModel } from '../models/WorldEntity';
import { QuestModel } from '../models/Quest';

let campaignService: CampaignService;
let worldEntityModel: WorldEntityModel;
let questModel: QuestModel;

function getCampaignService(): CampaignService {
  if (!campaignService) {
    campaignService = new CampaignService();
  }
  return campaignService;
}

function getWorldEntityModel(): WorldEntityModel {
  if (!worldEntityModel) {
    worldEntityModel = new WorldEntityModel();
  }
  return worldEntityModel;
}

function getQuestModel(): QuestModel {
  if (!questModel) {
    questModel = new QuestModel();
  }
  return questModel;
}

// Validation schemas
const createCampaignSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().max(2000).optional(),
  settings: z.any().optional(),
});

const updateCampaignSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().max(2000).optional(),
  settings: z.any().optional(),
});

const addPlayerSchema = z.object({
  userId: z.string().uuid(),
  characterId: z.string().uuid(),
});

export async function createCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const data = createCampaignSchema.parse(req.body);

    const campaign = await getCampaignService().createCampaign(
      data.name,
      data.description || '',
      userId,
      data.settings
    );

    res.status(201).json({
      status: 'success',
      data: { campaign },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function getCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const campaign = await getCampaignService().getCampaign(id, userId);

    res.json({
      status: 'success',
      data: { campaign },
    });
  } catch (error) {
    next(error);
  }
}

export async function getUserCampaigns(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;

    const campaigns = await getCampaignService().getUserCampaigns(userId);

    res.json({
      status: 'success',
      data: { campaigns },
    });
  } catch (error) {
    next(error);
  }
}

export async function getAllCampaigns(req: Request, res: Response, next: NextFunction) {
  try {
    const limit = parseInt(req.query.limit as string) || 50;
    const offset = parseInt(req.query.offset as string) || 0;

    const campaigns = await getCampaignService().getAllCampaigns(limit, offset);

    res.json({
      status: 'success',
      data: { campaigns },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const data = updateCampaignSchema.parse(req.body);

    const campaign = await getCampaignService().updateCampaign(id, userId, data);

    res.json({
      status: 'success',
      data: { campaign },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function deleteCampaign(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    await getCampaignService().deleteCampaign(id, userId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function addPlayer(req: Request, res: Response, next: NextFunction) {
  try {
    const requestingUserId = (req as any).userId;
    const { id: campaignId } = req.params;
    const data = addPlayerSchema.parse(req.body);

    await getCampaignService().addPlayer(
      campaignId,
      data.userId,
      data.characterId,
      requestingUserId
    );

    res.json({
      status: 'success',
      message: 'Player added to campaign',
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function removePlayer(req: Request, res: Response, next: NextFunction) {
  try {
    const requestingUserId = (req as any).userId;
    const { id: campaignId, userId } = req.params;

    await getCampaignService().removePlayer(campaignId, userId, requestingUserId);

    res.status(204).send();
  } catch (error) {
    next(error);
  }
}

export async function getCampaignPlayers(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const { id: campaignId } = req.params;

    const players = await getCampaignService().getCampaignPlayers(campaignId, userId);

    res.json({
      status: 'success',
      data: { players },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCampaignEntities(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const { id: campaignId } = req.params;

    // Verify user has access to this campaign
    await getCampaignService().getCampaign(campaignId, userId);

    const [locations, npcs, shops, items] = await Promise.all([
      getWorldEntityModel().getLocations(campaignId),
      getWorldEntityModel().getNPCs(campaignId),
      getWorldEntityModel().getShops(campaignId),
      getWorldEntityModel().getItems(campaignId),
    ]);

    res.json({
      status: 'success',
      data: {
        locations,
        npcs,
        shops,
        items,
      },
    });
  } catch (error) {
    next(error);
  }
}

export async function getCampaignQuests(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const { id: campaignId } = req.params;
    const statusParam = req.query.status as string | undefined;
    const status = statusParam && ['active','completed','failed','abandoned'].includes(statusParam)
      ? (statusParam as 'active' | 'completed' | 'failed' | 'abandoned')
      : undefined;

    // Verify user has access to this campaign
    await getCampaignService().getCampaign(campaignId, userId);

    const quests = await getQuestModel().getQuestsByCampaign(campaignId, status);

    res.json({
      status: 'success',
      data: { quests },
    });
  } catch (error) {
    next(error);
  }
}
