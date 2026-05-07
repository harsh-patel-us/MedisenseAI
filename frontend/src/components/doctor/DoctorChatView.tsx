import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  getPatientChatForDoctor, 
  sendDoctorChatMessage, 
  toggleChatAi, 
  openDoctorChatWebSocket 
} from '../../api/doctorChatApi';
import type { PatientChatMessage } from '../../types/patientChatbot.types';

const TEAL = '#05aebb';
const TEAL_DARK = '#0f6e56';

function BotAvatar({ size = 32 }: { size?: number }) {
  const iconSize = Math.round(size * 0.62);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${TEAL_DARK} 0%, ${TEAL} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: `0 2px 8px rgba(5,174,187,0.3)`,
        overflow: 'hidden',
      }}
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(255,255,255,0.95)"
        strokeWidth="1.8"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M4.8 2.3A.3.3 0 1 0 5 2H4a2 2 0 0 0-2 2v5a6 6 0 0 0 6 6v0a6 6 0 0 0 6-6V4a2 2 0 0 0-2-2h-1a.2.2 0 1 0 .3.3" />
        <path d="M8 15a6 6 0 0 0 6 6h0a6 6 0 0 0 6-6v-3" />
        <circle cx="20" cy="10" r="2" fill="rgba(255,255,255,0.95)" stroke="none" />
      </svg>
    </div>
  );
}

interface DoctorChatViewProps {
  sessionId: string;
}

