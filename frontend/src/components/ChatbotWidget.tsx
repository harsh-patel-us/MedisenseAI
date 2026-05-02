import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { sendChatbotMessage } from '../api/chatbotApi';
import type { ChatMessage } from '../types/chatbot.types';

const SESSION_STORAGE_KEY = 'medisense_chatbot_session_id';

const WELCOME_MESSAGE =
  "Hi! I'm the MediSense AI assistant. I can help you understand our platform and answer general health questions. For medical decisions, always consult a qualified doctor.";

const EMERGENCY_REPLY =
  'This sounds urgent. Please call emergency services (112 in India / 911 in US) or go to the nearest ER immediately. Do not wait.';

// Phrases that always shortcut to the emergency reply with no API call.
const EMERGENCY_KEYWORDS = [
  'chest pain',
  'crushing chest',
  'difficulty breathing',
  "can't breathe",
  'cant breathe',
  'shortness of breath',
  'fainting',
  'fainted',
  'passing out',
  'unconscious',
  'stroke',
  'heart attack',
  'severe bleeding',
  'bleeding heavily',
  'suicidal',
  'overdose',
  'anaphylaxis',
];

const QUICK_CHIPS = [
  'How do I upload my report?',
  'What is HbA1c?',
  'Which doctor for diabetes?',
  'How does SOAP note work?',
];

const PRIMARY = '#1d9e75';
const PRIMARY_DARK = '#0f6e56';

function isEmergency(text: string): boolean {
  const t = text.toLowerCase();
  return EMERGENCY_KEYWORDS.some((kw) => t.includes(kw));
}

function formatTime(ts: number): string {
  return new Date(ts).toLocaleTimeString([], {
    hour: 'numeric',
    minute: '2-digit',
    hour12: true,
  });
}

/* Internal state holds timestamps; we strip them before sending to the API. */
interface TimedMessage extends ChatMessage {
  timestamp: number;
}

/* ── Icons ──────────────────────────────────────────────────────────── */

function ChatBubbleIcon({ size = 26 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />
    </svg>
  );
}

function CloseIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="18" y1="6" x2="6" y2="18" />
      <line x1="6" y1="6" x2="18" y2="18" />
    </svg>
  );
}

function SendArrowIcon({ size = 16 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2.4"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <line x1="12" y1="20" x2="12" y2="4" />
      <polyline points="5 11 12 4 19 11" />
    </svg>
  );
}

function PaperclipIcon({ size = 18 }: { size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M21.44 11.05 12.25 20.24a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48" />
    </svg>
  );
}

function BotAvatar({ size = 28 }: { size?: number }) {
  const iconSize = Math.round(size * 0.6);
  return (
    <div
      style={{
        width: size,
        height: size,
        borderRadius: '50%',
        background: `linear-gradient(135deg, ${PRIMARY_DARK} 0%, ${PRIMARY} 100%)`,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        flexShrink: 0,
        boxShadow: `0 3px 12px rgba(29,158,117,0.4), 0 0 0 2px rgba(29,158,117,0.15)`,
        overflow: 'hidden',
      }}
      aria-hidden="true"
    >
      {/* Heart-pulse / vitals line — medical AI assistant icon */}
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width={iconSize}
        height={iconSize}
        viewBox="0 0 24 24"
        fill="none"
        stroke="rgba(255,255,255,0.95)"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        aria-hidden="true"
      >
        {/* Heart shape */}
        <path d="M19.5 12.572l-7.5 7.428l-7.5-7.428A5 5 0 1 1 12 6.006a5 5 0 1 1 7.5 6.572" />
        {/* Pulse/heartbeat line across the heart */}
        <polyline points="2 12 6 12 8 9 11 15 13 12 22 12" stroke="rgba(255,255,255,0.95)" fill="none" />
      </svg>
    </div>
  );
}

