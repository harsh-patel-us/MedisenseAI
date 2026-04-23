import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

type Integration = {
  name: string;
  category: 'EHR' | 'Scheduling' | 'Messaging' | 'Imaging' | 'Billing' | 'AI' | 'Storage';
  icon: string;
  status: 'Live' | 'Beta' | 'Q3 2026' | 'Planned';
  summary: string;
  highlights: string[];
  color: string;
};

const integrations: Integration[] = [
  {
    name: 'Epic (FHIR R4)',
    category: 'EHR',
    icon: '🏥',
    status: 'Live',
    summary: 'Push SOAP notes to the chart, pull demographics at session start.',
    highlights: ['SMART-on-FHIR launch', 'DocumentReference write-back', 'Read-only patient demographics'],
    color: '#22d3ee',
  },
  {
    name: 'Cerner / Oracle Health',
    category: 'EHR',
    icon: '🧬',
    status: 'Live',
    summary: 'Bi-directional encounter sync over FHIR R4 with scoped OAuth.',
    highlights: ['Encounter creation', 'PDF attachment to chart', 'Provider-scoped tokens'],
    color: '#60a5fa',
  },
  {
    name: 'athenahealth',
    category: 'EHR',
    icon: '🩺',
    status: 'Beta',
    summary: 'Documentation attachment via athenaClinicals API.',
    highlights: ['Appointment resolve', 'Note upload', 'Encounter close trigger'],
    color: '#a78bfa',
  },
  {
    name: 'DrChrono',
    category: 'EHR',
    icon: '📝',
    status: 'Live',
    summary: 'Upload signed SOAP PDFs into the patient chart.',
    highlights: ['OAuth 2.0 partner app', 'Scoped provider access', 'PDF handoff'],
    color: '#4ade80',
  },
  {
    name: 'OpenEMR',
    category: 'EHR',
    icon: '💊',
    status: 'Live',
    summary: 'Open-source friendly — direct API calls with per-org credentials.',
    highlights: ['Self-hosted ready', 'No gateway dependency', 'Local audit trail'],
    color: '#fbbf24',
  },
  {
    name: 'Google Calendar',
    category: 'Scheduling',
    icon: '📅',
    status: 'Live',
    summary: 'Schedule video consultations and auto-create calendar invites.',
    highlights: ['OAuth sign-in', 'ICS fallback', 'Reminder emails'],
    color: '#22d3ee',
  },
  {
    name: 'Microsoft 365 (Outlook)',
    category: 'Scheduling',
    icon: '📆',
    status: 'Live',
    summary: 'Calendar + Teams-compatible invites with join links.',
    highlights: ['Graph API', 'Tenant-scoped', 'MFA compatible'],
    color: '#60a5fa',
  },
  {
    name: 'Calendly',
    category: 'Scheduling',
    icon: '🗓️',
    status: 'Live',
    summary: 'Paste your Calendly link — we wrap each booking in a MediSense room.',
    highlights: ['Zero-config', 'Webhook-driven', 'Public booking pages'],
    color: '#a78bfa',
  },
  {
    name: 'Twilio (SMS)',
    category: 'Messaging',
    icon: '💬',
    status: 'Live',
    summary: 'Send patients a one-tap join link by SMS before their appointment.',
    highlights: ['Short link resolver', 'Auto-reminder 15 min prior', 'Reply-STOP honored'],
    color: '#f87171',
  },
  {
    name: 'SendGrid',
    category: 'Messaging',
    icon: '📧',
    status: 'Live',
    summary: 'Branded email delivery for reports, invites, and follow-ups.',
    highlights: ['SPF/DKIM/DMARC', 'Custom domain', 'Suppression list'],
    color: '#4ade80',
  },
  {
    name: 'DICOM / Orthanc',
    category: 'Imaging',
    icon: '🩻',
    status: 'Beta',
    summary: 'Attach imaging references directly into the consultation record.',
    highlights: ['DICOMweb (WADO-RS)', 'Thumbnail preview', 'Series-level linking'],
    color: '#fbbf24',
  },
  {
    name: 'Stripe',
    category: 'Billing',
    icon: '💳',
    status: 'Live',
    summary: 'Per-consult charges or monthly subscriptions — patient or clinic billing.',
    highlights: ['Card + ACH', 'Radar fraud rules', 'Invoice PDF'],
    color: '#60a5fa',
  },
  {
    name: 'QuickBooks',
    category: 'Billing',
    icon: '📒',
    status: 'Planned',
    summary: 'Automated invoicing and reconciliation for small clinics.',
    highlights: ['Invoice sync', 'Class tracking', 'Daily digest'],
    color: '#a78bfa',
  },
  {
    name: 'OpenRouter / OpenAI',
    category: 'AI',
    icon: '🤖',
    status: 'Live',
    summary: 'Provider-agnostic LLM routing — swap the model without code changes.',
    highlights: ['No-train clause', 'Routing policies', 'Cost ceilings'],
    color: '#22d3ee',
  },
  {
    name: 'Azure OpenAI',
    category: 'AI',
    icon: '☁️',
    status: 'Q3 2026',
    summary: 'Tenant-isolated GPT deployments for regulated customers.',
    highlights: ['Private VNet', 'HIPAA BAA', 'Data residency'],
    color: '#60a5fa',
  },
  {
    name: 'Hugging Face',
    category: 'AI',
    icon: '🤗',
    status: 'Beta',
    summary: 'Pluggable on-prem speech + NER models for clinics that want full control.',
    highlights: ['pyannote diarization', 'scispaCy NER', 'Private endpoints'],
    color: '#fbbf24',
  },
  {
    name: 'AWS S3',
    category: 'Storage',
    icon: '🪣',
    status: 'Live',
    summary: 'Customer-owned bucket for PDF exports and audio archives.',
    highlights: ['SSE-KMS', 'Bucket-policy isolation', 'Lifecycle rules'],
    color: '#4ade80',
  },
  {
    name: 'Google Cloud Storage',
    category: 'Storage',
    icon: '🗄️',
    status: 'Live',
    summary: 'Bring-your-own GCS bucket with HMAC or service-account auth.',
    highlights: ['CMEK support', 'Uniform bucket access', 'Retention locks'],
    color: '#a78bfa',
  },
];

