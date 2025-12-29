import { Link } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';

export default function Home() {
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);

  return (
    <div style={{ 
      minHeight: '100vh',
      background: 'linear-gradient(135deg, #667eea 0%, #764ba2 100%)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      color: 'white',
      textAlign: 'center',
      padding: '2rem'
    }}>
      <h1 style={{ fontSize: '3rem', marginBottom: '1rem' }}>AI Dungeon Master</h1>
      <p style={{ fontSize: '1.25rem', marginBottom: '2rem', maxWidth: '600px' }}>
        Embark on epic adventures powered by AI. Create campaigns, develop characters, 
        and let our AI Dungeon Master guide you through unforgettable stories.
      </p>
      
      {isAuthenticated ? (
        <Link
          to="/campaigns"
          style={{
            padding: '1rem 2rem',
            background: 'white',
            color: '#667eea',
            textDecoration: 'none',
            borderRadius: '8px',
            fontSize: '1.1rem',
            fontWeight: 'bold',
            boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
          }}
        >
          Go to Campaigns
        </Link>
      ) : (
        <div style={{ display: 'flex', gap: '1rem' }}>
          <Link
            to="/login"
            style={{
              padding: '1rem 2rem',
              background: 'white',
              color: '#667eea',
              textDecoration: 'none',
              borderRadius: '8px',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}
          >
            Login
          </Link>
          <Link
            to="/register"
            style={{
              padding: '1rem 2rem',
              background: 'rgba(255,255,255,0.2)',
              color: 'white',
              textDecoration: 'none',
              borderRadius: '8px',
              fontSize: '1.1rem',
              fontWeight: 'bold',
              border: '2px solid white',
              boxShadow: '0 4px 6px rgba(0,0,0,0.1)'
            }}
          >
            Register
          </Link>
        </div>
      )}

      <div style={{ marginTop: '3rem', maxWidth: '800px' }}>
        <h2 style={{ fontSize: '1.5rem', marginBottom: '1rem' }}>Features</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '1rem', textAlign: 'left' }}>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>🎭 Create Campaigns</h3>
            <p style={{ fontSize: '0.9rem' }}>Build immersive worlds with custom settings and storylines</p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>⚔️ Develop Characters</h3>
            <p style={{ fontSize: '0.9rem' }}>Create unique heroes with detailed backstories and abilities</p>
          </div>
          <div style={{ background: 'rgba(255,255,255,0.1)', padding: '1rem', borderRadius: '8px' }}>
            <h3 style={{ marginBottom: '0.5rem' }}>🤖 AI Dungeon Master</h3>
            <p style={{ fontSize: '0.9rem' }}>Experience dynamic storytelling powered by advanced AI</p>
          </div>
        </div>
      </div>
    </div>
  );
}
