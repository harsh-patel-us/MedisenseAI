import { useState } from 'react';
import { Link } from 'react-router-dom';

type Feature = {
  icon: string;
  title: string;
  tagline: string;
  color: string;
  bullets: string[];
  stack: string[];
  preview: { label: string; lines: string[] };
};

const features: Feature[] = [
  {
    icon: '🎥',
    title: 'Live Video Consultation',
    tagline: 'Secure, browser-native WebRTC between doctor and patient.',
    color: '#22d3ee',
    bullets: [
      'Zero-install — patients join from any modern browser with just a room code.',
      'Peer-to-peer encryption with signalling via secure WebSocket.',
      'Doctors schedule or start on-demand; patients receive a shareable 8-character code.',
      'Resilient to reconnects; the session and transcript survive brief drops.',
    ],
    stack: ['WebRTC', 'WebSocket', 'STUN/TURN ready', 'Opus audio'],
    preview: {
      label: 'Sample room',
      lines: [
        'Room A4F9-88C2 · 2 participants · Active',
        '→ Doctor connected (00:00)',
        '→ Patient connected (00:04)',
        '→ Transcript streaming · Audio 48kHz',
      ],
    },
  },
  {
    icon: '🎤',
    title: 'Real-Time Transcription',
    tagline: 'Every word captured, every speaker labelled, instantly.',
    color: '#60a5fa',
    bullets: [
      'Streaming STT pipeline with sub-second latency per chunk.',
      'Speaker diarisation separates doctor vs. patient voice automatically.',
      'Medical vocabulary layer boosts accuracy on drug names and conditions.',
      'Works with noisy ambient audio thanks to built-in voice-activity detection.',
    ],
    stack: ['Gemini 2.5 Flash STT', 'pyannote.audio', 'VAD', 'WebSocket streaming'],
    preview: {
      label: 'Live transcript',
      lines: [
        '[DOCTOR] Any history of allergic reactions?',
        '[PATIENT] Penicillin, gives me hives.',
        '[DOCTOR] OK, I\'ll avoid that class entirely.',
      ],
    },
  },
  {
    icon: '📋',
    title: 'AI SOAP Note Generation',
    tagline: 'Structured Subjective, Objective, Assessment, Plan — in seconds.',
    color: '#a78bfa',
    bullets: [
      'Evidence-trained medical LLM produces clinician-style notes.',
      'Four discrete sections always populated with consistent structure.',
      'NER pre-extracts symptoms, medications, diagnoses, and vitals for grounding.',
      'Every field is editable — the doctor always has the final word.',
    ],
    stack: ['OpenRouter', 'scispaCy', 'Medical NER', 'Structured JSON'],
    preview: {
      label: 'Generated SOAP excerpt',
      lines: [
        'S: 34F with 3-day pleuritic chest pain, denies fever.',
        'O: HR 88, BP 124/78, lungs clear, no JVD.',
        'A: Likely costochondritis; rule out PE if risk factors present.',
        'P: NSAIDs ×7d; return if SOB, follow up 1 week.',
      ],
    },
  },
  {
    icon: '🧪',
    title: 'Lab Report Analysis',
    tagline: 'Upload a PDF or photo; get findings, flags, and plain-English context.',
    color: '#4ade80',
    bullets: [
      'Text-based PDFs parsed instantly via PyMuPDF.',
      'Scanned documents and photos fall back to vision-OCR transparently.',
      'Each numerical finding normalised with reference range and high/low flag.',
      'Critical-value alerts surface abnormalities that need immediate attention.',
    ],
    stack: ['PyMuPDF', 'Tesseract OCR', 'Vision OCR fallback', 'JSON finding schema'],
    preview: {
      label: 'Report findings',
      lines: [
        'HbA1c  7.4 %   (ref < 5.7)   HIGH',
        'Fasting glucose  148 mg/dL   (ref 70–99)   HIGH',
        'LDL cholesterol  118 mg/dL   (ref < 100)   BORDERLINE',
      ],
    },
  },
  {
    icon: '🥗',
    title: 'Personalised Lifestyle Plan',
    tagline: 'Diet, exercise, and precaution guides matched to each patient.',
    color: '#fbbf24',
    bullets: [
      'Plans derived from actual findings — not generic boilerplate.',
      'Foods to eat, foods to avoid, meal timing, portion guidance.',
      'Exercise routine adapted to patient\'s conditions and contraindications.',
      'Precautions and emergency warning signs clearly surfaced.',
    ],
    stack: ['Medical LLM', 'Guideline-aware prompting', 'Condition → plan map'],
    preview: {
      label: 'Generated plan',
      lines: [
        'Eat: leafy greens, legumes, fatty fish 2×/week.',
        'Avoid: refined sugar, sugary drinks, white bread.',
        'Move: brisk walk 30 min/day, resistance 2×/week.',
        'Watch for: blurred vision, numbness, severe thirst.',
      ],
    },
  },
  {
    icon: '🩺',
    title: 'Specialist Routing',
    tagline: 'Intelligent referrals with urgency classification.',
    color: '#f87171',
    bullets: [
      'AI recommends specialists based on findings with stated rationale.',
      'Three-tier urgency: routine, within 1 week, go today.',
      'Explanation of why each referral is suggested in plain language.',
      'Reduces wasted appointments and speeds up the care journey.',
    ],
    stack: ['Rule + LLM hybrid', 'Urgency classifier', 'Specialist ontology'],
    preview: {
      label: 'Routing suggestion',
      lines: [
        'Endocrinologist — Priority 1',
        '   Reason: persistently elevated HbA1c.',
        'Ophthalmologist — Priority 2',
        '   Reason: screen for diabetic retinopathy.',
        'Urgency: within 1 week.',
      ],
    },
  },
  {
    icon: '📥',
    title: 'One-Click PDF Export',
    tagline: 'Chart-ready documents for records, referrals, and handouts.',
    color: '#05aebb',
    bullets: [
      'Doctor-branded SOAP PDF with session metadata.',
      'Patient-friendly health guide PDF with findings, plan, and disclaimer.',
      'Exports stored server-side and linked to the user account.',
      'ReportLab-powered; no screenshotting or third-party print service needed.',
    ],
    stack: ['ReportLab', 'Server-side rendering', 'Per-user persistence'],
    preview: {
      label: 'Export log',
      lines: [
        '2026-04-23 11:08 — SOAP note exported (session ABC123)',
        '2026-04-23 10:55 — Health guide exported (report XYZ789)',
        'All PDFs linked to your account · stored 7 days',
      ],
    },
  },
  {
    icon: '🔐',
    title: 'Auth & Session Persistence',
    tagline: 'Role-based access with durable, per-user record history.',
    color: '#7c3aed',
    bullets: [
      'JWT authentication with bcrypt-hashed passwords.',
      'Strict doctor / patient roles enforced server-side on every endpoint.',
      'Every consultation and analysis is linked to the user who created it.',
      'Session history visible in the dashboard; PDFs retrievable on demand.',
    ],
    stack: ['PyJWT', 'bcrypt', 'SQLAlchemy async', 'SQLite (Postgres-ready)'],
    preview: {
      label: 'Profile',
      lines: [
        'Dr. Rachel Kim · Role: Doctor',
        'Sessions: 42 · SOAP PDFs: 42',
        'Last login: 2026-04-23 08:02',
      ],
    },
  },
];

