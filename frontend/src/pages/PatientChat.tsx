import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { getToken } from '../api/authApi';
import {
  endPatientChatSession,
  endPatientChatSessionBeacon,
  fileToBase64,
  getPatientChatHistory,
  getPatientChatSession,
  sendPatientChatMessage,
} from '../api/patientChatbotApi';
import type {
  ChatAttachmentUpload,
  ChatFileReference,
  PatientChatMessage,
  PatientChatSessionSummary,
} from '../types/patientChatbot.types';

const TEAL = '#05aebb';
const TEAL_DARK = '#0f6e56';
const ACCEPT_MIME = 'image/jpeg,image/jpg,image/png,application/pdf';
const MAX_FILE_MB = 20;

interface PendingAttachment {
  id: string;
  file: File;
  kind: 'image' | 'pdf';
  previewUrl: string | null; // object URL for images, null for PDFs
}

interface UiMessage extends PatientChatMessage {
  pending?: boolean; // true while the assistant turn is loading
}

/* ── Helpers ────────────────────────────────────────────────────────── */

function classifyFile(file: File): 'image' | 'pdf' | null {
  const t = file.type.toLowerCase();
  if (t === 'image/png' || t === 'image/jpeg' || t === 'image/jpg') return 'image';
  if (t === 'application/pdf') return 'pdf';
  // Fall back to extension when the browser provides no MIME.
  const name = file.name.toLowerCase();
  if (name.endsWith('.png') || name.endsWith('.jpg') || name.endsWith('.jpeg')) return 'image';
  if (name.endsWith('.pdf')) return 'pdf';
  return null;
}

function inferMime(file: File, kind: 'image' | 'pdf'): string {
  if (file.type) return file.type.toLowerCase();
  if (kind === 'pdf') return 'application/pdf';
  const lower = file.name.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  return 'image/jpeg';
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function formatTime(iso: string): string {
  try {
    return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
  } catch {
    return '';
  }
}

function dayBucket(iso: string): string {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return 'Earlier';
  const now = new Date();
  const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
  const ts = d.getTime();
  const day = 24 * 60 * 60 * 1000;
  if (ts >= startOfToday) return 'Today';
  if (ts >= startOfToday - day) return 'Yesterday';
  if (ts >= startOfToday - 7 * day) return 'Previous 7 days';
  if (ts >= startOfToday - 30 * day) return 'Previous 30 days';
  return d.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });
}

function bucketOrder(b: string): number {
  if (b === 'Today') return 0;
  if (b === 'Yesterday') return 1;
  if (b === 'Previous 7 days') return 2;
  if (b === 'Previous 30 days') return 3;
  return 4;
}

function shortSummary(s: PatientChatSessionSummary): string {
  if (s.session_summary && s.session_summary.trim()) {
    const t = s.session_summary.trim();
    return t.length > 100 ? t.slice(0, 100) + '…' : t;
  }
  return s.message_count > 0 ? `${s.message_count} messages` : 'New chat';
}

function sessionTitle(s: PatientChatSessionSummary): string {
  if (s.session_summary) {
    const firstSentence = s.session_summary.split('.')[0];
    const t = firstSentence.trim();
    if (t.length >= 8) return t.length > 48 ? t.slice(0, 48) + '…' : t;
  }
  try {
    return new Date(s.started_at).toLocaleString([], {
      month: 'short',
      day: 'numeric',
      hour: 'numeric',
      minute: '2-digit',
    });
  } catch {
    return 'Conversation';
  }
}

/* ── Page ───────────────────────────────────────────────────────────── */

