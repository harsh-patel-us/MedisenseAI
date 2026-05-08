import { useEffect, useRef, useState } from 'react';
import {
  downloadFollowUpPdf,
  getFollowUpPlan,
  sendFollowUpToPatient,
} from '../../api/doctorApi';
import type { FollowUpPlan } from '../../types/doctor.types';

const POLL_INTERVAL_MS = 2000;
const MAX_POLLS = 10; // 10 × 2 s = 20 s

const TEAL = '#05aebb';
const KEYFRAMES_ID = 'medisense-followup-keyframes';

type LoadState =
  | { kind: 'loading'; attempt: number }
  | { kind: 'ready'; plan: FollowUpPlan }
  | { kind: 'failed'; reason: string };

function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes medisense-followup-pulse {
      0%, 100% { opacity: 0.7; }
      50%      { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function summaryBadge(state: LoadState): { label: string; color: string } {
  if (state.kind === 'loading') return { label: 'Generating…', color: 'var(--text-muted)' };
  if (state.kind === 'failed') return { label: 'Unavailable', color: '#fca5a5' };
  return { label: 'Ready', color: '#86efac' };
}

export interface FollowUpCardProps {
  sessionId: string;
}

export default function FollowUpCard({ sessionId }: FollowUpCardProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading', attempt: 0 });
  const [open, setOpen] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [sending, setSending] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const cancelledRef = useRef(false);

  useEffect(() => {
    ensureKeyframes();
  }, []);

  // Poll the GET endpoint until the follow-up has been extracted, or we
  // hit MAX_POLLS. `sessionId` keys the effect so a fresh /generate-note
  // re-triggers polling.
  useEffect(() => {
    cancelledRef.current = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setState({ kind: 'loading', attempt: 0 });

    const tick = async () => {
      if (cancelledRef.current) return;
      attempt += 1;
      try {
        const res = await getFollowUpPlan(sessionId);
        if (cancelledRef.current) return;
        if (res.status === 'pending') {
          if (attempt >= MAX_POLLS) {
            setState({
              kind: 'failed',
              reason: 'Follow-up plan is still being generated.',
            });
            return;
          }
          setState({ kind: 'loading', attempt });
          timer = setTimeout(tick, POLL_INTERVAL_MS);
          return;
        }
        setState({ kind: 'ready', plan: res });
      } catch (err) {
        if (cancelledRef.current) return;
        if (attempt >= MAX_POLLS) {
          setState({
            kind: 'failed',
            reason: (err as Error).message || 'Network error.',
          });
          return;
        }
        timer = setTimeout(tick, POLL_INTERVAL_MS);
      }
    };

    void tick();

    return () => {
      cancelledRef.current = true;
      if (timer) clearTimeout(timer);
    };
  }, [sessionId]);

  const handleDownload = async () => {
    if (exporting) return;
    setExporting(true);
    try {
      const blob = await downloadFollowUpPdf(sessionId);
      downloadBlob(blob, `medisense_followup_${sessionId.slice(0, 8)}.pdf`);
    } catch (err) {
      console.error('PDF download failed', err);
      setToast('Could not generate the follow-up PDF.');
    } finally {
      setExporting(false);
    }
  };

  const handleSend = async () => {
    if (sending) return;
    setSending(true);
    try {
      await sendFollowUpToPatient(sessionId);
      setToast('Follow-up plan sent to patient chat.');
      // Mark locally so the button disables without a refetch.
      setState((prev) =>
        prev.kind === 'ready'
          ? { ...prev, plan: { ...prev.plan, is_sent_to_patient: true } }
          : prev,
      );
    } catch (err) {
      const detail =
        (err as { response?: { data?: { detail?: string } } })?.response?.data?.detail ||
        'Could not send to patient chat.';
      console.error('Send to patient failed', err);
      setToast(typeof detail === 'string' ? detail : 'Could not send to patient chat.');
    } finally {
      setSending(false);
      setTimeout(() => setToast(null), 3500);
    }
  };

  const badge = summaryBadge(state);
  const plan = state.kind === 'ready' ? state.plan : null;
  const canSend = Boolean(plan?.patient_id);

  return (
    <div
      className="glass-card"
      style={{
        marginTop: 18,
        padding: 0,
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* Header */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        style={{
          width: '100%',
          background: 'rgba(15,30,60,0.55)',
          border: 'none',
          padding: '14px 20px',
          color: 'var(--text-primary)',
          cursor: 'pointer',
          display: 'flex',
          alignItems: 'center',
          gap: 14,
          textAlign: 'left',
        }}
      >
        <span style={{ fontSize: 22 }}>📅</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '0.98rem' }}>
            Follow-Up Plan
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)', marginTop: 2 }}>
            Patient-friendly summary of what to monitor, when to return, and red-flag warnings.
          </div>
        </div>
        <span
          style={{
            fontSize: '0.74rem',
            fontWeight: 800,
            letterSpacing: '0.4px',
            textTransform: 'uppercase',
            color: badge.color,
            padding: '4px 10px',
            border: `1px solid ${badge.color}55`,
            borderRadius: 999,
            animation:
              state.kind === 'loading'
                ? 'medisense-followup-pulse 1.6s ease-in-out infinite'
                : undefined,
          }}
        >
          {badge.label}
        </span>
        <span
          aria-hidden="true"
          style={{
            color: 'var(--text-muted)',
            transform: open ? 'rotate(90deg)' : 'rotate(0deg)',
            transition: 'transform 0.18s ease',
            fontSize: 18,
          }}
        >
          ›
        </span>
      </button>

      {open && (
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {state.kind === 'loading' && (
            <div
              style={{
                fontSize: '0.9rem',
                color: 'var(--text-secondary)',
                animation: 'medisense-followup-pulse 1.6s ease-in-out infinite',
              }}
            >
              Drafting the patient-facing follow-up plan…
              <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)', marginTop: 4 }}>
                Attempt {state.attempt} of {MAX_POLLS}
              </div>
            </div>
          )}

          {state.kind === 'failed' && (
            <div
              style={{
                fontSize: '0.9rem',
                color: '#fca5a5',
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(220, 38, 38, 0.12)',
                border: '1px solid rgba(220, 38, 38, 0.3)',
              }}
            >
              ⚠️ Follow-up plan unavailable. {state.reason}
            </div>
          )}

          {plan && <FollowUpBody plan={plan} />}

          {/* Actions */}
          {plan && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
              <button
                type="button"
                className="btn-primary"
                onClick={handleDownload}
                disabled={exporting}
                style={{ padding: '8px 16px', fontSize: '0.85rem', fontWeight: 700 }}
              >
                {exporting ? 'Preparing…' : '📥 Download Patient Follow-Up PDF'}
              </button>
              {canSend && (
                <button
                  type="button"
                  className="btn-secondary"
                  onClick={handleSend}
                  disabled={sending || plan.is_sent_to_patient}
                  style={{ padding: '8px 16px', fontSize: '0.85rem', fontWeight: 700 }}
                >
                  {plan.is_sent_to_patient
                    ? '✓ Sent to Patient Chat'
                    : sending
                      ? 'Sending…'
                      : '💬 Send to Patient Chat'}
                </button>
              )}
            </div>
          )}

          {toast && (
            <div
              role="status"
              aria-live="polite"
              style={{
                fontSize: '0.84rem',
                color: 'var(--text-secondary)',
                padding: '8px 12px',
                background: 'rgba(5,174,187,0.12)',
                border: '1px solid rgba(5,174,187,0.4)',
                borderRadius: 8,
              }}
            >
              {toast}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Body sections ─────────────────────────────────────────────────── */

function FollowUpBody({ plan }: { plan: FollowUpPlan }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* When to return */}
      <Section title="When to Return">
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <Row label="Next visit" value={plan.follow_up_date || 'Not specified'} />
          <Row label="Reason" value={plan.follow_up_reason || 'General follow-up'} />
          {plan.follow_up_specialist && (
            <Row label="Specialist" value={plan.follow_up_specialist} />
          )}
        </div>
      </Section>

      {/* Monitoring */}
      {plan.monitoring_items.length > 0 && (
        <Section title="What to Monitor">
          <ul style={listStyle}>
            {plan.monitoring_items.map((item, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <span style={{ color: TEAL, fontWeight: 800, marginRight: 6 }}>☐</span>
                {item}
              </li>
            ))}
          </ul>
        </Section>
      )}

      {/* Warning signs */}
      <div
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          background: 'rgba(220, 38, 38, 0.12)',
          border: '1px solid rgba(220, 38, 38, 0.45)',
        }}
      >
        <div
          style={{
            fontSize: '0.78rem',
            fontWeight: 800,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: '#fca5a5',
            marginBottom: 8,
          }}
        >
          ⚠ Warning Signs — Go to Emergency If:
        </div>
        <ul style={{ ...listStyle, color: '#fecaca' }}>
          {plan.warning_signs.map((item, i) => (
            <li key={i} style={{ marginBottom: 4 }}>
              <span style={{ marginRight: 6 }}>•</span>
              {item}
            </li>
          ))}
        </ul>
      </div>

      {/* Medications */}
      {plan.medications_to_start.length > 0 && (
        <Section title="Your Medications">
          <div
            style={{
              border: '1px solid var(--border-subtle)',
              borderRadius: 10,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: '2fr 1fr 1fr',
                background: 'rgba(15,30,60,0.7)',
                fontSize: '0.74rem',
                fontWeight: 800,
                letterSpacing: '0.4px',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
                padding: '8px 12px',
              }}
            >
              <div>Medication</div>
              <div>Dose</div>
              <div>Frequency</div>
            </div>
            {plan.medications_to_start.map((m, i) => (
              <div
                key={i}
                style={{
                  display: 'grid',
                  gridTemplateColumns: '2fr 1fr 1fr',
                  padding: '8px 12px',
                  fontSize: '0.86rem',
                  borderTop: '1px solid var(--border-subtle)',
                  color: 'var(--text-primary)',
                }}
              >
                <div style={{ fontWeight: 700 }}>{m.drug}</div>
                <div>{m.dose || '—'}</div>
                <div>{m.frequency || '—'}</div>
              </div>
            ))}
          </div>
        </Section>
      )}

      {/* Diet & activity */}
      {(plan.dietary_restrictions.length > 0 || plan.activity_restrictions.length > 0) && (
        <Section title="Diet & Activity">
          {plan.dietary_restrictions.length > 0 && (
            <>
              <div style={subLabel}>Dietary guidance</div>
              <ul style={listStyle}>
                {plan.dietary_restrictions.map((d, i) => (
                  <li key={i}>• {d}</li>
                ))}
              </ul>
            </>
          )}
          {plan.activity_restrictions.length > 0 && (
            <>
              <div style={{ ...subLabel, marginTop: 8 }}>Activity guidance</div>
              <ul style={listStyle}>
                {plan.activity_restrictions.map((d, i) => (
                  <li key={i}>• {d}</li>
                ))}
              </ul>
            </>
          )}
        </Section>
      )}

      {/* Doctor's instructions (quoted paragraph) */}
      {plan.patient_instructions && (
        <Section title="Doctor's Instructions">
          <blockquote
            style={{
              margin: 0,
              padding: '10px 14px',
              borderLeft: `3px solid ${TEAL}`,
              background: 'rgba(5,174,187,0.08)',
              borderRadius: '0 10px 10px 0',
              fontStyle: 'italic',
              fontSize: '0.92rem',
              lineHeight: 1.6,
              color: 'var(--text-secondary)',
            }}
          >
            {plan.patient_instructions}
          </blockquote>
        </Section>
      )}
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h4
        style={{
          fontSize: '0.82rem',
          fontWeight: 800,
          textTransform: 'uppercase',
          letterSpacing: '0.5px',
          color: 'var(--text-secondary)',
          marginBottom: 8,
        }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div style={{ display: 'flex', gap: 10, fontSize: '0.9rem' }}>
      <span
        style={{
          fontWeight: 700,
          color: 'var(--text-muted)',
          minWidth: 110,
        }}
      >
        {label}:
      </span>
      <span style={{ color: 'var(--text-primary)' }}>{value}</span>
    </div>
  );
}

const listStyle: React.CSSProperties = {
  margin: 0,
  paddingLeft: 4,
  listStyle: 'none',
  fontSize: '0.88rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.6,
};

const subLabel: React.CSSProperties = {
  fontSize: '0.78rem',
  fontWeight: 700,
  color: 'var(--text-muted)',
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
  marginBottom: 4,
};