export default function FeaturesPage() {
  const [open, setOpen] = useState<number | null>(0);

  return (
    <div style={{ flex: 1 }}>

      {/* Hero */}
      <section style={{
        padding: '80px 24px 56px',
        textAlign: 'center',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(5,174,187,0.14) 0%, transparent 70%)',
      }}>
        <div style={{ maxWidth: 780, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 18px', borderRadius: 20,
            border: '1px solid rgba(5,174,187,0.3)',
            background: 'rgba(5,174,187,0.08)',
            fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-teal)',
            marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.6px',
          }}>
            Platform Features
          </div>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 900, lineHeight: 1.15, marginBottom: 18,
          }}>
            Every capability, in depth.{' '}
            <span style={{
              background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              No black boxes.
            </span>
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Tap any feature below to expand — we tell you what it does, how it works,
            and show you a live sample of the output. No hand-waving.
          </p>
        </div>
      </section>

      {/* Feature list */}
      <section style={{ padding: '48px 24px 64px' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
          {features.map((f, i) => {
            const isOpen = open === i;
            return (
              <div
                key={f.title}
                className="glass-card"
                style={{
                  padding: 0,
                  overflow: 'hidden',
                  borderLeft: `4px solid ${isOpen ? f.color : 'transparent'}`,
                  transition: 'border-color 0.25s',
                }}
              >
                {/* Summary row */}
                <button
                  onClick={() => setOpen(isOpen ? null : i)}
                  style={{
                    width: '100%',
                    display: 'flex', alignItems: 'center', gap: 18,
                    padding: '22px 24px',
                    background: 'transparent',
                    border: 'none',
                    cursor: 'pointer',
                    textAlign: 'left',
                    color: 'inherit',
                  }}
                >
                  <div style={{
                    width: 48, height: 48, borderRadius: 12, flexShrink: 0,
                    background: `${f.color}1f`,
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.5rem', border: `1px solid ${f.color}40`,
                  }}>
                    {f.icon}
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <h3 style={{ fontSize: '1.05rem', fontWeight: 800, marginBottom: 3 }}>
                      {f.title}
                    </h3>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
                      {f.tagline}
                    </div>
                  </div>
                  <span style={{
                    fontSize: '1.3rem', color: f.color, flexShrink: 0,
                    transform: isOpen ? 'rotate(45deg)' : 'none',
                    transition: 'transform 0.2s', fontWeight: 700,
                  }}>+</span>
                </button>

                {/* Expanded content */}
                {isOpen && (
                  <div style={{
                    padding: '0 24px 28px',
                    display: 'grid',
                    gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
                    gap: 20,
                  }}>
                    {/* Bullets */}
                    <div>
                      <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.6px', color: f.color, textTransform: 'uppercase', marginBottom: 10 }}>
                        What it does
                      </div>
                      <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                        {f.bullets.map((b, bi) => (
                          <li key={bi} style={{
                            display: 'flex', gap: 10,
                            color: 'var(--text-primary)', fontSize: '0.88rem', lineHeight: 1.55,
                          }}>
                            <span style={{ color: f.color, flexShrink: 0 }}>▸</span>
                            {b}
                          </li>
                        ))}
                      </ul>
                      <div style={{ marginTop: 18 }}>
                        <div style={{ fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.6px', color: 'var(--text-muted)', textTransform: 'uppercase', marginBottom: 8 }}>
                          Tech stack
                        </div>
                        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                          {f.stack.map(s => (
                            <span key={s} style={{
                              padding: '4px 10px',
                              fontSize: '0.72rem', fontWeight: 600,
                              background: 'rgba(15,30,60,0.5)',
                              border: '1px solid var(--border-subtle)',
                              borderRadius: 6, color: 'var(--text-secondary)',
                            }}>{s}</span>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Preview */}
                    <div style={{
                      background: 'rgba(6,13,27,0.7)',
                      border: `1px solid ${f.color}30`,
                      borderRadius: 12,
                      padding: '18px 20px',
                      fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
                    }}>
                      <div style={{
                        display: 'flex', alignItems: 'center', gap: 6,
                        fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px',
                        color: f.color, textTransform: 'uppercase', marginBottom: 12,
                      }}>
                        <span style={{ width: 6, height: 6, background: f.color, borderRadius: '50%' }} />
                        {f.preview.label}
                      </div>
                      {f.preview.lines.map((line, li) => (
                        <div key={li} style={{
                          fontSize: '0.82rem',
                          color: 'var(--text-primary)',
                          lineHeight: 1.7,
                          whiteSpace: 'pre-wrap',
                        }}>
                          {line}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: '64px 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(23,89,176,0.04)',
        textAlign: 'center',
      }}>
        <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, marginBottom: 14 }}>
          See all of this in action
        </h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 520, margin: '0 auto 28px', lineHeight: 1.7 }}>
          Create an account and run through a full doctor or patient workflow in under 3 minutes.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/register"><button className="btn-primary">Create Free Account →</button></Link>
          <Link to="/use-cases"><button className="btn-secondary">See Use Cases</button></Link>
        </div>
      </section>

    </div>
  );
}
