import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiClient } from '../services/api';
import { useAuthStore } from '../stores/authStore';

interface Campaign {
  id: string;
  name: string;
  description: string;
  setting?: string;
  created_at?: string;
}

export default function Campaigns() {
  const navigate = useNavigate();
  const { user, logout } = useAuthStore();
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [showCreateForm, setShowCreateForm] = useState(false);
  const [newCampaign, setNewCampaign] = useState({
    name: '',
    description: '',
    setting: 'fantasy',
  });

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const fetchCampaigns = async () => {
    try {
      const response = await apiClient.get('/campaigns');
      const campaigns = response.data?.data?.campaigns ?? response.data?.campaigns ?? response.data;
      setCampaigns(Array.isArray(campaigns) ? campaigns : []);
    } catch (error) {
      console.error('Failed to fetch campaigns:', error);
      setCampaigns([]);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateCampaign = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await apiClient.post('/campaigns', {
        name: newCampaign.name,
        description: newCampaign.description,
        settings: { theme: newCampaign.setting },
      });
      setNewCampaign({ name: '', description: '', setting: 'fantasy' });
      setShowCreateForm(false);
      fetchCampaigns();
    } catch (error) {
      console.error('Failed to create campaign:', error);
    }
  };

  const selectCampaign = (campaignId: string) => {
    navigate(`/campaigns/${campaignId}/characters`);
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
        <h1 style={{ color: 'white' }}>AI Dungeon Master</h1>
        <div>
          <span style={{ marginRight: '1rem' }}>Welcome, {user?.username}!</span>
          <button
            onClick={logout}
            style={{
              padding: '0.5rem 1rem',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              border: '1px solid white',
              borderRadius: '4px',
              cursor: 'pointer'
            }}
          >
            Logout
          </button>
        </div>
      </header>

      <div style={{ maxWidth: '1200px', margin: '0 auto', padding: '2rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
          <h2 style={{ color: '#111' }}>Your Campaigns</h2>
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
            {showCreateForm ? 'Cancel' : 'Create Campaign'}
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
            <h3 style={{ marginBottom: '1rem', color: '#111' }}>Create New Campaign</h3>
            <form onSubmit={handleCreateCampaign}>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#111' }}>
                  Campaign Name
                </label>
                <input
                  type="text"
                  value={newCampaign.name}
                  onChange={(e) => setNewCampaign({ ...newCampaign, name: e.target.value })}
                  required
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#111' }}>
                  Description
                </label>
                <textarea
                  value={newCampaign.description}
                  onChange={(e) => setNewCampaign({ ...newCampaign, description: e.target.value })}
                  required
                  rows={3}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                />
              </div>
              <div style={{ marginBottom: '1rem' }}>
                <label style={{ display: 'block', marginBottom: '0.5rem', fontWeight: 'bold', color: '#111' }}>
                  Setting
                </label>
                <select
                  value={newCampaign.setting}
                  onChange={(e) => setNewCampaign({ ...newCampaign, setting: e.target.value })}
                  style={{
                    width: '100%',
                    padding: '0.5rem',
                    border: '1px solid #ddd',
                    borderRadius: '4px'
                  }}
                >
                  <option value="fantasy">Fantasy</option>
                  <option value="sci-fi">Sci-Fi</option>
                  <option value="horror">Horror</option>
                  <option value="modern">Modern</option>
                </select>
              </div>
              <button
                type="submit"
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
                Create
              </button>
            </form>
          </div>
        )}

        {loading ? (
          <div style={{ textAlign: 'center', padding: '2rem' }}>Loading campaigns...</div>
        ) : campaigns.length === 0 ? (
          <div style={{
            background: 'white',
            padding: '2rem',
            borderRadius: '8px',
            textAlign: 'center',
            boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
          }}>
            <p style={{ color: '#111' }}>No campaigns yet. Create your first campaign to begin your adventure!</p>
          </div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: '1.5rem' }}>
            {campaigns.map((campaign) => (
              <div
                key={campaign.id}
                onClick={() => selectCampaign(campaign.id)}
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
                <h3 style={{ marginBottom: '0.5rem', color: '#111' }}>{campaign.name}</h3>
                <p style={{ color: '#444', fontSize: '0.9rem', marginBottom: '0.5rem' }}>
                  {campaign.description}
                </p>
                <div style={{
                  display: 'inline-block',
                  padding: '0.25rem 0.75rem',
                  background: '#e0e7ff',
                  color: '#667eea',
                  borderRadius: '12px',
                  fontSize: '0.85rem',
                  marginTop: '0.5rem'
                }}>
                  {campaign.setting}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
