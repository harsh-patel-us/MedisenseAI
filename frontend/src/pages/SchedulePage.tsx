import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { listScheduledMeetings, scheduleConsultation } from '../api/consultationApi';
import type { ScheduledMeeting } from '../types/consultation.types';

/* ── Helpers ─────────────────────────────────────────────────────────── */

function toLocalDateTimeInput(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric',
      hour: 'numeric', minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function buildRoomUrl(roomId: string): string {
  const { protocol, host } = window.location;
  return `${protocol}//${host}/consultation/room/${roomId}`;
}

function buildIcs(meeting: ScheduledMeeting, joinUrl: string): string {
  const start = new Date(meeting.scheduled_at);
  const end = new Date(start.getTime() + meeting.duration_minutes * 60_000);
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');

  const description =
    `Join your MediSense AI consultation.\\n\\n` +
    `Doctor: ${meeting.doctor_name}\\n` +
    `Patient: ${meeting.patient_name}\\n` +
    (meeting.reason ? `Reason: ${meeting.reason}\\n` : '') +
    `\\nJoin link: ${joinUrl}\\nRoom ID: ${meeting.room_id}`;

  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//MediSense AI//Consultation//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:PUBLISH',
    'BEGIN:VEVENT',
    `UID:${meeting.room_id}@medisense.ai`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:MediSense Consultation — ${meeting.doctor_name} & ${meeting.patient_name}`,
    `DESCRIPTION:${description}`,
    `URL:${joinUrl}`,
    `LOCATION:${joinUrl}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}

function downloadIcs(meeting: ScheduledMeeting, joinUrl: string) {
  const ics = buildIcs(meeting, joinUrl);
  const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `medisense-consultation-${meeting.room_id}.ics`;
  a.click();
  URL.revokeObjectURL(url);
}

function buildMailto(meeting: ScheduledMeeting, joinUrl: string): string {
  const to = meeting.patient_email || '';
  const subject = encodeURIComponent(
    `Your consultation with ${meeting.doctor_name} — ${formatDateTime(meeting.scheduled_at)}`,
  );
  const body = encodeURIComponent(
    `Hello ${meeting.patient_name},\n\n` +
      `Your video consultation is scheduled for ${formatDateTime(meeting.scheduled_at)} ` +
      `(${meeting.duration_minutes} minutes) with ${meeting.doctor_name}.\n\n` +
      `Join using this link:\n${joinUrl}\n\n` +
      `Room ID: ${meeting.room_id}\n\n` +
      (meeting.reason ? `Reason for visit: ${meeting.reason}\n\n` : '') +
      `During the call, the conversation is live-transcribed. After the call ends, ` +
      `you'll receive a patient-friendly summary and your doctor will receive a SOAP note.\n\n` +
      `— MediSense AI`,
  );
  return `mailto:${to}?subject=${subject}&body=${body}`;
}

/* ── Form input styles ──────────────────────────────────────────────── */

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: 'var(--brand-teal)',
  marginBottom: 6,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: 'rgba(15,30,60,0.6)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  fontSize: '0.92rem',
  outline: 'none',
  transition: 'border-color 0.2s',
};

/* ── Page ────────────────────────────────────────────────────────────── */

