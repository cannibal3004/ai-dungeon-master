import { useMemo, useState } from 'react';

type BattlefieldZone = {
  id: string;
  name: string;
  description?: string;
  adjacentTo?: string[];
  cover?: 'none' | 'light' | 'heavy';
  elevation?: 'low' | 'high';
  terrain?: 'normal' | 'difficult';
  hazards?: string;
  lighting?: string;
};

type BattlefieldState = {
  zones: BattlefieldZone[];
  positions: Record<string, string>;
  engagements: Array<{ a: string; b: string }>;
};

type CombatantView = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  ac: number;
  initiative: number;
  isPlayer: boolean;
  level?: number;
  quantity?: number;
  type?: 'player' | 'enemy';
};

type CombatState = {
  round: number;
  currentTurnIndex: number;
  turnOrder: CombatantView[];
  battlefield?: BattlefieldState;
};

export function CombatUI({
  campaignId,
  socket,
  combatState,
  currentCharacter,
  ttsEnabled,
}: {
  campaignId?: string;
  socket: any;
  combatState: CombatState | null;
  currentCharacter: {
    id: string;
    name: string;
    hp?: number;
    max_hp?: number;
    armor_class?: number;
    ability_scores?: { dexterity?: number };
  } | null;
  ttsEnabled?: boolean;
}) {
  const [attackBonus, setAttackBonus] = useState(5);
  const [damageDice, setDamageDice] = useState('1d8+3');
  const [damageType, setDamageType] = useState<'piercing' | 'slashing' | 'bludgeoning' | 'fire' | 'cold' | 'lightning' | 'thunder' | 'acid' | 'poison' | 'radiant' | 'necrotic' | 'psychic' | 'force'>('piercing');
  const [advantage, setAdvantage] = useState(false);
  const [disadvantage, setDisadvantage] = useState(false);
  const [targetId, setTargetId] = useState<string | undefined>(undefined);
  const [selectedZoneId, setSelectedZoneId] = useState<string>('');
  const [disengage, setDisengage] = useState(false);
  const [layoutZones, setLayoutZones] = useState('Frontline\nMidfield\nHigh Ground\nFlank');
  const [movementNote, setMovementNote] = useState('');

  const battlefield = combatState?.battlefield;
  const zoneMap = useMemo(() => {
    if (!battlefield?.zones) return new Map<string, BattlefieldZone>();
    return new Map(battlefield.zones.map((z) => [z.id, z]));
  }, [battlefield]);

  const zoneOccupants: Record<string, CombatantView[]> = useMemo(() => {
    const buckets: Record<string, CombatantView[]> = {};
    if (!battlefield || !combatState) return buckets;
    Object.entries(battlefield.positions || {}).forEach(([combatantId, zoneId]) => {
      const occupant = combatState.turnOrder.find((c) => c.id === combatantId);
      if (!occupant) return;
      if (!buckets[zoneId]) buckets[zoneId] = [];
      buckets[zoneId].push(occupant);
    });
    return buckets;
  }, [battlefield, combatState]);

  const currentZoneId = battlefield && currentCharacter ? battlefield.positions?.[currentCharacter.id] : undefined;
  const adjacentOptions = useMemo(() => {
    if (!battlefield) return [] as BattlefieldZone[];
    if (!currentZoneId) return battlefield.zones;
    const currentZone = zoneMap.get(currentZoneId);
    return battlefield.zones.filter((z) => {
      if (z.id === currentZoneId) return true;
      const fromAdj = Array.isArray(currentZone?.adjacentTo) && currentZone!.adjacentTo!.includes(z.id);
      const toAdj = Array.isArray(z.adjacentTo) && z.adjacentTo.includes(currentZoneId);
      return fromAdj || toAdj;
    });
  }, [battlefield, currentZoneId, zoneMap]);

  const nextTurn = () => {
    if (!socket || !campaignId) return;
    socket.emit('combat:next-turn', { campaignId });
  };

  const attack = () => {
    if (!socket || !campaignId || !combatState) return;
    const current = combatState.turnOrder[combatState.currentTurnIndex];
    if (!current) return;
    const tId = targetId || combatState.turnOrder.find(c => !c.isPlayer)?.id || combatState.turnOrder.find(c => c.id !== current.id)?.id;
    if (!tId) return;
    const target = combatState.turnOrder.find(c => c.id === tId);
    if (!target) return;

    socket.emit('combat:attack', {
      campaignId,
      attackerId: current.id,
      attackerName: current.name,
      targetId: target.id,
      targetName: target.name,
      attackBonus,
      targetAC: target.ac,
      damageDice,
      damageType,
      advantage,
      disadvantage,
    });
  };

  const emitActionToDM = (action: string) => {
    if (!socket || !campaignId) return;
    socket.emit('game:action', {
      campaignId,
      action,
      characterId: currentCharacter?.id,
      ttsEnabled,
    });
  };

  const requestMove = () => {
    if (!combatState || !currentCharacter || !selectedZoneId) return;
    const fromZone = currentZoneId ? zoneMap.get(currentZoneId)?.name || currentZoneId : 'unknown';
    const toZone = zoneMap.get(selectedZoneId)?.name || selectedZoneId;
    const note = movementNote.trim() ? ` Notes: ${movementNote.trim()}` : '';
    emitActionToDM(`Player requests move_combatant(combatantId="${currentCharacter.id}", toZoneId="${selectedZoneId}", disengage=${disengage}) before narrating. From ${fromZone} -> ${toZone}.${note}`);
  };

  const proposeBattlefield = () => {
    if (!campaignId) return;
    const names = layoutZones
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean);
    if (names.length === 0) return;

    const zones: BattlefieldZone[] = names.map((name, idx) => {
      const normalizedId = name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `zone-${idx + 1}`;
      const adjacencies: string[] = [];
      const prev = names[idx - 1];
      const next = names[idx + 1];
      if (prev) {
        const prevId = prev.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `zone-${idx}`;
        adjacencies.push(prevId);
      }
      if (next) {
        const nextId = next.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '') || `zone-${idx + 2}`;
        adjacencies.push(nextId);
      }
      return {
        id: normalizedId,
        name,
        adjacentTo: adjacencies,
      };
    });

    const players = (combatState?.turnOrder || []).filter((c) => c.isPlayer);
    const enemies = (combatState?.turnOrder || []).filter((c) => !c.isPlayer);
    const positions: Record<string, string> = {};
    if (zones.length > 0) {
      players.forEach((p) => {
        positions[p.id] = zones[0].id;
      });
      if (zones.length > 1) {
        enemies.forEach((e) => {
          positions[e.id] = zones[zones.length - 1].id;
        });
      }
    }

    const action = `Set battlefield using set_battlefield with zones=${JSON.stringify(zones)} positions=${JSON.stringify(positions)} before narrating combat.`;
    emitActionToDM(action);
  };

  return (
    <div style={{
      marginBottom: '1.5rem',
      padding: '0.75rem',
      border: '1px solid #e5e7eb',
      borderRadius: '6px',
      background: '#fff'
    }}>
      <div style={{ fontWeight: 700, marginBottom: '0.5rem', color: '#111827' }}>⚔️ Combat</div>
      {!combatState ? (
        <div style={{ color: '#6b7280' }}>
          No active combat. When the DM starts combat, turn order and enemies will appear here.
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '0.5rem' }}>
            <strong>Round:</strong> {combatState.round} &nbsp; &nbsp;
            <strong>Turn:</strong> {combatState.currentTurnIndex + 1} / {combatState.turnOrder.length}
          </div>
          <div style={{ marginBottom: '0.5rem', color: '#374151' }}>
            {(() => {
              const current = combatState.turnOrder[combatState.currentTurnIndex];
              const mine = currentCharacter && current && current.id === currentCharacter.id;
              return mine ? 'It\'s your turn.' : `Waiting for ${current?.name}...`;
            })()}
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Enemies</div>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {combatState.turnOrder.filter(c => !c.isPlayer).map((c) => (
                <li key={c.id} style={{ marginBottom: '0.4rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontWeight: 600 }}>{c.name}</span>
                    <span style={{ color: '#6b7280', fontSize: '0.85rem' }}>AC {c.ac}{typeof (c as any).level === 'number' ? ` • Lv ${(c as any).level}` : ''}</span>
                  </div>
                  <div style={{ height: '8px', background: '#e5e7eb', borderRadius: '4px', overflow: 'hidden' }}>
                    <div style={{ height: '8px', width: `${Math.max(0, Math.min(100, Math.round((c.hp / c.maxHp) * 100)))}%`, background: '#ef4444' }} />
                  </div>
                  <div style={{ color: '#6b7280', fontSize: '0.85rem' }}>HP {c.hp}/{c.maxHp}</div>
                </li>
              ))}
            </ul>
          </div>
          <div style={{ marginBottom: '0.75rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Turn Order</div>
            <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
              {combatState.turnOrder.map((c, idx) => (
                <li key={c.id} style={{ marginBottom: '0.25rem' }}>
                  <span style={{ fontWeight: combatState.currentTurnIndex === idx ? 700 : 500 }}>
                    {c.name} {c.isPlayer ? '(Player)' : '(Enemy)'} — HP {c.hp}/{c.maxHp}, AC {c.ac}, Init {c.initiative}
                  </span>
                </li>
              ))}
            </ul>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Attack</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
                <select value={targetId} onChange={e => setTargetId(e.target.value)} style={inputStyle}>
                  <option value="">Select target</option>
                  {combatState.turnOrder.filter(c => !c.isPlayer).map(c => (
                    <option key={c.id} value={c.id}>{c.name}</option>
                  ))}
                </select>
                <input type="number" value={attackBonus} onChange={e => setAttackBonus(parseInt(e.target.value))} placeholder="Attack Bonus" style={inputStyle}/>
                <input value={damageDice} onChange={e => setDamageDice(e.target.value)} placeholder="Damage Dice (e.g., 1d8+3)" style={inputStyle}/>
                <select value={damageType} onChange={e => setDamageType(e.target.value as any)} style={inputStyle}>
                  {['piercing','slashing','bludgeoning','fire','cold','lightning','thunder','acid','poison','radiant','necrotic','psychic','force'].map(dt => (
                    <option key={dt} value={dt}>{dt}</option>
                  ))}
                </select>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <input type="checkbox" checked={advantage} onChange={e => setAdvantage(e.target.checked)} /> Advantage
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                  <input type="checkbox" checked={disadvantage} onChange={e => setDisadvantage(e.target.checked)} /> Disadvantage
                </label>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                {(() => {
                  const current = combatState.turnOrder[combatState.currentTurnIndex];
                  const mine = currentCharacter && current && current.id === currentCharacter.id;
                  return (
                    <button onClick={attack} style={{ ...buttonPrimary, opacity: mine ? 1 : 0.6, cursor: mine ? 'pointer' : 'not-allowed' }} disabled={!mine}>
                      Attack
                    </button>
                  );
                })()}
              </div>
            </div>
            <div>
              <div style={{ fontWeight: 600, marginBottom: '0.25rem' }}>Turns</div>
              <button onClick={nextTurn} style={buttonSecondary}>Next Turn</button>
            </div>
          </div>

          <div style={{ marginTop: '1rem', paddingTop: '0.75rem', borderTop: '1px solid #e5e7eb' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.4rem' }}>Battlefield</div>
            {!battlefield ? (
              <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>
                No battlefield yet. You can propose a quick layout to the DM.
                <div style={{ marginTop: '0.6rem', display: 'grid', gap: '0.4rem' }}>
                  <textarea
                    value={layoutZones}
                    onChange={(e) => setLayoutZones(e.target.value)}
                    rows={3}
                    style={{ ...inputStyle, fontFamily: 'inherit', resize: 'vertical' }}
                  />
                  <button onClick={proposeBattlefield} style={buttonSecondary}>Propose Battlefield To DM</button>
                </div>
              </div>
            ) : (
              <div style={{ display: 'grid', gap: '0.5rem' }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.5rem' }}>
                  {battlefield.zones.map((zone) => (
                    <div key={zone.id} style={{ border: '1px solid #e5e7eb', borderRadius: '6px', padding: '0.6rem', background: '#f9fafb' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.35rem' }}>
                        <div>
                          <div style={{ fontWeight: 700 }}>{zone.name}</div>
                          {zone.description && <div style={{ color: '#6b7280', fontSize: '0.9rem' }}>{zone.description}</div>}
                        </div>
                        {currentZoneId === zone.id && (
                          <span style={{ padding: '0.2rem 0.5rem', background: '#d1fae5', color: '#065f46', borderRadius: '999px', fontSize: '0.85rem' }}>You</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', marginBottom: '0.35rem' }}>
                        {(zoneOccupants[zone.id] || []).map((occ) => (
                          <span key={occ.id} style={{ padding: '0.3rem 0.5rem', borderRadius: '6px', background: occ.isPlayer ? '#e0f2fe' : '#fee2e2', color: occ.isPlayer ? '#0369a1' : '#b91c1c', fontWeight: 600 }}>
                            {occ.name}{occ.quantity ? ` x${occ.quantity}` : ''}
                          </span>
                        ))}
                        {(zoneOccupants[zone.id] || []).length === 0 && (
                          <span style={{ color: '#9ca3af' }}>Empty</span>
                        )}
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem', fontSize: '0.85rem', color: '#374151' }}>
                        {zone.adjacentTo && zone.adjacentTo.length > 0 && (
                          <span>Adjacent: {zone.adjacentTo.map((zId) => zoneMap.get(zId)?.name || zId).join(', ')}</span>
                        )}
                        {zone.cover && <span>Cover: {zone.cover}</span>}
                        {zone.terrain && <span>Terrain: {zone.terrain}</span>}
                        {zone.hazards && <span>Hazards: {zone.hazards}</span>}
                        {zone.lighting && <span>Lighting: {zone.lighting}</span>}
                      </div>
                    </div>
                  ))}
                </div>

                <div style={{ padding: '0.6rem', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#fff' }}>
                  <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Move Request</div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: '0.4rem' }}>
                    <select
                      value={selectedZoneId}
                      onChange={(e) => setSelectedZoneId(e.target.value)}
                      style={inputStyle}
                    >
                      <option value="">Select zone</option>
                      {adjacentOptions.map((z) => (
                        <option key={z.id} value={z.id}>{z.name}</option>
                      ))}
                    </select>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.4rem' }}>
                      <input type="checkbox" checked={disengage} onChange={(e) => setDisengage(e.target.checked)} />
                      Disengage to break engagement
                    </label>
                    <input
                      value={movementNote}
                      onChange={(e) => setMovementNote(e.target.value)}
                      placeholder="Optional note for the DM"
                      style={inputStyle}
                    />
                    <button
                      onClick={requestMove}
                      style={{ ...buttonPrimary, opacity: selectedZoneId && currentCharacter ? 1 : 0.6, cursor: selectedZoneId && currentCharacter ? 'pointer' : 'not-allowed' }}
                      disabled={!selectedZoneId || !currentCharacter}
                    >
                      Request Move
                    </button>
                  </div>
                </div>

                {battlefield.engagements && battlefield.engagements.length > 0 && (
                  <div style={{ padding: '0.6rem', border: '1px solid #e5e7eb', borderRadius: '6px', background: '#fff' }}>
                    <div style={{ fontWeight: 600, marginBottom: '0.35rem' }}>Engagements</div>
                    <ul style={{ margin: 0, paddingLeft: '1.1rem' }}>
                      {battlefield.engagements.map((pair, idx) => {
                        const a = combatState.turnOrder.find((c) => c.id === pair.a)?.name || pair.a;
                        const b = combatState.turnOrder.find((c) => c.id === pair.b)?.name || pair.b;
                        return <li key={`${pair.a}-${pair.b}-${idx}`}>{a} ↔ {b}</li>;
                      })}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: '0.5rem',
  border: '1px solid #e5e7eb',
  borderRadius: '4px',
};

const buttonPrimary: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: '#667eea',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 700,
};

const buttonSecondary: React.CSSProperties = {
  padding: '0.5rem 1rem',
  background: '#111827',
  color: 'white',
  border: 'none',
  borderRadius: '4px',
  cursor: 'pointer',
  fontWeight: 700,
};
