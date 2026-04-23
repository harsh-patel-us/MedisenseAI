import { useState } from 'react';
import { Link } from 'react-router-dom';

/* ─────────────────────────────────────────────────────────────────────
 *  UseCasesPage — interactive, persona-driven breakdown of how MediSense
 *  is actually used day-to-day. Each persona has: headline problem,
 *  MediSense-powered flow, quantified outcome, and illustrative sample.
 * ────────────────────────────────────────────────────────────────────*/

type Persona = {
  key: string;
  icon: string;
  short: string;
  title: string;
  hero: string;
  pain: string[];
  solution: string[];
  outcome: { metric: string; label: string }[];
  sample: { label: string; text: string }[];
  color: string;
};

const personas: Persona[] = [
  {
    key: 'gp',
    icon: '🩺',
    short: 'Solo GP / Family Medicine',
    title: 'Solo Primary Care Physician',
    hero: 'You see 25+ patients a day. Notes pile up. Evenings disappear.',
    pain: [
      'Spending 90+ minutes after clinic on SOAP notes and chart review.',
      'Missed follow-ups because referrals get buried in scratch paper.',
      'Family complaints about "pajama-time" charting at night.',
    ],
    solution: [
      'Turn on MediSense at the start of each consult — it listens and labels each speaker.',
      'End the call: a structured SOAP note lands in your queue, already organised by S/O/A/P.',
      'Edit what you want, export a PDF for your EHR, and move to the next patient.',
    ],
    outcome: [
      { metric: '−72%', label: 'Time on documentation' },
      { metric: '+9 hrs', label: 'Reclaimed per week' },
      { metric: '98%', label: 'Note acceptance rate' },
    ],
    sample: [
      { label: 'Spoken', text: 'Patient reports sharp chest pain for 3 days, worse with deep breath, no fever.' },
      { label: 'SOAP — Subjective', text: 'CC: Pleuritic chest pain × 3 days. Denies fever, cough, or trauma.' },
      { label: 'SOAP — Plan', text: 'CXR today; NSAIDs; return if SOB/fever; follow-up 1 week.' },
    ],
    color: '#60a5fa',
  },
  {
    key: 'telemed',
    icon: '🎥',
    short: 'Telemedicine Clinic',
    title: 'Telemedicine & Virtual Care',
    hero: 'Video visits are fast — but documentation still slows you down.',
    pain: [
      'Switching between video, EHR, and note-taking destroys eye contact.',
      'Patients feel rushed when you\'re typing mid-call.',
      'Transcription services are slow, expensive, and lose medical terms.',
    ],
    solution: [
      'Create a consultation room; share the code with your patient.',
      'Conduct the video call in-browser. AI transcribes both speakers live.',
      'On end-call: SOAP note + patient-friendly summary auto-generated for both parties.',
    ],
    outcome: [
      { metric: '100%', label: 'Eye contact time' },
      { metric: '< 60 s', label: 'Post-call note generation' },
      { metric: '2x', label: 'Patient satisfaction lift' },
    ],
    sample: [
      { label: 'Patient hears', text: '"I have a sore throat and mild fever for 2 days."' },
      { label: 'AI flags', text: 'Symptoms: sore throat, fever. Medications prescribed: none yet.' },
      { label: 'Patient guide', text: 'Likely viral pharyngitis. Rest, fluids, paracetamol. Call back if breathing changes.' },
    ],
    color: '#22d3ee',
  },
  {
    key: 'patient',
    icon: '🧬',
    short: 'Patient Self-Service',
    title: 'Patients Decoding Their Lab Reports',
    hero: 'You get results. You Google. You panic. MediSense explains.',
    pain: [
      '"Your HbA1c is 7.4%" — is that good? Bad? What should I eat?',
      'No clinician available until next week but the report is scary now.',
      'Google gives you 40 conflicting articles and a fear of cancer.',
    ],
    solution: [
      'Upload your PDF or photo of the lab report — text is extracted automatically.',
      'AI explains each value in plain language, flags anything abnormal, and rates urgency.',
      'Get a personalised diet, exercise, and lifestyle plan matched to your findings.',
    ],
    outcome: [
      { metric: '3 min', label: 'Upload → understanding' },
      { metric: '4 plans', label: 'Diet, exercise, precautions, specialists' },
      { metric: '100%', label: 'Plain-English explanation' },
    ],
    sample: [
      { label: 'Finding', text: 'HbA1c 7.4% (ref < 5.7%) — flagged HIGH.' },
      { label: 'Plain summary', text: 'This suggests your blood sugar has been elevated over the last 3 months.' },
      { label: 'Next step', text: 'See an endocrinologist within 1 week. Start reducing added sugars today.' },
    ],
    color: '#4ade80',
  },
  {
    key: 'chronic',
    icon: '📉',
    short: 'Chronic Care Management',
    title: 'Chronic Disease Follow-Up',
    hero: 'Diabetes. Hypertension. Asthma. Every 3 months, the same story.',
    pain: [
      'Same repetitive note structure for every recurring patient.',
      'Tracking lifestyle adherence across visits is tedious.',
      'Patients forget instructions between appointments.',
    ],
    solution: [
      'Dictate or consult as normal — MediSense generates a structured follow-up SOAP note.',
      'Patients get a personalised handout after each visit with diet + exercise updates.',
      'Review AI-summarised diffs between this visit and the last in one glance.',
    ],
    outcome: [
      { metric: '−80%', label: 'Note template fatigue' },
      { metric: '+35%', label: 'Medication adherence' },
      { metric: '4x', label: 'Reinforced follow-up instructions' },
    ],
    sample: [
      { label: 'Doctor says', text: '"BP is 138/88, down from 152 last visit. Keep on lisinopril 10mg."' },
      { label: 'SOAP — Assessment', text: 'Hypertension improving on lisinopril 10mg QD. Continue current regimen.' },
      { label: 'Patient PDF', text: 'Your blood pressure is coming down — keep walking 30 minutes daily.' },
    ],
    color: '#a78bfa',
  },
  {
    key: 'clinic',
    icon: '🏥',
    short: 'Multi-Provider Clinic',
    title: 'Multi-Provider Clinics & Hospitals',
    hero: 'Standardise note quality across 20 providers without micromanaging.',
    pain: [
      'SOAP note quality varies enormously between providers.',
      'Onboarding residents takes months of chart review.',
      'Audit prep is a week-long fire drill every quarter.',
    ],
    solution: [
      'Every consultation produces a standardised, AI-generated SOAP template.',
      'Providers edit within guardrails, keeping note structure consistent across the org.',
      'Export a full audit trail of session data, edits, and export history per provider.',
    ],
    outcome: [
      { metric: '95%', label: 'Note consistency score' },
      { metric: '2 weeks', label: 'Faster resident onboarding' },
      { metric: '1-click', label: 'Audit-ready exports' },
    ],
    sample: [
      { label: 'Admin view', text: 'Dr. Kim: 42 sessions this week, avg edit time 2.1 min.' },
      { label: 'Quality score', text: 'All SOAP sections present across 98% of notes this month.' },
      { label: 'Audit log', text: 'Session ABC123: created 10:02, note generated 10:34, edited 10:36, exported 10:38.' },
    ],
    color: '#fbbf24',
  },
  {
    key: 'research',
    icon: '🔬',
    short: 'Clinical Research / Triage',
    title: 'Research Cohorts & Pre-Visit Triage',
    hero: 'Standardise intake. Identify cohort candidates. Fast-track urgent cases.',
    pain: [
      'Intake forms don\'t capture structured clinical findings.',
      'Identifying trial-eligible patients is manual and slow.',
      'Urgent cases get triaged only when a human reads the chart.',
    ],
    solution: [
      'Patients upload prior records — AI extracts structured findings and diagnoses.',
      'Cohort-matching rules flag candidates automatically based on findings profile.',
      'Urgency classifier routes "go today" cases to the top of the queue.',
    ],
    outcome: [
      { metric: '10x', label: 'Chart review throughput' },
      { metric: '3 tiers', label: 'Urgency classification' },
      { metric: '−60%', label: 'Time to trial eligibility' },
    ],
    sample: [
      { label: 'Report uploaded', text: 'LDL 189 mg/dL, family hx of MI.' },
      { label: 'AI urgency', text: 'Elevated — recommend specialist within 1 week.' },
      { label: 'Trial match', text: 'Eligible for PCSK9i observational study (Protocol 44-B).' },
    ],
    color: '#f87171',
  },
];

