import React, { useState } from 'react';
import { rollDice, formatRollResult } from '../utils/dice';
import type { DiceType, DiceRoll } from '../utils/dice';

interface DiceRollerProps {
  onRoll?: (rollText: string) => void;
  forceExpanded?: boolean;
  hideHeader?: boolean;
}

interface RollHistory {
  id: number;
  text: string;
  timestamp: Date;
}

export const DiceRoller: React.FC<DiceRollerProps> = ({ onRoll, forceExpanded, hideHeader }) => {
  const [count, setCount] = useState(1);
  const [modifier, setModifier] = useState(0);
  const [lastRoll, setLastRoll] = useState<DiceRoll | null>(null);
  const [history, setHistory] = useState<RollHistory[]>([]);
  const [isExpanded, setIsExpanded] = useState(forceExpanded ?? false);

  const expanded = forceExpanded ?? isExpanded;

  const diceTypes: DiceType[] = ['d4', 'd6', 'd8', 'd10', 'd12', 'd20', 'd100'];

  // Keep local expansion state in sync when the caller forces it
  React.useEffect(() => {
    if (forceExpanded !== undefined) {
      setIsExpanded(forceExpanded);
    }
  }, [forceExpanded]);

  const handleRoll = (dice: DiceType) => {
    const roll = rollDice(dice, count, modifier);
    setLastRoll(roll);
    
    const rollText = formatRollResult(roll, count);
    const historyEntry = {
      id: Date.now(),
      text: rollText,
      timestamp: new Date()
    };
    
    setHistory(prev => [historyEntry, ...prev].slice(0, 10)); // Keep last 10 rolls
    
    if (onRoll) {
      onRoll(rollText);
    }
  };

  const quickRoll = (dice: DiceType, quickCount: number = 1, quickMod: number = 0) => {
    const roll = rollDice(dice, quickCount, quickMod);
    setLastRoll(roll);
    
    const rollText = formatRollResult(roll, quickCount);
    const historyEntry = {
      id: Date.now(),
      text: rollText,
      timestamp: new Date()
    };
    
    setHistory(prev => [historyEntry, ...prev].slice(0, 10));
    
    if (onRoll) {
      onRoll(rollText);
    }
  };

  return (
    <div className="dice-roller">
      {!hideHeader && (
        <div className="dice-roller-header">
          <h3
            onClick={() => {
              if (forceExpanded === undefined) {
                setIsExpanded(!isExpanded);
              }
            }}
            style={{ cursor: forceExpanded === undefined ? 'pointer' : 'default' }}
          >
            🎲 Dice Roller {expanded ? '▼' : '▶'}
          </h3>
        </div>
      )}

      {expanded && (
        <>
          {/* Last Roll Display */}
          {lastRoll && (
            <div className="last-roll">
              <strong>Last Roll:</strong> {formatRollResult(lastRoll, count)}
            </div>
          )}

          {/* Quick Roll Buttons */}
          <div className="quick-rolls">
            <div className="quick-roll-label">Quick Rolls:</div>
            <button onClick={() => quickRoll('d20')} className="dice-btn quick">
              d20
            </button>
            <button onClick={() => quickRoll('d20', 1, 5)} className="dice-btn quick">
              d20+5
            </button>
            <button onClick={() => quickRoll('d6', 2)} className="dice-btn quick">
              2d6
            </button>
          </div>

          {/* Custom Roll Configuration */}
          <div className="custom-roll">
            <div className="roll-config">
              <div className="config-group">
                <label>Count:</label>
                <input
                  type="number"
                  min="1"
                  max="20"
                  value={count}
                  onChange={(e) => setCount(Math.max(1, parseInt(e.target.value) || 1))}
                />
              </div>
              <div className="config-group">
                <label>Modifier:</label>
                <input
                  type="number"
                  min="-10"
                  max="10"
                  value={modifier}
                  onChange={(e) => setModifier(parseInt(e.target.value) || 0)}
                />
              </div>
            </div>
            
            <div className="dice-buttons">
              {diceTypes.map(dice => (
                <button
                  key={dice}
                  onClick={() => handleRoll(dice)}
                  className="dice-btn"
                >
                  {count > 1 ? `${count}${dice}` : dice}
                  {modifier !== 0 && `${modifier > 0 ? '+' : ''}${modifier}`}
                </button>
              ))}
            </div>
          </div>

          {/* Roll History */}
          {history.length > 0 && (
            <div className="roll-history">
              <div className="history-header">Recent Rolls:</div>
              <div className="history-list">
                {history.map(roll => (
                  <div key={roll.id} className="history-item">
                    {roll.text}
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      )}

      <style>{`
        .dice-roller {
          background: #2a2a2a;
          border-radius: 8px;
          padding: 15px;
          margin-bottom: 20px;
        }

        .dice-roller-header h3 {
          margin: 0;
          color: #fff;
          user-select: none;
        }

        .last-roll {
          background: #1a1a1a;
          padding: 10px;
          border-radius: 4px;
          margin: 10px 0;
          color: #4ade80;
          font-size: 18px;
          text-align: center;
        }

        .quick-rolls {
          display: flex;
          gap: 8px;
          margin: 10px 0;
          flex-wrap: wrap;
          align-items: center;
        }

        .quick-roll-label {
          color: #aaa;
          font-size: 14px;
        }

        .custom-roll {
          margin-top: 15px;
        }

        .roll-config {
          display: flex;
          gap: 15px;
          margin-bottom: 10px;
        }

        .config-group {
          display: flex;
          align-items: center;
          gap: 8px;
        }

        .config-group label {
          color: #aaa;
          font-size: 14px;
        }

        .config-group input {
          width: 60px;
          padding: 5px;
          background: #1a1a1a;
          border: 1px solid #444;
          border-radius: 4px;
          color: #fff;
          text-align: center;
        }

        .dice-buttons {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(80px, 1fr));
          gap: 8px;
        }

        .dice-btn {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          border: none;
          padding: 10px;
          border-radius: 6px;
          cursor: pointer;
          font-weight: bold;
          font-size: 14px;
          transition: transform 0.1s, box-shadow 0.1s;
        }

        .dice-btn:hover {
          transform: translateY(-2px);
          box-shadow: 0 4px 8px rgba(0, 0, 0, 0.3);
        }

        .dice-btn:active {
          transform: translateY(0);
        }

        .dice-btn.quick {
          background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
          font-size: 13px;
          padding: 6px 12px;
        }

        .roll-history {
          margin-top: 15px;
          border-top: 1px solid #444;
          padding-top: 10px;
        }

        .history-header {
          color: #aaa;
          font-size: 14px;
          margin-bottom: 8px;
        }

        .history-list {
          max-height: 150px;
          overflow-y: auto;
        }

        .history-item {
          background: #1a1a1a;
          padding: 6px 10px;
          margin-bottom: 4px;
          border-radius: 4px;
          color: #ccc;
          font-size: 13px;
          font-family: monospace;
        }

        .history-list::-webkit-scrollbar {
          width: 6px;
        }

        .history-list::-webkit-scrollbar-track {
          background: #1a1a1a;
          border-radius: 3px;
        }

        .history-list::-webkit-scrollbar-thumb {
          background: #444;
          border-radius: 3px;
        }
      `}</style>
    </div>
  );
};
