import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  getPatientChatForDoctor,
  sendDoctorChatMessage,
  toggleChatAi,
  openDoctorChatWebSocket,
  updateDoctorChatMessage,
} from '../../api/doctorChatApi';
import type { PatientChatMessage } from '../../types/patientChatbot.types';

const TEAL = '#05aebb';
const TEAL_DARK = '#0f6e56';

function MessageActions({ text }: { text: string }) {
  const [liked, setLiked] = useState<boolean | null>(null);
  const [copied, setCopying] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopying(true);
      setTimeout(() => setCopying(false), 2000);
    } catch (err) {
      console.error('Failed to copy', err);
    }
  };

  return (
    <div style={{ 
      display: 'flex', 
      alignItems: 'center', 
      gap: 12, 
      marginTop: 6,
      opacity: 0.8
    }}>
      <button 
        type="button"
        title="Like"
        onClick={() => setLiked(liked === true ? null : true)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', opacity: liked === true ? 1 : 0.45, transition: 'opacity 0.2s', padding: 0 }}
      >
        {liked === true ? '👍' : '👍'}
      </button>
      <button 
        type="button"
        title="Dislike"
        onClick={() => setLiked(liked === false ? null : false)}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', opacity: liked === false ? 1 : 0.45, transition: 'opacity 0.2s' }}
      >
        {liked === false ? '👎' : '👎'}
      </button>
      <button 
        type="button"
        title="Copy to clipboard"
        onClick={handleCopy}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', opacity: copied ? 1 : 0.45, transition: 'opacity 0.2s' }}
      >
        {copied ? '✅' : '📋'}
      </button>
      <button 
        type="button"
        title="Share"
        onClick={() => alert('Sharing functionality coming soon!')}
        style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: '0.85rem', opacity: 0.45, transition: 'opacity 0.2s' }}
      >
        🔗
      </button>
    </div>
  );
}

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

  // ── Editing state ──────────────────────────────────────
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editValue, setEditValue] = useState('');
  const [isSaving, setIsSaving] = useState(false);

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
          } else if (payload.type === 'message_update') {
            setMessages((prev) =>
              prev.map((m) =>
                m.id === payload.message_id
                  ? { ...m, content: payload.content, updated_at: payload.updated_at }
                  : m
              )
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

  const handleStartEdit = (m: PatientChatMessage) => {
    setEditingId(m.id);
    setEditValue(m.content);
  };

  const handleCancelEdit = () => {
    setEditingId(null);
    setEditValue('');
  };

  const handleSaveEdit = async () => {
    if (!editingId || isSaving) return;
    const trimmed = editValue.trim();
    if (!trimmed) return;
    
    const targetId = editingId;
    
    // Optimistic UI updates
    setEditingId(null);
    setEditValue('');
    setIsSaving(true);

    setMessages((prev) => {
      const idx = prev.findIndex(m => m.id === targetId);
      if (idx === -1) return prev;
      const updatedMsg = { ...prev[idx], content: trimmed };
      return [...prev.slice(0, idx), updatedMsg, ...prev.slice(idx + 1)];
    });

    try {
      await updateDoctorChatMessage(targetId, trimmed);
    } catch (err) {
      alert('Failed to update message');
    } finally {
      setIsSaving(false);
    }
  };

  if (loading) {
    return (
      <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'var(--text-muted)' }}>
        <div style={{ textAlign: 'center' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />&nbsp;
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
              const isEditing = editingId === m.id;

              return (
                <div key={m.id} className="group" style={{
                  display: 'flex',
                  gap: 12,
                  flexDirection: isYou ? 'row-reverse' : 'row',
                  alignItems: 'flex-end',
                  maxWidth: '85%',
                  alignSelf: isYou ? 'flex-end' : 'flex-start',
                  position: 'relative'
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

                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      {isYou && !isEditing && (
                        <button
                          type="button"
                          onClick={() => handleStartEdit(m)}
                          style={{
                            background: 'rgba(255,255,255,0.1)',
                            border: '1px solid rgba(255,255,255,0.2)',
                            borderRadius: '50%',
                            width: 28,
                            height: 28,
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            color: 'rgba(255,255,255,0.8)',
                            cursor: 'pointer',
                            fontSize: '0.85rem',
                            flexShrink: 0,
                            transition: 'all 0.2s',
                          }}
                          onMouseEnter={(e) => { 
                            e.currentTarget.style.color = '#fff'; 
                            e.currentTarget.style.background = 'rgba(255,255,255,0.2)'; 
                          }}
                          onMouseLeave={(e) => { 
                            e.currentTarget.style.color = 'rgba(255,255,255,0.8)'; 
                            e.currentTarget.style.background = 'rgba(255,255,255,0.1)'; 
                          }}
                          title="Edit message"
                        >
                          ✏️
                        </button>
                      )}
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                        <div style={{ position: 'relative' }}>
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
                            wordBreak: 'break-word',
                            minWidth: isEditing ? 240 : 'auto',
                          }}>
                            <div style={{ flex: 1 }}>
                              {isEditing ? (
                                <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 240, width: '100%' }}>
                                  <input
                                    autoFocus
                                    value={editValue}
                                    onChange={e => setEditValue(e.target.value)}
                                    disabled={isSaving}
                                    onKeyDown={(e) => {
                                      if (e.key === 'Enter') {
                                        e.preventDefault();
                                        handleSaveEdit();
                                      } else if (e.key === 'Escape') {
                                        e.preventDefault();
                                        handleCancelEdit();
                                      }
                                    }}
                                    style={{
                                      flex: 1,
                                      background: 'rgba(0,0,0,0.1)',
                                      border: '1px solid rgba(255,255,255,0.2)',
                                      borderRadius: 8,
                                      padding: '8px 12px',
                                      color: '#fff',
                                      fontSize: '0.92rem',
                                      fontFamily: 'inherit',
                                      outline: 'none',
                                      minWidth: 150
                                    }}
                                  />
                                  <button
                                    type="button"
                                    onClick={handleCancelEdit}
                                    disabled={isSaving}
                                    style={{
                                      background: 'transparent',
                                      border: 'none',
                                      color: 'rgba(255,255,255,0.8)',
                                      fontSize: '1rem',
                                      cursor: 'pointer',
                                      padding: '4px'
                                    }}
                                    title="Cancel"
                                  >
                                    ✖
                                  </button>
                                  <button
                                    type="button"
                                    onClick={handleSaveEdit}
                                    disabled={isSaving || !editValue.trim()}
                                    style={{
                                      background: '#fff',
                                      border: 'none',
                                      borderRadius: '50%',
                                      width: 28,
                                      height: 28,
                                      display: 'flex',
                                      alignItems: 'center',
                                      justifyContent: 'center',
                                      color: TEAL,
                                      fontSize: '0.9rem',
                                      cursor: (isSaving || !editValue.trim()) ? 'not-allowed' : 'pointer',
                                      opacity: (isSaving || !editValue.trim()) ? 0.6 : 1
                                    }}
                                    title="Save"
                                  >
                                    ➤
                                  </button>
                                </div>
                              ) : (
                                <div>{m.content}</div>
                              )}
                            </div>
                          </div>
                        </div>
                        {isAi && <div style={{ marginLeft: 6 }}><MessageActions text={m.content} /></div>}
                      </div>
                                </div>

                                <div style={{ fontSize: '0.65rem', color: 'var(--text-muted)', padding: '0 4px', display: 'flex', gap: 6 }}>
                                {m.updated_at && <span style={{ fontStyle: 'italic' }}>(edited)</span>}
                                <span>{new Date(m.created_at).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', hour12: true, timeZone: 'Asia/Kolkata' })}</span>
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