export default function SchedulePage() {
  const navigate = useNavigate();

  // Default scheduled_at = next round half-hour
  const defaultStart = (() => {
    const d = new Date();
    d.setMinutes(d.getMinutes() < 30 ? 30 : 60, 0, 0);
    return toLocalDateTimeInput(d);
  })();

  const [form, setForm] = useState({
    doctor_name: '',
    patient_name: '',
    patient_email: '',
    reason: '',
    scheduled_at_local: defaultStart,
    duration_minutes: 30,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [created, setCreated] = useState<ScheduledMeeting | null>(null);
  const [copyOk, setCopyOk] = useState(false);

  const [upcoming, setUpcoming] = useState<ScheduledMeeting[]>([]);
  const [upcomingLoading, setUpcomingLoading] = useState(true);

  async function loadUpcoming() {
    setUpcomingLoading(true);
    try {
      const all = await listScheduledMeetings();
      const now = Date.now();
      setUpcoming(
        all.filter(m => new Date(m.scheduled_at).getTime() >= now - 15 * 60_000),
      );
    } catch {
      /* ignore */
    } finally {
      setUpcomingLoading(false);
    }
  }

  useEffect(() => { loadUpcoming(); }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');

    if (!form.doctor_name.trim() || !form.patient_name.trim()) {
      setError('Doctor and patient names are required.');
      return;
    }
    const startMs = new Date(form.scheduled_at_local).getTime();
    if (Number.isNaN(startMs)) {
      setError('Please pick a valid date and time.');
      return;
    }
    if (startMs < Date.now() - 60_000) {
      setError('Scheduled time must be in the future.');
      return;
    }

    setLoading(true);
    try {
      const meeting = await scheduleConsultation({
        doctor_name: form.doctor_name.trim(),
        patient_name: form.patient_name.trim(),
        patient_email: form.patient_email.trim() || undefined,
        scheduled_at: new Date(form.scheduled_at_local).toISOString(),
        duration_minutes: form.duration_minutes,
        reason: form.reason.trim(),
      });
      setCreated(meeting);
      loadUpcoming();
    } catch {
      setError('Failed to schedule the consultation. Is the backend running?');
    } finally {
      setLoading(false);
    }
  }

  async function copyLink(url: string) {
    try {
      await navigator.clipboard.writeText(url);
      setCopyOk(true);
      setTimeout(() => setCopyOk(false), 1800);
    } catch {
      /* ignore */
    }
  }

  function resetForm() {
    setCreated(null);
    setCopyOk(false);
    setForm(f => ({ ...f, reason: '', scheduled_at_local: defaultStart }));
  }

  return (
    <div style={{ flex: 1, padding: '48px 20px' }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 18px', borderRadius: 20,
            border: '1px solid rgba(5,174,187,0.3)',
            background: 'rgba(5,174,187,0.08)',
            fontSize: '0.78rem', fontWeight: 700, color: 'var(--brand-teal)',
            marginBottom: 18, textTransform: 'uppercase', letterSpacing: '0.6px',
          }}>
            📅 Video Consultation
          </div>
          <h1 style={{
            fontSize: 'clamp(1.8rem, 4vw, 2.6rem)', fontWeight: 900, lineHeight: 1.2,
            background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent', marginBottom: 12,
          }}>
            Schedule a Live Consultation
          </h1>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
            Pick a time, share the link. Doctor and patient meet live with real-time captions,
            and an AI-generated SOAP note arrives after the call ends.
          </p>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1fr)', gap: 28 }}>

          {/* ── LEFT: Form or Success ────────────────────────── */}
          <div className="glass-card" style={{ padding: '32px 30px' }}>
            {created ? (
              <SuccessPanel
                meeting={created}
                joinUrl={buildRoomUrl(created.room_id)}
                copyOk={copyOk}
                onCopy={copyLink}
                onReset={resetForm}
                onJoinNow={() => navigate(`/consultation/room/${created.room_id}?role=doctor`)}
              />
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
                <h2 style={{ fontSize: '1.25rem', fontWeight: 800, marginBottom: 2 }}>New Appointment</h2>
                <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: 10 }}>
                  All fields with * are required.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Doctor Name *</label>
                    <input
                      required
                      style={inputStyle}
                      placeholder="Dr. Rachel Kim"
                      value={form.doctor_name}
                      onChange={e => setForm(f => ({ ...f, doctor_name: e.target.value }))}
                      onFocus={e => (e.target.style.borderColor = 'var(--brand-teal)')}
                      onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Patient Name *</label>
                    <input
                      required
                      style={inputStyle}
                      placeholder="Sameer Khan"
                      value={form.patient_name}
                      onChange={e => setForm(f => ({ ...f, patient_name: e.target.value }))}
                      onFocus={e => (e.target.style.borderColor = 'var(--brand-teal)')}
                      onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                    />
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Patient Email (optional)</label>
                  <input
                    type="email"
                    style={inputStyle}
                    placeholder="patient@example.com"
                    value={form.patient_email}
                    onChange={e => setForm(f => ({ ...f, patient_email: e.target.value }))}
                    onFocus={e => (e.target.style.borderColor = 'var(--brand-teal)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                  />
                  <p style={{ fontSize: '0.72rem', color: 'var(--text-muted)', marginTop: 4 }}>
                    Used to pre-fill the invitation email after scheduling.
                  </p>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 14 }}>
                  <div>
                    <label style={labelStyle}>Date & Time *</label>
                    <input
                      required
                      type="datetime-local"
                      style={inputStyle}
                      value={form.scheduled_at_local}
                      onChange={e => setForm(f => ({ ...f, scheduled_at_local: e.target.value }))}
                      onFocus={e => (e.target.style.borderColor = 'var(--brand-teal)')}
                      onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                    />
                  </div>
                  <div>
                    <label style={labelStyle}>Duration</label>
                    <select
                      style={{ ...inputStyle, cursor: 'pointer' }}
                      value={form.duration_minutes}
                      onChange={e => setForm(f => ({ ...f, duration_minutes: parseInt(e.target.value, 10) }))}
                      onFocus={e => (e.target.style.borderColor = 'var(--brand-teal)')}
                      onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                    >
                      <option value={15}>15 min</option>
                      <option value={30}>30 min</option>
                      <option value={45}>45 min</option>
                      <option value={60}>60 min</option>
                    </select>
                  </div>
                </div>

                <div>
                  <label style={labelStyle}>Reason for Visit</label>
                  <textarea
                    rows={3}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 80 }}
                    placeholder="Brief description of symptoms or topic to discuss…"
                    value={form.reason}
                    onChange={e => setForm(f => ({ ...f, reason: e.target.value }))}
                    onFocus={e => (e.target.style.borderColor = 'var(--brand-teal)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                  />
                </div>

                {error && (
                  <div style={{
                    padding: '10px 14px', borderRadius: 10,
                    background: 'rgba(220,38,38,0.1)', border: '1px solid rgba(220,38,38,0.3)',
                    color: '#fca5a5', fontSize: '0.85rem',
                  }}>
                    ⚠ {error}
                  </div>
                )}

                <button
                  type="submit"
                  className="btn-primary"
                  disabled={loading}
                  style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: '0.95rem' }}
                >
                  {loading ? (
                    <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /> Scheduling…</>
                  ) : (
                    '📅 Schedule Consultation'
                  )}
                </button>
              </form>
            )}
          </div>

          {/* ── RIGHT: Upcoming + info ───────────────────────── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

            {/* How it works */}
            <div className="glass-card" style={{ padding: '26px 26px' }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 16 }}>
                What Happens Next
              </h3>
              {[
                { n: 1, t: 'Share the link', d: 'Copy the shareable link or download the calendar invite after scheduling.' },
                { n: 2, t: 'Both parties join', d: 'At the scheduled time, doctor and patient open the link — the video call connects automatically.' },
                { n: 3, t: 'Live captions', d: 'Every word is transcribed and speaker-labeled in real time during the conversation.' },
                { n: 4, t: 'AI SOAP summary', d: 'When the call ends, the LLM generates a clinical SOAP note and a patient-friendly explanation.' },
              ].map(step => (
                <div key={step.n} style={{ display: 'flex', gap: 14, marginBottom: 14 }}>
                  <div style={{
                    width: 28, height: 28, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(23,89,176,0.15)', color: 'var(--brand-teal)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.78rem',
                    border: '1px solid rgba(5,174,187,0.3)',
                  }}>{step.n}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem', marginBottom: 2 }}>{step.t}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.5 }}>{step.d}</div>
                  </div>
                </div>
              ))}
            </div>

            {/* Upcoming list */}
            <div className="glass-card" style={{ padding: '26px 26px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
                <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>Upcoming Meetings</h3>
                <button
                  onClick={loadUpcoming}
                  style={{
                    background: 'transparent', border: 'none',
                    color: 'var(--brand-teal)', fontSize: '0.78rem', fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  ↻ Refresh
                </button>
              </div>

              {upcomingLoading ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>Loading…</p>
              ) : upcoming.length === 0 ? (
                <p style={{ color: 'var(--text-muted)', fontSize: '0.85rem' }}>
                  No upcoming consultations. Schedule your first one on the left.
                </p>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 10, maxHeight: 380, overflowY: 'auto' }}>
                  {upcoming.map(m => (
                    <UpcomingCard key={m.room_id} meeting={m} />
                  ))}
                </div>
              )}
            </div>

            {/* Already have a link */}
            <div style={{
              padding: '16px 20px', borderRadius: 12,
              background: 'rgba(5,174,187,0.06)', border: '1px solid var(--border-subtle)',
              fontSize: '0.82rem', color: 'var(--text-secondary)', textAlign: 'center',
            }}>
              Already have a Room ID?{' '}
              <Link to="/consultation/join" style={{ color: 'var(--brand-teal)', fontWeight: 600 }}>
                Join an existing call →
              </Link>
            </div>

          </div>
        </div>
      </div>
    </div>
  );
}

