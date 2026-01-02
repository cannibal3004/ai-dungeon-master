import { useState, useEffect, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { useAuthStore } from '../stores/authStore';
import { io, Socket } from 'socket.io-client';
import { DiceRoller } from '../components/DiceRoller';
import { HighlightedText } from '../components/EntityHighlight';
import { CombatUI } from '../components/CombatUI';
import ReactMarkdown from 'react-markdown';

interface Message {
  id: string;
  type: 'narrative' | 'action' | 'system';
  content: string;
  timestamp: Date;
  audioUrl?: string;
}

interface AbilityScores {
  strength?: number;
  dexterity?: number;
  constitution?: number;
  intelligence?: number;
  wisdom?: number;
  charisma?: number;
}

interface Character {
  id: string;
  name: string;
  class: string;
  race: string;
  level: number;
  background: string;
  hp?: number;
  max_hp?: number;
  armor_class?: number;
  experience?: number;
  ability_scores?: AbilityScores;
  inventory?: any[];
  money?: number;
}

interface WorldLocation {
  id: string;
  name: string;
  type: string;
  description?: string;
}

interface WorldNPC {
  id: string;
  name: string;
  role?: string;
  description?: string;
  location?: string;
}

interface WorldShop {
  id: string;
  name: string;
  type: string;
  description?: string;
  location?: string;
}

interface WorldItem {
  id: string;
  name: string;
  type: string;
  description?: string;
  shop?: string;
}

interface WorldEntities {
  locations: WorldLocation[];
  npcs: WorldNPC[];
  shops: WorldShop[];
  items: WorldItem[];
}

interface Quest {
  id: string;
  title: string;
  description?: string;
  giver?: string;
  status: 'active' | 'completed' | 'failed' | 'abandoned';
  objectives: string[];
  rewards?: string;
  notes?: string;
}

export default function Game() {
  const { campaignId, sessionId, characterId } = useParams<{
    campaignId: string;
    sessionId: string;
    characterId: string;
  }>();
  const storageKey = campaignId && characterId
    ? `aidm:messages:${campaignId}:${characterId}`
    : undefined;
  const navigate = useNavigate();
  const { logout, token, user } = useAuthStore();
  const [messages, setMessages] = useState<Message[]>([]);
  const [character, setCharacter] = useState<Character | null>(null);
  const [worldEntities, setWorldEntities] = useState<WorldEntities>({
    locations: [],
    npcs: [],
    shops: [],
    items: []
  });
  const [activeQuests, setActiveQuests] = useState<Quest[]>([]);
  const [completedQuests, setCompletedQuests] = useState<Quest[]>([]);
  const [showWorldKnowledge, setShowWorldKnowledge] = useState(false);
  const [actionInput, setActionInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'connecting' | 'connected' | 'reconnecting' | 'disconnected'>('connecting');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const socketRef = useRef<Socket | null>(null);
  const [combatState, setCombatState] = useState<any | null>(null);
  const [enemyInfo, setEnemyInfo] = useState<any[]>([]);
  const [expandedEnemies, setExpandedEnemies] = useState<Record<number, boolean>>({});
  const [showSaveMenu, setShowSaveMenu] = useState(false);
  const [saveStates, setSaveStates] = useState<any[]>([]);
  const [saveName, setSaveName] = useState('');
  const [loadingSave, setLoadingSave] = useState(false);
  const saveMenuRef = useRef<HTMLDivElement>(null);

  // Apply inventory changes from backend LLM extraction
  const applyInventoryChanges = async (changes: {
    itemsAdded: string[];
    itemsRemoved: string[];
    goldChange: number;
  }) => {
    if (!character || (!changes.itemsAdded.length && !changes.itemsRemoved.length && !changes.goldChange)) {
      return;
    }

    let newInventory = [...(character.inventory || [])];
    let newMoney = (character.money ?? 0) + changes.goldChange;

    // Helper to get item name (handles both string and object formats)
    const getItemName = (item: any): string => {
      if (typeof item === 'string') return item;
      return item?.name || String(item);
    };

    // Helper to match items (case-insensitive)
    const itemMatches = (invItem: any, searchName: string): boolean => {
      const itemName = getItemName(invItem);
      return itemName.toLowerCase() === searchName.toLowerCase();
    };

    // Add items
    changes.itemsAdded.forEach((itemName) => {
      // Check if item already exists
      const existingIndex = newInventory.findIndex(i => itemMatches(i, itemName));
      
      if (existingIndex !== -1) {
        // Item exists - increment quantity
        const existing = newInventory[existingIndex];
        if (typeof existing === 'string') {
          // Convert string to object format
          newInventory[existingIndex] = { name: itemName, quantity: 2 };
        } else {
          existing.quantity = (existing.quantity || 1) + 1;
        }
      } else {
        // New item - add as object with quantity 1
        newInventory.push({ name: itemName, quantity: 1 });
      }
    });

    // Remove items
    changes.itemsRemoved.forEach((itemName) => {
      const idx = newInventory.findIndex(i => itemMatches(i, itemName));
      if (idx !== -1) {
        const item = newInventory[idx];
        if (typeof item === 'object' && item.quantity > 1) {
          // Decrement quantity
          item.quantity--;
        } else {
          // Remove item entirely
          newInventory.splice(idx, 1);
        }
      }
    });

    // Update character
    try {
      const updatePayload: any = {};
      if (JSON.stringify(newInventory) !== JSON.stringify(character.inventory)) {
        updatePayload.inventory = newInventory;
      }
      if (newMoney !== character.money) {
        updatePayload.money = newMoney;
      }
      if (Object.keys(updatePayload).length > 0) {
        await apiClient.put(`/characters/${characterId}`, updatePayload);
        // Update local state immediately for responsiveness
        setCharacter((prev) => prev ? { ...prev, inventory: newInventory, money: newMoney } : prev);
        // Fetch fresh character data to ensure consistency
        await fetchCharacter();
      }
    } catch (error) {
      console.warn('Failed to update inventory', error);
    }
  };

  useEffect(() => {
    fetchCharacter();
    fetchWorldEntities();
    fetchQuests();
    fetchSaveStates();
    initializeSocket();
    
    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
      }
    };
  }, []);

  // Separate effect for loading chat history when sessionId becomes available
  useEffect(() => {
    // Hydrate messages from localStorage first for speed
    if (storageKey) {
      try {
        const raw = localStorage.getItem(storageKey);
        if (raw) {
          const parsed = JSON.parse(raw) as Array<Omit<Message, 'timestamp'> & { timestamp: string }>;
          const restored = parsed.map((m) => ({ ...m, timestamp: new Date(m.timestamp) }));
          setMessages(restored);
        }
      } catch (err) {
        console.warn('Failed to restore messages from storage', err);
      }
    }

    // Then fetch backend history
    const loadHistory = async () => {
      let historySessionId = sessionId;
      
      // If sessionId is missing, try to get the active session
      if (!historySessionId && campaignId) {
        try {
          const activeSessionRes = await apiClient.get(`/sessions/campaign/${campaignId}/active`);
          historySessionId = activeSessionRes.data?.data?.session?.id;
          console.log('Fetched active session:', historySessionId);
        } catch (err) {
          console.warn('Failed to fetch active session', err);
          return;
        }
      }

      if (historySessionId) {
        try {
          const res = await apiClient.get(`/sessions/${historySessionId}/history?limit=100`);
          const backendMessages = res.data?.data?.messages || [];
          const converted = backendMessages.map((msg: any) => ({
            id: msg.id,
            type: msg.sender === 'dm' ? 'narrative' : msg.sender === 'player' ? 'action' : 'system',
            content: msg.content,
            timestamp: new Date(msg.created_at),
            audioUrl: msg.metadata?.audioUrl || msg.audioUrl || undefined,
          }));
          setMessages(converted);
          console.log('Loaded', converted.length, 'messages from backend');
        } catch (err) {
          console.warn('Failed to fetch chat history from server', err);
        }
      }
    };

    loadHistory();
  }, [sessionId, campaignId, storageKey]);

  useEffect(() => {
    scrollToBottom();
    // Persist messages locally for quick refresh recovery
    if (storageKey) {
      try {
        const payload = messages.map((m) => ({ ...m, timestamp: m.timestamp.toISOString() }));
        localStorage.setItem(storageKey, JSON.stringify(payload));
      } catch (err) {
        console.warn('Failed to persist messages to storage', err);
      }
    }
  }, [messages]);

  const fetchCharacter = async () => {
    try {
      const response = await apiClient.get(`/characters/${characterId}`);
      const char = response.data?.data?.character ?? response.data?.character ?? response.data;
      const rawInventory = char.inventory ?? char.items ?? [];
      let inventory: any[] = [];
      if (typeof rawInventory === 'string') {
        try {
          const parsed = JSON.parse(rawInventory);
          inventory = Array.isArray(parsed) ? parsed : [parsed];
        } catch {
          inventory = [rawInventory];
        }
      } else if (Array.isArray(rawInventory)) {
        inventory = rawInventory;
      } else if (rawInventory) {
        inventory = [rawInventory];
      }

      // Normalize some snake_case fields to the props we expect
      setCharacter({
        ...char,
        max_hp: char.max_hp ?? char.maxHp,
        armor_class: char.armor_class ?? char.armorClass,
        ability_scores: char.ability_scores ?? char.abilityScores,
        inventory,
      });
    } catch (error) {
      console.error('Failed to fetch character:', error);
    }
  };

  const fetchWorldEntities = async () => {
    try {
      const response = await apiClient.get(`/campaigns/${campaignId}/entities`);
      const data = response.data?.data ?? response.data;
      setWorldEntities({
        locations: data.locations ?? [],
        npcs: data.npcs ?? [],
        shops: data.shops ?? [],
        items: data.items ?? []
      });
    } catch (error) {
      console.error('Failed to fetch world entities:', error);
    }
  };

  const fetchQuests = async () => {
    try {
      const [activeRes, completedRes] = await Promise.all([
        apiClient.get(`/campaigns/${campaignId}/quests?status=active`),
        apiClient.get(`/campaigns/${campaignId}/quests?status=completed`),
      ]);
      const active = activeRes.data?.data?.quests ?? [];
      const completed = completedRes.data?.data?.quests ?? [];
      setActiveQuests(active);
      setCompletedQuests(completed);
    } catch (error) {
      console.error('Failed to fetch quests:', error);
    }
  };

  const initializeSocket = () => {
    // WebSocket will use same origin via reverse proxy
    const socket = io(undefined, {
      auth: { token },
    });

    socket.on('connect', () => {
      console.log('Connected to WebSocket');
      setConnectionStatus('connected');
      if (campaignId && user?.id) {
        socket.emit('join-campaign', campaignId, user.id);
      }
    });

    socket.io.on('reconnect_attempt', () => setConnectionStatus('reconnecting'));
    socket.on('disconnect', () => setConnectionStatus('disconnected'));

    socket.on('game:narrative', (data: { 
      narrative: string; 
      inventoryChanges?: { itemsAdded: string[]; itemsRemoved: string[]; goldChange: number };
      characterId?: string;
      enemyInfo?: any[];
      audioUrl?: string;
      ambienceUrl?: string;
    }) => {
      addMessage('narrative', data.narrative, data.audioUrl);
      // Apply inventory changes if they're for this character
      if (data.inventoryChanges && (!data.characterId || data.characterId === characterId)) {
        applyInventoryChanges(data.inventoryChanges);
      }
      // Update enemy info panel if provided
      if (Array.isArray(data.enemyInfo) && data.enemyInfo.length > 0) {
        setEnemyInfo(data.enemyInfo);
      }
      // Play TTS audio if available and enabled
      if (data.audioUrl) {
        console.log('[Narrative] Got audioUrl:', data.audioUrl, 'ttsEnabledRef.current:', ttsEnabledRef.current);
        setLastAudioUrl(data.audioUrl);
        if (ttsEnabledRef.current) {
          console.log('[Narrative] TTS is enabled, calling playAudioWithAutoplay');
          unlockAudio();
          playAudioWithAutoplay(data.audioUrl);
        } else {
          console.log('[Narrative] TTS is disabled, skipping autoplay');
        }
      }
      if (data.ambienceUrl) {
        const resolved = resolveAudioUrl(data.ambienceUrl);
        setAmbienceUrl(resolved);
        if (ambienceOn) {
          playAmbience(resolved);
        }
      }
      // Refresh world entities since DM may have mentioned new ones
      fetchWorldEntities();
      // Refresh character in case HP/XP/Gold changed via tools
      fetchCharacter();
      // Refresh quests in case DM added/updated quests
      fetchQuests();
    });
    // Combat state updates
    socket.on('combat:state', (data: any) => {
      setCombatState({
        round: data.round,
        currentTurnIndex: data.currentTurnIndex,
        turnOrder: data.turnOrder,
      });
    });

    socket.on('combat:hp-updated', (data: { combatantId: string; newHp: number; maxHp: number }) => {
      setCombatState((prev: typeof combatState) => {
        if (!prev) return prev;
        const updated = { ...prev, turnOrder: prev.turnOrder.map((c: any) => c.id === data.combatantId ? { ...c, hp: data.newHp, maxHp: data.maxHp } : c) };
        return updated;
      });
    });

    socket.on('combat:attack-result', (data: any) => {
      const summary = `${data.attackerName} attacks ${data.targetName} — ${data.hit ? `HIT${data.critical ? ' (CRIT)' : ''} for ${data.damage} ${data.damageType}` : 'MISS'} (roll ${data.attackRoll}${data.damageRoll ? `, damage ${data.damageRoll}` : ''})`;
      addMessage('system', summary);
    });

    socket.on('combat:end', () => {
      addMessage('system', 'Combat has ended.');
      setCombatState(null);
    });

    socket.on('combat:error', (data: any) => {
      const msg = data?.message || 'Combat error';
      addMessage('system', `⚠️ ${msg}`);
    });

    socket.on('game:error', (error: { message: string }) => {
      addMessage('system', `Error: ${error.message}`);
    });

    // Live character updates (HP, XP, gold, inventory) without extra fetches
    socket.on('character:update', (payload: any) => {
      setCharacter((prev) => {
        if (!prev || prev.id !== payload.id) return prev;
        return {
          ...prev,
          hp: payload.hp ?? prev.hp,
          max_hp: payload.max_hp ?? prev.max_hp,
          experience: payload.experience ?? prev.experience,
          level: payload.level ?? prev.level,
          money: payload.money ?? prev.money,
          inventory: Array.isArray(payload.inventory) ? payload.inventory : prev.inventory,
        };
      });
    });

    // Audio ready - TTS has finished generating
    socket.on('game:audio-ready', (data: { campaignId: string; audioUrl: string; narrativeId?: string }) => {
      if (data.campaignId === campaignId) {
        console.log('[Audio] TTS ready:', data.audioUrl);
        setLastAudioUrl(data.audioUrl);
        // Update the last narrative message with the audio URL
        setMessages((prev) => {
          const lastNarrative = [...prev].reverse().find(m => m.type === 'narrative' && !m.audioUrl);
          if (lastNarrative) {
            return prev.map(m => m.id === lastNarrative.id ? { ...m, audioUrl: data.audioUrl } : m);
          }
          return prev;
        });
        // Auto-play if TTS is enabled
        if (ttsEnabledRef.current) {
          console.log('[Audio] Auto-playing TTS');
          unlockAudio();
          playAudioWithAutoplay(data.audioUrl);
        }
      }
    });

    // Ambience ready - background music has been generated
    socket.on('game:ambience-ready', (data: { campaignId: string; ambienceUrl: string; narrativeId?: string }) => {
      if (data.campaignId === campaignId) {
        console.log('[Ambience] Ready:', data.ambienceUrl);
        const resolved = resolveAudioUrl(data.ambienceUrl);
        setAmbienceUrl(resolved);
        if (ambienceOn) {
          playAmbience(resolved);
        }
      }
    });

    socketRef.current = socket;
  };

  const addMessage = (type: 'narrative' | 'action' | 'system', content: string, audioUrl?: string) => {
    const message: Message = {
      id: Date.now().toString(),
      type,
      content,
      timestamp: new Date(),
      audioUrl,
    };
    setMessages((prev) => [...prev, message]);
  };
  // TTS toggle and player state
  const [ttsEnabled, setTtsEnabled] = useState<boolean>(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [lastAudioUrl, setLastAudioUrl] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [audioCurrent, setAudioCurrent] = useState<number>(0);
  const [audioDuration, setAudioDuration] = useState<number>(0);
  const [audioUnlocked, setAudioUnlocked] = useState<boolean>(false);
  const audioCtxRef = useRef<any>(null);
  const ambienceRef = useRef<HTMLAudioElement | null>(null);
  const [ambienceUrl, setAmbienceUrl] = useState<string | null>(null);
  const [ambienceOn, setAmbienceOn] = useState<boolean>(true);
  const [ambienceVolume, setAmbienceVolume] = useState<number>(0.5);
  const [showNarrationMenu, setShowNarrationMenu] = useState<boolean>(false);
  const [showAmbienceMenu, setShowAmbienceMenu] = useState<boolean>(false);
  const [showDiceMenu, setShowDiceMenu] = useState<boolean>(false);
  const narrationMenuRef = useRef<HTMLDivElement | null>(null);
  const ambienceMenuRef = useRef<HTMLDivElement | null>(null);
  const diceMenuRef = useRef<HTMLDivElement | null>(null);
  const ttsEnabledRef = useRef<boolean>(false);

  const extractText = (node: any): string => {
    if (node === null || node === undefined) return '';
    if (typeof node === 'string' || typeof node === 'number') return String(node);
    if (Array.isArray(node)) return node.map(extractText).join('');
    if (node.props && node.props.children) return extractText(node.props.children);
    return '';
  };

  const fetchSaveStates = async () => {
    if (!campaignId) return;
    try {
      const res = await apiClient.get(`/sessions/campaign/${campaignId}/saves`);
      setSaveStates(res.data?.data?.saveStates || []);
    } catch (err) {
      console.warn('Failed to fetch save states', err);
    }
  };

  const createSaveState = async () => {
    if (!sessionId || !saveName.trim()) return;
    setLoadingSave(true);
    try {
      await apiClient.post('/sessions/saves', {
        sessionId,
        saveName,
        stateData: {
          character: character,
          worldEntities: worldEntities,
          quests: activeQuests
        },
        turnNumber: combatState?.round || 0,
      });
      setSaveName('');
      await fetchSaveStates();
      addMessage('system', `✓ Save created: "${saveName}"`);
      setShowSaveMenu(false);
    } catch (err) {
      console.warn('Failed to create save', err);
      addMessage('system', '✗ Failed to save');
    } finally {
      setLoadingSave(false);
    }
  };

  const loadSaveState = async (saveId: string) => {
    setLoadingSave(true);
    try {
      const res = await apiClient.get(`/sessions/saves/${saveId}`);
      const save = res.data?.data?.saveState;
      addMessage('system', `✓ Loaded save: "${save?.name}" (Turn ${save?.turn_number})`);
      // TODO: Restore character, world entities, and quests from save.game_state
      // For now, just refresh the current data
      await Promise.all([fetchCharacter(), fetchWorldEntities(), fetchQuests()]);
      setShowSaveMenu(false);
    } catch (err) {
      console.warn('Failed to load save', err);
      addMessage('system', '✗ Failed to load save');
    } finally {
      setLoadingSave(false);
    }
  };

  const deleteSaveState = async (saveId: string) => {
    if (!confirm('Delete this save?')) return;
    try {
      await apiClient.delete(`/sessions/saves/${saveId}`);
      fetchSaveStates();
      addMessage('system', '✓ Save deleted');
    } catch (err) {
      console.warn('Failed to delete save', err);
    }
  };

  const unlockAudio = () => {
    if (audioUnlocked) return;
    try {
      const AudioContextCls = (window as any).AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextCls) {
        setAudioUnlocked(true);
        return;
      }
      if (!audioCtxRef.current) {
        audioCtxRef.current = new AudioContextCls();
      }
      const ctx = audioCtxRef.current as AudioContext;
      if (ctx.state === 'suspended') {
        ctx.resume?.();
      }
      // Play a 1-frame silent buffer to satisfy gesture requirement
      const buffer = ctx.createBuffer(1, 1, 22050);
      const source = ctx.createBufferSource();
      source.buffer = buffer;
      source.connect(ctx.destination);
      source.start(0);
      source.disconnect();
      setAudioUnlocked(true);
    } catch (error) {
      // If anything fails, still mark as unlocked to avoid loops
      console.error('Audio unlock failed: assuming unlocked');
      console.error('Error details:', (error as any).toString());
      setAudioUnlocked(true);
    }
  };

  const resolveAudioUrl = (url: string) => {
    if (!url) return url;
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('data:')) return url;
    const origin = window?.location?.origin || '';
    return url.startsWith('/') ? `${origin}${url}` : `${origin}/${url}`;
  };

  const playAudio = async (url?: string) => {
    try {
      if (!audioRef.current) return;
      unlockAudio();
      const audio = audioRef.current;
      if (url) {
        const resolved = resolveAudioUrl(url);
        if (audio.src !== resolved) {
          audio.src = resolved;
          audio.load();
        }
      }
      const playPromise = audio.play();
      if (playPromise) {
        await playPromise;
      }
    } catch (err) {
      console.warn('Audio playback failed:', err instanceof Error ? err.message : String(err));
    }
  };

  const playAudioWithAutoplay = async (url?: string) => {
    console.log('[Autoplay] Called with URL:', url, 'ttsEnabled:', ttsEnabled);
    if (!audioRef.current) {
      console.warn('[Autoplay] audioRef.current is null');
      return;
    }
    if (!url) {
      console.warn('[Autoplay] No URL provided');
      return;
    }
    try {
      console.log('[Autoplay] Unlocking audio context');
      unlockAudio();
      const audio = audioRef.current;
      const resolved = resolveAudioUrl(url);
      console.log('[Autoplay] Resolved URL:', resolved, 'Previous src:', audio.src);
      
      if (audio.src !== resolved) {
        console.log('[Autoplay] Setting new src and calling load()');
        audio.src = resolved;
        audio.load();
      }

      // Wait for audio to be ready before playing (max 2 seconds)
      console.log('[Autoplay] Current readyState:', audio.readyState);
      if (audio.readyState < 2) {
        console.log('[Autoplay] Waiting for canplay event...');
        await new Promise<void>((resolve) => {
          const onCanPlay = () => {
            console.log('[Autoplay] canplay event fired');
            audio.removeEventListener('canplay', onCanPlay);
            resolve();
          };
          audio.addEventListener('canplay', onCanPlay);
          setTimeout(() => {
            console.log('[Autoplay] canplay timeout, proceeding anyway');
            audio.removeEventListener('canplay', onCanPlay);
            resolve();
          }, 2000);
        });
      } else {
        console.log('[Autoplay] readyState >= 2, ready to play immediately');
      }

      console.log('[Autoplay] Calling audio.play()');
      const playPromise = audio.play();
      if (playPromise) {
        await playPromise;
        console.log('[Autoplay] Playback started successfully');
      }
    } catch (err) {
      console.error('[Autoplay] Error:', err instanceof Error ? err.message : String(err), err);
    }
  };

  const playAmbience = async (url?: string) => {
    try {
      if (!ambienceRef.current || !ambienceOn) return;
      unlockAudio();
      const a = ambienceRef.current;
      if (url) {
        const resolved = resolveAudioUrl(url);
        if (a.src !== resolved) {
          a.src = resolved;
          a.load();
        }
      }
      await a.play();
    } catch {
      // ignore
    }
  };

  const pauseAmbience = () => {
    if (!ambienceRef.current) return;
    ambienceRef.current.pause();
  };

  const pauseAudio = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
  };

  const stopAudio = () => {
    if (!audioRef.current) return;
    audioRef.current.pause();
    audioRef.current.currentTime = 0;
  };

  // Fallback priming effect (kept, but onChange handler also calls unlock synchronously)
  useEffect(() => {
    if (!ttsEnabled || audioUnlocked) return;
    try {
      const silentMp3 =
        'data:audio/mp3;base64,//uQZAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAACcQCAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
      const a = new Audio(silentMp3);
      a.play().catch(() => {/* ignore */});
    } catch {/* ignore */}
  }, [ttsEnabled, audioUnlocked]);

  // Also unlock on first user interaction anywhere on the page
  useEffect(() => {
    if (audioUnlocked) return;
    const handler = () => unlockAudio();
    window.addEventListener('pointerdown', handler, { once: true } as any);
    window.addEventListener('keydown', handler, { once: true } as any);
    return () => {
      window.removeEventListener('pointerdown', handler);
      window.removeEventListener('keydown', handler);
    };
  }, [audioUnlocked]);

  // Initialize shared audio element and listeners
  useEffect(() => {
    const audio = new Audio();
    audio.setAttribute('playsinline', 'true');
    audio.preload = 'auto';
    audio.crossOrigin = 'anonymous';
    audioRef.current = audio;
    const onTime = () => setAudioCurrent(audio.currentTime || 0);
    const onMeta = () => setAudioDuration(isFinite(audio.duration) ? audio.duration : 0);
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);
    const onEnd = () => setIsPlaying(false);
    audio.addEventListener('timeupdate', onTime);
    audio.addEventListener('loadedmetadata', onMeta);
    audio.addEventListener('play', onPlay);
    audio.addEventListener('pause', onPause);
    audio.addEventListener('ended', onEnd);
    // Ambience element (looping)
    const ambience = new Audio();
    ambience.setAttribute('playsinline', 'true');
    ambience.preload = 'auto';
    ambience.crossOrigin = 'anonymous';
    ambience.loop = true;
    ambience.volume = ambienceVolume;
    ambienceRef.current = ambience;

    const onAmbienceEnded = () => { /* loop keeps playing */ };
    ambience.addEventListener('ended', onAmbienceEnded);
    return () => {
      audio.pause();
      audio.src = '';
      audio.removeEventListener('timeupdate', onTime);
      audio.removeEventListener('loadedmetadata', onMeta);
      audio.removeEventListener('play', onPlay);
      audio.removeEventListener('pause', onPause);
      audio.removeEventListener('ended', onEnd);
      audioRef.current = null;

      ambience.pause();
      ambience.src = '';
      ambience.removeEventListener('ended', onAmbienceEnded);
      ambienceRef.current = null;
    };
  // ambienceVolume intentionally omitted from deps; volume handled via setter below
  }, []);

  useEffect(() => {
    if (ambienceRef.current) {
      ambienceRef.current.volume = ambienceVolume;
    }
  }, [ambienceVolume]);

  // Close dropdowns on outside click
  useEffect(() => {
    const handleOutside = (e: MouseEvent | PointerEvent) => {
      const target = e.target as Node | null;
      if (showNarrationMenu && narrationMenuRef.current && target && !narrationMenuRef.current.contains(target)) {
        setShowNarrationMenu(false);
      }
      if (showAmbienceMenu && ambienceMenuRef.current && target && !ambienceMenuRef.current.contains(target)) {
        setShowAmbienceMenu(false);
      }
      if (showDiceMenu && diceMenuRef.current && target && !diceMenuRef.current.contains(target)) {
        setShowDiceMenu(false);
      }
      if (showSaveMenu && saveMenuRef.current && target && !saveMenuRef.current.contains(target)) {
        setShowSaveMenu(false);
      }
    };
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        if (showNarrationMenu) setShowNarrationMenu(false);
        if (showAmbienceMenu) setShowAmbienceMenu(false);
        if (showDiceMenu) setShowDiceMenu(false);
        if (showSaveMenu) setShowSaveMenu(false);
      }
    };
    document.addEventListener('pointerdown', handleOutside);
    document.addEventListener('keydown', handleKey);
    return () => {
      document.removeEventListener('pointerdown', handleOutside);
      document.removeEventListener('keydown', handleKey);
    };
  }, [showNarrationMenu, showAmbienceMenu, showDiceMenu, showSaveMenu]);


  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleSubmitAction = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!actionInput.trim() || loading) return;

    const action = actionInput.trim();
    setActionInput('');
    setLoading(true);

    // Add user action to messages
    addMessage('action', action);

    try {
      if (socketRef.current?.connected) {
        setConnectionStatus('connected');
        socketRef.current.emit('game:action', {
          campaignId,
          action,
          characterId,
        });
      } else {
        const response = await apiClient.post(`/dm/narrative`, {
          campaignId,
          action,
        });
        const result = response.data?.data ?? response.data;
        addMessage('narrative', result.narrative);
        if (result.inventoryChanges) {
          applyInventoryChanges(result.inventoryChanges);
        }
        fetchWorldEntities();
      }
    } catch (error: any) {
      addMessage('system', error.response?.data?.message || 'Failed to get response from DM');
    } finally {
      setLoading(false);
    }
  };

  const startAdventure = async () => {
    // Ensure audio gets unlocked on first meaningful user action
    unlockAudio();
    setLoading(true);
    try {
      if (socketRef.current?.connected) {
        setConnectionStatus('connected');
        socketRef.current.emit('game:action', {
          campaignId,
          action: 'Start the adventure',
          characterId,
        });
      } else {
        const response = await apiClient.post(`/dm/narrative`, {
          campaignId,
          action: 'Start the adventure',
        });
        const narrative = response.data?.data?.narrative ?? response.data?.narrative;
        addMessage('narrative', narrative);
        // Inventory updates now handled by backend tool calling
      }
    } catch (error: any) {
      addMessage('system', error.response?.data?.message || 'Failed to start adventure');
    } finally {
      setLoading(false);
    }
  };

  return (
    <>
      <style>{`
        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }
      `}</style>
      <div style={{ display: 'flex', flexDirection: 'column', height: '100vh' }}>
      {/* Header */}
      <header style={{
        background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
        color: 'white',
        padding: '1rem 2rem',
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center'
      }}>
        <div>
          <button
            onClick={() => navigate(`/campaigns/${campaignId}/characters`)}
            style={{
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: '1px solid white',
              borderRadius: '4px',
              padding: '0.5rem 1rem',
              cursor: 'pointer',
              marginRight: '1rem'
            }}
          >
            ← Exit Game
          </button>
          <span style={{ fontSize: '1.25rem', fontWeight: 'bold' }}>AI Dungeon Master</span>
        </div>
        <div style={{ display: 'inline-flex', alignItems: 'center', gap: '0.75rem' }}>
          <button onClick={logout} style={{
            padding: '0.55rem 1.15rem',
            background: 'rgba(255,255,255,0.22)',
            color: 'white',
            border: '1px solid rgba(255,255,255,0.6)',
            borderRadius: '6px',
            cursor: 'pointer',
            fontWeight: 600
          }}>
            Logout
          </button>
          {/* Narration dropdown */}
          <div style={{ position: 'relative' }} ref={narrationMenuRef}>
            <button
              aria-label="Narration audio controls"
              title="Narration audio controls"
              onClick={() => {
                setShowNarrationMenu((v) => !v);
                setShowAmbienceMenu(false);
                setShowDiceMenu(false);
                setShowSaveMenu(false);
              }}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.55)',
                background: 'rgba(255,255,255,0.22)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '1.15rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)'
              }}
            >🗣️</button>
            {showNarrationMenu && (
              <div style={{
                position: 'absolute',
                right: 0,
                marginTop: '0.65rem',
                minWidth: '280px',
                background: '#0f172a',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '10px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
                padding: '0.9rem',
                zIndex: 30
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.6rem' }}>
                  <span style={{ fontWeight: 700 }}>Narrator Voice</span>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={ttsEnabled}
                      onChange={(e) => {
                        const enabled = e.target.checked;
                        setTtsEnabled(enabled);
                        ttsEnabledRef.current = enabled;
                        if (enabled) {
                          unlockAudio();
                          if (lastAudioUrl) playAudio(lastAudioUrl);
                        } else {
                          pauseAudio();
                        }
                      }}
                    />
                    <span>On</span>
                  </label>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.8rem' }}>
                  <button
                    onClick={() => {
                      if (!lastAudioUrl) return;
                      if (isPlaying) pauseAudio(); else playAudio(lastAudioUrl);
                    }}
                    disabled={!lastAudioUrl}
                    style={{
                      flex: 1,
                      padding: '0.5rem 0.65rem',
                      borderRadius: '7px',
                      border: '1px solid rgba(255,255,255,0.22)',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      cursor: lastAudioUrl ? 'pointer' : 'not-allowed'
                    }}
                  >{isPlaying ? 'Pause' : 'Play'}</button>
                  <button
                    onClick={() => { if (lastAudioUrl) { stopAudio(); playAudio(lastAudioUrl); } }}
                    disabled={!lastAudioUrl}
                    style={{
                      padding: '0.5rem 0.65rem',
                      borderRadius: '7px',
                      border: '1px solid rgba(255,255,255,0.22)',
                      background: 'rgba(255,255,255,0.1)',
                      color: 'white',
                      cursor: lastAudioUrl ? 'pointer' : 'not-allowed'
                    }}
                  >Replay</button>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <input
                    type="range"
                    min={0}
                    max={Math.max(1, Math.floor(audioDuration))}
                    value={Math.floor(audioCurrent)}
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setAudioCurrent(v);
                      if (audioRef.current) audioRef.current.currentTime = v;
                    }}
                    style={{ flex: 1 }}
                  />
                  <span style={{ fontVariantNumeric: 'tabular-nums', fontSize: '0.9rem', color: '#cbd5f5' }}>
                    {new Date(Math.floor(audioCurrent) * 1000).toISOString().substr(14, 5)} / {new Date(Math.floor(audioDuration) * 1000).toISOString().substr(14, 5)}
                  </span>
                </div>
              </div>
            )}
          </div>

          {/* Ambience dropdown */}
          <div style={{ position: 'relative' }} ref={ambienceMenuRef}>
            <button
              aria-label="Ambience and music controls"
              title="Ambience and music controls"
              onClick={() => {
                setShowAmbienceMenu((v) => !v);
                setShowNarrationMenu(false);
                setShowDiceMenu(false);
                setShowSaveMenu(false);
              }}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.55)',
                background: 'rgba(255,255,255,0.22)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '1.15rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)'
              }}
            >🎵</button>
            {showAmbienceMenu && (
              <div style={{
                position: 'absolute',
                right: 0,
                marginTop: '0.65rem',
                minWidth: '260px',
                background: '#0f172a',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '10px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
                padding: '0.9rem',
                zIndex: 30
              }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ fontWeight: 700 }}>Background Music</span>
                  <label style={{ display: 'inline-flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.9rem' }}>
                    <input
                      type="checkbox"
                      checked={ambienceOn}
                      onChange={(e) => {
                        const on = e.target.checked;
                        setAmbienceOn(on);
                        if (on && ambienceUrl) {
                          unlockAudio();
                          playAmbience(ambienceUrl);
                        } else {
                          pauseAmbience();
                        }
                      }}
                    />
                    <span>On</span>
                  </label>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
                  <span style={{ color: 'rgba(255,255,255,0.85)', fontSize: '0.95rem', whiteSpace: 'nowrap' }}>Volume</span>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.05}
                    value={ambienceVolume}
                    onChange={(e) => setAmbienceVolume(Number(e.target.value))}
                    style={{ flex: 1 }}
                  />
                </div>
                {ambienceUrl && (
                  <div style={{ marginTop: '0.85rem', display: 'flex', gap: '0.55rem' }}>
                    <button
                      onClick={() => playAmbience(ambienceUrl)}
                      style={{
                        flex: 1,
                        padding: '0.5rem 0.65rem',
                        borderRadius: '7px',
                        border: '1px solid rgba(255,255,255,0.22)',
                        background: 'rgba(255,255,255,0.1)',
                        color: 'white',
                        cursor: 'pointer'
                      }}
                    >Play</button>
                    <button
                      onClick={() => pauseAmbience()}
                      style={{
                        padding: '0.5rem 0.65rem',
                        borderRadius: '7px',
                        border: '1px solid rgba(255,255,255,0.22)',
                        background: 'rgba(255,255,255,0.1)',
                        color: 'white',
                        cursor: 'pointer'
                      }}
                    >Pause</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Dice roller dropdown */}
          <div style={{ position: 'relative' }} ref={diceMenuRef}>
            <button
              aria-label="Dice roller"
              title="Dice roller"
              onClick={() => {
                setShowDiceMenu((v) => !v);
                setShowNarrationMenu(false);
                setShowAmbienceMenu(false);
                setShowSaveMenu(false);
              }}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.55)',
                background: 'rgba(255,255,255,0.22)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '1.15rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)'
              }}
            >🎲</button>
            {showDiceMenu && (
              <div style={{
                position: 'absolute',
                right: 0,
                marginTop: '0.65rem',
                minWidth: '320px',
                background: '#0f172a',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '10px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
                padding: '0.75rem',
                zIndex: 30
              }}>
                <DiceRoller
                  forceExpanded
                  hideHeader
                  onRoll={(rollText) => {
                    setActionInput((prev) => {
                      const separator = prev.trim() ? ' ' : '';
                      return `${prev}${separator}${rollText}`;
                    });
                  }}
                />
              </div>
            )}
          </div>

          {/* Save states dropdown */}
          <div style={{ position: 'relative' }} ref={saveMenuRef}>
            <button
              aria-label="Save/Load game"
              title="Save/Load game"
              onClick={() => {
                setShowSaveMenu((v) => !v);
                setShowNarrationMenu(false);
                setShowAmbienceMenu(false);
                setShowDiceMenu(false);
              }}
              style={{
                width: '44px',
                height: '44px',
                borderRadius: '10px',
                border: '1px solid rgba(255,255,255,0.55)',
                background: 'rgba(255,255,255,0.22)',
                color: '#fff',
                cursor: 'pointer',
                fontSize: '1.15rem',
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                boxShadow: '0 4px 14px rgba(0,0,0,0.25)'
              }}
            >💾</button>
            {showSaveMenu && (
              <div style={{
                position: 'absolute',
                right: 0,
                marginTop: '0.65rem',
                minWidth: '320px',
                maxWidth: '420px',
                background: '#0f172a',
                color: 'white',
                border: '1px solid rgba(255,255,255,0.18)',
                borderRadius: '10px',
                boxShadow: '0 16px 40px rgba(0,0,0,0.35)',
                padding: '0.9rem',
                zIndex: 30,
                maxHeight: '480px',
                overflowY: 'auto'
              }}>
                <div style={{ fontWeight: 700, marginBottom: '0.75rem' }}>Save/Load Game</div>
                
                {/* Create new save */}
                <div style={{ marginBottom: '1rem' }}>
                  <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '0.5rem' }}>
                    <input
                      type="text"
                      placeholder="Save name..."
                      value={saveName}
                      onChange={(e) => setSaveName(e.target.value)}
                      style={{
                        flex: 1,
                        padding: '0.5rem 0.65rem',
                        borderRadius: '7px',
                        border: '1px solid rgba(255,255,255,0.22)',
                        background: 'rgba(255,255,255,0.08)',
                        color: 'white',
                        fontSize: '0.9rem'
                      }}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && !loadingSave) createSaveState();
                      }}
                    />
                    <button
                      onClick={createSaveState}
                      disabled={!saveName.trim() || loadingSave}
                      style={{
                        padding: '0.5rem 0.8rem',
                        borderRadius: '7px',
                        border: '1px solid rgba(255,255,255,0.22)',
                        background: saveName.trim() && !loadingSave ? 'rgba(16, 185, 129, 0.3)' : 'rgba(255,255,255,0.08)',
                        color: 'white',
                        cursor: saveName.trim() && !loadingSave ? 'pointer' : 'not-allowed',
                        fontSize: '0.9rem',
                        whiteSpace: 'nowrap'
                      }}
                    >
                      {loadingSave ? 'Saving...' : 'Save'}
                    </button>
                  </div>
                </div>

                {/* Existing saves list */}
                <div style={{ 
                  maxHeight: '300px',
                  overflowY: 'auto',
                  borderTop: '1px solid rgba(255,255,255,0.1)',
                  paddingTop: '0.75rem'
                }}>
                  {saveStates.length === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: '0.9rem', padding: '0.5rem' }}>
                      No saves yet
                    </div>
                  ) : (
                    saveStates.map((save) => (
                      <div
                        key={save.id}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.65rem',
                          marginBottom: '0.5rem',
                          background: 'rgba(255,255,255,0.08)',
                          borderRadius: '6px',
                          border: '1px solid rgba(255,255,255,0.12)'
                        }}
                      >
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div style={{ fontWeight: 600, fontSize: '0.95rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {save.name}
                          </div>
                          <div style={{ fontSize: '0.8rem', color: 'rgba(255,255,255,0.6)' }}>
                            {new Date(save.created_at).toLocaleString()}
                          </div>
                        </div>
                        <button
                          onClick={() => loadSaveState(save.id)}
                          disabled={loadingSave}
                          style={{
                            padding: '0.4rem 0.6rem',
                            borderRadius: '5px',
                            border: '1px solid rgba(255,255,255,0.22)',
                            background: 'rgba(59, 130, 246, 0.2)',
                            color: '#93c5fd',
                            cursor: 'pointer',
                            fontSize: '0.8rem',
                            whiteSpace: 'nowrap'
                          }}
                        >
                          Load
                        </button>
                        <button
                          onClick={() => deleteSaveState(save.id)}
                          disabled={loadingSave}
                          style={{
                            padding: '0.4rem 0.6rem',
                            borderRadius: '5px',
                            border: '1px solid rgba(255,255,255,0.22)',
                            background: 'rgba(239, 68, 68, 0.15)',
                            color: '#fca5a5',
                            cursor: 'pointer',
                            fontSize: '0.8rem'
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      </header>

      {/* Status bar */}
      <div style={{
        padding: '0.5rem 1rem',
        background: '#111827',
        color: '#e5e7eb',
        display: 'flex',
        alignItems: 'center',
        gap: '0.75rem',
        fontSize: '0.9rem'
      }}>
        <style>{`@keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }`}</style>
        <div style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: '0.5rem',
          padding: '0.35rem 0.6rem',
          borderRadius: '999px',
          background: '#1f2937',
          border: '1px solid #374151',
        }}>
          <span style={{
            width: '10px',
            height: '10px',
            borderRadius: '999px',
            background:
              connectionStatus === 'connected' ? '#10b981' :
              connectionStatus === 'reconnecting' ? '#f59e0b' :
              '#ef4444'
          }} />
          <span>{
            connectionStatus === 'connected' ? 'Connected' :
            connectionStatus === 'reconnecting' ? 'Reconnecting…' :
            connectionStatus === 'connecting' ? 'Connecting…' :
            'Disconnected'
          }</span>
        </div>

        {loading && (
          <div style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '0.5rem',
            padding: '0.35rem 0.6rem',
            borderRadius: '999px',
            background: '#312e81',
            border: '1px solid #4338ca',
            color: '#e0e7ff'
          }}>
            <span className="spinner" style={{
              width: '12px',
              height: '12px',
              border: '2px solid #a5b4fc',
              borderTopColor: 'transparent',
              borderRadius: '50%',
              display: 'inline-block',
              animation: 'spin 1s linear infinite'
            }} />
            <span>DM is thinking…</span>
          </div>
        )}
      </div>

      {/* Main Game Area */}
      <div style={{ display: 'flex', flex: 1, overflow: 'hidden' }}>
        {/* Narrative Panel */}
        <div style={{ flex: 1, display: 'flex', flexDirection: 'column', background: '#f5f5f5' }}>
          {/* Messages Area */}
          <div style={{
            flex: 1,
            overflowY: 'auto',
            padding: '1.5rem',
            background: 'linear-gradient(to bottom, #1a1a2e 0%, #16213e 100%)'
          }}>
            {messages.length === 0 ? (
              <div style={{ 
                textAlign: 'center', 
                padding: '3rem',
                color: '#888'
              }}>
                <h2 style={{ color: '#fff', marginBottom: '1rem' }}>Welcome, {character?.name}!</h2>
                <p style={{ marginBottom: '1.5rem', color: '#aaa' }}>
                  Your adventure awaits. Click "Start Adventure" to begin your journey.
                </p>
                <button
                  onClick={startAdventure}
                  disabled={loading}
                  style={{
                    padding: '1rem 2rem',
                    background: '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '8px',
                    fontSize: '1.1rem',
                    fontWeight: 'bold',
                    cursor: loading ? 'not-allowed' : 'pointer',
                    opacity: loading ? 0.7 : 1
                  }}
                >
                  {loading ? 'Starting...' : 'Start Adventure'}
                </button>
              </div>
            ) : (
              <>
                {messages.map((message) => (
                  <div
                    key={message.id}
                    style={{
                      marginBottom: '1.5rem',
                      padding: '1rem',
                      borderRadius: '8px',
                      background: message.type === 'narrative' 
                        ? 'rgba(102, 126, 234, 0.1)' 
                        : message.type === 'action'
                        ? 'rgba(76, 175, 80, 0.1)'
                        : 'rgba(255, 152, 0, 0.1)',
                      border: `1px solid ${
                        message.type === 'narrative' 
                          ? 'rgba(102, 126, 234, 0.3)' 
                          : message.type === 'action'
                          ? 'rgba(76, 175, 80, 0.3)'
                          : 'rgba(255, 152, 0, 0.3)'
                      }`,
                    }}
                  >
                    <div style={{
                      position: 'relative',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      marginBottom: '0.5rem',
                      minHeight: '32px'
                    }}>
                      <div style={{
                        fontSize: '0.85rem',
                        color: message.type === 'narrative' 
                          ? '#667eea' 
                          : message.type === 'action'
                          ? '#4caf50'
                          : '#ff9800',
                        fontWeight: 'bold',
                        textTransform: 'uppercase',
                        textAlign: 'center',
                        flex: 1
                      }}>
                        {message.type === 'narrative' ? '🎭 Dungeon Master' : message.type === 'action' ? '⚔️ Your Action' : '⚠️ System'}
                      </div>
                      <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                        {message.type === 'narrative' && !message.audioUrl && (
                          <div style={{ fontSize: '0.75rem', color: '#ffb74d', display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                            <span style={{ animation: 'spin 1s linear infinite' }}>⏳</span> Generating audio...
                          </div>
                        )}
                        {message.audioUrl && (
                          <button
                            onClick={() => {
                              const url = resolveAudioUrl(message.audioUrl!);
                              setLastAudioUrl(url);
                              playAudio(url);
                            }}
                            style={{
                              padding: '0.3rem 0.65rem',
                              borderRadius: '4px',
                              border: '1px solid rgba(255,255,255,0.3)',
                              background: 'rgba(255,255,255,0.12)',
                              color: 'white',
                              cursor: 'pointer',
                              fontSize: '0.8rem'
                            }}
                          >▶ Play Clip</button>
                        )}
                      </div>
                    </div>
                    <div style={{ 
                      color: '#e0e0e0',
                      lineHeight: '1.6',
                      whiteSpace: 'pre-wrap'
                    }}>
                      <ReactMarkdown
                        components={{
                          // Helper function to extract text from children
                          // Style markdown elements to match our theme
                          p: ({node, children, ...props}) => {
                            const childText = extractText(children);
                            return (
                              <p style={{ margin: '0.5rem 0' }} {...props}>
                                {childText ? <HighlightedText text={childText} entities={worldEntities} /> : children}
                              </p>
                            );
                          },
                          strong: ({node, children, ...props}) => {
                            const childText = extractText(children);
                            return (
                              <strong style={{ color: '#ffd700', fontWeight: 'bold' }} {...props}>
                                {childText ? <HighlightedText text={childText} entities={worldEntities} /> : children}
                              </strong>
                            );
                          },
                          em: ({node, children, ...props}) => {
                            const childText = extractText(children);
                            return (
                              <em style={{ color: '#87ceeb', fontStyle: 'italic' }} {...props}>
                                {childText ? <HighlightedText text={childText} entities={worldEntities} /> : children}
                              </em>
                            );
                          },
                          code: ({node, ...props}) => <code style={{ background: 'rgba(255,215,0,0.1)', padding: '0.2rem 0.4rem', borderRadius: '3px', color: '#ffd700', fontFamily: 'monospace' }} {...props} />,
                          ul: ({node, ...props}) => <ul style={{ marginLeft: '1.5rem', marginTop: '0.5rem', marginBottom: '0.5rem' }} {...props} />,
                          ol: ({node, ...props}) => <ol style={{ marginLeft: '1.5rem', marginTop: '0.5rem', marginBottom: '0.5rem' }} {...props} />,
                          li: ({node, children, ...props}) => {
                            const childText = extractText(children);
                            return (
                              <li style={{ marginBottom: '0.25rem' }} {...props}>
                                {childText ? <HighlightedText text={childText} entities={worldEntities} /> : children}
                              </li>
                            );
                          },
                          blockquote: ({node, ...props}) => <blockquote style={{ borderLeft: '3px solid #667eea', paddingLeft: '1rem', marginLeft: '0', marginRight: '0', color: '#b0b0b0', fontStyle: 'italic' }} {...props} />,
                          h1: ({node, children, ...props}) => {
                            const childText = extractText(children);
                            return (
                              <h1 style={{ fontSize: '1.5rem', fontWeight: 'bold', marginTop: '0.5rem', marginBottom: '0.5rem', color: '#ffd700' }} {...props}>
                                {childText ? <HighlightedText text={childText} entities={worldEntities} /> : children}
                              </h1>
                            );
                          },
                          h2: ({node, children, ...props}) => {
                            const childText = extractText(children);
                            return (
                              <h2 style={{ fontSize: '1.25rem', fontWeight: 'bold', marginTop: '0.5rem', marginBottom: '0.5rem', color: '#ffd700' }} {...props}>
                                {childText ? <HighlightedText text={childText} entities={worldEntities} /> : children}
                              </h2>
                            );
                          },
                          h3: ({node, children, ...props}) => {
                            const childText = extractText(children);
                            return (
                              <h3 style={{ fontSize: '1.1rem', fontWeight: 'bold', marginTop: '0.5rem', marginBottom: '0.5rem', color: '#ffd700' }} {...props}>
                                {childText ? <HighlightedText text={childText} entities={worldEntities} /> : children}
                              </h3>
                            );
                          },
                          hr: ({node, ...props}) => <hr style={{ border: 'none', borderTop: '1px solid rgba(255,215,0,0.3)', margin: '1rem 0' }} {...props} />,
                        }}
                      >
                        {message.content}
                      </ReactMarkdown>
                    </div>
                  </div>
                ))}
                <div ref={messagesEndRef} />
              </>
            )}
          </div>

          {/* Action Input */}
          <div style={{
            padding: '1.5rem',
            background: '#1a1a2e',
            borderTop: '1px solid rgba(255,255,255,0.1)'
          }}>
            <form onSubmit={handleSubmitAction}>
              <div style={{ display: 'flex', gap: '1rem' }}>
                <input
                  type="text"
                  value={actionInput}
                  onChange={(e) => setActionInput(e.target.value)}
                  placeholder="What do you do? (e.g., 'I search the room for clues')"
                  disabled={loading}
                  style={{
                    flex: 1,
                    padding: '0.75rem',
                    border: '1px solid #444',
                    borderRadius: '4px',
                    fontSize: '1rem',
                    background: '#2a2a3e',
                    color: '#fff'
                  }}
                />
                <button
                  type="submit"
                  disabled={loading || !actionInput.trim()}
                  style={{
                    padding: '0.75rem 2rem',
                    background: loading || !actionInput.trim() ? '#555' : '#667eea',
                    color: 'white',
                    border: 'none',
                    borderRadius: '4px',
                    fontSize: '1rem',
                    fontWeight: 'bold',
                    cursor: loading || !actionInput.trim() ? 'not-allowed' : 'pointer'
                  }}
                >
                  {loading ? 'Sending...' : 'Send'}
                </button>
              </div>
              {!loading && (
                <div style={{ marginTop: '0.75rem', color: '#9ca3af', fontSize: '0.9rem' }}>
                  Tip: describe intent clearly; the DM responds faster if the socket stays connected.
                </div>
              )}
            </form>
          </div>
        </div>

        {/* Character Sidebar */}
        <div style={{
          width: '320px',
          background: 'white',
          padding: '1.5rem',
          borderLeft: '1px solid #ddd',
          overflowY: 'auto',
          color: '#111'
        }}>
          {/* Combat UI */}
          <CombatUI
            campaignId={campaignId}
            socket={socketRef.current}
            combatState={combatState}
            currentCharacter={character}
          />

          {/* Enemy Info Panel */}
          {enemyInfo && enemyInfo.length > 0 && (
            <div style={{
              marginTop: '1rem',
              marginBottom: '1.5rem',
              padding: '0.75rem',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              background: '#fff7ed'
            }}>
              <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#9a3412' }}>📚 Enemy Reference</div>
              <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#374151' }}>
                {enemyInfo.map((info, idx) => (
                  <li key={idx} style={{ marginBottom: '0.6rem' }}>
                    <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                      <span>{info.name}{info.challenge_rating ? <span style={{ color: '#6b7280', fontSize: '0.85rem' }}> (CR {info.challenge_rating})</span> : null}</span>
                      <button
                        onClick={() => setExpandedEnemies((prev) => ({ ...prev, [idx]: !prev[idx] }))}
                        style={{
                          background: expandedEnemies[idx] ? '#f59e0b' : '#10b981',
                          color: 'white',
                          border: 'none',
                          borderRadius: '4px',
                          padding: '0.25rem 0.5rem',
                          cursor: 'pointer',
                          fontSize: '0.8rem'
                        }}
                      >
                        {expandedEnemies[idx] ? 'Hide Details' : 'Show Details'}
                      </button>
                    </div>
                    <div style={{ fontSize: '0.9rem' }}>AC {info.armor_class ?? '—'} • HP {info.hit_points ?? '—'}{info.hit_dice ? ` (${info.hit_dice})` : ''}</div>
                    {!expandedEnemies[idx] && Array.isArray(info.actions) && info.actions.length > 0 && (
                      <div style={{ fontSize: '0.85rem', color: '#6b7280', marginTop: '0.25rem' }}>
                        Action: <strong>{info.actions[0].name}</strong> — {String(info.actions[0].desc || '').replace(/\s+/g, ' ').slice(0, 160)}{String(info.actions[0].desc || '').length > 160 ? '…' : ''}
                      </div>
                    )}
                    {expandedEnemies[idx] && (
                      <div style={{ marginTop: '0.4rem' }}>
                        {Array.isArray(info.actions) && info.actions.length > 0 && (
                          <div style={{ marginBottom: '0.35rem' }}>
                            <div style={{ fontWeight: 600, color: '#9a3412' }}>Actions</div>
                            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                              {info.actions.map((a: any, i: number) => (
                                <li key={i} style={{ marginBottom: '0.25rem' }}>
                                  <strong>{a.name}</strong> — {String(a.desc || '').replace(/\s+/g, ' ')}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {Array.isArray(info.special_abilities) && info.special_abilities.length > 0 && (
                          <div>
                            <div style={{ fontWeight: 600, color: '#9a3412' }}>Traits</div>
                            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                              {info.special_abilities.map((t: any, i: number) => (
                                <li key={i} style={{ marginBottom: '0.25rem' }}>
                                  <strong>{t.name}</strong> — {String(t.desc || '').replace(/\s+/g, ' ')}
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    )}
                  </li>
                ))}
              </ul>
            </div>
          )}
          
          {character && (
            <>
              <h3 style={{ marginBottom: '1rem', fontSize: '1.5rem', color: '#667eea' }}>
                {character.name}
              </h3>
              <div style={{ marginBottom: '1.5rem', display: 'grid', gridTemplateColumns: 'repeat(2, minmax(0, 1fr))', gap: '0.5rem' }}>
                <StatCard label="Race" value={character.race} />
                <StatCard label="Class" value={character.class} />
                <StatCard label="Level" value={character.level || 1} />
                <StatCard label="AC" value={character.armor_class ?? '—'} />
                <StatCard label="HP" value={character.hp !== undefined && character.max_hp !== undefined ? `${character.hp}/${character.max_hp}` : '—'} />
                <StatCard label="XP" value={character.experience ?? 0} />
              </div>

              {/* Money section */}
              <div style={{
                marginBottom: '1.5rem',
                padding: '0.75rem',
                background: '#fef3c7',
                border: '1px solid #fcd34d',
                borderRadius: '6px'
              }}>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#92400e' }}>💰 Gold</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <button
                    onClick={async () => {
                      const newMoney = Math.max(0, (character.money ?? 0) - 1);
                      await apiClient.put(`/characters/${characterId}`, { money: newMoney });
                      setCharacter((prev) => prev ? { ...prev, money: newMoney } : prev);
                    }}
                    style={{
                      background: '#f59e0b',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '0.35rem 0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    −
                  </button>
                  <div style={{ fontWeight: 700, color: '#92400e', flex: 1, textAlign: 'center' }}>{character.money ?? 0}</div>
                  <button
                    onClick={async () => {
                      const newMoney = (character.money ?? 0) + 1;
                      await apiClient.put(`/characters/${characterId}`, { money: newMoney });
                      setCharacter((prev) => prev ? { ...prev, money: newMoney } : prev);
                    }}
                    style={{
                      background: '#10b981',
                      color: 'white',
                      border: 'none',
                      borderRadius: '4px',
                      padding: '0.35rem 0.5rem',
                      cursor: 'pointer',
                      fontSize: '0.9rem'
                    }}
                  >
                    +
                  </button>
                </div>
              </div>

              {character.background && (
                <div style={{ 
                  padding: '0.75rem', 
                  background: '#f0f0f0', 
                  borderRadius: '4px',
                  marginBottom: '1rem'
                }}>
                  <strong>Background:</strong> {character.background}
                </div>
              )}

              {character.ability_scores && (
                <div style={{
                  marginBottom: '1.25rem',
                  padding: '0.75rem',
                  border: '1px solid #e5e7eb',
                  borderRadius: '6px'
                }}>
                  <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#374151' }}>Abilities</div>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, minmax(0, 1fr))', gap: '0.35rem' }}>
                    {Object.entries(character.ability_scores).map(([key, val]) => (
                      <div key={key} style={{
                        background: '#f9fafb',
                        border: '1px solid #e5e7eb',
                        borderRadius: '4px',
                        padding: '0.4rem',
                        textAlign: 'center',
                        fontSize: '0.9rem'
                      }}>
                        <div style={{ color: '#6b7280', fontWeight: 600 }}>{key.slice(0,3).toUpperCase()}</div>
                        <div style={{ fontWeight: 700, color: '#111827' }}>{val ?? '—'}</div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div style={{
                marginBottom: '1.5rem',
                padding: '0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                background: '#f9fafb'
              }}>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#374151' }}>Inventory</div>
                {character.inventory && character.inventory.length > 0 ? (
                  <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#374151' }}>
                    {character.inventory.map((item, idx) => {
                      const itemDisplay = typeof item === 'string' 
                        ? item 
                        : item.quantity > 1 
                          ? `${item.name} (${item.quantity})`
                          : item.name;
                      return (
                        <li key={idx} style={{ marginBottom: '0.35rem' }}>{itemDisplay}</li>
                      );
                    })}
                  </ul>
                ) : (
                  <div style={{ color: '#6b7280' }}>No items yet. Add loot as you play.</div>
                )}
              </div>

              {/* World Knowledge Panel */}
              <div style={{
                marginBottom: '1.5rem',
                padding: '0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                background: '#fefce8'
              }}>
                <div 
                  onClick={() => setShowWorldKnowledge(!showWorldKnowledge)}
                  style={{ 
                    fontWeight: 700, 
                    marginBottom: showWorldKnowledge ? '0.5rem' : 0, 
                    color: '#854d0e',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center'
                  }}
                >
                  <span>🗺️ Campaign Knowledge</span>
                  <span style={{ fontSize: '0.85rem' }}>{showWorldKnowledge ? '▼' : '▶'}</span>
                </div>
                {showWorldKnowledge && (
                  <div style={{ fontSize: '0.9rem', color: '#374151' }}>
                    {worldEntities.locations.length > 0 && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '0.25rem' }}>Locations:</div>
                        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                          {worldEntities.locations.map((loc) => (
                            <li 
                              key={loc.id} 
                              style={{ marginBottom: '0.2rem' }}
                              title={loc.description || 'No description available'}
                            >
                              <span style={{ cursor: loc.description ? 'help' : 'default', borderBottom: loc.description ? '1px dotted #9ca3af' : 'none' }}>
                                {loc.name}
                              </span>
                              {' '}<span style={{ color: '#6b7280', fontSize: '0.85rem' }}>({loc.type})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {worldEntities.npcs.length > 0 && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '0.25rem' }}>NPCs:</div>
                        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                          {worldEntities.npcs.map((npc) => (
                            <li 
                              key={npc.id} 
                              style={{ marginBottom: '0.2rem' }}
                              title={npc.description || 'No description available'}
                            >
                              <span style={{ cursor: npc.description ? 'help' : 'default', borderBottom: npc.description ? '1px dotted #9ca3af' : 'none' }}>
                                {npc.name}
                              </span>
                              {npc.role && <span style={{ color: '#6b7280', fontSize: '0.85rem' }}> ({npc.role})</span>}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {worldEntities.shops.length > 0 && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '0.25rem' }}>Shops:</div>
                        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                          {worldEntities.shops.map((shop) => (
                            <li 
                              key={shop.id} 
                              style={{ marginBottom: '0.2rem' }}
                              title={shop.description || 'No description available'}
                            >
                              <span style={{ cursor: shop.description ? 'help' : 'default', borderBottom: shop.description ? '1px dotted #9ca3af' : 'none' }}>
                                {shop.name}
                              </span>
                              {' '}<span style={{ color: '#6b7280', fontSize: '0.85rem' }}>({shop.type})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {worldEntities.items.length > 0 && (
                      <div style={{ marginBottom: '0.75rem' }}>
                        <div style={{ fontWeight: 600, color: '#92400e', marginBottom: '0.25rem' }}>Known Items:</div>
                        <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                          {worldEntities.items.map((item) => (
                            <li 
                              key={item.id} 
                              style={{ marginBottom: '0.2rem' }}
                              title={item.description || 'No description available'}
                            >
                              <span style={{ cursor: item.description ? 'help' : 'default', borderBottom: item.description ? '1px dotted #9ca3af' : 'none' }}>
                                {item.name}
                              </span>
                              {' '}<span style={{ color: '#6b7280', fontSize: '0.85rem' }}>({item.type})</span>
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {worldEntities.locations.length === 0 && 
                     worldEntities.npcs.length === 0 && 
                     worldEntities.shops.length === 0 && 
                     worldEntities.items.length === 0 && (
                      <div style={{ color: '#6b7280', fontStyle: 'italic' }}>
                        As you play, the DM will automatically track locations, NPCs, shops, and special items for campaign consistency.
                      </div>
                    )}
                  </div>
                )}
              </div>

              {/* Quests Panel */}
              <div style={{
                marginBottom: '1.5rem',
                padding: '0.75rem',
                border: '1px solid #e5e7eb',
                borderRadius: '6px',
                background: '#eef2ff'
              }}>
                <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#3730a3' }}>📜 Quests</div>
                {activeQuests.length > 0 ? (
                  <div style={{ marginBottom: '0.75rem' }}>
                    <div style={{ fontWeight: 600, color: '#4f46e5', marginBottom: '0.25rem' }}>Active</div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#374151' }}>
                      {activeQuests.map((q) => (
                        <li key={q.id} style={{ marginBottom: '0.4rem' }}>
                          <div style={{ fontWeight: 600 }}>{q.title}{q.giver ? <span style={{ color: '#6b7280', fontSize: '0.85rem' }}> (from {q.giver})</span> : null}</div>
                          {q.description && (
                            <div style={{ fontSize: '0.9rem' }}>{q.description}</div>
                          )}
                          {q.objectives && q.objectives.length > 0 && (
                            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Objectives: {q.objectives.join(', ')}</div>
                          )}
                          {q.rewards && (
                            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>Rewards: {q.rewards}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : (
                  <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No active quests yet.</div>
                )}
                {completedQuests.length > 0 && (
                  <div>
                    <div style={{ fontWeight: 600, color: '#4f46e5', marginBottom: '0.25rem' }}>Completed</div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem', color: '#374151' }}>
                      {completedQuests.map((q) => (
                        <li key={q.id} style={{ marginBottom: '0.4rem' }}>
                          <div style={{ fontWeight: 600 }}>{q.title}</div>
                          {q.notes && (
                            <div style={{ fontSize: '0.85rem', color: '#6b7280' }}>{q.notes}</div>
                          )}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
              
              <div style={{
                padding: '1rem',
                background: '#e8f4f8',
                borderRadius: '8px',
                border: '1px solid #b3e5fc'
              }}>
                <h4 style={{ marginBottom: '0.5rem', color: '#0277bd' }}>💡 Quick Tips</h4>
                <ul style={{ fontSize: '0.9rem', color: '#555', paddingLeft: '1.25rem' }}>
                  <li>Describe your actions clearly</li>
                  <li>Be creative with your choices</li>
                  <li>Ask questions to the DM</li>
                  <li>Roleplay your character</li>
                </ul>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
    </>
  );
}

// Simple stat card component for sidebar chips
function StatCard({ label, value }: { label: string; value: string | number }) {
  return (
    <div style={{
      padding: '0.75rem',
      background: '#f0f0f0',
      borderRadius: '4px',
      border: '1px solid #e5e7eb'
    }}>
      <div style={{ fontSize: '0.8rem', color: '#6b7280', textTransform: 'uppercase', letterSpacing: '0.02em' }}>{label}</div>
      <div style={{ fontWeight: 700, color: '#1f2937', marginTop: '0.25rem' }}>{value}</div>
    </div>
  );
}