const categories: Array<Integration['category'] | 'All'> = [
  'All', 'EHR', 'Scheduling', 'Messaging', 'Imaging', 'Billing', 'AI', 'Storage',
];

const statusColors: Record<Integration['status'], string> = {
  Live: '#4ade80',
  Beta: '#fbbf24',
  'Q3 2026': '#60a5fa',
  Planned: 'var(--text-muted)',
};

export default function IntegrationsPage() {
  const [category, setCategory] = useState<Integration['category'] | 'All'>('All');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return integrations.filter(i => {
      const matchCat = category === 'All' || i.category === category;
      const matchQuery = !q || i.name.toLowerCase().includes(q) || i.summary.toLowerCase().includes(q);
      return matchCat && matchQuery;
    });
  }, [category, query]);

  return (
    <div style={{ flex: 1 }}>
      {/* Hero */}
      <section style={{
        padding: '80px 24px 48px',
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
            🔌 Integrations
          </div>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 900, lineHeight: 1.15, marginBottom: 18,
          }}>
            Fits the tools you{' '}
            <span style={{
              background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              already use.
            </span>
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            MediSense is built on open standards — FHIR, SMART, OAuth, DICOMweb — so it drops into
            your EHR, calendar, messaging, billing, and storage stacks without middleware.
          </p>
        </div>
      </section>

      {/* Filter controls */}
      <section style={{ padding: '32px 24px 16px', borderBottom: '1px solid var(--border-subtle)' }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', flexDirection: 'column', gap: 16,
        }}>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search integrations… (e.g. Epic, Stripe, FHIR)"
            style={{
              width: '100%',
              padding: '14px 18px',
              borderRadius: 10,
              border: '1px solid var(--border-subtle)',
              background: 'rgba(15,30,60,0.5)',
              color: 'var(--text-primary)',
              fontSize: '0.95rem',
              outline: 'none',
            }}
          />
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {categories.map(c => {
              const active = category === c;
              return (
                <button
                  key={c}
                  onClick={() => setCategory(c)}
                  style={{
                    padding: '7px 14px',
                    borderRadius: 999,
                    border: `1px solid ${active ? 'var(--brand-teal)' : 'var(--border-subtle)'}`,
                    background: active ? 'rgba(5,174,187,0.15)' : 'transparent',
                    color: active ? 'var(--brand-teal)' : 'var(--text-secondary)',
                    fontSize: '0.82rem', fontWeight: 700,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Grid */}
      <section style={{ padding: '32px 24px 64px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {filtered.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '60px 20px',
              color: 'var(--text-muted)',
            }}>
              No integrations match your filter.{' '}
              <button
                onClick={() => { setCategory('All'); setQuery(''); }}
                style={{
                  background: 'transparent', border: 'none',
                  color: 'var(--brand-teal)', fontWeight: 700, cursor: 'pointer',
                }}
              >
                Reset filters
              </button>
            </div>
          ) : (
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
              gap: 16,
            }}>
              {filtered.map(i => (
                <div
                  key={i.name}
                  className="glass-card"
                  style={{ padding: '22px 22px', borderTop: `3px solid ${i.color}` }}
                >
                  <div style={{
                    display: 'flex', alignItems: 'flex-start', gap: 12, marginBottom: 12,
                  }}>
                    <div style={{
                      width: 42, height: 42, borderRadius: 10,
                      background: `${i.color}1f`, border: `1px solid ${i.color}40`,
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: '1.3rem', flexShrink: 0,
                    }}>{i.icon}</div>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{
                        display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, marginBottom: 2,
                      }}>
                        <h3 style={{ fontSize: '0.98rem', fontWeight: 800 }}>{i.name}</h3>
                        <span style={{
                          fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.4px',
                          padding: '2px 7px', borderRadius: 5,
                          background: 'rgba(15,30,60,0.7)',
                          color: statusColors[i.status],
                          border: `1px solid ${statusColors[i.status]}40`,
                          textTransform: 'uppercase',
                          whiteSpace: 'nowrap',
                        }}>
                          {i.status}
                        </span>
                      </div>
                      <div style={{
                        fontSize: '0.7rem', color: 'var(--text-muted)',
                        fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.5px',
                      }}>
                        {i.category}
                      </div>
                    </div>
                  </div>

                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.55, marginBottom: 12 }}>
                    {i.summary}
                  </p>

                  <ul style={{ listStyle: 'none', padding: 0, margin: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {i.highlights.map(h => (
                      <li key={h} style={{
                        display: 'flex', gap: 8, fontSize: '0.78rem',
                        color: 'var(--text-primary)', lineHeight: 1.5,
                      }}>
                        <span style={{ color: i.color, flexShrink: 0 }}>✓</span>
                        {h}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Webhooks + API */}
      <section style={{
        padding: '64px 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(23,89,176,0.04)',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 36 }}>
            <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, marginBottom: 10 }}>
              Not on the list? Build it in an afternoon.
            </h2>
            <p style={{ color: 'var(--text-secondary)', maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
              Every platform capability exposes a REST + webhook surface. Point it at your tool of choice.
            </p>
          </div>

          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
            gap: 16,
          }}>
            {[
              {
                title: 'REST API',
                icon: '🔗',
                lines: [
                  'GET  /sessions/:id',
                  'POST /sessions/:id/soap',
                  'POST /patient/analyze',
                  'GET  /patient/records',
                ],
              },
              {
                title: 'Webhooks',
                icon: '📡',
                lines: [
                  'session.completed',
                  'soap.generated',
                  'report.analyzed',
                  'pdf.exported',
                ],
              },
              {
                title: 'FHIR R4',
                icon: '🧬',
                lines: [
                  'DocumentReference',
                  'Encounter',
                  'Observation',
                  'ServiceRequest',
                ],
              },
            ].map(block => (
              <div key={block.title} className="glass-card" style={{ padding: '24px 22px' }}>
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14,
                }}>
                  <span style={{ fontSize: '1.3rem' }}>{block.icon}</span>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800 }}>{block.title}</h3>
                </div>
                <pre style={{
                  margin: 0, padding: '14px 16px', borderRadius: 10,
                  background: 'rgba(6,13,27,0.7)', border: '1px solid var(--border-subtle)',
                  fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                  fontSize: '0.78rem', lineHeight: 1.7, color: 'var(--text-primary)',
                  overflowX: 'auto',
                }}>
                  {block.lines.join('\n')}
                </pre>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{ padding: '56px 24px', textAlign: 'center' }}>
        <h2 style={{ fontSize: 'clamp(1.4rem, 2.4vw, 1.8rem)', fontWeight: 800, marginBottom: 12 }}>
          Need a custom integration?
        </h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 540, margin: '0 auto 24px' }}>
          Enterprise customers get a named integrations engineer and a 30-day delivery SLA for common EHRs.
        </p>
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/contact"><button className="btn-primary">Talk to integrations</button></Link>
          <Link to="/pricing"><button className="btn-secondary">See Enterprise plan</button></Link>
        </div>
      </section>
    </div>
  );
}
