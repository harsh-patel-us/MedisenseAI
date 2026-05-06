import React, { useState, useEffect, useCallback, useRef } from 'react';
import { 
  getPatientChatForDoctor, 
  sendDoctorChatMessage, 
  toggleChatAi, 
  openDoctorChatWebSocket 
} from '../../api/doctorChatApi';
import type { PatientChatMessage, PatientChatSessionDetail } from '../../types/patientChatbot.types';

const TEAL = '#05aebb';

interface DoctorChatOverlayProps {
  sessionId: string;
  patientName?: string;
  specialtyName?: string | null;
  onClose: () => void;
}

export function DoctorChatOverlay({
  sessionId,
  patientName,
  specialtyName,
  onClose,
}: DoctorChatOverlayProps) {
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 1000,
      background: 'rgba(0,0,0,0.8)', backdropFilter: 'blur(8px)',
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }}>
       <div className="glass-card" style={{ width: '100%', maxWidth: 800, height: '85vh', display: 'flex', flexDirection: 'column', position: 'relative' }}>
          <button onClick={onClose} style={{ position: 'absolute', top: 20, right: 20, background: 'transparent', border: 'none', color: '#fff', fontSize: 24, cursor: 'pointer' }}>✕</button>
          <div style={{ padding: '24px 30px', borderBottom: '1px solid var(--border-subtle)' }}>
             <h2 style={{ fontSize: '1.2rem', fontWeight: 800 }}>
               {patientName ? `Conversation with ${patientName}` : 'Patient Conversation'}
             </h2>
             <p style={{ fontSize: '0.84rem', color: 'var(--text-muted)' }}>
               {specialtyName ? `🩺 ${specialtyName}` : 'MediSense AI patient chat'}
             </p>
          </div>
          <DoctorChatView sessionId={sessionId} />
       </div>
    </div>
  );
}

function DoctorChatView({ sessionId }: { sessionId: string }) {
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

  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
  }, [messages]);

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
      // No need to call loadChat() if WS is working, but it's a safe fallback
      // Actually, we should probably wait for the WS message.
      // But loadChat replaces everything, which is safe.
      await loadChat();
    } catch (err) {
      alert('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  if (loading) return <div style={{ padding: 40, textAlign: 'center' }}>Loading conversation...</div>;

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
       {/* Toggle bar */}
       <div style={{
         padding: '12px 30px',
         background: doctorJoined ? 'rgba(5, 174, 187, 0.1)' : 'rgba(15,30,60,0.3)',
         display: 'flex', alignItems: 'center', justifyContent: 'space-between',
         flexWrap: 'wrap', gap: 12,
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

       {/* Messages */}
       <div ref={scrollRef} style={{ flex: 1, overflowY: 'auto', padding: '24px 30px', display: 'flex', flexDirection: 'column', gap: 16 }}>
          {messages.map(m => (
            <div key={m.id} style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: m.role === 'user' ? 'flex-start' : 'flex-end',
              maxWidth: '85%',
              alignSelf: m.role === 'user' ? 'flex-start' : 'flex-end',
            }}>
               <div style={{ 
                 fontSize: '0.68rem', fontWeight: 700, color: 'var(--text-muted)', marginBottom: 4,
                 textAlign: m.role === 'user' ? 'left' : 'right'
               }}>
                 {m.role === 'user' ? 'PATIENT' : m.role === 'doctor' ? 'YOU' : 'AI ASSISTANT'}
               </div>
               <div style={{
                 padding: '10px 14px',
                 borderRadius: 12,
                 background: m.role === 'user' ? 'rgba(15,30,60,0.6)' : m.role === 'doctor' ? TEAL : 'rgba(15,30,60,0.9)',
                 color: m.role === 'doctor' ? '#fff' : 'var(--text-primary)',
                 fontSize: '0.9rem',
                 lineHeight: 1.5,
                 border: m.role === 'doctor' ? 'none' : '1px solid var(--border-subtle)'
               }}>
                 {m.content}
               </div>
               <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', marginTop: 4 }}>
                 {new Date(m.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
               </div>
            </div>
          ))}
       </div>

       {/* Input */}
       {doctorJoined && (
         <form onSubmit={handleSend} style={{ padding: '20px 30px', borderTop: '1px solid var(--border-subtle)', display: 'flex', gap: 12 }}>
            <input 
              value={input}
              onChange={e => setInput(e.target.value)}
              placeholder="Type your message to the patient..."
              style={{
                flex: 1, background: 'rgba(15,30,60,0.6)', border: '1px solid var(--border-subtle)',
                borderRadius: 10, padding: '10px 16px', color: '#fff', outline: 'none'
              }}
            />
            <button className="btn-primary" disabled={!input.trim() || sending} style={{ padding: '0 24px' }}>
              {sending ? '...' : 'Send'}
            </button>
         </form>
       )}
       {!doctorJoined && (
         <div style={{ padding: '20px 30px', borderTop: '1px solid var(--border-subtle)', textAlign: 'center', fontSize: '0.84rem', color: 'var(--text-muted)' }}>
           Join the chat to send messages to the patient.
         </div>
       )}
    </div>
  );
}
