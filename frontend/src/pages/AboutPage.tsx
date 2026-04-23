import { Link } from 'react-router-dom';

const team = [
  {
    name: 'Dr. Sarah Chen',
    role: 'Chief Medical Officer',
    specialty: 'Internal Medicine & AI Ethics',
    icon: '👩‍⚕️',
    bio: 'Former Chief Resident at Johns Hopkins with 12 years clinical experience. Leads our medical accuracy and safety standards.',
  },
  {
    name: 'Arjun Mehta',
    role: 'Co-Founder & CTO',
    specialty: 'AI / ML Engineering',
    icon: '👨‍💻',
    bio: 'Ex-Google AI researcher. Designed our real-time transcription pipeline and medical NLP models.',
  },
  {
    name: 'Dr. Priya Nair',
    role: 'Head of Clinical Research',
    specialty: 'Pathology & Lab Medicine',
    icon: '👩‍🔬',
    bio: 'Specialises in lab diagnostics interpretation. Oversees patient-side AI accuracy and clinical validation.',
  },
  {
    name: 'Marcus Webb',
    role: 'VP of Product',
    specialty: 'Healthcare UX',
    icon: '🎨',
    bio: '10+ years designing clinical software. Ensures every workflow is intuitive for both doctors and patients.',
  },
];

const values = [
  {
    icon: '🔒',
    title: 'Privacy First',
    desc: 'Patient data is never stored beyond the session without consent. End-to-end encryption on all communications.',
  },
  {
    icon: '⚕️',
    title: 'Clinical Accuracy',
    desc: 'Every AI output is validated against clinical guidelines. We flag uncertainty so clinicians stay in control.',
  },
  {
    icon: '♿',
    title: 'Accessibility',
    desc: 'Built for clinics of all sizes — from solo practitioners to large hospital systems, on any device.',
  },
  {
    icon: '🔬',
    title: 'Evidence-Based',
    desc: 'Our models are trained on peer-reviewed medical literature and continually refined with clinician feedback.',
  },
];

const milestones = [
  { year: '2022', event: 'Founded by a team of doctors and AI engineers frustrated by clinical paperwork overhead.' },
  { year: '2023', event: 'Launched beta with 50 partner clinics. Reduced SOAP documentation time by 70%.' },
  { year: '2024', event: 'Added patient-side lab analysis. Reached 100,000 consultations assisted.' },
  { year: '2025', event: 'Introduced real-time video consultation with live AI transcription.' },
  { year: '2026', event: 'Serving 5,000+ healthcare providers across 30 countries.' },
];

