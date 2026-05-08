import { useEffect, useRef, useState } from 'react';
import { getAuditReport } from '../../api/doctorApi';
import type {
  AuditIssue,
  AuditPriority,
  SoapAuditResponse,
} from '../../types/doctor.types';

const TEAL = '#05aebb';
const POLL_INTERVAL_MS = 3000;
const MAX_POLLS = 15; // 15 × 3 s = 45 s
const KEYFRAMES_ID = 'medisense-audit-keyframes';

type LoadState =
  | { kind: 'loading'; attempt: number }
  | { kind: 'ready'; audit: SoapAuditResponse }
  | { kind: 'failed'; reason: string };

function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(KEYFRAMES_ID)) return;
  const style = document.createElement('style');
  style.id = KEYFRAMES_ID;
  style.textContent = `
    @keyframes medisense-audit-pulse {
      0%, 100% { opacity: 0.7; }
      50% { opacity: 1; }
    }
  `;
  document.head.appendChild(style);
}

function scoreColor(score: number): string {
  if (score >= 8) return '#16a34a'; // green
  if (score >= 5) return '#ca8a04'; // yellow
  if (score >= 1) return '#dc2626'; // red
  return 'var(--text-muted)';
}

function qualityLabel(audit: SoapAuditResponse): string {
  const parts: string[] = [];
  if (audit.overall_score) parts.push(`${audit.overall_score}/10`);
  if (audit.overall_quality) {
    parts.push(audit.overall_quality.replace('_', ' '));
  }
  return parts.join(' — ') || 'Audit complete';
}

function priorityStyle(priority: string): { bg: string; border: string; text: string } {
  if (priority === 'high') {
    return {
      bg: 'rgba(220, 38, 38, 0.14)',
      border: 'rgba(220, 38, 38, 0.55)',
      text: '#fca5a5',
    };
  }
  if (priority === 'medium') {
    return {
      bg: 'rgba(234, 88, 12, 0.14)',
      border: 'rgba(234, 88, 12, 0.55)',
      text: '#fdba74',
    };
  }
  return {
    bg: 'rgba(202, 138, 4, 0.14)',
    border: 'rgba(202, 138, 4, 0.55)',
    text: '#fde68a',
  };
}

function summaryBadge(state: LoadState): { label: string; color: string } {
  if (state.kind === 'loading') {
    return { label: 'Auditing…', color: 'var(--text-muted)' };
  }
  if (state.kind === 'failed') {
    return { label: 'Audit unavailable', color: '#fca5a5' };
  }
  const issues = state.audit.critical_issues?.length ?? 0;
  if (issues === 0) {
    return { label: 'No issues found', color: '#86efac' };
  }
  return {
    label: `${issues} issue${issues === 1 ? '' : 's'} found`,
    color: '#fdba74',
  };
}

export interface SoapAuditPanelProps {
  sessionId: string;
}

