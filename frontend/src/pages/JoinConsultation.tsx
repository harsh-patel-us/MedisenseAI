import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { getRoomInfo } from '../api/consultationApi';

export default function JoinConsultation() {
  const navigate = useNavigate();
  const [roomId, setRoomId] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleJoin = async () => {
    const trimId = roomId.trim().toUpperCase();
    if (!trimId) { setError('Please enter a Room ID.'); return; }

    setLoading(true);
    setError('');
    try {
      await getRoomInfo(trimId);
      navigate(`/consultation/room/${trimId}?role=patient`);
    } catch (e: unknown) {
      const err = e as { response?: { status?: number } };
      if (err?.response?.status === 404) {
        setError('Room not found. Check the ID and try again.');
      } else {
        setError('Could not connect to the consultation server.');
      }
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center',
      padding: '40px 20px',
    }}>
      <div className="glass-card" style={{ maxWidth: 480, width: '100%', padding: '40px 36px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <p style={{ fontSize: '2.5rem', marginBottom: '12px' }}>🎥</p>
          <h1 style={{
            fontSize: '1.6rem', fontWeight: 800,
            background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent', marginBottom: '8px',
          }}>
            Join Consultation
          </h1>
          <p style={{ fontSize: '0.9rem', color: 'var(--text-secondary)' }}>
            Enter the Room ID shared by your doctor to join the video consultation.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          <div>
            <label style={{ fontSize: '0.8rem', fontWeight: 600, color: 'var(--text-secondary)', display: 'block', marginBottom: '6px' }}>
              Room ID *
            </label>
            <input
              type="text"
              value={roomId}
              onChange={e => setRoomId(e.target.value.toUpperCase())}
              onKeyDown={e => e.key === 'Enter' && handleJoin()}
              placeholder="e.g. AB12CD34"
              maxLength={8}
              style={{
                width: '100%', padding: '12px 14px', borderRadius: '10px',
                background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.12)',
                color: '#fff', fontSize: '1.1rem', letterSpacing: '3px', fontWeight: 700,
                boxSizing: 'border-box', fontFamily: 'monospace',
              }}
            />
          </div>

          {error && (
            <div style={{
              padding: '10px 14px', borderRadius: '8px',
              background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
              color: '#fca5a5', fontSize: '0.85rem',
            }}>
              ⚠ {error}
            </div>
          )}

          <button
            className="btn-primary"
            onClick={handleJoin}
            disabled={loading || !roomId.trim()}
            style={{ width: '100%', padding: '14px', fontSize: '1rem' }}
          >
            {loading ? (
              <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Verifying room...</>
            ) : (
              '🎥 Join Video Call'
            )}
          </button>

          <button
            className="btn-secondary"
            onClick={() => navigate('/')}
            style={{ width: '100%', padding: '12px', fontSize: '0.9rem' }}
          >
            ← Back to Home
          </button>
        </div>

        <p style={{
          marginTop: '24px', fontSize: '0.75rem', color: 'var(--text-muted)',
          textAlign: 'center', lineHeight: 1.5,
        }}>
          Your doctor will share the Room ID with you. The consultation is private and
          only accessible to the invited participants.
        </p>

        <div style={{
          marginTop: 20, paddingTop: 20,
          borderTop: '1px solid var(--border-subtle)',
          textAlign: 'center', fontSize: '0.82rem', color: 'var(--text-secondary)',
        }}>
          Don't have a Room ID yet?{' '}
          <Link to="/consultation/schedule" style={{ color: 'var(--brand-teal)', fontWeight: 600 }}>
            Schedule a consultation →
          </Link>
        </div>
      </div>
    </div>
  );
}