export default function PatientChat() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const patientId = user?.id ?? '';

  const [sessions, setSessions] = useState<PatientChatSessionSummary[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<UiMessage[]>([]);
  const [readOnly, setReadOnly] = useState(false);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [sending, setSending] = useState(false);
  const [historyLoading, setHistoryLoading] = useState(true);
  const [sessionLoading, setSessionLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const activeSessionRef = useRef<string | null>(null);
  const sentSomethingRef = useRef<boolean>(false);

  // Keep a ref of the active session for unmount/teardown handlers.
  useEffect(() => {
    activeSessionRef.current = activeSessionId;
  }, [activeSessionId]);

  // Auto-scroll to bottom on new messages.
  useEffect(() => {
    const el = scrollRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [messages, sending]);

  // Auto-grow textarea.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = Math.min(el.scrollHeight, 160) + 'px';
  }, [input]);

  // Revoke object URLs when previews change/unmount.
  useEffect(() => {
    return () => {
      pending.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /* ── Load history on mount ─────────────────────────────────────── */
  const refreshHistory = useCallback(async () => {
    if (!patientId) return;
    try {
      const res = await getPatientChatHistory(patientId);
      setSessions(res.sessions);
      return res.sessions;
    } catch (err) {
      console.error('Failed to load chat history', err);
      setError('Could not load your past conversations.');
      return [];
    } finally {
      setHistoryLoading(false);
    }
  }, [patientId]);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  /* ── Auto-save + summarize on leave ────────────────────────────── */
  useEffect(() => {
    const handleUnload = () => {
      const sid = activeSessionRef.current;
      if (sid && sentSomethingRef.current) {
        endPatientChatSessionBeacon(patientId, sid, getToken());
      }
    };
    window.addEventListener('beforeunload', handleUnload);
    return () => {
      window.removeEventListener('beforeunload', handleUnload);
      // Route-change cleanup — best-effort end + summarize.
      const sid = activeSessionRef.current;
      if (sid && sentSomethingRef.current) {
        void endPatientChatSession(patientId, sid).catch(() => {
          /* fall back to beacon if regular call rejected */
          endPatientChatSessionBeacon(patientId, sid, getToken());
        });
      }
    };
  }, [patientId]);

  /* ── Session selection ─────────────────────────────────────────── */

  const startNewChat = useCallback(async () => {
    // If the user is leaving an active live session that had real activity,
    // close it so the next session has a fresh memory.
    const prev = activeSessionRef.current;
    if (prev && sentSomethingRef.current && !readOnly) {
      try {
        await endPatientChatSession(patientId, prev);
      } catch {
        /* non-fatal */
      }
    }
    sentSomethingRef.current = false;
    setActiveSessionId(null);
    setMessages([]);
    setReadOnly(false);
    setError(null);
    setInput('');
    setPending([]);
    void refreshHistory();
  }, [patientId, readOnly, refreshHistory]);

  const openSession = useCallback(
    async (s: PatientChatSessionSummary) => {
      // Always opening a past/closed session in read-only mode.
      const prev = activeSessionRef.current;
      if (prev && sentSomethingRef.current && !readOnly && prev !== s.id) {
        try {
          await endPatientChatSession(patientId, prev);
        } catch {
          /* non-fatal */
        }
      }
      sentSomethingRef.current = false;
      setActiveSessionId(s.id);
      setReadOnly(true);
      setError(null);
      setSessionLoading(true);
      setMessages([]);
      try {
        const detail = await getPatientChatSession(s.id);
        setMessages(detail.messages.map((m) => ({ ...m })));
      } catch (err) {
        console.error('Failed to load session', err);
        setError('Could not load that conversation.');
      } finally {
        setSessionLoading(false);
      }
    },
    [patientId, readOnly],
  );

  /* ── File handling ─────────────────────────────────────────────── */

  const addFiles = useCallback((files: FileList | File[] | null) => {
    if (!files) return;
    setError(null);
    const additions: PendingAttachment[] = [];
    for (const file of Array.from(files)) {
      const kind = classifyFile(file);
      if (!kind) {
        setError(`${file.name} is not a supported file (JPG, PNG, or PDF only).`);
        continue;
      }
      if (file.size > MAX_FILE_MB * 1024 * 1024) {
        setError(`${file.name} exceeds the ${MAX_FILE_MB} MB limit.`);
        continue;
      }
      additions.push({
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        kind,
        previewUrl: kind === 'image' ? URL.createObjectURL(file) : null,
      });
    }
    if (additions.length) {
      setPending((p) => [...p, ...additions]);
    }
  }, []);

  const removePending = useCallback((id: string) => {
    setPending((p) => {
      const target = p.find((x) => x.id === id);
      if (target?.previewUrl) URL.revokeObjectURL(target.previewUrl);
      return p.filter((x) => x.id !== id);
    });
  }, []);

  /* ── Send ──────────────────────────────────────────────────────── */

  const send = useCallback(async () => {
    if (sending || readOnly) return;
    const trimmed = input.trim();
    if (!trimmed && pending.length === 0) return;

    setError(null);
    setSending(true);

    // Snapshot for the optimistic bubble.
    const optimisticUserId = `local-${Date.now()}`;
    const optimisticRefs: ChatFileReference[] = pending.map((p) => ({
      filename: p.file.name,
      mime_type: inferMime(p.file, p.kind),
      size_bytes: p.file.size,
      kind: p.kind,
    }));
    const optimisticMsg: UiMessage = {
      id: optimisticUserId,
      role: 'user',
      content: trimmed || '[attachment uploaded]',
      created_at: new Date().toISOString(),
      file_references: optimisticRefs,
    };
    const loadingMsg: UiMessage = {
      id: `local-loading-${Date.now()}`,
      role: 'assistant',
      content: '',
      created_at: new Date().toISOString(),
      pending: true,
    };
    setMessages((prev) => [...prev, optimisticMsg, loadingMsg]);

    // Clear the input immediately so the user can type the next turn.
    const pendingSnapshot = pending;
    setInput('');
    setPending([]);

    let attachmentsPayload: ChatAttachmentUpload[] = [];
    try {
      attachmentsPayload = await Promise.all(
        pendingSnapshot.map(async (p) => ({
          filename: p.file.name,
          mime_type: inferMime(p.file, p.kind),
          data_base64: await fileToBase64(p.file),
          kind: p.kind,
        })),
      );
    } catch (err) {
      console.error('Failed to encode attachments', err);
      setError('Could not read the attached file.');
      setMessages((prev) => prev.filter((m) => m.id !== optimisticUserId && m.id !== loadingMsg.id));
      setSending(false);
      // Restore previews so the user can retry.
      setPending(pendingSnapshot);
      return;
    }

    try {
      const res = await sendPatientChatMessage(
        patientId,
        activeSessionRef.current,
        trimmed || null,
        attachmentsPayload,
      );

      sentSomethingRef.current = true;
      if (res.session_id !== activeSessionRef.current) {
        setActiveSessionId(res.session_id);
        activeSessionRef.current = res.session_id;
      }

      setMessages((prev) =>
        prev
          .filter((m) => m.id !== loadingMsg.id)
          .concat({
            id: `srv-${Date.now()}`,
            role: 'assistant',
            content: res.reply,
            created_at: new Date().toISOString(),
          }),
      );

      // Release object URLs for sent images now that previews are gone.
      pendingSnapshot.forEach((p) => p.previewUrl && URL.revokeObjectURL(p.previewUrl));

      // Refresh sidebar so the new session shows up; summary may update later.
      void refreshHistory();
    } catch (err: unknown) {
      console.error('Send failed', err);
      setError("Sorry, I couldn't reach Dr. MediSense. Please try again.");
      setMessages((prev) => prev.filter((m) => m.id !== loadingMsg.id));
    } finally {
      setSending(false);
    }
  }, [input, pending, patientId, readOnly, refreshHistory, sending]);

  /* ── Drag & drop ───────────────────────────────────────────────── */
  const [dragOver, setDragOver] = useState(false);
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    if (readOnly) return;
    addFiles(e.dataTransfer.files);
  };

  /* ── Keyboard ──────────────────────────────────────────────────── */
  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void send();
    }
  };

  /* ── Grouped sessions for sidebar ──────────────────────────────── */
  const groupedSessions = useMemo(() => {
    const groups = new Map<string, PatientChatSessionSummary[]>();
    for (const s of sessions) {
      const b = dayBucket(s.started_at);
      const arr = groups.get(b) ?? [];
      arr.push(s);
      groups.set(b, arr);
    }
    return Array.from(groups.entries()).sort((a, b) => bucketOrder(a[0]) - bucketOrder(b[0]));
  }, [sessions]);

  /* ── Render ────────────────────────────────────────────────────── */

  const canSend = !sending && !readOnly && (input.trim().length > 0 || pending.length > 0);

  return (
    <div
      style={{
        height: 'calc(100vh - 64px)',
        display: 'flex',
        background: 'rgba(6,13,27,0.5)',
        overflow: 'hidden',
      }}
    >
      {/* ── Sidebar ────────────────────────────────────────────── */}
      <aside
        style={{
          width: 300,
          flexShrink: 0,
          borderRight: '1px solid var(--border-subtle)',
          background: 'rgba(6,13,27,0.85)',
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
        }}
      >
        <div
          style={{
            padding: '16px 16px 12px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: TEAL_DARK,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 13,
              }}
            >
              MA
            </div>
            <div style={{ lineHeight: 1.2 }}>
              <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>Dr. MediSense</div>
              <div style={{ fontSize: '0.72rem', color: 'var(--text-muted)' }}>
                Your AI medical companion
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={startNewChat}
            className="btn-primary"
            style={{
              width: '100%',
              justifyContent: 'center',
              padding: '10px 12px',
              fontSize: '0.88rem',
            }}
          >
            ＋ New Chat
          </button>
          <Link
            to="/patient"
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              textDecoration: 'none',
              textAlign: 'center',
            }}
          >
            ← Back to dashboard
          </Link>
        </div>

        <div style={{ flex: 1, overflowY: 'auto', padding: '12px 8px' }}>
          {historyLoading ? (
            <div style={{ padding: 16, color: 'var(--text-muted)', fontSize: '0.82rem' }}>
              Loading conversations…
            </div>
          ) : groupedSessions.length === 0 ? (
            <div
              style={{
                padding: 16,
                color: 'var(--text-muted)',
                fontSize: '0.82rem',
                lineHeight: 1.5,
              }}
            >
              No past conversations yet. Start a new chat to ask Dr. MediSense
              anything about your health.
            </div>
          ) : (
            groupedSessions.map(([bucket, items]) => (
              <div key={bucket} style={{ marginBottom: 14 }}>
                <div
                  style={{
                    fontSize: '0.7rem',
                    fontWeight: 700,
                    textTransform: 'uppercase',
                    letterSpacing: '0.6px',
                    color: 'var(--text-muted)',
                    padding: '4px 10px 6px',
                  }}
                >
                  {bucket}
                </div>
                {items.map((s) => {
                  const active = s.id === activeSessionId;
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => void openSession(s)}
                      style={{
                        width: '100%',
                        textAlign: 'left',
                        background: active ? 'rgba(5,174,187,0.15)' : 'transparent',
                        border: 'none',
                        borderLeft: active
                          ? `3px solid ${TEAL}`
                          : '3px solid transparent',
                        color: 'var(--text-primary)',
                        padding: '10px 12px',
                        cursor: 'pointer',
                        borderRadius: 8,
                        marginBottom: 4,
                      }}
                    >
                      <div
                        style={{
                          fontSize: '0.84rem',
                          fontWeight: 600,
                          marginBottom: 3,
                          whiteSpace: 'nowrap',
                          overflow: 'hidden',
                          textOverflow: 'ellipsis',
                        }}
                      >
                        {sessionTitle(s)}
                      </div>
                      <div
                        style={{
                          fontSize: '0.74rem',
                          color: 'var(--text-secondary)',
                          lineHeight: 1.4,
                          display: '-webkit-box',
                          WebkitLineClamp: 2,
                          WebkitBoxOrient: 'vertical',
                          overflow: 'hidden',
                        }}
                      >
                        {shortSummary(s)}
                      </div>
                    </button>
                  );
                })}
              </div>
            ))
          )}
        </div>
      </aside>

      {/* ── Active chat ────────────────────────────────────────── */}
      <main
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          minHeight: 0,
          background: 'rgba(15,30,60,0.25)',
          position: 'relative',
        }}
        onDragOver={(e) => {
          e.preventDefault();
          if (!readOnly) setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
      >
        {/* Header bar */}
        <header
          style={{
            padding: '14px 22px',
            borderBottom: '1px solid var(--border-subtle)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'rgba(6,13,27,0.6)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: TEAL,
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 700,
                fontSize: 14,
              }}
            >
              Dr
            </div>
            <div>
              <div style={{ fontWeight: 700, fontSize: '0.98rem' }}>Dr. MediSense</div>
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                {readOnly
                  ? 'Read-only view of past conversation'
                  : 'Online · powered by gpt-4o-mini agent'}
              </div>
            </div>
          </div>
          {readOnly && (
            <button
              className="btn-secondary"
              onClick={startNewChat}
              style={{ fontSize: '0.82rem', padding: '8px 14px' }}
            >
              Start New Chat
            </button>
          )}
        </header>

        {/* Messages area */}
        <div
          ref={scrollRef}
          style={{
            flex: 1,
            overflowY: 'auto',
            padding: '24px 24px 12px',
            display: 'flex',
            flexDirection: 'column',
            gap: 14,
          }}
        >
          {sessionLoading && (
            <div style={{ color: 'var(--text-muted)', textAlign: 'center', padding: 32 }}>
              Loading conversation…
            </div>
          )}

          {!sessionLoading && messages.length === 0 && !readOnly && (
            <div
              style={{
                margin: 'auto',
                maxWidth: 520,
                textAlign: 'center',
                color: 'var(--text-secondary)',
                lineHeight: 1.6,
              }}
            >
              <div style={{ fontSize: '1.6rem', marginBottom: 14 }}>👋</div>
              <h2 style={{ fontSize: '1.25rem', marginBottom: 10, color: 'var(--text-primary)' }}>
                Hi {user?.full_name?.split(' ')[0] ?? 'there'}, I'm Dr. MediSense.
              </h2>
              <p style={{ fontSize: '0.92rem' }}>
                Ask me about a symptom, a medication, or upload a recent lab
                report or photo (JPG, PNG, or PDF). I remember your past
                conversations and reports, so feel free to ask follow-up
                questions any time.
              </p>
            </div>
          )}

          {messages.map((m) => (
            <MessageBubble key={m.id} msg={m} />
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div
            style={{
              margin: '0 24px 8px',
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(220, 38, 38, 0.12)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              color: '#fca5a5',
              fontSize: '0.84rem',
            }}
          >
            ⚠️ {error}
          </div>
        )}

        {/* Pending attachments preview */}
        {pending.length > 0 && !readOnly && (
          <div
            style={{
              padding: '8px 24px 0',
              display: 'flex',
              gap: 10,
              flexWrap: 'wrap',
            }}
          >
            {pending.map((p) => (
              <AttachmentPreview key={p.id} item={p} onRemove={() => removePending(p.id)} />
            ))}
          </div>
        )}

        {/* Composer */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send();
          }}
          style={{
            padding: '12px 24px 18px',
            borderTop: '1px solid var(--border-subtle)',
            background: 'rgba(6,13,27,0.55)',
            flexShrink: 0,
          }}
        >
          <div
            style={{
              display: 'flex',
              alignItems: 'flex-end',
              gap: 10,
              background: 'rgba(15,30,60,0.6)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 18,
              padding: '8px 8px 8px 14px',
            }}
          >
            <button
              type="button"
              onClick={() => fileInputRef.current?.click()}
              disabled={readOnly || sending}
              title="Attach JPG, PNG, or PDF"
              aria-label="Attach file"
              style={{
                background: 'transparent',
                border: 'none',
                color: readOnly ? 'var(--text-muted)' : 'var(--text-secondary)',
                cursor: readOnly ? 'not-allowed' : 'pointer',
                padding: 8,
                fontSize: 18,
                lineHeight: 1,
              }}
            >
              📎
            </button>
            <input
              ref={fileInputRef}
              type="file"
              accept={ACCEPT_MIME}
              multiple
              onChange={(e) => {
                addFiles(e.target.files);
                e.target.value = '';
              }}
              style={{ display: 'none' }}
            />
            <textarea
              ref={inputRef}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={handleKeyDown}
              disabled={readOnly || sending}
              placeholder={
                readOnly
                  ? 'This conversation is read-only — start a new chat to talk to Dr. MediSense.'
                  : 'Ask Dr. MediSense anything…'
              }
              rows={1}
              maxLength={4000}
              style={{
                flex: 1,
                minHeight: 24,
                maxHeight: 160,
                background: 'transparent',
                border: 'none',
                outline: 'none',
                resize: 'none',
                color: 'var(--text-primary)',
                fontSize: '0.92rem',
                lineHeight: 1.5,
                padding: '6px 4px',
                fontFamily: 'inherit',
              }}
            />
            <button
              type="submit"
              disabled={!canSend}
              aria-label="Send"
              style={{
                width: 38,
                height: 38,
                borderRadius: '50%',
                background: canSend ? TEAL : 'rgba(5,174,187,0.25)',
                color: '#fff',
                border: 'none',
                cursor: canSend ? 'pointer' : 'not-allowed',
                fontSize: 16,
              }}
            >
              {sending ? '…' : '➤'}
            </button>
          </div>
          <div
            style={{
              fontSize: '0.7rem',
              color: 'var(--text-muted)',
              marginTop: 8,
              textAlign: 'center',
            }}
          >
            Dr. MediSense provides educational guidance only — always consult a
            licensed clinician for medical decisions.
          </div>
        </form>

        {/* Drag overlay */}
        {dragOver && !readOnly && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(5,174,187,0.18)',
              border: `2px dashed ${TEAL}`,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '1.1rem',
              color: '#fff',
              fontWeight: 700,
              pointerEvents: 'none',
              borderRadius: 4,
            }}
          >
            Drop your image or PDF to attach
          </div>
        )}
      </main>
    </div>
  );

  // unused — silences the navigate hook for future enhancements
  void navigate;
}