export default function SoapAuditPanel({ sessionId }: SoapAuditPanelProps) {
  const [state, setState] = useState<LoadState>({ kind: 'loading', attempt: 0 });
  const [open, setOpen] = useState(false);
  const cancelledRef = useRef(false);

  useEffect(() => {
    ensureKeyframes();
  }, []);

  // Poll the audit endpoint until the audit lands or we hit MAX_POLLS.
  // Resetting on `sessionId` so a fresh /generate-note re-triggers polling.
  useEffect(() => {
    cancelledRef.current = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | null = null;
    setState({ kind: 'loading', attempt: 0 });

    const tick = async () => {
      if (cancelledRef.current) return;
      attempt += 1;
      try {
        const res = await getAuditReport(sessionId);
        if (cancelledRef.current) return;
        if (res.status === 'pending') {
          if (attempt >= MAX_POLLS) {
            setState({
              kind: 'failed',
              reason: 'Audit is still running after 45 seconds.',
            });
            return;
          }
          setState({ kind: 'loading', attempt });
          timer = setTimeout(tick, POLL_INTERVAL_MS);
          return;
        }
        // Treat backend "failed" status the same as a failed request — the
        // panel falls back to the manual-review message.
        if (res.status === 'failed') {
          setState({
            kind: 'failed',
            reason:
              res.reviewer_summary ||
              'The reviewer could not produce a structured audit.',
          });
          return;
        }
        setState({ kind: 'ready', audit: res });
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

  const badge = summaryBadge(state);

  return (
    <div
      className="glass-card"
      style={{
        marginTop: 24,
        padding: 0,
        overflow: 'hidden',
        border: '1px solid var(--border-subtle)',
      }}
    >
      {/* ── Header (always visible) ────────────────────────────────── */}
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
        <span style={{ fontSize: 22 }}>🔍</span>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontWeight: 800, fontSize: '0.98rem' }}>
            Second Opinion — Clinical Audit
          </div>
          <div
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              marginTop: 2,
            }}
          >
            AI senior-reviewer pass for documentation completeness and safety.
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
                ? 'medisense-audit-pulse 1.6s ease-in-out infinite'
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

      {/* ── Body ───────────────────────────────────────────────────── */}
      {open && (
        <div style={{ padding: '20px 22px', display: 'flex', flexDirection: 'column', gap: 18 }}>
          {state.kind === 'loading' && (
            <div
              style={{
                fontSize: '0.9rem',
                color: 'var(--text-secondary)',
                animation: 'medisense-audit-pulse 1.6s ease-in-out infinite',
              }}
            >
              Audit in progress… Analyzing for clinical completeness.
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
              ⚠️ Audit unavailable — please review manually.
              {state.reason && (
                <div style={{ fontSize: '0.78rem', marginTop: 4, opacity: 0.85 }}>
                  {state.reason}
                </div>
              )}
            </div>
          )}

          {state.kind === 'ready' && (
            <AuditBody audit={state.audit} />
          )}

          {/* Disclaimer is always visible when expanded. */}
          <div
            style={{
              fontSize: '0.74rem',
              color: 'var(--text-muted)',
              borderTop: '1px solid var(--border-subtle)',
              paddingTop: 12,
              lineHeight: 1.5,
            }}
          >
            ⚠️ This is an AI-generated audit for educational reference only.
            Clinical judgment of the treating physician supersedes all AI
            suggestions.
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Audit body (rendered when audit is ready) ─────────────────────── */

function AuditBody({ audit }: { audit: SoapAuditResponse }) {
  const color = scoreColor(audit.overall_score);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Score badge */}
      <div style={{ display: 'flex', alignItems: 'center', gap: 14, flexWrap: 'wrap' }}>
        <div
          style={{
            padding: '10px 16px',
            borderRadius: 12,
            background: `${color}22`,
            border: `1.5px solid ${color}`,
            color,
            fontWeight: 800,
            fontSize: '0.98rem',
            letterSpacing: '0.3px',
          }}
        >
          {qualityLabel(audit)}
        </div>
        {audit.reviewer_summary && (
          <blockquote
            style={{
              flex: 1,
              minWidth: 240,
              margin: 0,
              padding: '10px 14px',
              borderLeft: `3px solid ${TEAL}`,
              background: 'rgba(5,174,187,0.08)',
              borderRadius: '0 10px 10px 0',
              fontStyle: 'italic',
              fontSize: '0.9rem',
              lineHeight: 1.55,
              color: 'var(--text-secondary)',
            }}
          >
            {audit.reviewer_summary}
          </blockquote>
        )}
      </div>

      {/* Critical issues */}
      <Section title="Critical Issues" emptyText="No critical issues identified.">
        {audit.critical_issues.length === 0 ? null : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {audit.critical_issues.map((it, i) => (
              <CriticalIssueCard key={i} issue={it} />
            ))}
          </div>
        )}
      </Section>

      {/* Missing differentials */}
      <Section
        title="Missing Differentials"
        emptyText="No additional differentials suggested."
      >
        {audit.missing_differentials.length === 0 ? null : (
          <ul style={listStyle}>
            {audit.missing_differentials.map((d, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <span style={{ color: TEAL, fontWeight: 800, marginRight: 6 }}>＋</span>
                {d}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Documentation gaps */}
      <Section
        title="Documentation Gaps"
        emptyText="No documentation gaps flagged."
      >
        {audit.documentation_gaps.length === 0 ? null : (
          <ul style={listStyle}>
            {audit.documentation_gaps.map((g, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <span style={{ color: '#fdba74', marginRight: 6 }}>⚠️</span>
                {g}
              </li>
            ))}
          </ul>
        )}
      </Section>

      {/* Positive findings */}
      <Section title="What's Done Well" emptyText="No specific strengths noted.">
        {audit.positive_findings.length === 0 ? null : (
          <ul style={listStyle}>
            {audit.positive_findings.map((p, i) => (
              <li key={i} style={{ marginBottom: 4 }}>
                <span style={{ color: '#86efac', marginRight: 6 }}>✓</span>
                {p}
              </li>
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

function Section({
  title,
  children,
  emptyText,
}: {
  title: string;
  children: React.ReactNode;
  emptyText: string;
}) {
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
      {children ?? (
        <div style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>{emptyText}</div>
      )}
    </div>
  );
}

function CriticalIssueCard({ issue }: { issue: AuditIssue }) {
  const sev = priorityStyle(String(issue.priority || 'medium'));
  const priorityLabel: AuditPriority | string = issue.priority || 'medium';
  return (
    <div
      style={{
        padding: '12px 14px',
        borderRadius: 10,
        background: sev.bg,
        border: `1px solid ${sev.border}`,
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          fontWeight: 800,
          letterSpacing: '0.6px',
          textTransform: 'uppercase',
          color: sev.text,
        }}
      >
        Priority: {String(priorityLabel)}
      </div>
      <div style={{ fontWeight: 700, fontSize: '0.92rem' }}>{issue.issue}</div>
      {issue.recommendation && (
        <div
          style={{
            fontSize: '0.84rem',
            color: 'var(--text-secondary)',
            lineHeight: 1.5,
          }}
        >
          <span style={{ fontWeight: 700, marginRight: 4 }}>Suggested:</span>
          {issue.recommendation}
        </div>
      )}
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