/* ── Success panel ───────────────────────────────────────────────────── */

function SuccessPanel({
  meeting, joinUrl, copyOk, onCopy, onReset, onJoinNow,
}: {
  meeting: ScheduledMeeting;
  joinUrl: string;
  copyOk: boolean;
  onCopy: (url: string) => void;
  onReset: () => void;
  onJoinNow: () => void;
}) {
  return (
    <div>
      <div style={{ textAlign: 'center', marginBottom: 24 }}>
        <div style={{ fontSize: '2.8rem', marginBottom: 10 }}>✅</div>
        <h2 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: 6 }}>Consultation Scheduled!</h2>
        <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
          Share the link below with {meeting.patient_name}. Both of you can join at the scheduled time.
        </p>
      </div>

      {/* Detail card */}
      <div style={{
        padding: '18px 20px', borderRadius: 12,
        background: 'rgba(5,174,187,0.06)', border: '1px solid var(--border-subtle)',
        marginBottom: 18,
      }}>
        <div style={{ fontSize: '0.75rem', color: 'var(--brand-teal)', fontWeight: 700, marginBottom: 4, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
          {formatDateTime(meeting.scheduled_at)} · {meeting.duration_minutes} min
        </div>
        <div style={{ fontWeight: 700, marginBottom: 4 }}>
          {meeting.doctor_name} &nbsp;↔&nbsp; {meeting.patient_name}
        </div>
        {meeting.reason && (
          <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
            <strong>Reason:</strong> {meeting.reason}
          </div>
        )}
      </div>

      {/* Room ID + link */}
      <div style={{ marginBottom: 16 }}>
        <div style={labelStyle}>Room ID</div>
        <div style={{
          fontFamily: 'monospace', fontSize: '1.4rem', fontWeight: 800, letterSpacing: '4px',
          padding: '12px 16px', borderRadius: 10, textAlign: 'center',
          background: 'rgba(15,30,60,0.6)', border: '1px solid var(--border-subtle)',
          color: 'var(--brand-teal)',
        }}>
          {meeting.room_id}
        </div>
      </div>

      <div style={{ marginBottom: 18 }}>
        <div style={labelStyle}>Shareable Link</div>
        <div style={{ display: 'flex', gap: 8 }}>
          <input
            readOnly
            value={joinUrl}
            onFocus={e => e.target.select()}
            style={{ ...inputStyle, fontSize: '0.82rem', flex: 1 }}
          />
          <button
            onClick={() => onCopy(joinUrl)}
            className="btn-secondary"
            style={{ padding: '10px 16px', fontSize: '0.82rem', whiteSpace: 'nowrap' }}
          >
            {copyOk ? '✓ Copied' : '📋 Copy'}
          </button>
        </div>
      </div>

      {/* Action buttons */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 10 }}>
        <button
          onClick={() => downloadIcs(meeting, joinUrl)}
          className="btn-secondary"
          style={{ justifyContent: 'center', padding: '12px', fontSize: '0.85rem' }}
        >
          📆 Add to Calendar
        </button>
        <a
          href={buildMailto(meeting, joinUrl)}
          style={{ textDecoration: 'none' }}
          title="Opens a pre-filled draft in your default email app"
        >
          <button
            type="button"
            className="btn-secondary"
            style={{ width: '100%', justifyContent: 'center', padding: '12px', fontSize: '0.85rem' }}
          >
            ✉️ Open Email Draft
          </button>
        </a>
      </div>

      <p style={{
        fontSize: '0.72rem', color: 'var(--text-muted)', lineHeight: 1.5,
        marginBottom: 14, textAlign: 'center',
      }}>
        💡 "Open Email Draft" opens your email app with the invitation pre-filled — you'll still need
        to hit Send. MediSense does not send emails directly.
      </p>

      <button
        onClick={onJoinNow}
        className="btn-primary"
        style={{ width: '100%', justifyContent: 'center', padding: '13px', fontSize: '0.95rem', marginBottom: 8 }}
      >
        🎥 Open Call Now (as Doctor)
      </button>

      <button
        onClick={onReset}
        style={{
          width: '100%', padding: '10px', fontSize: '0.82rem',
          background: 'transparent', border: 'none',
          color: 'var(--text-muted)', cursor: 'pointer',
        }}
      >
        + Schedule another
      </button>
    </div>
  );
}

