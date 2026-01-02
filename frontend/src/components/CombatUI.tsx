import { useState } from 'react';

type CombatantView = {
  id: string;
  name: string;
  hp: number;
  maxHp: number;
  ac: number;
  initiative: number;
  isPlayer: boolean;
};

export function CombatUI({
  campaignId,
  socket,
  combatState,
  currentCharacter,
}: {
  campaignId?: string;
  socket: any;
  combatState: {
    round: number;
    currentTurnIndex: number;
    turnOrder: CombatantView[];
  } | null;
  currentCharacter: {
    id: string;
    name: string;
    hp?: number;
    max_hp?: number;
    armor_class?: number;
    ability_scores?: { dexterity?: number };
  } | null;
}) {
  const [attackBonus, setAttackBonus] = useState(5);
  const [damageDice, setDamageDice] = useState('1d8+3');
  const [damageType, setDamageType] = useState<'piercing' | 'slashing' | 'bludgeoning' | 'fire' | 'cold' | 'lightning' | 'thunder' | 'acid' | 'poison' | 'radiant' | 'necrotic' | 'psychic' | 'force'>('piercing');
  const [advantage, setAdvantage] = useState(false);
  const [disadvantage, setDisadvantage] = useState(false);
  const [targetId, setTargetId] = useState<string | undefined>(undefined);

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
