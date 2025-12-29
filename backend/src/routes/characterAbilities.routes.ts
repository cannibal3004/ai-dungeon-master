import { Router, Request, Response, NextFunction } from 'express';
import { getCharacterAbilitiesModel } from '../models/CharacterAbilities';

const router = Router({ mergeParams: true });

// Spells
router.post('/spells', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { characterId } = req.params;
    const spell = await getCharacterAbilitiesModel().addSpell(characterId, req.body);
    res.status(201).json({ status: 'success', data: spell });
  } catch (error) {
    next(error);
  }
});

router.get('/spells', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { characterId } = req.params;
    const spells = await getCharacterAbilitiesModel().getSpells(characterId);
    res.json({ status: 'success', data: spells });
  } catch (error) {
    next(error);
  }
});

router.delete('/spells/:spellId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { spellId } = req.params;
    await getCharacterAbilitiesModel().removeSpell(spellId);
    res.json({ status: 'success', message: 'Spell removed' });
  } catch (error) {
    next(error);
  }
});

// Spell Slots
router.post('/spell-slots/:level', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { characterId, level } = req.params;
    const { maxSlots } = req.body;
    const slots = await getCharacterAbilitiesModel().setSpellSlots(characterId, parseInt(level), maxSlots);
    res.json({ status: 'success', data: slots });
  } catch (error) {
    next(error);
  }
});

router.get('/spell-slots', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { characterId } = req.params;
    const slots = await getCharacterAbilitiesModel().getSpellSlots(characterId);
    res.json({ status: 'success', data: slots });
  } catch (error) {
    next(error);
  }
});

router.post('/spell-slots/:level/use', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { characterId, level } = req.params;
    const success = await getCharacterAbilitiesModel().useSpellSlot(characterId, parseInt(level));
    if (success) {
      res.json({ status: 'success', message: 'Spell slot used' });
    } else {
      res.status(400).json({ status: 'error', message: 'No spell slots available' });
    }
  } catch (error) {
    next(error);
  }
});

router.post('/spell-slots/restore', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { characterId } = req.params;
    await getCharacterAbilitiesModel().restoreSpellSlots(characterId);
    res.json({ status: 'success', message: 'Spell slots restored' });
  } catch (error) {
    next(error);
  }
});

// Skills
router.post('/skills', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { characterId } = req.params;
    const skill = await getCharacterAbilitiesModel().addSkill(characterId, req.body);
    res.status(201).json({ status: 'success', data: skill });
  } catch (error) {
    next(error);
  }
});

router.get('/skills', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { characterId } = req.params;
    const skills = await getCharacterAbilitiesModel().getSkills(characterId);
    res.json({ status: 'success', data: skills });
  } catch (error) {
    next(error);
  }
});

router.put('/skills/:skillId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { skillId } = req.params;
    const skill = await getCharacterAbilitiesModel().updateSkill(skillId, req.body);
    res.json({ status: 'success', data: skill });
  } catch (error) {
    next(error);
  }
});

router.delete('/skills/:skillId', async (req: Request, res: Response, next: NextFunction) => {
  try {
    const { skillId } = req.params;
    await getCharacterAbilitiesModel().removeSkill(skillId);
    res.json({ status: 'success', message: 'Skill removed' });
  } catch (error) {
    next(error);
  }
});

export default router;
