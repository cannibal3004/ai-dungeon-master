import { CampaignModel, Campaign, CampaignWithCreator, SessionPlayer } from '../models/Campaign';
import { CharacterModel } from '../models/Character';
import { AppError } from '../middleware/errorHandler';

export class CampaignService {
  private campaignModel: CampaignModel;
  private characterModel: CharacterModel;

  constructor() {
    this.campaignModel = new CampaignModel();
    this.characterModel = new CharacterModel();
  }

  async createCampaign(
    name: string,
    description: string,
    createdBy: string,
    settings?: any
  ): Promise<Campaign> {
    if (!name || name.trim().length === 0) {
      throw new AppError(400, 'Campaign name is required');
    }

    return await this.campaignModel.createCampaign(name, description, createdBy, settings);
  }

  async getCampaign(id: string, userId: string): Promise<CampaignWithCreator> {
    const campaign = await this.campaignModel.findById(id);
    if (!campaign) {
      throw new AppError(404, 'Campaign not found');
    }

    // Check if user is the creator or a player in the campaign
    const isCreator = campaign.created_by === userId;
    const isPlayer = await this.campaignModel.isPlayerInCampaign(id, userId);

    if (!isCreator && !isPlayer) {
      throw new AppError(403, 'You do not have access to this campaign');
    }

    return campaign;
  }

  async getUserCampaigns(userId: string): Promise<Campaign[]> {
    return await this.campaignModel.findByCreator(userId);
  }

  async getAllCampaigns(limit = 50, offset = 0): Promise<CampaignWithCreator[]> {
    return await this.campaignModel.findAll(limit, offset);
  }

  async updateCampaign(
    id: string,
    userId: string,
    updates: { name?: string; description?: string; settings?: any }
  ): Promise<Campaign> {
    const campaign = await this.campaignModel.findById(id);
    if (!campaign) {
      throw new AppError(404, 'Campaign not found');
    }

    // Only the creator can update the campaign
    if (campaign.created_by !== userId) {
      throw new AppError(403, 'Only the campaign creator can update it');
    }

    const updated = await this.campaignModel.updateCampaign(id, updates);
    if (!updated) {
      throw new AppError(500, 'Failed to update campaign');
    }

    return updated;
  }

  async deleteCampaign(id: string, userId: string): Promise<void> {
    const campaign = await this.campaignModel.findById(id);
    if (!campaign) {
      throw new AppError(404, 'Campaign not found');
    }

    // Only the creator can delete the campaign
    if (campaign.created_by !== userId) {
      throw new AppError(403, 'Only the campaign creator can delete it');
    }

    const deleted = await this.campaignModel.deleteCampaign(id);
    if (!deleted) {
      throw new AppError(500, 'Failed to delete campaign');
    }
  }

  async addPlayer(
    campaignId: string,
    userId: string,
    characterId: string,
    requestingUserId: string
  ): Promise<void> {
    const campaign = await this.campaignModel.findById(campaignId);
    if (!campaign) {
      throw new AppError(404, 'Campaign not found');
    }

    // Verify the character exists and belongs to the user
    const character = await this.characterModel.findById(characterId);
    if (!character) {
      throw new AppError(404, 'Character not found');
    }

    if (character.player_id !== userId) {
      throw new AppError(403, 'Character does not belong to this user');
    }

    // Verify the character is for this campaign
    if (character.campaign_id !== campaignId) {
      throw new AppError(400, 'Character is not created for this campaign');
    }

    // Only campaign creator or the user themselves can add the player
    if (campaign.created_by !== requestingUserId && userId !== requestingUserId) {
      throw new AppError(403, 'You do not have permission to add players to this campaign');
    }

    await this.campaignModel.addPlayerToCampaign(campaignId, userId, characterId);
  }

  async removePlayer(
    campaignId: string,
    userId: string,
    requestingUserId: string
  ): Promise<void> {
    const campaign = await this.campaignModel.findById(campaignId);
    if (!campaign) {
      throw new AppError(404, 'Campaign not found');
    }

    // Only campaign creator or the user themselves can remove the player
    if (campaign.created_by !== requestingUserId && userId !== requestingUserId) {
      throw new AppError(403, 'You do not have permission to remove players from this campaign');
    }

    await this.campaignModel.removePlayerFromCampaign(campaignId, userId);
  }

  async getCampaignPlayers(campaignId: string, requestingUserId: string): Promise<SessionPlayer[]> {
    const campaign = await this.campaignModel.findById(campaignId);
    if (!campaign) {
      throw new AppError(404, 'Campaign not found');
    }

    // Check if user has access to this campaign
    const isCreator = campaign.created_by === requestingUserId;
    const isPlayer = await this.campaignModel.isPlayerInCampaign(campaignId, requestingUserId);

    if (!isCreator && !isPlayer) {
      throw new AppError(403, 'You do not have access to this campaign');
    }

    return await this.campaignModel.getCampaignPlayers(campaignId);
  }
}
