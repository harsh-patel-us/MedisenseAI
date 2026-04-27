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

function ChatBubbleIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="26"
      height="26"
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

function CloseIcon() {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width="22"
      height="22"
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

function TypingDots() {
  return (
    <div className="flex items-center gap-1 px-3 py-2" aria-label="Assistant is typing">
      {[0, 1, 2].map((i) => (
        <span
          key={i}
          className="inline-block h-2 w-2 rounded-full bg-slate-400 dark:bg-slate-500"
          style={{
            animation: 'medibot-bounce 1s infinite ease-in-out',
            animationDelay: `${i * 0.15}s`,
          }}
        />
      ))}
    </div>
  );
}

export default function ChatbotWidget() {
  const [open, setOpen] = useState(false);
  const [hasOpened, setHasOpened] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'assistant', content: WELCOME_MESSAGE },
  ]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(() => {
    if (typeof window === 'undefined') return null;
    return window.sessionStorage.getItem(SESSION_STORAGE_KEY);
  });

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const conversationStarted = useMemo(
    () => messages.some((m) => m.role === 'user'),
    [messages],
  );

  // Auto-scroll to the latest message whenever the transcript or typing state changes.
  useEffect(() => {
    if (!open) return;
    const el = scrollRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [messages, loading, open]);

  // Focus the input when the popup opens.
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  const toggleOpen = useCallback(() => {
    setOpen((prev) => {
      const next = !prev;
      if (next) setHasOpened(true);
      return next;
    });
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      setError(null);
      setInput('');

      const userMsg: ChatMessage = { role: 'user', content: trimmed };

      // Emergency shortcut — bypass the API entirely.
      if (isEmergency(trimmed)) {
        setMessages((prev) => [
          ...prev,
          userMsg,
          { role: 'assistant', content: EMERGENCY_REPLY },
        ]);
        return;
      }

      const nextHistory = [...messages, userMsg];
      setMessages(nextHistory);
      setLoading(true);

      // Cancel any in-flight request before issuing a new one.
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      try {
        const { reply, session_id } = await sendChatbotMessage(
          nextHistory,
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
        setMessages((prev) => [...prev, { role: 'assistant', content: reply }]);
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

  const showUnreadDot = !hasOpened;

  return (
    <>
      {/* Animations + scrollbar polish (kept local to the widget). */}
      <style>{`
        @keyframes medibot-bounce {
          0%, 80%, 100% { transform: translateY(0); opacity: 0.6; }
          40% { transform: translateY(-4px); opacity: 1; }
        }
        @keyframes medibot-pop {
          0% { opacity: 0; transform: translateY(8px) scale(0.96); }
          100% { opacity: 1; transform: translateY(0) scale(1); }
        }
        .medibot-pop { animation: medibot-pop 0.18s ease-out; }
        .medibot-scroll::-webkit-scrollbar { width: 6px; }
        .medibot-scroll::-webkit-scrollbar-thumb {
          background: rgba(100, 116, 139, 0.35); border-radius: 3px;
        }
      `}</style>

      {/* ── Popup ─────────────────────────────────────────────────────── */}
      {open && (
        <div
          role="dialog"
          aria-label="MediSense AI chat"
          className="medibot-pop fixed z-[1000] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl dark:border-slate-700 dark:bg-slate-900"
          style={{
            bottom: 96,
            right: 24,
            width: 'min(360px, calc(100vw - 32px))',
            height: 'min(520px, calc(100vh - 140px))',
          }}
        >
          {/* Header */}
          <div
            className="flex items-center justify-between px-4 py-3 text-white"
            style={{ background: PRIMARY_DARK }}
          >
            <div className="flex items-center gap-3">
              <div
                className="flex h-9 w-9 items-center justify-center rounded-full"
                style={{ background: PRIMARY }}
              >
                <ChatBubbleIcon />
              </div>
              <div className="leading-tight">
                <div className="flex items-center gap-2 text-sm font-semibold">
                  MediSense AI
                  <span
                    className="inline-block h-2 w-2 rounded-full bg-emerald-400"
                    style={{ boxShadow: '0 0 6px #34d399' }}
                    aria-label="Online"
                  />
                </div>
                <div className="text-[11px] text-white/80">Health assistant</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setOpen(false)}
              aria-label="Close chat"
              className="rounded-md p-1 text-white/90 transition hover:bg-white/10 hover:text-white"
            >
              <CloseIcon />
            </button>
          </div>

          {/* Messages */}
          <div
            ref={scrollRef}
            className="medibot-scroll flex-1 overflow-y-auto bg-slate-50 px-3 py-3 dark:bg-slate-950"
          >
            <div className="flex flex-col gap-2">
              {messages.map((m, i) => {
                const isUser = m.role === 'user';
                return (
                  <div
                    key={i}
                    className={`flex w-full ${isUser ? 'justify-end' : 'justify-start'}`}
                  >
                    <div
                      className={`max-w-[80%] whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-[13.5px] leading-relaxed shadow-sm ${
                        isUser
                          ? 'rounded-br-sm text-white'
                          : 'rounded-bl-sm border border-slate-200 bg-white text-slate-800 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                      }`}
                      style={isUser ? { background: PRIMARY } : undefined}
                    >
                      {m.content}
                    </div>
                  </div>
                );
              })}

              {loading && (
                <div className="flex w-full justify-start">
                  <div className="rounded-2xl rounded-bl-sm border border-slate-200 bg-white shadow-sm dark:border-slate-700 dark:bg-slate-800">
                    <TypingDots />
                  </div>
                </div>
              )}

              {error && (
                <div className="self-center rounded-md bg-red-50 px-3 py-1.5 text-[12px] text-red-700 dark:bg-red-900/30 dark:text-red-300">
                  {error}
                </div>
              )}
            </div>

            {/* Quick chips — only before the user has sent anything. */}
            {!conversationStarted && !loading && (
              <div className="mt-3 flex flex-wrap gap-2">
                {QUICK_CHIPS.map((q) => (
                  <button
                    key={q}
                    type="button"
                    onClick={() => void send(q)}
                    className="rounded-full border border-slate-300 bg-white px-3 py-1 text-[12px] font-medium text-slate-700 transition hover:border-emerald-400 hover:text-emerald-700 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-200 dark:hover:border-emerald-400 dark:hover:text-emerald-300"
                  >
                    {q}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Disclaimer */}
          <div className="border-t border-slate-200 bg-slate-50 px-3 py-1.5 text-center text-[10.5px] leading-snug text-slate-500 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-400">
            AI responses are for guidance only. Always consult a licensed doctor.
          </div>

          {/* Composer */}
          <form
            onSubmit={handleSubmit}
            className="flex items-center gap-2 border-t border-slate-200 bg-white p-2.5 dark:border-slate-700 dark:bg-slate-900"
          >
            <input
              ref={inputRef}
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              disabled={loading}
              placeholder={loading ? 'Waiting for reply…' : 'Ask about MediSense or health…'}
              maxLength={2000}
              className="flex-1 rounded-full border border-slate-300 bg-white px-3.5 py-2 text-[13.5px] text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 disabled:opacity-60 dark:border-slate-600 dark:bg-slate-800 dark:text-slate-100 dark:placeholder:text-slate-500"
              aria-label="Type your message"
            />
            <button
              type="submit"
              disabled={loading || !input.trim()}
              aria-label="Send message"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-white shadow-sm transition disabled:cursor-not-allowed disabled:opacity-50"
              style={{ background: PRIMARY }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.4"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <line x1="22" y1="2" x2="11" y2="13" />
                <polygon points="22 2 15 22 11 13 2 9 22 2" />
              </svg>
            </button>
          </form>
        </div>
      )}

      {/* ── Floating bubble button ────────────────────────────────────── */}
      <button
        type="button"
        onClick={toggleOpen}
        aria-label={open ? 'Close chat' : 'Open chat'}
        aria-expanded={open}
        className="fixed z-[1000] flex h-14 w-14 items-center justify-center rounded-full text-white shadow-lg ring-4 ring-white/10 transition hover:scale-105 active:scale-95"
        style={{
          bottom: 24,
          right: 24,
          background: PRIMARY,
          boxShadow: '0 10px 30px rgba(15, 110, 86, 0.45)',
        }}
      >
        {open ? <CloseIcon /> : <ChatBubbleIcon />}
        {showUnreadDot && !open && (
          <span
            className="absolute h-3 w-3 rounded-full border-2 border-white bg-red-500"
            style={{ top: 8, right: 8 }}
            aria-hidden="true"
          />
        )}
      </button>
    </>
  );
}