export default function DoctorChatView({ sessionId }: DoctorChatViewProps) {
  const [messages, setMessages] = useState<PatientChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [doctorJoined, setDoctorJoined] = useState(false);
  const [specialtyName, setSpecialtyName] = useState<string | null>(null);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [toggling, setToggling] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  const loadChat = useCallback(async () => {
    try {
      const res = await getPatientChatForDoctor(sessionId);
      setMessages(res.messages);
      setDoctorJoined(res.doctor_joined);
      setSpecialtyName(res.specialty_name ?? null);
    } catch (err) {
      console.error('Failed to load chat', err);
    } finally {
      setLoading(false);
    }
  }, [sessionId]);

  useEffect(() => {
    let cancelled = false;
    let ws: WebSocket | null = null;
    let retryTimer: ReturnType<typeof setTimeout> | null = null;
    let retryCount = 0;

    setLoading(true);
    void loadChat();

    const connect = () => {
      if (cancelled) return;
      ws = openDoctorChatWebSocket(sessionId);
      if (!ws) return;

      ws.onopen = () => {
        retryCount = 0;
      };

      ws.onmessage = (evt) => {
        try {
          const payload = JSON.parse(evt.data);
          if (payload.type === 'mode_change') {
            setDoctorJoined(Boolean(payload.doctor_joined));
          } else if (payload.type === 'message' && payload.message) {
            const incoming = payload.message;
            setMessages((prev: PatientChatMessage[]) =>
              prev.some((m) => m.id === incoming.id) ? prev : [...prev, incoming],
            );
          }
        } catch (err) {
          console.error('WS payload parse failed', err);
        }
      };

      ws.onclose = () => {
        if (cancelled) return;
        if (retryCount < 5) {
          const delay = Math.min(1500 * Math.pow(1.6, retryCount), 15000);
          retryCount += 1;
          retryTimer = setTimeout(connect, delay);
        }
      };
    };

    connect();

    return () => {
      cancelled = true;
      if (retryTimer) clearTimeout(retryTimer);
      if (ws) {
        ws.onmessage = null;
        ws.onclose = null;
        ws.onopen = null;
        try { ws.close(); } catch { /* ignore */ }
      }
    };
  }, [loadChat, sessionId]);

  // Auto-scroll to bottom on new messages or state changes
  useEffect(() => {
    const el = scrollRef.current;
    if (el) {
      // Use requestAnimationFrame to ensure the DOM has updated and layout is stable
      const scrollDown = () => {
        el.scrollTop = el.scrollHeight;
      };
      
      scrollDown();
      // Double-tap with a frame delay for robustness against image/content loading
      requestAnimationFrame(scrollDown);
    }
  }, [messages, loading, sending, doctorJoined]);

  const handleToggleAi = async () => {
    if (toggling) return;
    setToggling(true);
    try {
      const res = await toggleChatAi(sessionId);
      setDoctorJoined(res.doctor_joined);
      await loadChat();
    } catch (err) {
      alert('Failed to toggle AI state');
    } finally {
      setToggling(false);
    }
  };

  const handleSend = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await sendDoctorChatMessage(sessionId, input.trim());
      setInput('');
      // The WebSocket will likely push the new message, 
      // but loadChat is a safe fallback to keep state in sync.
      await loadChat();
    } catch (err) {
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          Loading conversation...
        </div>
      </div>
    );
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative' }}>
       {/* Toggle bar */}
       <div style={{
         padding: '12px 30px',
         background: doctorJoined ? 'rgba(5, 174, 187, 0.1)' : 'rgba(15,30,60,0.3)',
         display: 'flex', alignItems: 'center', justifyContent: 'space-between',
         flexWrap: 'wrap', gap: 12,
         borderBottom: '1px solid var(--border-subtle)',
         flexShrink: 0
       }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
             <span style={{ fontSize: 20 }}>{doctorJoined ? '👨‍⚕️' : '🤖'}</span>
             <div style={{ display: 'flex', flexDirection: 'column' }}>
               <span style={{ fontSize: '0.88rem', fontWeight: 700 }}>
                 {doctorJoined
                   ? 'You are live with the patient'
                   : `MediSense AI is replying as ${specialtyName || 'the specialist'}`}
               </span>
               <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)' }}>
                 {doctorJoined
                   ? 'Hand back to AI when you need to step away.'
                   : 'Join the chat to disable AI and reply directly.'}
               </span>
             </div>
          </div>
          <button
            className={doctorJoined ? "btn-secondary" : "btn-primary"}
            onClick={handleToggleAi}
            disabled={toggling}
            style={{ padding: '8px 18px', fontSize: '0.82rem', fontWeight: 700 }}
          >
            {toggling
              ? '…'
              : doctorJoined
                ? '↩ Hand Back to AI'
                : '🩺 Join Chat'}
          </button>
       </div>

       {/* Messages Container */}
       <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
         <div ref={scrollRef} style={{ 
           position: 'absolute',
           inset: 0,
           overflowY: 'auto', 
           padding: '24px 30px', 
           display: 'flex', 
           flexDirection: 'column', 
           gap: 24,
           background: 'rgba(15, 30, 60, 0.05)'
         }}>
            {messages.length === 0 ? (
              <div style={{ margin: 'auto', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.9rem' }}>
                No messages in this conversation yet.
              </div>
            ) : (
              messages.map(m => {
                const isYou = m.role === 'doctor';
                const isAi = m.role === 'assistant';
                const isPatient = m.role === 'user';

                return (
                  <div key={m.id} style={{
                    display: 'flex',
                    gap: 12,
                    flexDirection: isYou ? 'row-reverse' : 'row',
                    alignItems: 'flex-end',
                    maxWidth: '85%',
                    alignSelf: isYou ? 'flex-end' : 'flex-start',
                  }}>
                    {!isYou && (
                      <div style={{ flexShrink: 0, marginBottom: 18 }}>
                        {isAi ? (
                          <BotAvatar size={34} />
                        ) : (
                          <div style={{ 
                            width: 34, height: 34, borderRadius: '50%', 
                            background: 'rgba(15, 30, 60, 0.4)', 
                            display: 'flex', alignItems: 'center', justifyContent: 'center',
                            fontSize: 18, border: '1px solid var(--border-subtle)'
                          }}>👤</div>
                        )}
                      </div>
                    )}
                    <div style={{ display: 'flex', flexDirection: 'column', alignItems: isYou ? 'flex-end' : 'flex-start', gap: 4 }}>
                       <div style={{ 
                         fontSize: '0.65rem', 
                         fontWeight: 800, 
                         color: 'var(--text-muted)',
                         textTransform: 'uppercase',
                         letterSpacing: '0.5px',
                         padding: '0 4px'
                       }}>
                         {isYou ? 'You' : isPatient ? 'Patient' : 'MediSense AI'}
                       </div>
                       <div style={{
                         padding: '12px 16px',
                         borderRadius: isYou ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                         background: isYou ? TEAL : '#ffffff',
                         color: isYou ? '#fff' : '#1a1a18',
                         fontSize: '0.92rem',
                         lineHeight: 1.55,
                         border: isAi ? `1px solid ${TEAL}` : 'none',
                         boxShadow: '0 1px 4px rgba(0,0,0,0.12)',
                         whiteSpace: 'pre-wrap',
                         wordBreak: 'break-word'
                       }}>
                         {m.content}
                       </div>
                       <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', padding: '0 4px' }}>
                         {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                       </div>
                    </div>
                  </div>
                );
              })
            )}
         </div>
       </div>

       {/* Input */}
       <div style={{ 
         padding: '20px 30px', 
         borderTop: '1px solid var(--border-subtle)', 
         background: 'rgba(6,13,27,0.5)',
         flexShrink: 0
       }}>
         {doctorJoined ? (
           <form onSubmit={handleSend} style={{ display: 'flex', gap: 12 }}>
              <input 
                value={input}
                onChange={e => setInput(e.target.value)}
                placeholder="Type your message to the patient..."
                style={{
                  flex: 1, background: 'rgba(15,30,60,0.6)', border: '1px solid var(--border-subtle)',
                  borderRadius: 10, padding: '12px 16px', color: '#fff', outline: 'none'
                }}
              />
              <button className="btn-primary" disabled={!input.trim() || sending} style={{ padding: '0 24px' }}>
                {sending ? '...' : 'Send'}
              </button>
           </form>
         ) : (
           <div style={{ textAlign: 'center', fontSize: '0.84rem', color: 'var(--text-muted)', padding: '10px 0' }}>
             Join the chat to send messages to the patient directly.
           </div>
         )}
       </div>
    </div>
  );
}