/* ── Sub-components ─────────────────────────────────────────────── */

function MessageBubble({ msg }: { msg: UiMessage }) {
  const isUser = msg.role === 'user';
  const refs = msg.file_references ?? [];

  return (
    <div
      style={{
        display: 'flex',
        justifyContent: isUser ? 'flex-end' : 'flex-start',
        gap: 10,
      }}
    >
      {!isUser && (
        <div
          style={{
            width: 32,
            height: 32,
            borderRadius: '50%',
            background: TEAL_DARK,
            color: '#fff',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 12,
            fontWeight: 700,
            flexShrink: 0,
          }}
        >
          Dr
        </div>
      )}
      <div
        style={{
          maxWidth: '70%',
          background: isUser ? TEAL : 'rgba(15,30,60,0.85)',
          color: isUser ? '#fff' : 'var(--text-primary)',
          padding: '10px 14px',
          borderRadius: isUser ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
          boxShadow: '0 1px 4px rgba(0,0,0,0.18)',
          fontSize: '0.92rem',
          lineHeight: 1.55,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
        }}
      >
        {refs.length > 0 && (
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              gap: 6,
              marginBottom: msg.content && msg.content !== '[attachment uploaded]' ? 8 : 0,
            }}
          >
            {refs.map((r, i) => (
              <FileChip key={i} ref_={r} onLightBg={!isUser} />
            ))}
          </div>
        )}
        {msg.pending ? (
          <span style={{ opacity: 0.7 }}>Dr. MediSense is thinking…</span>
        ) : msg.content === '[attachment uploaded]' && refs.length > 0 ? null : (
          <span>{msg.content}</span>
        )}
        <div
          style={{
            fontSize: '0.68rem',
            opacity: 0.6,
            marginTop: 6,
            textAlign: isUser ? 'right' : 'left',
          }}
        >
          {formatTime(msg.created_at)}
        </div>
      </div>
    </div>
  );
}