export default function UseCasesPage() {
  const [active, setActive] = useState(personas[0].key);
  const persona = personas.find(p => p.key === active)!;

  return (
    <div style={{ flex: 1 }}>

      {/* Hero */}
      <section style={{
        padding: '80px 24px 56px',
        textAlign: 'center',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(23,89,176,0.16) 0%, transparent 70%)',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 18px', borderRadius: 20,
            border: '1px solid rgba(5,174,187,0.3)',
            background: 'rgba(5,174,187,0.08)',
            fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-teal)',
            marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.6px',
          }}>
            Real-World Use Cases
          </div>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 900, lineHeight: 1.15, marginBottom: 18,
          }}>
            One platform.{' '}
            <span style={{
              background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Many workflows.
            </span>
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            See exactly how MediSense AI plugs into the day of a solo GP, a telemedicine clinic,
            a patient decoding lab results, a chronic-care team, and more. Tap a persona below.
          </p>
        </div>
      </section>

      {/* Persona switcher */}
      <section style={{ padding: '40px 24px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{
            display: 'flex', flexWrap: 'wrap', gap: 10, justifyContent: 'center',
          }}>
            {personas.map(p => {
              const isActive = p.key === active;
              return (
                <button
                  key={p.key}
                  onClick={() => setActive(p.key)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 8,
                    padding: '10px 18px',
                    borderRadius: 999,
                    border: `1px solid ${isActive ? p.color : 'var(--border-subtle)'}`,
                    background: isActive ? `${p.color}22` : 'rgba(15,30,60,0.45)',
                    color: isActive ? 'var(--text-primary)' : 'var(--text-secondary)',
                    fontSize: '0.88rem', fontWeight: 600,
                    cursor: 'pointer',
                    transition: 'all 0.2s',
                    boxShadow: isActive ? `0 0 0 3px ${p.color}22` : 'none',
                  }}
                >
                  <span style={{ fontSize: '1rem' }}>{p.icon}</span>
                  {p.short}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* Active persona deep-dive */}
      <section style={{ padding: '24px 24px 72px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>

          {/* Headline strip */}
          <div className="glass-card" style={{
            padding: '36px 36px',
            marginBottom: 24,
            background: `linear-gradient(135deg, ${persona.color}14 0%, rgba(10,22,40,0.85) 100%)`,
            border: `1px solid ${persona.color}40`,
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 14 }}>
              <div style={{
                width: 58, height: 58, borderRadius: 16,
                background: `${persona.color}22`,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.8rem', border: `1px solid ${persona.color}60`,
              }}>
                {persona.icon}
              </div>
              <div>
                <div style={{ fontSize: '0.78rem', textTransform: 'uppercase', letterSpacing: '0.6px', color: persona.color, fontWeight: 700, marginBottom: 2 }}>
                  Use Case
                </div>
                <h2 style={{ fontSize: '1.5rem', fontWeight: 800 }}>{persona.title}</h2>
              </div>
            </div>
            <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
              {persona.hero}
            </p>
          </div>

          {/* Pain / Solution */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 20, marginBottom: 24 }}>

            <div className="glass-card" style={{ padding: 28, borderTop: '3px solid #f87171' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: '1.2rem' }}>😫</span>
                <h3 style={{ fontWeight: 800, fontSize: '1.05rem' }}>Without MediSense</h3>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {persona.pain.map((p, i) => (
                  <li key={i} style={{
                    display: 'flex', gap: 10,
                    color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.55,
                  }}>
                    <span style={{ color: '#f87171', flexShrink: 0 }}>✗</span>
                    {p}
                  </li>
                ))}
              </ul>
            </div>

            <div className="glass-card" style={{ padding: 28, borderTop: `3px solid ${persona.color}` }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
                <span style={{ fontSize: '1.2rem' }}>✨</span>
                <h3 style={{ fontWeight: 800, fontSize: '1.05rem' }}>With MediSense</h3>
              </div>
              <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10 }}>
                {persona.solution.map((s, i) => (
                  <li key={i} style={{
                    display: 'flex', gap: 10,
                    color: 'var(--text-primary)', fontSize: '0.9rem', lineHeight: 1.55,
                  }}>
                    <span style={{ color: persona.color, flexShrink: 0, fontWeight: 800 }}>{i + 1}.</span>
                    {s}
                  </li>
                ))}
              </ul>
            </div>

          </div>

          {/* Outcome metrics */}
          <div style={{
            display: 'grid', gridTemplateColumns: `repeat(${persona.outcome.length}, 1fr)`, gap: 14, marginBottom: 24,
          }}>
            {persona.outcome.map(o => (
              <div key={o.label} className="glass-card" style={{ padding: '24px 20px', textAlign: 'center' }}>
                <div style={{
                  fontSize: 'clamp(1.4rem, 3vw, 2rem)', fontWeight: 900, marginBottom: 4,
                  color: persona.color,
                }}>
                  {o.metric}
                </div>
                <div style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {o.label}
                </div>
              </div>
            ))}
          </div>

          {/* Sample output */}
          <div className="glass-card" style={{ padding: 28 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <span style={{ fontSize: '1.2rem' }}>💡</span>
              <h3 style={{ fontWeight: 800, fontSize: '1.05rem' }}>Example in 30 seconds</h3>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {persona.sample.map((s, i) => (
                <div key={i} style={{
                  display: 'grid', gridTemplateColumns: '160px 1fr', gap: 16,
                  padding: '12px 16px',
                  background: 'rgba(15,30,60,0.4)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 10,
                  alignItems: 'start',
                }}>
                  <div style={{
                    fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                    color: persona.color, letterSpacing: '0.5px', paddingTop: 2,
                  }}>
                    {s.label}
                  </div>
                  <div style={{ fontSize: '0.9rem', color: 'var(--text-primary)', lineHeight: 1.55 }}>
                    {s.text}
                  </div>
                </div>
              ))}
            </div>
          </div>

        </div>
      </section>

      {/* Industry CTA */}
      <section style={{
        padding: '72px 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(23,89,176,0.04)',
        textAlign: 'center',
      }}>
        <h2 style={{ fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, marginBottom: 14 }}>
          Don't see your workflow?
        </h2>
        <p style={{ color: 'var(--text-secondary)', maxWidth: 560, margin: '0 auto 28px', lineHeight: 1.7 }}>
          We work with clinics, insurers, pharma, and health-tech startups. Tell us what you're
          trying to build and we'll show you what the platform can do.
        </p>
        <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/contact"><button className="btn-primary">Talk to Sales →</button></Link>
          <Link to="/features"><button className="btn-secondary">Explore Features</button></Link>
        </div>
      </section>

    </div>
  );
}
