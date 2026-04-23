import { useState } from 'react';
import { Link } from 'react-router-dom';

type Control = {
  icon: string;
  title: string;
  summary: string;
  detail: string[];
  tag: string;
  color: string;
};

const controls: Control[] = [
  {
    icon: '🔐',
    title: 'Encryption in transit & at rest',
    summary: 'AES-256 at rest, TLS 1.3 in transit. Keys rotated quarterly.',
    detail: [
      'All database columns containing PHI are encrypted at rest with AES-256 via managed KMS.',
      'Every network hop is TLS 1.3. Older ciphers and SSL are explicitly disabled.',
      'Keys rotate quarterly under an automated schedule; key custody split between two officers.',
      'Backups inherit the same envelope encryption — restore integrity verified on every run.',
    ],
    tag: 'Encryption',
    color: '#22d3ee',
  },
  {
    icon: '🧭',
    title: 'Role-based access control',
    summary: 'Doctor/patient isolation enforced on every endpoint — never by UI only.',
    detail: [
      'Each API route declares its required role via a FastAPI dependency — no backdoors.',
      'Doctors cannot read another doctor\'s sessions; patients cannot enumerate other patients.',
      'Admin actions require a secondary hardware-key step-up.',
      'JWT tokens are short-lived and scoped; session revocation is instant.',
    ],
    tag: 'Authorization',
    color: '#a78bfa',
  },
  {
    icon: '🕳️',
    title: 'Zero training on your data',
    summary: 'Your consultations and lab reports are never used to train models.',
    detail: [
      'We pass data to inference endpoints under a no-retain, no-train contract.',
      'Prompts and completions are scrubbed from provider logs within 24 hours.',
      'Customer data is partitioned — no shared embeddings across tenants.',
      'You can request an attested deletion receipt at any time.',
    ],
    tag: 'AI Privacy',
    color: '#60a5fa',
  },
  {
    icon: '📜',
    title: 'Immutable audit log',
    summary: 'Every PHI read, write, and export is logged, hashed, and retained 7 years.',
    detail: [
      'Every access event is appended to a tamper-evident log (hash-chain).',
      'Exports include who, what, when, and the client IP / device fingerprint.',
      'Logs are queryable by the account owner through the admin console.',
      'Retention: 7 years by default — extendable for regulated customers.',
    ],
    tag: 'Auditability',
    color: '#4ade80',
  },
  {
    icon: '🧬',
    title: 'Clinician-in-the-loop',
    summary: 'AI output is always editable; nothing auto-signs or auto-submits.',
    detail: [
      'SOAP notes, findings, and care plans are drafts until a clinician confirms them.',
      'The UI highlights AI-generated text so it is never mistaken for clinician input.',
      'Every edit is captured in the session revision history.',
      'Patients see disclaimers on AI-generated guides alongside the doctor attribution.',
    ],
    tag: 'Safety',
    color: '#fbbf24',
  },
  {
    icon: '🚨',
    title: 'Incident response',
    summary: '24/7 on-call, 1-hour notification SLA, breach playbook reviewed quarterly.',
    detail: [
      'On-call rotation covers 24/7 with two-person escalation for PHI incidents.',
      'Customer notification SLA is 1 hour for confirmed PHI exposure.',
      'Breach playbook is tabletop-tested every quarter with external counsel.',
      'Postmortems are published to affected customers within 14 days.',
    ],
    tag: 'Response',
    color: '#f87171',
  },
];

const certifications = [
  { label: 'HIPAA', state: 'Aligned', note: 'BAAs available for paid plans.', color: '#22d3ee' },
  { label: 'SOC 2 Type II', state: 'In Audit', note: 'Report available Q3 2026 under NDA.', color: '#a78bfa' },
  { label: 'GDPR', state: 'Compliant', note: 'EU data residency available on request.', color: '#4ade80' },
  { label: 'ISO 27001', state: 'In Progress', note: 'Target certification Q4 2026.', color: '#fbbf24' },
  { label: 'PIPEDA (Canada)', state: 'Compliant', note: 'Regional data residency supported.', color: '#60a5fa' },
  { label: 'HITRUST', state: 'Roadmap', note: 'Targeted for enterprise plan.', color: '#f87171' },
];