export default function AboutPage() {
  return (
    <div style={{ flex: 1 }}>

      {/* Hero */}
      <section style={{
        padding: '80px 24px 60px',
        textAlign: 'center',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(23,89,176,0.18) 0%, transparent 70%)',
      }}>
        <div style={{ maxWidth: 720, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 18px', borderRadius: 20,
            border: '1px solid rgba(5,174,187,0.3)',
            background: 'rgba(5,174,187,0.08)',
            fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-teal)',
            marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.6px',
          }}>
            Our Story
          </div>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 900, lineHeight: 1.15,
            background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent', marginBottom: 20,
          }}>
            Reimagining the Doctor–Patient Experience
          </h1>
          <p style={{ fontSize: '1.1rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            MediSense AI was born from a simple frustration: doctors spending more time on paperwork than patients.
            We built an AI platform that handles the documentation so clinicians can focus on care.
          </p>
        </div>
      </section>

      {/* Mission */}
      <section style={{ padding: '72px 24px', maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48, alignItems: 'center' }}>
          <div>
            <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 16 }}>Our Mission</h2>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 16 }}>
              We believe every patient deserves a doctor who is fully present — not distracted by charts,
              coding, and administrative burden. Our mission is to eliminate that friction through
              responsible, clinician-trusted AI.
            </p>
            <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8 }}>
              From real-time SOAP note generation to intelligent lab report interpretation, MediSense AI
              acts as a clinical co-pilot — always assistive, never autonomous. The doctor stays in command.
            </p>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
            {[
              { num: '5,000+', label: 'Healthcare Providers' },
              { num: '500K+', label: 'Consultations Assisted' },
              { num: '70%', label: 'Less Documentation Time' },
              { num: '30+', label: 'Countries Served' },
            ].map(stat => (
              <div key={stat.label} className="glass-card" style={{ padding: '28px 20px', textAlign: 'center' }}>
                <div style={{
                  fontSize: '2rem', fontWeight: 900,
                  background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent', marginBottom: 6,
                }}>
                  {stat.num}
                </div>
                <div style={{ fontSize: '0.8rem', color: 'var(--text-secondary)', fontWeight: 600 }}>
                  {stat.label}
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Timeline */}
      <section style={{
        padding: '72px 24px',
        borderTop: '1px solid var(--border-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(23,89,176,0.04)',
      }}>
        <div style={{ maxWidth: 800, margin: '0 auto' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, textAlign: 'center', marginBottom: 48 }}>
            Our Journey
          </h2>
          <div style={{ position: 'relative' }}>
            <div style={{
              position: 'absolute', left: 80, top: 0, bottom: 0,
              width: 2, background: 'var(--border-subtle)',
            }} />
            {milestones.map((m, i) => (
              <div key={i} style={{
                display: 'flex', gap: 32, marginBottom: 36, alignItems: 'flex-start',
              }}>
                <div style={{
                  minWidth: 64, textAlign: 'right',
                  fontWeight: 800, fontSize: '0.9rem',
                  color: 'var(--brand-teal)', paddingTop: 2,
                }}>
                  {m.year}
                </div>
                <div style={{
                  width: 14, height: 14, borderRadius: '50%', marginTop: 4, flexShrink: 0,
                  background: 'var(--gradient-brand)',
                  border: '3px solid var(--surface-0)',
                  boxShadow: '0 0 0 2px var(--brand-teal)',
                  position: 'relative', zIndex: 1,
                }} />
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6, paddingTop: 0 }}>
                  {m.event}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Values */}
      <section style={{ padding: '72px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, textAlign: 'center', marginBottom: 12 }}>
            What We Stand For
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 48, maxWidth: 560, margin: '0 auto 48px' }}>
            These principles guide every product decision we make.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
            {values.map(v => (
              <div key={v.title} className="glass-card" style={{ padding: '32px 24px' }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: 'rgba(5,174,187,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.6rem', marginBottom: 16,
                }}>
                  {v.icon}
                </div>
                <h3 style={{ fontWeight: 700, marginBottom: 10, fontSize: '1.05rem' }}>{v.title}</h3>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>{v.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Team */}
      <section style={{
        padding: '72px 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(23,89,176,0.03)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ fontSize: '2rem', fontWeight: 800, textAlign: 'center', marginBottom: 12 }}>
            Leadership Team
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 48, maxWidth: 520, margin: '0 auto 48px' }}>
            A multidisciplinary team of clinicians, engineers, and designers.
          </p>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: 24 }}>
            {team.map(member => (
              <div key={member.name} className="glass-card" style={{ padding: '32px 24px', textAlign: 'center' }}>
                <div style={{
                  width: 70, height: 70, borderRadius: '50%',
                  background: 'var(--gradient-brand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '2rem', margin: '0 auto 16px',
                  boxShadow: '0 8px 24px rgba(23,89,176,0.3)',
                }}>
                  {member.icon}
                </div>
                <h3 style={{ fontWeight: 700, fontSize: '1rem', marginBottom: 4 }}>{member.name}</h3>
                <div style={{ color: 'var(--brand-teal)', fontSize: '0.8rem', fontWeight: 700, marginBottom: 6 }}>
                  {member.role}
                </div>
                <div style={{
                  fontSize: '0.75rem', color: 'var(--text-muted)', marginBottom: 14,
                  padding: '4px 10px', borderRadius: 8,
                  background: 'rgba(5,174,187,0.08)', display: 'inline-block',
                }}>
                  {member.specialty}
                </div>
                <p style={{ fontSize: '0.83rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  {member.bio}
                </p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* CTA */}
      <section style={{
        padding: '72px 24px',
        textAlign: 'center',
        borderTop: '1px solid var(--border-subtle)',
      }}>
        <h2 style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 16 }}>
          Ready to Transform Your Practice?
        </h2>
        <p style={{ color: 'var(--text-secondary)', marginBottom: 36, maxWidth: 480, margin: '0 auto 36px' }}>
          Join thousands of healthcare providers already using MediSense AI.
        </p>
        <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap' }}>
          <Link to="/doctor"><button className="btn-primary">Start as Doctor</button></Link>
          <Link to="/contact"><button className="btn-secondary">Contact Us</button></Link>
        </div>
      </section>

    </div>
  );
}
