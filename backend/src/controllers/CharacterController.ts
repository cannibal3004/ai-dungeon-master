import { Request, Response, NextFunction } from 'express';
import { CharacterService } from '../services/CharacterService';
import { getDDBImportService } from '../services/DDBImportService';
import { z } from 'zod';
import { AppError } from '../middleware/errorHandler';
import { RACES, CLASSES } from '../rules/constants';

let characterService: CharacterService;

function getCharacterService(): CharacterService {
  if (!characterService) {
    characterService = new CharacterService();
  }
  return characterService;
}

const importSchema = z.object({
  campaignId: z.string().uuid(),
  url: z.string().url().optional(),
  ddb: z.any().optional(),
}).refine((val) => !!val.url || val.ddb !== undefined, {
  message: 'Provide either a D&D Beyond character URL or a JSON payload',
});

// Validation schemas
const createCharacterSchema = z.object({
  campaignId: z.string().uuid(),
  name: z.string().min(1).max(100),
  race: z.enum(Object.keys(RACES) as [string, ...string[]]),
  class: z.enum(Object.keys(CLASSES) as [string, ...string[]]),
  background: z.string().optional(),
  customScores: z.object({
    strength: z.number().min(3).max(20),
    dexterity: z.number().min(3).max(20),
    constitution: z.number().min(3).max(20),
    intelligence: z.number().min(3).max(20),
    wisdom: z.number().min(3).max(20),
    charisma: z.number().min(3).max(20),
  }).optional(),
});

const updateCharacterSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  hp: z.number().optional(),
  armorClass: z.number().optional(),
  inventory: z.array(z.any()).optional(),
  spells: z.array(z.any()).optional(),
  traits: z.array(z.any()).optional(),
});

const updateHPSchema = z.object({
  amount: z.number(),
});

export async function createCharacter(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const data = createCharacterSchema.parse(req.body);

    const character = await getCharacterService().createCharacter(
      data.campaignId,
      userId,
      data.name,
      data.race as any,
      data.class as any,
      data.background,
      data.customScores
    );

    res.status(201).json({
      status: 'success',
      data: { character },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function getCharacter(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const character = await getCharacterService().getCharacter(id, userId);

    res.json({
      status: 'success',
      data: { character },
    });
  } catch (error) {
    next(error);
  }
}

export async function getMyCharacters(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;

    const characters = await getCharacterService().getPlayerCharacters(userId);

    res.json({
      status: 'success',
      data: { characters },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateCharacter(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const updates = updateCharacterSchema.parse(req.body);

    const character = await getCharacterService().updateCharacter(id, userId, updates);

    res.json({
      status: 'success',
      data: { character },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function levelUpCharacter(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    const character = await getCharacterService().levelUpCharacter(id, userId);

    res.json({
      status: 'success',
      data: { character },
    });
  } catch (error) {
    next(error);
  }
}

export async function updateHP(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;
    const { amount } = updateHPSchema.parse(req.body);

    const character = await getCharacterService().updateHP(id, userId, amount);

    res.json({
      status: 'success',
      data: { character },
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      next(new AppError(400, error.errors[0].message));
    } else {
      next(error);
    }
  }
}

export async function deleteCharacter(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const { id } = req.params;

    await getCharacterService().deleteCharacter(id, userId);

    res.json({
      status: 'success',
      message: 'Character deleted successfully',
    });
  } catch (error) {
    next(error);
  }
}

export async function importFromDDB(req: Request, res: Response, next: NextFunction) {
  try {
    const userId = (req as any).userId;
    const { campaignId, ddb, url } = importSchema.parse(req.body);

    const payload = url ?? ddb;
    const result = await getDDBImportService().importCharacter(campaignId, userId, payload);

    res.status(201).json({
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
