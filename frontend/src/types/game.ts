export interface User {
  id: string;
  username: string;
  email: string;
  createdAt: string;
}

export interface Campaign {
  id: string;
  name: string;
  description: string;
  ruleSystem: string;
  createdBy: string;
  createdAt: string;
  updatedAt: string;
}

export interface Character {
  id: string;
  campaignId: string;
  playerId: string;
  name: string;
  race: string;
  class: string;
  level: number;
  abilityScores: AbilityScores;
  hp: number;
  maxHp: number;
  inventory: InventoryItem[];
  createdAt: string;
  updatedAt: string;
}

export interface AbilityScores {
  strength: number;
  dexterity: number;
  constitution: number;
  intelligence: number;
  wisdom: number;
  charisma: number;
}

export interface InventoryItem {
  id: string;
  name: string;
  type: string;
  quantity: number;
  description?: string;
}

export interface GameSession {
  id: string;
  campaignId: string;
  name: string;
  players: string[];
  currentTurn: number;
  state: 'active' | 'paused' | 'completed';
  createdAt: string;
  updatedAt: string;
}

export interface ChatMessage {
  id: string;
  sessionId: string;
  sender: 'dm' | 'player';
  playerId?: string;
  content: string;
  timestamp: string;
}

export interface SaveState {
  id: string;
  sessionId: string;
  name: string;
  turnNumber: number;
  gameState: any;
  createdAt: string;
}
