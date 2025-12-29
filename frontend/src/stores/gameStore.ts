import { create } from 'zustand';
import { GameSession, ChatMessage, Character } from '../types/game';

interface GameState {
  currentSession: GameSession | null;
  messages: ChatMessage[];
  characters: Character[];
  setSession: (session: GameSession) => void;
  addMessage: (message: ChatMessage) => void;
  setCharacters: (characters: Character[]) => void;
  clearSession: () => void;
}

export const useGameStore = create<GameState>((set) => ({
  currentSession: null,
  messages: [],
  characters: [],
  setSession: (session) => set({ currentSession: session }),
  addMessage: (message) => set((state) => ({ 
    messages: [...state.messages, message] 
  })),
  setCharacters: (characters) => set({ characters }),
  clearSession: () => set({ 
    currentSession: null, 
    messages: [], 
    characters: [] 
  }),
}));
