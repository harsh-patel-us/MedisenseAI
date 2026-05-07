import { useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useDoctorChat } from '../../contexts/DoctorChatContext';

const TEAL = '#05aebb';

const SIDEBAR_LINKS: { to: string; label: string; icon: string }[] = [
  { to: '/doctor', label: 'Dashboard', icon: '🩺' },
  { to: '/consultation/schedule', label: 'Schedule a Call', icon: '📅' },
];

export default function DoctorSidebar() {
  const location = useLocation();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(true);
  const { chatList, selectedChatId, setSelectedChatId, chatListLoading } = useDoctorChat();

  return (
    <aside
      style={{
        width: expanded ? 280 : 80,
        flexShrink: 0,
        borderRight: '1px solid var(--border-subtle)',
        background: 'rgba(6,13,27,0.85)',
        padding: expanded ? '24px 16px' : '24px 8px',
        display: 'flex',
        flexDirection: 'column',
        gap: 8,
        minHeight: 'calc(100vh - 64px)',
        position: 'sticky',
        top: 64,
        transition: 'width 0.3s ease, padding 0.3s ease',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: expanded ? 'space-between' : 'center', marginBottom: 16 }}>
        {expanded && (
          <div
            style={{
              fontSize: '0.72rem',
              textTransform: 'uppercase',
              letterSpacing: '0.8px',
              color: 'var(--text-muted)',
              fontWeight: 800,
              paddingLeft: 12,
            }}
          >
            Doctor Workspace
          </div>
        )}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            background: 'transparent',
            border: 'none',
            color: 'var(--text-secondary)',
            cursor: 'pointer',
            fontSize: '1.2rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 4,
            borderRadius: 8,
          }}
          title={expanded ? "Collapse Sidebar" : "Expand Sidebar"}
        >
          {expanded ? '◀' : '▶'}
        </button>
      </div>
      
      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
        {SIDEBAR_LINKS.map((link) => {
          const active = location.pathname === link.to;
          return (
            <Link
              key={link.to}
              to={link.to}
              title={!expanded ? link.label : undefined}
              style={{
                textDecoration: 'none',
                padding: expanded ? '12px 16px' : '12px',
                borderRadius: 12,
                fontSize: '0.9rem',
                fontWeight: 600,
                color: active ? 'var(--brand-teal)' : 'var(--text-secondary)',
                background: active ? 'rgba(5,174,187,0.1)' : 'transparent',
                border: active
                  ? '1px solid rgba(5,174,187,0.25)'
                  : '1px solid transparent',
                display: 'flex',
                alignItems: 'center',
                justifyContent: expanded ? 'flex-start' : 'center',
                gap: 12,
                transition: 'all 0.2s ease',
              }}
            >
              <span style={{ 
                fontSize: '1.2rem',
                filter: active ? 'drop-shadow(0 0 8px var(--brand-teal))' : 'none'
              }}>{link.icon}</span>
              {expanded && <span>{link.label}</span>}
            </Link>
          );
        })}
      </div>

      {/* ── Patient Chats Section ── */}
      <div style={{ marginTop: 24, display: 'flex', flexDirection: 'column', gap: 12, flex: 1, minHeight: 0 }}>
        {expanded && (
          <div style={{
            fontSize: '0.72rem',
            textTransform: 'uppercase',
            letterSpacing: '0.8px',
            color: 'var(--text-muted)',
            fontWeight: 800,
            paddingLeft: 12,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <span>Patient Chats</span>
            {chatListLoading && <div className="spinner" style={{ width: 12, height: 12, borderWidth: 1.5 }} />}
          </div>
        )}

        <div style={{ 
          display: 'flex', 
          flexDirection: 'column', 
          gap: 4, 
          overflowY: 'auto',
          paddingRight: expanded ? 4 : 0,
        }}>
          {chatList.length === 0 && expanded && !chatListLoading && (
            <div style={{ padding: '12px 16px', fontSize: '0.75rem', color: 'var(--text-muted)', fontStyle: 'italic' }}>
              No active chats
            </div>
          )}

          {chatList.slice(0, 8).map((chat) => {
            const active = selectedChatId === chat.id;
            const isDoctorMode = chat.session_mode === 'doctor';

            return (
              <button
                key={chat.id}
                onClick={() => {
                  setSelectedChatId(chat.id);
                  navigate('/doctor/chat');
                }}
                title={!expanded ? `Chat with ${chat.patient_name}` : undefined}
                style={{
                  width: '100%',
                  textAlign: 'left',
                  background: active ? 'rgba(5,174,187,0.15)' : 'transparent',
                  border: 'none',
                  borderLeft: active ? `3px solid ${TEAL}` : '3px solid transparent',
                  padding: expanded ? '10px 12px' : '12px',
                  cursor: 'pointer',
                  borderRadius: 8,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 4,
                  transition: 'all 0.2s ease',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, justifyContent: expanded ? 'flex-start' : 'center' }}>
                  <div style={{ 
                    width: 32, height: 32, borderRadius: '50%', 
                    background: isDoctorMode ? TEAL : 'rgba(15,30,60,0.6)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '0.9rem', flexShrink: 0,
                    border: active ? `1px solid ${TEAL}` : '1px solid var(--border-subtle)'
                  }}>
                    {chat.patient_name.charAt(0)}
                  </div>
                  {expanded && (
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ 
                        fontSize: '0.82rem', fontWeight: 700, color: 'var(--text-primary)',
                        whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' 
                      }}>
                        {chat.patient_name}
                      </div>
                      <div style={{ fontSize: '0.65rem', color: isDoctorMode ? TEAL : 'var(--text-muted)', fontWeight: 600 }}>
                        {isDoctorMode ? 'Live with you' : 'MediSense AI'}
                      </div>
                    </div>
                  )}
                </div>
              </button>
            );
          })}
        </div>
      </div>

      <div style={{ marginTop: 'auto', padding: expanded ? '12px' : '0' }}>
        {expanded ? (
          <div className="glass-card" style={{ padding: '16px', fontSize: '0.8rem', background: 'rgba(5,174,187,0.05)' }}>
            <div style={{ fontWeight: 700, color: 'var(--brand-teal)', marginBottom: 4 }}>Need Help?</div>
            <div style={{ color: 'var(--text-muted)', lineHeight: 1.4 }}>
              Our support team is available 24/7 for technical assistance.
            </div>
          </div>
        ) : (
          <button
            style={{
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: 'var(--brand-teal)',
              fontSize: '1.5rem',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '12px 0',
            }}
            title="Need Help?"
          >
            ❓
          </button>
        )}
      </div>
    </aside>
  );
}
