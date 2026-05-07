import { useEffect } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { useDoctorChat } from '../contexts/DoctorChatContext';
import DoctorChatView from '../components/doctor/DoctorChatView';

export default function DoctorChat() {
  const { selectedChatId, setSelectedChatId, chatList } = useDoctorChat();
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as { sessionId?: string } | null;
  const sessionId = selectedChatId || state?.sessionId;

  // Sync context with navigation state if needed
  useEffect(() => {
    if (state?.sessionId && state.sessionId !== selectedChatId) {
      setSelectedChatId(state.sessionId);
    }
  }, [state?.sessionId, selectedChatId, setSelectedChatId]);

  const activeChat = chatList.find(c => c.id === sessionId);

  if (!sessionId) {
    return (
      <div style={{ 
        height: '100%', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'center',
        flexDirection: 'column',
        gap: 20,
        color: 'var(--text-secondary)'
      }}>
        <div style={{ fontSize: '4rem' }}>💬</div>
        <h2 style={{ fontSize: '1.5rem', fontWeight: 700 }}>Select a patient to start chatting</h2>
        <p style={{ opacity: 0.7 }}>Choose a conversation from the sidebar to begin.</p>
        <button 
          onClick={() => navigate('/doctor')}
          style={{
            marginTop: 10,
            background: 'transparent',
            border: '1px solid var(--border-subtle)',
            borderRadius: 99,
            padding: '8px 20px',
            color: 'var(--text-primary)',
            cursor: 'pointer'
          }}
        >
          Return to Dashboard
        </button>
      </div>
    );
  }

  return (
    <div style={{ height: 'calc(100vh - 64px)', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ 
        padding: '20px 30px', 
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(6,13,27,0.4)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexShrink: 0
      }}>
        <div>
          <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
            {activeChat?.patient_name ? `Conversation with ${activeChat.patient_name}` : 'Patient Conversation'}
          </h2>
          <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
            {activeChat?.specialty_name ? `🩺 ${activeChat.specialty_name}` : 'MediSense AI patient chat'}
          </p>
        </div>
        <button
          onClick={() => {
            setSelectedChatId(null);
            navigate('/doctor');
          }}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-muted)',
            cursor: 'pointer',
            fontSize: '0.9rem'
          }}
        >
          ✕ Close Chat
        </button>
      </div>
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <DoctorChatView sessionId={sessionId} />
      </div>
    </div>
  );
}