const faq = [
  {
    q: 'Do you sign a Business Associate Agreement?',
    a: 'Yes. Every paid plan includes a HIPAA BAA at no extra cost. We sign your paper or ours — a template is available on request.',
  },
  {
    q: 'Where is data stored?',
    a: 'By default, data is stored in U.S. regions. EU and Canada residency are available on Enterprise plans. Storage regions are fixed per workspace — data never crosses regions unless you explicitly opt in.',
  },
  {
    q: 'What happens if I delete my account?',
    a: 'All PHI is purged within 30 days, with a final attested deletion receipt available by email. Backups roll off within the same window. Audit log summaries (not content) are retained for legal compliance.',
  },
  {
    q: 'Can I get a penetration test report?',
    a: 'Yes. An annual third-party pentest executive summary is available under NDA. Enterprise customers can request a scoped test against their own tenant.',
  },
  {
    q: 'Are AI model providers HIPAA covered?',
    a: 'We route AI calls through BAA-covered inference partners. No prompts or outputs are retained beyond the transient request window, and no tenant data is used for model training.',
  },
];

export default function SecurityPage() {
  const [openFaq, setOpenFaq] = useState<number | null>(0);

  return (
    <div style={{ flex: 1 }}>
      {/* Hero */}
      <section style={{
        padding: '80px 24px 56px',
        textAlign: 'center',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(5,174,187,0.14) 0%, transparent 70%)',
      }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 18px', borderRadius: 20,
            border: '1px solid rgba(5,174,187,0.3)',
            background: 'rgba(5,174,187,0.08)',
            fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-teal)',
            marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.6px',
          }}>
            🛡️ Trust Center
          </div>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 900, lineHeight: 1.15, marginBottom: 18,
          }}>
            Built on{' '}
            <span style={{
              background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              verifiable trust
            </span>
            , not marketing claims.
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Healthcare-grade security, patient-grade privacy. Every control below is
            engineered into the platform — not a slide deck.
          </p>
          <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap', marginTop: 26 }}>
            <a href="#controls"><button className="btn-primary">See the controls</button></a>
            <Link to="/contact"><button className="btn-secondary">Request audit docs</button></Link>
          </div>
        </div>
      </section>

      {/* Quick-glance badges */}
      <section style={{ padding: '48px 24px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
            gap: 14,
          }}>
            {certifications.map(c => (
              <div key={c.label} className="glass-card" style={{ padding: '18px 20px' }}>
                <div style={{
                  display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 6,
                }}>
                  <div style={{ fontWeight: 800, fontSize: '0.95rem' }}>{c.label}</div>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px',
                    padding: '3px 8px', borderRadius: 6,
                    background: `${c.color}1f`, color: c.color,
                    border: `1px solid ${c.color}40`,
                    textTransform: 'uppercase',
                  }}>
                    {c.state}
                  </span>
                </div>
                <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>
                  {c.note}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Controls */}
      <section id="controls" style={{ padding: '48px 24px 64px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, marginBottom: 10 }}>
              Every control, explained
            </h2>
            <p style={{ color: 'var(--text-secondary)', maxWidth: 620, margin: '0 auto', lineHeight: 1.6 }}>
              Tap any card to see how the control is implemented in the platform.
            </p>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 16,
          }}>
            {controls.map((c) => (
              <details
                key={c.title}
                className="glass-card"
                style={{ padding: 0, overflow: 'hidden', borderLeft: `4px solid ${c.color}` }}
              >
                <summary
                  style={{
                    listStyle: 'none', cursor: 'pointer',
                    padding: '22px 22px', display: 'flex', gap: 14, alignItems: 'flex-start',
                  }}
                >
                  <div style={{
                    width: 46, height: 46, borderRadius: 12, flexShrink: 0,
                    background: `${c.color}1f`, border: `1px solid ${c.color}40`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.4rem',
                  }}>{c.icon}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{
                      fontSize: '0.68rem', letterSpacing: '0.6px', fontWeight: 700,
                      color: c.color, textTransform: 'uppercase', marginBottom: 4,
                    }}>
                      {c.tag}
                    </div>
                    <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 4 }}>{c.title}</h3>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.5 }}>
                      {c.summary}
                    </div>
                  </div>
                </summary>
                <div style={{ padding: '0 22px 22px 82px' }}>
                  <ul style={{
                    listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 8,
                  }}>
                    {c.detail.map((d, i) => (
                      <li key={i} style={{
                        display: 'flex', gap: 10, color: 'var(--text-primary)',
                        fontSize: '0.85rem', lineHeight: 1.55,
                      }}>
                        <span style={{ color: c.color, flexShrink: 0 }}>▸</span>
                        {d}
                      </li>
                    ))}
                  </ul>
                </div>
              </details>
            ))}
          </div>
        </div>
      </section>

      {/* Infra diagram */}
      <section style={{
        padding: '64px 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(23,89,176,0.04)',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, marginBottom: 10 }}>
              Data flow, at a glance
            </h2>
            <p style={{ color: 'var(--text-secondary)', maxWidth: 620, margin: '0 auto' }}>
              Transparent architecture. No opaque middle-boxes.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
            gap: 14,
          }}>
            {[
              { step: '1', title: 'Browser', detail: 'TLS 1.3 to ingress. No third-party analytics inside consult rooms.', color: '#22d3ee' },
              { step: '2', title: 'API Gateway', detail: 'Auth, rate-limit, audit log. Rejects traffic without a valid JWT.', color: '#60a5fa' },
              { step: '3', title: 'Service Tier', detail: 'Per-route role dependency checks. No PHI written to stdout.', color: '#a78bfa' },
              { step: '4', title: 'AI Inference', detail: 'BAA-covered. No retention. No training on your data.', color: '#fbbf24' },
              { step: '5', title: 'Encrypted Store', detail: 'AES-256 at rest. Region-pinned. Row-level tenant isolation.', color: '#4ade80' },
            ].map((s, i, arr) => (
              <div key={s.step} style={{ display: 'flex', alignItems: 'stretch', gap: 8 }}>
                <div className="glass-card" style={{
                  flex: 1, padding: '18px 16px', borderTop: `3px solid ${s.color}`,
                }}>
                  <div style={{
                    display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                    width: 28, height: 28, borderRadius: '50%',
                    background: `${s.color}20`, color: s.color,
                    fontSize: '0.8rem', fontWeight: 800, marginBottom: 10,
                    border: `1px solid ${s.color}40`,
                  }}>{s.step}</div>
                  <div style={{ fontWeight: 800, fontSize: '0.92rem', marginBottom: 6 }}>{s.title}</div>
                  <div style={{ color: 'var(--text-secondary)', fontSize: '0.8rem', lineHeight: 1.55 }}>
                    {s.detail}
                  </div>
                </div>
                {i < arr.length - 1 && (
                  <div style={{
                    display: 'flex', alignItems: 'center', color: 'var(--brand-teal)',
                    fontSize: '1.2rem', fontWeight: 700,
                  }}>→</div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section style={{ padding: '64px 24px' }}>
        <div style={{ maxWidth: 820, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, marginBottom: 10 }}>
              Compliance questions
            </h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              The answers your procurement team actually asks for.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {faq.map((item, i) => {
              const isOpen = openFaq === i;
              return (
                <div
                  key={i}
                  className="glass-card"
                  style={{
                    padding: 0, overflow: 'hidden',
                    borderLeft: `4px solid ${isOpen ? 'var(--brand-teal)' : 'transparent'}`,
                    transition: 'border-color 0.2s',
                  }}
                >
                  <button
                    onClick={() => setOpenFaq(isOpen ? null : i)}
                    style={{
                      width: '100%', padding: '18px 22px',
                      background: 'transparent', border: 'none', color: 'inherit',
                      display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                      cursor: 'pointer', textAlign: 'left', fontSize: '0.95rem', fontWeight: 700,
                    }}
                  >
                    <span>{item.q}</span>
                    <span style={{
                      color: 'var(--brand-teal)', fontSize: '1.2rem', fontWeight: 700,
                      transform: isOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s',
                    }}>+</span>
                  </button>
                  {isOpen && (
                    <div style={{
                      padding: '0 22px 20px', color: 'var(--text-secondary)',
                      fontSize: '0.9rem', lineHeight: 1.65,
                    }}>
                      {item.a}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: '56px 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(23,89,176,0.04)',
        textAlign: 'center',
      }}>
        <h2 style={{ fontSize: 'clamp(1.4rem, 2.4vw, 1.8rem)', fontWeight: 800, marginBottom: 12 }}>
          Need deeper evidence for your audit?
        </h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 540, margin: '0 auto 24px' }}>
          We share our SOC 2 roadmap letter, pentest summaries, and DPA templates under NDA.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/contact"><button className="btn-primary">Request security pack</button></Link>
          <Link to="/pricing"><button className="btn-secondary">Compare plans</button></Link>
        </div>
      </section>
    </div>
  );
}
