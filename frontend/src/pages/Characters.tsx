import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { apiClient } from '../services/api';
import { useAuthStore } from '../stores/authStore';

interface Character {
  id: string;
  campaign_id?: string;
  campaignId?: string;
  name: string;
  class: string;
  level: number;
  race: string;
  background: string;
}

export default function Characters() {
  const { campaignId } = useParams<{ campaignId: string }>();
  const navigate = useNavigate();
  const { logout } = useAuthStore();
  const [characters, setCharacters] = useState<Character[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [importUrl, setImportUrl] = useState('');
  const [importing, setImporting] = useState(false);
  const [importError, setImportError] = useState('');
  const [newCharacter, setNewCharacter] = useState({
    name: '',
    class: 'fighter',
    race: 'human',
    background: '',
  });

  useEffect(() => {
    fetchCharacters();
  }, [campaignId]);

  const fetchCharacters = async () => {
    try {
      const response = await apiClient.get(`/characters/my`);
      const chars = response.data?.data?.characters ?? response.data?.characters ?? response.data;
      const filtered = Array.isArray(chars)
        ? chars.filter((c) => (c.campaignId ?? c.campaign_id) === campaignId)
        : [];
      // Normalize to camelCase for rendering
      const normalized = filtered.map((c) => ({
        ...c,
        campaignId: c.campaignId ?? c.campaign_id,
      }));
      setCharacters(normalized as Character[]);
    } catch (error) {
      console.error('Failed to fetch characters:', error);
      setCharacters([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCharacter = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post(`/characters`, {
        campaignId,
        name: newCharacter.name,
        class: newCharacter.class,
        race: newCharacter.race,
        background: newCharacter.background,
      });
      setNewCharacter({ name: '', class: 'Fighter', race: 'Human', background: '' });
      setShowCreateForm(false);
      fetchCharacters();
    } catch (error) {
      console.error('Failed to create character:', error);
    }
  };

  const selectCharacter = async (characterId: string) => {
    try {
      // Start session for this campaign
      const sessionResponse = await apiClient.post(`/sessions/start`, {
        campaignId,
      });
      const sessionId = sessionResponse.data?.data?.session?.id ?? sessionResponse.data?.session?.id ?? sessionResponse.data?.id;

      // Navigate to game
      navigate(`/game/${campaignId}/${sessionId}/${characterId}`);
    } catch (error) {
      console.error('Failed to start session:', error);
    }
  };

  const classes = ['fighter', 'wizard', 'rogue', 'cleric', 'ranger', 'paladin', 'barbarian', 'bard', 'druid', 'warlock'];
  const races = ['human', 'elf', 'dwarf', 'halfling', 'dragonborn', 'gnome', 'half-elf', 'half-orc', 'tiefling'];

  const handleImport = async () => {
    if (!importUrl.trim()) {
      setImportError('Enter a D&D Beyond character URL.');
      return;
    }
    try {
      setImporting(true);
      setImportError('');
      await apiClient.post('/characters/import/ddb', {
        campaignId,
        url: importUrl.trim(),
      });
      setImportUrl('');
      await fetchCharacters();
    } catch (err: any) {
      console.error('Import failed', err);
      setImportError(err?.response?.data?.message || 'Import failed. Ensure the URL is correct and public.');
    } finally {
      setImporting(false);
    }
  };

  return (
    <div style={{ minHeight: '100vh', background: '#f5f5f5', color: '#111' }}>
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
            onClick={() => navigate('/campaigns')}
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
            ← Back to Campaigns
          </button>
          <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'white' }}>AI Dungeon Master</span>
        </div>
        <button onClick={logout} style={{
          padding: '0.5rem 1rem',
          background: 'rgba(255,255,255,0.2)',
          color: 'white',
          border: '1px solid white',
          borderRadius: '4px',
          cursor: 'pointer'
        }}>
          Logout
        </button>
      </header>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ color: '#111' }}>Select Your Character</h2>
          <button
            onClick={() => setShowCreateForm(!showCreateForm)}
            style={{
              padding: '0.75rem 1.5rem',
              background: '#667eea',
              color: 'white',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              fontWeight: 'bold'
            }}
          >
            {showCreateForm ? 'Cancel' : 'Create Character'}
          </button>
        </div>

        {showCreateForm && (
          <div style={{
            background: 'white',
            padding: '1.5rem',
            borderRadius: '8px',
            marginBottom: '2rem',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <h3 style={{ marginBottom: '1rem', color: '#111' }}>Create New Character</h3>
            <form onSubmit={handleCreateCharacter}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#111' }}>
                    Character Name
                  </label>
                  <input
                    type="text"
                    value={newCharacter.name}
                    onChange={(e) => setNewCharacter({ ...newCharacter, name: e.target.value })}
                    required
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#111' }}>
                    Class
                  </label>
                  <select
                    value={newCharacter.class}
                    onChange={(e) => setNewCharacter({ ...newCharacter, class: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  >
                    {classes.map((cls) => (
                      <option key={cls} value={cls}>{cls.charAt(0).toUpperCase() + cls.slice(1)}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#111' }}>
                    Race
                  </label>
                  <select
                    value={newCharacter.race}
                    onChange={(e) => setNewCharacter({ ...newCharacter, race: e.target.value })}
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  >
                    {races.map((race) => (
                      <option key={race} value={race}>
                        {race.charAt(0).toUpperCase() + race.slice(1)}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#111' }}>
                    Background
                  </label>
                  <input
                    type="text"
                    value={newCharacter.background}
                    onChange={(e) => setNewCharacter({ ...newCharacter, background: e.target.value })}
                    required
                    placeholder="e.g., Noble, Sage, Soldier"
                    style={{
                      width: '100%',
                      padding: '0.5rem',
                      border: '1px solid #ddd',
                      borderRadius: '4px'
                    }}
                  />
                </div>
              </div>
              <button
                type="submit"
                style={{
                  marginTop: '1rem',
                  padding: '0.75rem 1.5rem',
                  background: '#667eea',
                  color: 'white',
                  border: 'none',
                  borderRadius: '4px',
                  cursor: 'pointer',
                  fontWeight: 'bold'
                }}
              >
                Create Character
              </button>
            </form>
          </div>
        )}

        <div style={{
          background: 'white',
          padding: '1.5rem',
          borderRadius: '8px',
          marginBottom: '2rem',
          boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
        }}>
          <h3 style={{ marginBottom: '0.75rem', color: '#111' }}>Import from D&amp;D Beyond (URL)</h3>
          <p style={{ marginBottom: '0.75rem', color: '#333', fontSize: '0.95rem' }}>
            Paste a character URL like https://www.dndbeyond.com/characters/79230921. We'll fetch the JSON, create/update the character, and add combat/roleplay summaries.
          </p>
          <input
            type="url"
            value={importUrl}
            onChange={(e) => setImportUrl(e.target.value)}
            placeholder="https://www.dndbeyond.com/characters/1234567"
            style={{ width: '100%', padding: '0.75rem', border: '1px solid #ddd', borderRadius: '6px', fontSize: '0.95rem', marginBottom: '0.75rem' }}
          />
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.75rem' }}>
            <button
              type="button"
              onClick={handleImport}
              disabled={importing}
              style={{
                padding: '0.75rem 1.5rem',
                background: importing ? '#9aa5f4' : '#667eea',
                color: 'white',
                border: 'none',
                borderRadius: '6px',
                cursor: importing ? 'wait' : 'pointer',
                fontWeight: 'bold'
              }}
            >
              {importing ? 'Importing…' : 'Import Character'}
            </button>
            {importError && <span style={{ color: '#c53030' }}>{importError}</span>}
          </div>
          <small style={{ color: '#555' }}>We only store the stats we need; your D&amp;D Beyond link is not saved.</small>
        </div>

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>Loading characters...</div>
        ) : characters.length === 0 ? (
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '8px',
            textAlign: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <p style={{ color: '#111' }}>No characters yet for this campaign. Create your first character to begin your adventure!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '1.5rem' }}>
            {characters.map((character) => (
              <div
                key={character.id}
                onClick={() => selectCharacter(character.id)}
                style={{
                  background: 'white',
                  padding: '1.5rem',
                  borderRadius: '8px',
                  cursor: 'pointer',
                  boxShadow: '0 2px 4px rgba(0,0,0,0.1)',
                  transition: 'transform 0.2s, box-shadow 0.2s'
                }}
                onMouseOver={(e) => {
                  e.currentTarget.style.transform = 'translateY(-4px)';
                  e.currentTarget.style.boxShadow = '0 4px 8px rgba(0,0,0,0.15)';
                }}
                onMouseOut={(e) => {
                  e.currentTarget.style.transform = 'translateY(0)';
                  e.currentTarget.style.boxShadow = '0 2px 4px rgba(0,0,0,0.1)';
                }}
              >
                <h3 style={{ marginBottom: '0.75rem', fontSize: '1.25rem' }}>{character.name}</h3>
                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 'bold' }}>Race:</span> {character.race}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 'bold' }}>Class:</span> {character.class}
                </div>
                <div style={{ marginBottom: '0.5rem' }}>
                  <span style={{ fontWeight: 'bold' }}>Level:</span> {character.level || 1}
                </div>
                {character.background && (
                  <div style={{ 
                    marginTop: '0.75rem', 
                    padding: '0.5rem', 
                    background: '#f0f0f0', 
                    borderRadius: '4px',
                    fontSize: '0.9rem'
                  }}>
                    <strong>Background:</strong> {character.background}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