/* ── Upcoming meeting card ───────────────────────────────────────────── */

function UpcomingCard({ meeting }: { meeting: ScheduledMeeting }) {
  const navigate = useNavigate();
  const joinUrl = buildRoomUrl(meeting.room_id);
  const [copied, setCopied] = useState(false);

  const start = new Date(meeting.scheduled_at).getTime();
  const now = Date.now();
  const minutesUntil = Math.round((start - now) / 60_000);
  const isLive = minutesUntil <= 0 && minutesUntil > -meeting.duration_minutes;
  const isSoon = minutesUntil > 0 && minutesUntil <= 15;

  async function copy() {
    try {
      await navigator.clipboard.writeText(joinUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch { /* ignore */ }
  }

  let badge = null;
  if (isLive) {
    badge = <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(220,38,38,0.15)', color: '#f87171', fontSize: '0.7rem', fontWeight: 700, border: '1px solid rgba(220,38,38,0.3)' }}>● LIVE</span>;
  } else if (isSoon) {
    badge = <span style={{ padding: '2px 8px', borderRadius: 6, background: 'rgba(245,158,11,0.15)', color: '#fbbf24', fontSize: '0.7rem', fontWeight: 700, border: '1px solid rgba(245,158,11,0.3)' }}>SOON</span>;
  }

  return (
    <div style={{
      padding: '14px 16px', borderRadius: 10,
      background: 'rgba(15,30,60,0.4)', border: '1px solid var(--border-subtle)',
    }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6, gap: 8 }}>
        <div style={{ fontSize: '0.78rem', color: 'var(--brand-teal)', fontWeight: 700 }}>
          {formatDateTime(meeting.scheduled_at)}
        </div>
        {badge}
      </div>
      <div style={{ fontSize: '0.9rem', fontWeight: 700, marginBottom: 4 }}>
        {meeting.doctor_name} ↔ {meeting.patient_name}
      </div>
      {meeting.reason && (
        <div style={{ fontSize: '0.78rem', color: 'var(--text-secondary)', marginBottom: 8, lineHeight: 1.4 }}>
          {meeting.reason.length > 90 ? `${meeting.reason.slice(0, 90)}…` : meeting.reason}
        </div>
      )}
      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
        <button
          onClick={() => navigate(`/consultation/room/${meeting.room_id}?role=doctor`)}
          className="btn-secondary"
          style={{ padding: '6px 12px', fontSize: '0.75rem' }}
        >
          🩺 Join as Doctor
        </button>
        <button
          onClick={() => navigate(`/consultation/room/${meeting.room_id}?role=patient`)}
          className="btn-secondary"
          style={{ padding: '6px 12px', fontSize: '0.75rem' }}
        >
          🧬 Join as Patient
        </button>
        <button
          onClick={copy}
          className="btn-secondary"
          style={{ padding: '6px 12px', fontSize: '0.75rem' }}
        >
          {copied ? '✓' : '📋'} Copy Link
        </button>
        <span style={{
          fontFamily: 'monospace', fontSize: '0.7rem', color: 'var(--text-muted)',
          padding: '6px 8px', letterSpacing: '1px', marginLeft: 'auto',
        }}>
          {meeting.room_id}
        </span>
      </div>
    </div>
  );
}