function FileChip({ ref_, onLightBg }: { ref_: ChatFileReference; onLightBg: boolean }) {
  const icon = ref_.kind === 'image' ? '🖼️' : '📄';
  return (
    <div
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 10px',
        background: onLightBg ? 'rgba(5,174,187,0.15)' : 'rgba(255,255,255,0.18)',
        borderRadius: 10,
        fontSize: '0.78rem',
      }}
    >
      <span style={{ fontSize: 16 }}>{icon}</span>
      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {ref_.filename}
      </span>
      <span style={{ opacity: 0.7 }}>· {formatFileSize(ref_.size_bytes)}</span>
    </div>
  );
}

function AttachmentPreview({
  item,
  onRemove,
}: {
  item: PendingAttachment;
  onRemove: () => void;
}) {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        gap: 10,
        padding: '8px 28px 8px 8px',
        background: 'rgba(15,30,60,0.65)',
        border: '1px solid var(--border-subtle)',
        borderRadius: 10,
        maxWidth: 240,
      }}
    >
      {item.kind === 'image' && item.previewUrl ? (
        <img
          src={item.previewUrl}
          alt={item.file.name}
          style={{
            width: 48,
            height: 48,
            objectFit: 'cover',
            borderRadius: 6,
            flexShrink: 0,
          }}
        />
      ) : (
        <div
          style={{
            width: 48,
            height: 48,
            borderRadius: 6,
            background: 'rgba(220, 38, 38, 0.18)',
            color: '#fca5a5',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: 22,
            flexShrink: 0,
          }}
        >
          📄
        </div>
      )}
      <div
        style={{
          fontSize: '0.78rem',
          minWidth: 0,
          display: 'flex',
          flexDirection: 'column',
          gap: 2,
        }}
      >
        <span
          style={{
            fontWeight: 600,
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
        >
          {item.file.name}
        </span>
        <span style={{ color: 'var(--text-muted)' }}>{formatFileSize(item.file.size)}</span>
      </div>
      <button
        type="button"
        onClick={onRemove}
        aria-label={`Remove ${item.file.name}`}
        style={{
          position: 'absolute',
          top: 4,
          right: 4,
          width: 20,
          height: 20,
          background: 'rgba(0,0,0,0.5)',
          color: '#fff',
          border: 'none',
          borderRadius: '50%',
          cursor: 'pointer',
          fontSize: 12,
          lineHeight: 1,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
        }}
      >
        ×
      </button>
    </div>
  );
}
