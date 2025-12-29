import React, { useState, useEffect } from 'react';
import api from '../services/api';

interface Spell {
  id: string;
  name: string;
  level: number;
  school?: string;
  casting_time?: string;
  range?: string;
  duration?: string;
  description?: string;
}

interface SpellSlot {
  id: string;
  spell_level: number;
  max_slots: number;
  remaining_slots: number;
}

interface Skill {
  id: string;
  name: string;
  ability_modifier?: string;
  proficiency_bonus: number;
  expertise: boolean;
  bonus: number;
  description?: string;
}

interface CharacterAbilitiesProps {
  characterId: string;
}

export function CharacterAbilities({ characterId }: CharacterAbilitiesProps) {
  const [spells, setSpells] = useState<Spell[]>([]);
  const [spellSlots, setSpellSlots] = useState<SpellSlot[]>([]);
  const [skills, setSkills] = useState<Skill[]>([]);
  const [activeTab, setActiveTab] = useState<'spells' | 'skills'>('spells');
  const [showAddSpell, setShowAddSpell] = useState(false);
  const [showAddSkill, setShowAddSkill] = useState(false);

  useEffect(() => {
    loadAbilities();
  }, [characterId]);

  const loadAbilities = async () => {
    try {
      const [spellsRes, slotsRes, skillsRes] = await Promise.all([
        api.get(`/characters/${characterId}/abilities/spells`),
        api.get(`/characters/${characterId}/abilities/spell-slots`),
        api.get(`/characters/${characterId}/abilities/skills`),
      ]);
      setSpells(spellsRes.data.data || []);
      setSpellSlots(slotsRes.data.data || []);
      setSkills(skillsRes.data.data || []);
    } catch (error) {
      console.error('Failed to load abilities:', error);
    }
  };

  const handleUseSpellSlot = async (level: number) => {
    try {
      await api.post(`/characters/${characterId}/abilities/spell-slots/${level}/use`);
      loadAbilities();
    } catch (error) {
      console.error('Failed to use spell slot:', error);
    }
  };

  const handleRestoreSpellSlots = async () => {
    try {
      await api.post(`/characters/${characterId}/abilities/spell-slots/restore`);
      loadAbilities();
    } catch (error) {
      console.error('Failed to restore spell slots:', error);
    }
  };

  const handleRemoveSpell = async (spellId: string) => {
    try {
      await api.delete(`/characters/${characterId}/abilities/spells/${spellId}`);
      loadAbilities();
    } catch (error) {
      console.error('Failed to remove spell:', error);
    }
  };

  return (
    <div style={{ padding: '1rem', backgroundColor: '#f9fafb', borderRadius: '0.5rem' }}>
      <div style={{ marginBottom: '1rem' }}>
        <h3 style={{ marginTop: 0, marginBottom: '0.75rem', color: '#1f2937' }}>Character Abilities</h3>
        
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem', borderBottom: '1px solid #e5e7eb' }}>
          <button
            onClick={() => setActiveTab('spells')}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              background: activeTab === 'spells' ? '#3b82f6' : '#d1d5db',
              color: activeTab === 'spells' ? 'white' : '#374151',
              cursor: 'pointer',
              borderRadius: '0.25rem 0.25rem 0 0',
              fontWeight: activeTab === 'spells' ? 600 : 400,
            }}
          >
            📚 Spells
          </button>
          <button
            onClick={() => setActiveTab('skills')}
            style={{
              padding: '0.5rem 1rem',
              border: 'none',
              background: activeTab === 'skills' ? '#3b82f6' : '#d1d5db',
              color: activeTab === 'skills' ? 'white' : '#374151',
              cursor: 'pointer',
              borderRadius: '0.25rem 0.25rem 0 0',
              fontWeight: activeTab === 'skills' ? 600 : 400,
            }}
          >
            🎯 Skills
          </button>
        </div>

        {activeTab === 'spells' && (
          <div>
            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#1f2937' }}>Spell Slots</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '0.5rem', marginBottom: '0.5rem' }}>
                {spellSlots.map((slot) => (
                  <div key={slot.id} style={{ padding: '0.5rem', backgroundColor: '#e0e7ff', borderRadius: '0.25rem' }}>
                    <div style={{ fontWeight: 500, color: '#1f2937' }}>Level {slot.spell_level}</div>
                    <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                      {slot.remaining_slots}/{slot.max_slots}
                    </div>
                    {slot.remaining_slots > 0 && (
                      <button
                        onClick={() => handleUseSpellSlot(slot.spell_level)}
                        style={{
                          marginTop: '0.25rem',
                          padding: '0.25rem 0.5rem',
                          fontSize: '0.75rem',
                          backgroundColor: '#f3f4f6',
                          border: '1px solid #d1d5db',
                          borderRadius: '0.25rem',
                          cursor: 'pointer',
                        }}
                      >
                        Use Slot
                      </button>
                    )}
                  </div>
                ))}
              </div>
              <button
                onClick={handleRestoreSpellSlots}
                style={{
                  padding: '0.5rem 1rem',
                  backgroundColor: '#10b981',
                  color: 'white',
                  border: 'none',
                  borderRadius: '0.25rem',
                  cursor: 'pointer',
                  fontSize: '0.875rem',
                }}
              >
                Restore All Slots
              </button>
            </div>

            <div style={{ marginBottom: '1rem' }}>
              <div style={{ fontWeight: 600, marginBottom: '0.5rem', color: '#1f2937' }}>Spells</div>
              <div style={{ maxHeight: '300px', overflowY: 'auto', marginBottom: '0.5rem' }}>
                {spells.length === 0 ? (
                  <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No spells yet</div>
                ) : (
                  <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                    {spells.map((spell) => (
                      <li
                        key={spell.id}
                        style={{
                          padding: '0.5rem',
                          backgroundColor: '#f3f4f6',
                          marginBottom: '0.25rem',
                          borderRadius: '0.25rem',
                          display: 'flex',
                          justifyContent: 'space-between',
                          alignItems: 'center',
                        }}
                      >
                        <div>
                          <div style={{ fontWeight: 500, color: '#1f2937' }}>
                            {spell.name}
                            {spell.level > 0 && <span style={{ fontSize: '0.75rem', color: '#6b7280' }}> (Level {spell.level})</span>}
                          </div>
                          {spell.description && (
                            <div style={{ fontSize: '0.75rem', color: '#6b7280' }} title={spell.description}>
                              {spell.description.substring(0, 50)}...
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleRemoveSpell(spell.id)}
                          style={{
                            padding: '0.25rem 0.5rem',
                            backgroundColor: '#ef4444',
                            color: 'white',
                            border: 'none',
                            borderRadius: '0.25rem',
                            cursor: 'pointer',
                            fontSize: '0.75rem',
                          }}
                        >
                          Remove
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        {activeTab === 'skills' && (
          <div>
            <div style={{ maxHeight: '400px', overflowY: 'auto', marginBottom: '0.5rem' }}>
              {skills.length === 0 ? (
                <div style={{ color: '#6b7280', fontStyle: 'italic' }}>No skills yet</div>
              ) : (
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {skills.map((skill) => {
                    const totalBonus = skill.proficiency_bonus + (skill.expertise ? skill.proficiency_bonus : 0) + skill.bonus;
                    return (
                      <li
                        key={skill.id}
                        style={{
                          padding: '0.75rem',
                          backgroundColor: '#f3f4f6',
                          marginBottom: '0.5rem',
                          borderRadius: '0.25rem',
                        }}
                      >
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                          <div>
                            <div style={{ fontWeight: 500, color: '#1f2937' }}>
                              {skill.name}
                              {skill.ability_modifier && (
                                <span style={{ fontSize: '0.875rem', color: '#6b7280' }}> ({skill.ability_modifier})</span>
                              )}
                            </div>
                            <div style={{ fontSize: '0.875rem', color: '#6b7280' }}>
                              {skill.expertise && '✓ Expertise • '}
                              Bonus: {totalBonus > 0 ? '+' : ''}{totalBonus}
                            </div>
                            {skill.description && (
                              <div style={{ fontSize: '0.75rem', color: '#6b7280' }}>{skill.description}</div>
                            )}
                          </div>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