function TypingDots() {
  return (
    <div className="flex items-center" style={{ gap: 4 }} aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="medibot-dot"
          style={{
            width: 7,
            height: 7,
            borderRadius: '50%',
            background: PRIMARY,
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

/* ── Widget ─────────────────────────────────────────────────────────── */

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [hasInteracted, setHasInteracted] = useState(false);
  const [messages, setMessages] = useState<TimedMessage[]>(() => [
    { role: 'assistant', content: WELCOME_MESSAGE, timestamp: Date.now() },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const conversationStarted = useMemo(
    () => messages.some((m) => m.role === 'user'),
    [messages],
  );

  // Auto-scroll on every transcript / typing update.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  // Focus the textarea when the popup opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  // Auto-grow the textarea.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 96) + 'px';
  }, [input]);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => !prev);
    setHasInteracted(true);
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setError(null);
      setInput('');

      const userMsg: TimedMessage = { role: 'user', content: trimmed, timestamp: Date.now() };

      // Emergency shortcut — bypass the API entirely.
      if (isEmergency(trimmed)) {
        setMessages((prev) => [
          ...prev,
          userMsg,
          { role: 'assistant', content: EMERGENCY_REPLY, timestamp: Date.now() },
        ]);
        return;
      }

      const nextHistory = [...messages, userMsg];
      setMessages(nextHistory);
      setLoading(true);

      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        // Strip timestamps — the API only takes {role, content}.
        const apiHistory: ChatMessage[] = nextHistory.map(({ role, content }) => ({ role, content }));
        const { reply, session_id } = await sendChatbotMessage(
          apiHistory,
          sessionId,
          controller.signal,
        );
        if (session_id && session_id !== sessionId) {
          setSessionId(session_id);
          try {
            window.sessionStorage.setItem(SESSION_STORAGE_KEY, session_id);
          } catch {
            // sessionStorage may be unavailable (private mode); harmless to skip.
          }
        }
        setMessages((prev) => [
          ...prev,
          { role: 'assistant', content: reply, timestamp: Date.now() },
        ]);
      } catch (err: unknown) {
        if (controller.signal.aborted) return;
        console.error('Chatbot send failed:', err);
        setError("Sorry, I couldn't reach the assistant. Please try again.");
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    },
    [loading, messages, sessionId],
  );

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    void send(input);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send(input);
    }
  };

  const canSend = !!input.trim() && !loading;

  /* ── Group messages by speaker so we render avatars + timestamps per group ── */
  type Group = { role: 'user' | 'assistant'; messages: TimedMessage[]; lastTimestamp: number };
  const groups: Group[] = useMemo(() => {
    const out: Group[] = [];
    for (const m of messages) {
      const last = out[out.length - 1];
      if (last && last.role === m.role) {
        last.messages.push(m);
        last.lastTimestamp = m.timestamp;
      } else {
        out.push({ role: m.role, messages: [m], lastTimestamp: m.timestamp });
      }
    }
    return out;
  }, [messages]);

  return (
    <>
      <style>{`
        /* ── Animations ─────────────────────────────────────── */
        @keyframes medibot-window-in {
          from { opacity: 0; transform: translateY(20px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes medibot-window-out {
          from { opacity: 1; transform: translateY(0); }
          to   { opacity: 0; transform: translateY(20px); }
        }
        @keyframes medibot-msg-in {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        @keyframes medibot-dot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.45; }
          40%           { transform: translateY(-5px); opacity: 1; }
        }
        @keyframes medibot-fab-pulse {
          0%, 100% { transform: scale(1); }
          50%      { transform: scale(1.12); }
        }
        @keyframes medibot-online-pulse {
          0%   { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0.7); }
          70%  { box-shadow: 0 0 0 6px rgba(74, 222, 128, 0); }
          100% { box-shadow: 0 0 0 0 rgba(74, 222, 128, 0); }
        }

        .medibot-window-open  { animation: medibot-window-in 0.25s ease-out forwards; }
        .medibot-window-close { animation: medibot-window-out 0.2s ease-in forwards; }

        .medibot-bubble { animation: medibot-msg-in 0.2s ease-out; }
        .medibot-dot {
          display: inline-block;
          animation: medibot-dot-bounce 1s infinite ease-in-out;
        }
        .medibot-fab-pulse { animation: medibot-fab-pulse 2s ease-in-out infinite; }
        .medibot-online    { animation: medibot-online-pulse 1.8s ease-out infinite; }

        /* Hide scrollbars in the messages list. */
        .medibot-scroll {
          scrollbar-width: none;
          -ms-overflow-style: none;
        }
        .medibot-scroll::-webkit-scrollbar { width: 0; height: 0; display: none; }

        .medibot-textarea { resize: none; }
        .medibot-textarea::placeholder { color: #aaa; }

        /* ── Mobile fullscreen takeover ─────────────────────── */
        @media (max-width: 419px) {
          .medibot-window {
            top: 0 !important;
            left: 0 !important;
            right: 0 !important;
            bottom: 0 !important;
            width: 100vw !important;
            height: 100vh !important;
            max-height: 100vh !important;
            border-radius: 0 !important;
          }
          .medibot-window-header {
            border-radius: 0 !important;
            padding-top: calc(14px + env(safe-area-inset-top, 0px)) !important;
          }
        }
      `}</style>

      {/* ── Popup ─────────────────────────────────────────────────── */}
      {(open || hasInteracted) && (
        <div
          role="dialog"
          aria-label="MediSense AI chat"
          aria-hidden={!open}
          className={`medibot-window fixed z-[1000] flex flex-col overflow-hidden ${open ? 'medibot-window-open' : 'medibot-window-close'}`}
          style={{
            bottom: 100,
            right: 24,
            width: 370,
            height: 580,
            borderRadius: 20,
            background: 'linear-gradient(160deg, #e8f8f2 0%, #ffffff 60%)',
            boxShadow: '0 8px 40px rgba(0,0,0,0.14)',
            pointerEvents: open ? 'auto' : 'none',
          }}
        >
          {/* Header */}
          <div
            className="medibot-window-header flex items-center justify-between text-white"
            style={{
              height: 64,
              padding: '14px 16px',
              background: PRIMARY_DARK,
              borderRadius: '20px 20px 0 0',
              flexShrink: 0,
            }}
          >
            <div className="flex items-center" style={{ gap: 12 }}>
              <BotAvatar size={40} />
              <div className="leading-tight">
                <div
                  className="flex items-center"
                  style={{ fontSize: 15, fontWeight: 500, gap: 8 }}
                >
                  MediSense AI
                </div>
                <div
                  className="flex items-center"
                  style={{ fontSize: 11, color: 'rgba(255,255,255,0.65)', gap: 6, marginTop: 2 }}
                >
                  <span
                    className="medibot-online inline-block rounded-full"
                    style={{ width: 8, height: 8, background: '#4ade80' }}
                    aria-label="Online"
                  />
                  Health Assistant · Online
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-lg text-white/90 transition hover:bg-white/15 hover:text-white"
              style={{ padding: 6 }}
            >
              <CloseIcon />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="medibot-scroll flex-1 overflow-y-auto"
            style={{ padding: '16px 14px', background: 'transparent' }}
          >
            <div className="flex flex-col" style={{ gap: 10 }}>
              {groups.map((group, gi) => {
                const isUser = group.role === 'user';
                return (
                  <div key={gi} className="flex flex-col" style={{ gap: 4 }}>
                    {group.messages.map((m, mi) => {
                      const isFirstInGroup = mi === 0;
                      return (
                        <div
                          key={mi}
                          className={`flex w-full items-end ${isUser ? 'justify-end' : 'justify-start'}`}
                          style={{ gap: 8 }}
                        >
                          {!isUser && (
                            <div style={{ width: 28, flexShrink: 0 }}>
                              {isFirstInGroup && <BotAvatar size={28} />}
                            </div>
                          )}
                          <div
                            className="medibot-bubble whitespace-pre-wrap break-words"
                            style={{
                              maxWidth: '78%',
                              padding: '10px 14px',
                              fontSize: 13,
                              lineHeight: 1.6,
                              background: isUser ? PRIMARY : '#ffffff',
                              color: isUser ? '#ffffff' : '#1a1a18',
                              borderRadius: isUser
                                ? '16px 16px 4px 16px'
                                : '16px 16px 16px 4px',
                              boxShadow: isUser
                                ? '0 1px 3px rgba(29,158,117,0.25)'
                                : '0 1px 4px rgba(0,0,0,0.08)',
                            }}
                          >
                            {m.content}
                          </div>
                        </div>
                      );
                    })}
                    {/* Group timestamp */}
                    <div
                      className="text-center"
                      style={{
                        fontSize: 10,
                        color: '#aaa',
                        marginTop: 2,
                        marginLeft: isUser ? 0 : 36,
                        marginRight: isUser ? 4 : 0,
                        textAlign: isUser ? 'right' : 'left',
                      }}
                    >
                      {formatTime(group.lastTimestamp)}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex w-full items-end justify-start" style={{ gap: 8 }}>
                  <div style={{ width: 28, flexShrink: 0 }}>
                    <BotAvatar size={28} />
                  </div>
                  <div
                    className="medibot-bubble"
                    style={{
                      padding: '10px 14px',
                      background: '#ffffff',
                      borderRadius: '16px 16px 16px 4px',
                      boxShadow: '0 1px 4px rgba(0,0,0,0.08)',
                    }}
                  >
                    <TypingDots />
                  </div>
                </div>
              )}

              {error && (
                <div
                  className="self-center"
                  style={{
                    fontSize: 12,
                    color: '#b91c1c',
                    background: 'rgba(254, 226, 226, 0.85)',
                    padding: '6px 12px',
                    borderRadius: 12,
                  }}
                >
                  {error}
                </div>
              )}
            </div>

            {/* Quick chips — horizontal scroll, only at conversation start. */}
            {!conversationStarted && !loading && (
              <div
                className="medibot-scroll"
                style={{
                  marginTop: 14,
                  display: 'flex',
                  gap: 8,
                  overflowX: 'auto',
                  paddingBottom: 4,
                  marginLeft: 36,
                }}
              >
                {QUICK_CHIPS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    style={{
                      flexShrink: 0,
                      whiteSpace: 'nowrap',
                      background: '#ffffff',
                      color: PRIMARY,
                      border: `0.5px solid ${PRIMARY}`,
                      borderRadius: 20,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 500,
                      cursor: 'pointer',
                      transition: 'background 0.15s, color 0.15s',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = PRIMARY;
                      e.currentTarget.style.color = '#ffffff';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = '#ffffff';
                      e.currentTarget.style.color = PRIMARY;
                    }}
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Disclaimer bar */}
          <div
            className="text-center"
            style={{
              height: 28,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 10,
              color: '#888',
              background: 'rgba(255,255,255,0.7)',
              backdropFilter: 'blur(4px)',
              WebkitBackdropFilter: 'blur(4px)',
              borderTop: '0.5px solid rgba(0,0,0,0.06)',
              flexShrink: 0,
            }}
          >
            AI responses are for guidance only. Always consult a licensed doctor.
          </div>

          {/* Input area */}
          <form
            onSubmit={handleSubmit}
            style={{
              background: '#ffffff',
              padding: '12px 14px',
              borderTop: '0.5px solid rgba(0,0,0,0.08)',
              borderRadius: '0 0 20px 20px',
              flexShrink: 0,
            }}
          >
            <div
              className="medibot-input-wrap"
              style={{
                position: 'relative',
                background: '#f4f4f2',
                borderRadius: 24,
                transition: 'box-shadow 0.15s',
              }}
              onFocus={(e) => {
                e.currentTarget.style.boxShadow = '0 0 0 2px rgba(29,158,117,0.25)';
              }}
              onBlur={(e) => {
                e.currentTarget.style.boxShadow = 'none';
              }}
            >
              <textarea
                ref={inputRef}
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={handleKeyDown}
                disabled={loading}
                rows={1}
                placeholder="Ask a health question..."
                maxLength={2000}
                className="medibot-textarea"
                aria-label="Ask a health question"
                style={{
                  width: '100%',
                  background: 'transparent',
                  border: 'none',
                  outline: 'none',
                  padding: '10px 84px 10px 16px',
                  fontSize: 13,
                  lineHeight: 1.5,
                  color: '#1a1a18',
                  fontFamily: 'inherit',
                  display: 'block',
                  minHeight: 38,
                  maxHeight: 96,
                }}
              />
              {/* Attachment (decorative) */}
              {/* <button
                type="button"
                aria-label="Attach (coming soon)"
                disabled
                style={{
                  position: 'absolute',
                  right: 48,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  background: 'transparent',
                  border: 'none',
                  color: '#aaa',
                  cursor: 'not-allowed',
                  padding: 4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
                tabIndex={-1}
              >
                <PaperclipIcon size={18} />
              </button> */}
              {/* Send button (inside the field) */}
              <button
                type="submit"
                disabled={!canSend}
                aria-label="Send message"
                style={{
                  position: 'absolute',
                  right: 6,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 34,
                  height: 34,
                  borderRadius: '50%',
                  background: PRIMARY,
                  color: '#ffffff',
                  border: 'none',
                  cursor: canSend ? 'pointer' : 'not-allowed',
                  opacity: canSend ? 1 : 0.4,
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  transition: 'transform 0.1s, opacity 0.15s',
                }}
                onMouseDown={(e) => {
                  if (canSend) e.currentTarget.style.transform = 'translateY(-50%) scale(0.92)';
                }}
                onMouseUp={(e) => {
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.transform = 'translateY(-50%) scale(1)';
                }}
              >
                <SendArrowIcon size={16} />
              </button>
            </div>
          </form>
        </div>
      )}

      {/* ── Floating bubble button ────────────────────────────────── */}
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        className={!hasInteracted ? 'medibot-fab-pulse' : ''}
        style={{
          position: 'fixed',
          bottom: 24,
          right: 24,
          width: 60,
          height: 60,
          borderRadius: '50%',
          background: PRIMARY,
          color: '#ffffff',
          border: 'none',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          boxShadow: '0 4px 20px rgba(29,158,117,0.35)',
          transition: 'transform 0.2s ease',
          zIndex: 1000,
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = 'scale(1.08)';
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = 'scale(1)';
        }}
      >
        {open ? <CloseIcon size={22} /> : <ChatBubbleIcon size={26} />}
        {!hasInteracted && !open && (
          <span
            aria-hidden="true"
            style={{
              position: 'absolute',
              top: 8,
              right: 8,
              width: 10,
              height: 10,
              borderRadius: '50%',
              background: '#4ade80',
              border: '2px solid #ffffff',
              boxShadow: '0 0 4px rgba(74,222,128,0.7)',
            }}
          />
        )}
      </button>
    </>
  );
}
