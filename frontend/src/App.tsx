import { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import DoctorDashboard from './pages/DoctorDashboard';
import PatientDashboard from './pages/PatientDashboard';
import ConsultationRoom from './pages/ConsultationRoom';
import JoinConsultation from './pages/JoinConsultation';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import SchedulePage from './pages/SchedulePage';
import Login from './pages/Login';
import Register from './pages/Register';
import ProtectedRoute from './components/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
import UseCasesPage from './pages/UseCasesPage';
import FeaturesPage from './pages/FeaturesPage';
import PricingPage from './pages/PricingPage';
import SecurityPage from './pages/SecurityPage';
import IntegrationsPage from './pages/IntegrationsPage';
import ResourcesPage from './pages/ResourcesPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import './index.css';

/* ── Navigation Bar ──────────────────────────────────────────────────── */
function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);

  // Public visitors see marketing nav; logged-in users focus on their workspace.
  const navLinks = user
    ? []
    : [
        { to: '/', label: 'Home' },
        { to: '/features', label: 'Features' },
        { to: '/use-cases', label: 'Use Cases' },
        { to: '/integrations', label: 'Integrations' },
        { to: '/pricing', label: 'Pricing' },
        { to: '/resources', label: 'Resources' },
        { to: '/security', label: 'Trust' },
        { to: '/about', label: 'About' },
        { to: '/contact', label: 'Contact' },
      ];

  const handleLogout = () => {
    logout();
    navigate('/', { replace: true });
  };

  const dashboardPath = user?.role === 'patient' ? '/patient' : '/doctor';

  return (
    <nav style={{
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'space-between',
      padding: '14px 28px',
      borderBottom: '1px solid var(--border-subtle)',
      background: 'rgba(6, 13, 27, 0.85)',
      backdropFilter: 'blur(12px)',
      position: 'sticky',
      top: 0,
      zIndex: 100,
    }}>
      <Link to={user ? dashboardPath : '/'} style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: '10px' }}>
        <span style={{ fontSize: '1.5rem' }}>💊</span>
        <span style={{
          fontSize: '1.15rem', fontWeight: 800,
          background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
          WebkitTextFillColor: 'transparent',
        }}>
          MediSense AI
        </span>
      </Link>

      {/* Desktop nav links */}
      <div className="nav-links-desktop" style={{
        display: 'flex', gap: 4, alignItems: 'center',
      }}>
        {navLinks.map(link => {
          const active = location.pathname === link.to;
          return (
            <Link
              key={link.to}
              to={link.to}
              style={{
                textDecoration: 'none',
                padding: '8px 16px',
                fontSize: '0.9rem',
                fontWeight: 600,
                color: active ? 'var(--brand-teal)' : 'var(--text-secondary)',
                borderRadius: 8,
                transition: 'all 0.2s',
                background: active ? 'rgba(5,174,187,0.1)' : 'transparent',
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </div>

      {/* Right-side portal buttons */}
      <div className="nav-actions-desktop" style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        {user ? (
          <>
            <Link to={dashboardPath}>
              <button
                className={location.pathname === dashboardPath ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '8px 16px', fontSize: '0.82rem' }}
              >
                {user.role === 'doctor' ? '🩺 Dashboard' : '🧬 Dashboard'}
              </button>
            </Link>
            {user.role === 'doctor' && (
              <Link to="/consultation/schedule">
                <button
                  className={location.pathname === '/consultation/schedule' ? 'btn-primary' : 'btn-secondary'}
                  style={{ padding: '8px 16px', fontSize: '0.82rem' }}
                >
                  📅 Schedule
                </button>
              </Link>
            )}
            <Link to="/consultation/join">
              <button
                className={location.pathname === '/consultation/join' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '8px 16px', fontSize: '0.82rem' }}
              >
                🎥 Join Call
              </button>
            </Link>
            <div style={{
              display: 'flex', alignItems: 'center', gap: 8,
              padding: '6px 12px', borderRadius: 8,
              background: 'rgba(5,174,187,0.08)',
              border: '1px solid rgba(5,174,187,0.25)',
              fontSize: '0.8rem', color: 'var(--text-secondary)',
            }}>
              <span style={{ fontSize: '0.95rem' }}>{user.role === 'doctor' ? '🩺' : '🧬'}</span>
              <span style={{ fontWeight: 600, color: 'var(--text-primary)' }}>{user.full_name.split(' ')[0]}</span>
            </div>
            <button
              className="btn-secondary"
              onClick={handleLogout}
              style={{ padding: '8px 14px', fontSize: '0.82rem' }}
            >
              Logout
            </button>
          </>
        ) : (
          <>
            <Link to="/login">
              <button
                className={location.pathname === '/login' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '8px 16px', fontSize: '0.82rem' }}
              >
                Sign in
              </button>
            </Link>
            <Link to="/register">
              <button
                className="btn-primary"
                style={{ padding: '8px 16px', fontSize: '0.82rem' }}
              >
                Register
              </button>
            </Link>
          </>
        )}
      </div>

      {/* Mobile toggle */}
      <button
        className="nav-mobile-toggle"
        onClick={() => setMobileOpen(o => !o)}
        style={{
          display: 'none',
          background: 'transparent', border: 'none',
          color: 'var(--text-primary)', fontSize: '1.5rem', cursor: 'pointer',
        }}
        aria-label="Menu"
      >
        {mobileOpen ? '✕' : '☰'}
      </button>

      {/* Mobile drawer */}
      {mobileOpen && (
        <div style={{
          position: 'absolute', top: '100%', left: 0, right: 0,
          background: 'rgba(6,13,27,0.98)',
          borderBottom: '1px solid var(--border-subtle)',
          padding: 20, display: 'flex', flexDirection: 'column', gap: 8,
        }}>
          {navLinks.map(link => (
            <Link
              key={link.to}
              to={link.to}
              onClick={() => setMobileOpen(false)}
              style={{
                textDecoration: 'none', padding: '10px 12px',
                color: 'var(--text-primary)', fontWeight: 600, borderRadius: 8,
              }}
            >
              {link.label}
            </Link>
          ))}
          <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
            {user ? (
              <>
                <Link to={dashboardPath} onClick={() => setMobileOpen(false)}>
                  <button className="btn-secondary" style={{ fontSize: '0.82rem' }}>
                    {user.role === 'doctor' ? '🩺 Dashboard' : '🧬 Dashboard'}
                  </button>
                </Link>
                {user.role === 'doctor' && (
                  <Link to="/consultation/schedule" onClick={() => setMobileOpen(false)}>
                    <button className="btn-secondary" style={{ fontSize: '0.82rem' }}>📅 Schedule</button>
                  </Link>
                )}
                <Link to="/consultation/join" onClick={() => setMobileOpen(false)}>
                  <button className="btn-secondary" style={{ fontSize: '0.82rem' }}>🎥 Join Call</button>
                </Link>
                <button
                  className="btn-secondary"
                  onClick={() => { setMobileOpen(false); handleLogout(); }}
                  style={{ fontSize: '0.82rem' }}
                >
                  Logout
                </button>
              </>
            ) : (
              <>
                <Link to="/login" onClick={() => setMobileOpen(false)}>
                  <button className="btn-secondary" style={{ fontSize: '0.82rem' }}>Sign in</button>
                </Link>
                <Link to="/register" onClick={() => setMobileOpen(false)}>
                  <button className="btn-primary" style={{ fontSize: '0.82rem' }}>Register</button>
                </Link>
              </>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

/* ── Interactive Demo Tabs ───────────────────────────────────────────── */
type DemoKey = 'doctor' | 'patient' | 'video';

const demoContent: Record<DemoKey, {
  label: string;
  icon: string;
  color: string;
  heading: string;
  intro: string;
  panelTitle: string;
  lines: Array<{ label?: string; text: string; emphasis?: boolean }>;
  cta: { to: string; label: string };
}> = {
  doctor: {
    label: 'Doctor',
    icon: '🩺',
    color: '#22d3ee',
    heading: 'Talk. We document.',
    intro:
      'You consult normally. MediSense captures every word, tags each speaker, and drafts a SOAP note the moment the call ends.',
    panelTitle: 'Live transcript · Room 4F-88C2',
    lines: [
      { label: 'DOCTOR', text: 'How long have you had the chest pain?' },
      { label: 'PATIENT', text: 'About three days now. It\'s sharp when I breathe in.' },
      { label: 'DOCTOR', text: 'Any fever, cough, or recent travel?' },
      { label: 'PATIENT', text: 'No fever. No travel.' },
      { text: '— SOAP draft ready in 8s —', emphasis: true },
      { label: 'AI SOAP', text: 'S: 34F · 3-day pleuritic chest pain. Denies fever, cough, travel.' },
      { label: 'AI SOAP', text: 'A: Likely costochondritis; rule out PE if risk factors.' },
    ],
    cta: { to: '/doctor', label: 'Open Doctor Dashboard →' },
  },
  patient: {
    label: 'Patient',
    icon: '🧬',
    color: '#4ade80',
    heading: 'Upload a report. Get a plan.',
    intro:
      'Drop in any PDF or photo. We read it — even scanned — explain every finding in plain language, and build a personalised care plan.',
    panelTitle: 'Health guide · Metabolic panel',
    lines: [
      { text: 'HbA1c  7.4 %   (ref < 5.7)   HIGH', emphasis: true },
      { text: 'Fasting glucose  148 mg/dL   HIGH', emphasis: true },
      { text: 'LDL cholesterol  118 mg/dL   BORDERLINE' },
      { text: '— AI explanation —', emphasis: true },
      { label: 'Plain', text: 'Your blood sugar is running high — suggests early type-2 diabetes.' },
      { label: 'Plan', text: 'Diet: leafy greens, legumes, fatty fish 2×/week. Avoid refined sugar.' },
      { label: 'Plan', text: 'Move: brisk walk 30 min/day, resistance 2×/week.' },
      { label: 'Refer', text: 'Endocrinologist — within 1 week.' },
    ],
    cta: { to: '/patient', label: 'Open Patient Dashboard →' },
  },
  video: {
    label: 'Video Call',
    icon: '🎥',
    color: '#a78bfa',
    heading: 'Consult. Record. Done.',
    intro:
      'Browser-native WebRTC. Patients join with a six-character code — no downloads. Transcript and SOAP note persist to the doctor\'s dashboard automatically.',
    panelTitle: 'Consult room · A4F9-88C2',
    lines: [
      { text: 'Room A4F9-88C2 · 2 participants · Active' },
      { text: '→ Doctor connected (00:00)' },
      { text: '→ Patient connected (00:04)' },
      { text: '→ Transcript streaming · Audio 48 kHz' },
      { text: '— Call ended 12:34 —', emphasis: true },
      { label: 'Saved', text: 'SOAP draft · Transcript · Session PDF' },
      { label: 'Next', text: 'Doctor reviews → 1-click export to chart.' },
    ],
    cta: { to: '/consultation/schedule', label: 'Schedule a Call →' },
  },
};

function InteractiveDemo() {
  const [tab, setTab] = useState<DemoKey>('doctor');
  const [visibleLines, setVisibleLines] = useState(0);
  const demo = demoContent[tab];

  useEffect(() => {
    setVisibleLines(0);
    let i = 0;
    const total = demo.lines.length;
    const timer = window.setInterval(() => {
      i += 1;
      setVisibleLines(i);
      if (i >= total) window.clearInterval(timer);
    }, 420);
    return () => window.clearInterval(timer);
  }, [tab, demo.lines.length]);

  return (
    <section style={{
      padding: '80px 24px',
      borderTop: '1px solid var(--border-subtle)',
      background: 'rgba(6,13,27,0.3)',
    }}>
      <div style={{ maxWidth: 1100, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 32 }}>
          <div style={{
            display: 'inline-block', padding: '6px 14px', borderRadius: 20,
            background: 'rgba(5,174,187,0.08)', color: 'var(--brand-teal)',
            fontSize: '0.75rem', fontWeight: 700, marginBottom: 18,
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            Live Demo
          </div>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, marginBottom: 14 }}>
            See it do the thing.
          </h2>
          <p style={{ color: 'var(--text-secondary)', maxWidth: 620, margin: '0 auto', lineHeight: 1.6 }}>
            Pick a workflow — the panel on the right plays a simulated sample of what MediSense actually outputs.
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 24 }}>
          {(Object.keys(demoContent) as DemoKey[]).map(k => {
            const d = demoContent[k];
            const active = tab === k;
            return (
              <button
                key={k}
                onClick={() => setTab(k)}
                style={{
                  padding: '10px 20px', borderRadius: 10,
                  border: `1px solid ${active ? d.color : 'var(--border-subtle)'}`,
                  background: active ? `${d.color}18` : 'rgba(15,30,60,0.4)',
                  color: active ? d.color : 'var(--text-secondary)',
                  fontSize: '0.9rem', fontWeight: 700,
                  cursor: 'pointer', transition: 'all 0.2s',
                  display: 'inline-flex', alignItems: 'center', gap: 8,
                }}
              >
                <span>{d.icon}</span>
                {d.label}
              </button>
            );
          })}
        </div>

        <div className="glass-card" style={{
          padding: 0, overflow: 'hidden',
          border: `1px solid ${demo.color}30`,
        }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          }}>
            <div style={{ padding: '36px 32px', borderRight: '1px solid var(--border-subtle)' }}>
              <div style={{
                display: 'inline-flex', alignItems: 'center', gap: 8,
                padding: '4px 10px', borderRadius: 6,
                background: `${demo.color}1f`, color: demo.color,
                border: `1px solid ${demo.color}40`,
                fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px',
                textTransform: 'uppercase', marginBottom: 16,
              }}>
                <span>{demo.icon}</span>
                {demo.label} workflow
              </div>
              <h3 style={{ fontSize: '1.35rem', fontWeight: 800, marginBottom: 14, lineHeight: 1.3 }}>
                {demo.heading}
              </h3>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, fontSize: '0.92rem', marginBottom: 24 }}>
                {demo.intro}
              </p>
              <Link to={demo.cta.to}>
                <button className="btn-primary" style={{
                  padding: '12px 22px', fontSize: '0.9rem',
                  background: `linear-gradient(135deg, ${demo.color} 0%, ${demo.color}cc 100%)`,
                }}>
                  {demo.cta.label}
                </button>
              </Link>
            </div>

            <div style={{
              padding: '24px 26px',
              background: 'rgba(6,13,27,0.7)',
              fontFamily: 'ui-monospace, SFMono-Regular, Menlo, monospace',
              minHeight: 320,
            }}>
              <div style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px',
                color: demo.color, textTransform: 'uppercase', marginBottom: 18,
              }}>
                <span style={{
                  width: 8, height: 8, background: demo.color, borderRadius: '50%',
                  boxShadow: `0 0 10px ${demo.color}`, animation: 'pulse-dot 1.4s infinite',
                }} />
                {demo.panelTitle}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {demo.lines.slice(0, visibleLines).map((line, i) => (
                  <div
                    key={`${tab}-${i}`}
                    style={{
                      fontSize: '0.82rem',
                      lineHeight: 1.6,
                      color: line.emphasis ? demo.color : 'var(--text-primary)',
                      opacity: 0,
                      animation: 'demo-fade 0.35s ease-out forwards',
                      fontWeight: line.emphasis ? 700 : 400,
                    }}
                  >
                    {line.label && (
                      <span style={{
                        color: demo.color, fontWeight: 700, marginRight: 8,
                        fontSize: '0.72rem', letterSpacing: '0.4px',
                      }}>
                        [{line.label}]
                      </span>
                    )}
                    {line.text}
                  </div>
                ))}
                {visibleLines < demo.lines.length && (
                  <div style={{
                    display: 'inline-block', width: 8, height: 14, background: demo.color,
                    animation: 'demo-cursor 0.8s infinite',
                  }} />
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

/* ── FAQ Accordion ───────────────────────────────────────────────────── */
const landingFaq = [
  {
    q: 'Is MediSense actually used in real clinics?',
    a: 'Yes. We\'re live in family medicine, internal medicine, cardiology, and endocrinology practices. Most clinics are up and running in a week; the longest rollout to date was 18 days.',
  },
  {
    q: 'Does the AI replace the doctor?',
    a: 'No — and it never will. Every SOAP note, every finding, and every care plan is a draft a clinician reviews and edits. The UI highlights AI-generated text so it\'s never mistaken for clinician input.',
  },
  {
    q: 'How accurate is the medical transcription?',
    a: '95 %+ on general speech and 92 %+ on medical terminology (drug names, ICD codes, dosages) in our audits. We publish accuracy benchmarks openly in the Resources section.',
  },
  {
    q: 'What does it cost?',
    a: 'Free for individual clinicians doing up to 20 consults a month. Clinic plans from $79/provider/month. See the full pricing page — no hidden fees, no per-minute transcription charges.',
  },
  {
    q: 'Can I use it for telehealth / video calls?',
    a: 'Yes. WebRTC video consultations are built in. Patients join with a 6-character code from any browser — no app install. Transcription and SOAP generation work identically to in-person calls.',
  },
  {
    q: 'What about my existing EHR?',
    a: 'We integrate with Epic, Cerner, athenahealth, DrChrono, and OpenEMR via FHIR R4. One-click PDF export works with every other system. See the Integrations page for the full list.',
  },
];

function FaqSection() {
  const [open, setOpen] = useState<number | null>(0);
  return (
    <section style={{
      padding: '80px 24px',
      borderTop: '1px solid var(--border-subtle)',
    }}>
      <div style={{ maxWidth: 820, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 40 }}>
          <div style={{
            display: 'inline-block', padding: '6px 14px', borderRadius: 20,
            background: 'rgba(5,174,187,0.08)', color: 'var(--brand-teal)',
            fontSize: '0.75rem', fontWeight: 700, marginBottom: 18,
            textTransform: 'uppercase', letterSpacing: '0.5px',
          }}>
            FAQ
          </div>
          <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, marginBottom: 14 }}>
            Questions we get every week
          </h2>
          <p style={{ color: 'var(--text-secondary)' }}>
            Don't see yours? <Link to="/contact" style={{ color: 'var(--brand-teal)', fontWeight: 600 }}>Drop us a line</Link>.
          </p>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {landingFaq.map((item, i) => {
            const isOpen = open === i;
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
                  onClick={() => setOpen(isOpen ? null : i)}
                  style={{
                    width: '100%', padding: '18px 22px',
                    background: 'transparent', border: 'none', color: 'inherit',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    gap: 14, cursor: 'pointer', textAlign: 'left',
                    fontSize: '0.95rem', fontWeight: 700,
                  }}
                >
                  <span>{item.q}</span>
                  <span style={{
                    color: 'var(--brand-teal)', fontSize: '1.25rem', fontWeight: 700,
                    transform: isOpen ? 'rotate(45deg)' : 'none', transition: 'transform 0.2s',
                    flexShrink: 0,
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
  );
}

/* ── Animated Counter ────────────────────────────────────────────────── */
function AnimatedCounter({ end, suffix = '', duration = 1500 }: { end: number; suffix?: string; duration?: number }) {
  const [value, setValue] = useState(0);

  useEffect(() => {
    let start: number | null = null;
    let raf: number;
    const step = (ts: number) => {
      if (start === null) start = ts;
      const p = Math.min((ts - start) / duration, 1);
      setValue(Math.floor(p * end));
      if (p < 1) raf = requestAnimationFrame(step);
    };
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
  }, [end, duration]);

  return <span>{value.toLocaleString()}{suffix}</span>;
}

/* ── Landing Page ────────────────────────────────────────────────────── */
function LandingPage() {
  return (
    <div style={{ flex: 1 }}>

      {/* ── HERO ───────────────────────────────────────── */}
      <section style={{
        padding: '80px 24px 100px',
        position: 'relative',
        textAlign: 'center',
        overflow: 'hidden',
      }}>
        <div style={{ maxWidth: 900, margin: '0 auto', position: 'relative', zIndex: 1 }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 10,
            padding: '6px 18px', borderRadius: 20,
            border: '1px solid rgba(5,174,187,0.3)',
            background: 'rgba(5,174,187,0.08)',
            fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-teal)',
            marginBottom: 28, textTransform: 'uppercase', letterSpacing: '0.6px',
          }}>
            <span style={{
              width: 8, height: 8, borderRadius: '50%', background: 'var(--brand-teal)',
              boxShadow: '0 0 10px var(--brand-teal)', animation: 'pulse-dot 1.6s infinite',
            }} />
            Trusted by 5,000+ Clinicians Worldwide
          </div>

          <h1 style={{
            fontSize: 'clamp(2.2rem, 6vw, 4rem)',
            fontWeight: 900, lineHeight: 1.1, marginBottom: 24,
          }}>
            AI-Powered Medical Intelligence for{' '}
            <span style={{
              background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Modern Clinicians
            </span>
          </h1>

          <p style={{
            fontSize: 'clamp(1rem, 1.6vw, 1.2rem)',
            color: 'var(--text-secondary)', lineHeight: 1.7,
            maxWidth: 680, margin: '0 auto 40px',
          }}>
            From real-time video consultations with automatic SOAP notes, to patient-friendly lab report analysis —
            MediSense AI is the clinical co-pilot that gives doctors their time back and patients clearer care.
          </p>

          <div style={{ display: 'flex', gap: 16, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 64 }}>
            <Link to="/doctor"><button className="btn-primary" style={{ padding: '14px 32px', fontSize: '1rem' }}>🩺 I'm a Doctor</button></Link>
            <Link to="/patient"><button className="btn-secondary" style={{ padding: '14px 32px', fontSize: '1rem' }}>🧬 I'm a Patient</button></Link>
            <Link to="/consultation/schedule"><button className="btn-secondary" style={{ padding: '14px 32px', fontSize: '1rem' }}>📅 Schedule Video Call</button></Link>
          </div>

          {/* Trust bar */}
          <div style={{
            display: 'flex', gap: 36, justifyContent: 'center', flexWrap: 'wrap',
            padding: '20px 24px', borderTop: '1px solid var(--border-subtle)',
            maxWidth: 700, margin: '0 auto',
          }}>
            {[
              { icon: '🔒', label: 'HIPAA Aligned' },
              { icon: '🛡️', label: 'End-to-End Encrypted' },
              { icon: '⚡', label: 'Real-Time AI' },
              { icon: '🌐', label: '30+ Countries' },
            ].map(item => (
              <div key={item.label} style={{
                display: 'flex', alignItems: 'center', gap: 8,
                fontSize: '0.82rem', color: 'var(--text-muted)', fontWeight: 600,
              }}>
                <span style={{ fontSize: '1rem' }}>{item.icon}</span>
                {item.label}
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── STATS ──────────────────────────────────────── */}
      <section style={{
        padding: '56px 24px',
        borderTop: '1px solid var(--border-subtle)',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'rgba(23,89,176,0.04)',
      }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 24,
        }}>
          {[
            { num: 500000, suffix: '+', label: 'Consultations Assisted' },
            { num: 5000, suffix: '+', label: 'Healthcare Providers' },
            { num: 95, suffix: '%', label: 'Transcription Accuracy' },
            { num: 70, suffix: '%', label: 'Less Paperwork Time' },
          ].map(stat => (
            <div key={stat.label} style={{ textAlign: 'center' }}>
              <div style={{
                fontSize: 'clamp(2rem, 3.5vw, 2.8rem)', fontWeight: 900,
                background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent', marginBottom: 6, lineHeight: 1,
              }}>
                <AnimatedCounter end={stat.num} suffix={stat.suffix} />
              </div>
              <div style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', fontWeight: 600 }}>
                {stat.label}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* ── FEATURES ───────────────────────────────────── */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 56px' }}>
            <div style={{
              display: 'inline-block', padding: '6px 14px', borderRadius: 20,
              background: 'rgba(5,174,187,0.08)', color: 'var(--brand-teal)',
              fontSize: '0.75rem', fontWeight: 700, marginBottom: 18,
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              Platform Features
            </div>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, marginBottom: 16 }}>
              Everything You Need, Beautifully Integrated
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.7 }}>
              Purpose-built tools for every step of the care journey — from first consult to follow-up.
            </p>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24,
          }}>
            {[
              { icon: '🎥', title: 'Live Video Consultations', desc: 'Secure WebRTC video calls between doctor and patient, with in-browser join and no downloads.', color: '#22d3ee' },
              { icon: '🎤', title: 'Real-Time Transcription', desc: 'Every word captured and speaker-labeled as the conversation happens. No manual notes required.', color: '#60a5fa' },
              { icon: '📋', title: 'AI-Generated SOAP Notes', desc: 'Structured clinical notes produced automatically at end of call — editable, exportable, chart-ready.', color: '#a78bfa' },
              { icon: '🧪', title: 'Lab Report Analysis', desc: 'Patients upload PDFs and get plain-English explanations, flagged abnormalities, and next steps.', color: '#4ade80' },
              { icon: '🥗', title: 'Personalized Health Plans', desc: 'AI-generated diet, exercise, and precaution guides tailored to each patient\'s lab findings.', color: '#fbbf24' },
              { icon: '📥', title: 'One-Click PDF Export', desc: 'Download professionally formatted clinical documents for records, referrals, or patient handouts.', color: '#f87171' },
            ].map(f => (
              <div key={f.title} className="glass-card" style={{ padding: '32px 28px' }}>
                <div style={{
                  width: 52, height: 52, borderRadius: 14,
                  background: `${f.color}18`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.7rem', marginBottom: 18,
                  border: `1px solid ${f.color}40`,
                }}>
                  {f.icon}
                </div>
                <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 10 }}>{f.title}</h3>
                <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.6 }}>{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── HOW IT WORKS ──────────────────────────────── */}
      <section style={{
        padding: '80px 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(23,89,176,0.03)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', maxWidth: 640, margin: '0 auto 56px' }}>
            <div style={{
              display: 'inline-block', padding: '6px 14px', borderRadius: 20,
              background: 'rgba(5,174,187,0.08)', color: 'var(--brand-teal)',
              fontSize: '0.75rem', fontWeight: 700, marginBottom: 18,
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              How It Works
            </div>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, marginBottom: 16 }}>
              Two Workflows, One Platform
            </h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '1rem', lineHeight: 1.7 }}>
              Whether you're the clinician or the patient — we've designed a frictionless experience.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 32 }}>

            {/* Doctor Flow */}
            <div className="glass-card" style={{ padding: '36px 32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: 'var(--gradient-brand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.6rem', boxShadow: '0 6px 20px rgba(23,89,176,0.3)',
                }}>🩺</div>
                <div>
                  <h3 style={{ fontWeight: 800, fontSize: '1.2rem' }}>For Doctors</h3>
                  <div style={{ fontSize: '0.8rem', color: 'var(--brand-teal)', fontWeight: 600 }}>
                    Consultation → SOAP Note
                  </div>
                </div>
              </div>

              {[
                { n: 1, t: 'Start a Session', d: 'Open the Doctor Dashboard and begin recording or launch a video consultation.' },
                { n: 2, t: 'Talk Naturally', d: 'Conduct the consultation as you normally would. AI transcribes and labels every speaker in real time.' },
                { n: 3, t: 'Review AI SOAP Note', d: 'End the call to receive structured Subjective, Objective, Assessment, and Plan — edit as needed.' },
                { n: 4, t: 'Export & Share', d: 'Download a chart-ready PDF or copy to clipboard for your EHR system.' },
              ].map(step => (
                <div key={step.n} style={{ display: 'flex', gap: 18, marginBottom: 20 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(23,89,176,0.15)', color: 'var(--brand-teal)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.9rem',
                    border: '1px solid rgba(5,174,187,0.3)',
                  }}>{step.n}</div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4, fontSize: '0.95rem' }}>{step.t}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6 }}>{step.d}</div>
                  </div>
                </div>
              ))}

              <Link to="/doctor">
                <button className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }}>
                  Open Doctor Dashboard →
                </button>
              </Link>
            </div>

            {/* Patient Flow */}
            <div className="glass-card" style={{ padding: '36px 32px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 28 }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: 'linear-gradient(135deg, #05aebb 0%, #4ade80 100%)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.6rem', boxShadow: '0 6px 20px rgba(5,174,187,0.3)',
                }}>🧬</div>
                <div>
                  <h3 style={{ fontWeight: 800, fontSize: '1.2rem' }}>For Patients</h3>
                  <div style={{ fontSize: '0.8rem', color: '#4ade80', fontWeight: 600 }}>
                    Lab Report → Health Guide
                  </div>
                </div>
              </div>

              {[
                { n: 1, t: 'Upload Your Report', d: 'Drop in any PDF lab report. We extract the text even from scanned documents via OCR.' },
                { n: 2, t: 'AI Analysis', d: 'Our medical AI interprets findings in plain language and flags values that need attention.' },
                { n: 3, t: 'Get Your Plan', d: 'Receive a personalized guide: diet recommendations, exercise, precautions, and specialist referrals.' },
                { n: 4, t: 'Download & Discuss', d: 'Save a PDF to review with your doctor. You come in prepared and informed.' },
              ].map(step => (
                <div key={step.n} style={{ display: 'flex', gap: 18, marginBottom: 20 }}>
                  <div style={{
                    width: 36, height: 36, borderRadius: '50%', flexShrink: 0,
                    background: 'rgba(33,162,87,0.15)', color: '#4ade80',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontWeight: 800, fontSize: '0.9rem',
                    border: '1px solid rgba(33,162,87,0.3)',
                  }}>{step.n}</div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 4, fontSize: '0.95rem' }}>{step.t}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6 }}>{step.d}</div>
                  </div>
                </div>
              ))}

              <Link to="/patient">
                <button className="btn-primary" style={{
                  width: '100%', justifyContent: 'center', marginTop: 12,
                  background: 'linear-gradient(135deg, #05aebb 0%, #4ade80 100%)',
                }}>
                  Open Patient Dashboard →
                </button>
              </Link>
            </div>

          </div>
        </div>
      </section>

      {/* ── INTERACTIVE DEMO ──────────────────────────── */}
      <InteractiveDemo />

      {/* ── WHY CHOOSE US ─────────────────────────────── */}
      <section style={{ padding: '80px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 32, alignItems: 'center' }}>
            <div>
              <div style={{
                display: 'inline-block', padding: '6px 14px', borderRadius: 20,
                background: 'rgba(5,174,187,0.08)', color: 'var(--brand-teal)',
                fontSize: '0.75rem', fontWeight: 700, marginBottom: 18,
                textTransform: 'uppercase', letterSpacing: '0.5px',
              }}>
                Why MediSense
              </div>
              <h2 style={{ fontSize: 'clamp(1.8rem, 3vw, 2.4rem)', fontWeight: 800, marginBottom: 18, lineHeight: 1.2 }}>
                Built by doctors, for doctors. Trusted by patients.
              </h2>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.8, marginBottom: 24 }}>
                Most AI tools are built by engineers guessing at clinical workflows.
                MediSense is co-designed with practicing physicians and validated against
                evidence-based medicine — so the output feels like a thoughtful colleague,
                not a generic chatbot.
              </p>
              <Link to="/about">
                <button className="btn-secondary">Learn Our Story →</button>
              </Link>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {[
                { icon: '✅', t: 'Clinician-in-the-loop', d: 'Every AI output is editable. The doctor always has final say.' },
                { icon: '⚡', t: 'Fast enough for live calls', d: 'Sub-second transcription so documentation never lags behind conversation.' },
                { icon: '🔐', t: 'Privacy by design', d: 'Encryption in transit and at rest. Session data auto-purged on close.' },
                { icon: '📚', t: 'Evidence-based outputs', d: 'Models grounded in peer-reviewed clinical literature, not Wikipedia.' },
              ].map(item => (
                <div key={item.t} style={{
                  display: 'flex', gap: 16, padding: '16px 18px',
                  background: 'rgba(15,30,60,0.4)',
                  border: '1px solid var(--border-subtle)',
                  borderRadius: 12,
                }}>
                  <div style={{ fontSize: '1.4rem', flexShrink: 0 }}>{item.icon}</div>
                  <div>
                    <div style={{ fontWeight: 700, marginBottom: 3, fontSize: '0.92rem' }}>{item.t}</div>
                    <div style={{ color: 'var(--text-secondary)', fontSize: '0.82rem', lineHeight: 1.5 }}>{item.d}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ──────────────────────────────── */}
      <section style={{
        padding: '80px 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(23,89,176,0.03)',
      }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 48 }}>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.5rem)', fontWeight: 800, marginBottom: 12 }}>
              What Our Users Say
            </h2>
            <p style={{ color: 'var(--text-secondary)' }}>
              Real feedback from clinicians and patients around the world.
            </p>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 24 }}>
            {[
              {
                quote: 'I used to spend 2 hours after clinic on notes. Now it\'s 15 minutes of review. MediSense gave me my evenings back.',
                name: 'Dr. Rachel Kim',
                role: 'Family Medicine, Seattle',
                icon: '👩‍⚕️',
              },
              {
                quote: 'My father got his lab report back and actually understood it for the first time. The personalized diet plan was a game-changer.',
                name: 'Sameer Khan',
                role: 'Patient, Dubai',
                icon: '🧑',
              },
              {
                quote: 'The transcription accuracy on medical terminology is remarkable. It correctly captures drug names, dosages, and ICD codes.',
                name: 'Dr. James O\'Brien',
                role: 'Internal Medicine, Dublin',
                icon: '👨‍⚕️',
              },
            ].map(t => (
              <div key={t.name} className="glass-card" style={{ padding: '28px 26px' }}>
                <div style={{ fontSize: '1.8rem', color: 'var(--brand-teal)', marginBottom: 10, lineHeight: 1 }}>
                  "
                </div>
                <p style={{ fontSize: '0.92rem', lineHeight: 1.7, color: 'var(--text-primary)', marginBottom: 20 }}>
                  {t.quote}
                </p>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{
                    width: 40, height: 40, borderRadius: '50%',
                    background: 'var(--gradient-brand)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                    fontSize: '1.2rem',
                  }}>{t.icon}</div>
                  <div>
                    <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{t.name}</div>
                    <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────── */}
      <FaqSection />

      {/* ── CTA ───────────────────────────────────────── */}
      <section style={{ padding: '80px 24px' }}>
        <div className="glass-card" style={{
          maxWidth: 1000, margin: '0 auto',
          padding: 'clamp(40px, 6vw, 64px)',
          textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(23,89,176,0.15) 0%, rgba(5,174,187,0.12) 100%)',
          border: '1px solid rgba(5,174,187,0.25)',
        }}>
          <h2 style={{
            fontSize: 'clamp(1.6rem, 3.5vw, 2.4rem)', fontWeight: 800, marginBottom: 16,
            background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent',
          }}>
            Ready to Experience Smarter Healthcare?
          </h2>
          <p style={{
            color: 'var(--text-secondary)', fontSize: '1.05rem', lineHeight: 1.7,
            maxWidth: 600, margin: '0 auto 36px',
          }}>
            Start your first consultation or analyze a lab report in under 60 seconds. No sign-up required for the demo.
          </p>
          <div style={{ display: 'flex', gap: 14, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/doctor"><button className="btn-primary" style={{ padding: '14px 30px', fontSize: '0.95rem' }}>Start as Doctor</button></Link>
            <Link to="/patient"><button className="btn-primary" style={{ padding: '14px 30px', fontSize: '0.95rem', background: 'linear-gradient(135deg, #05aebb 0%, #4ade80 100%)' }}>Start as Patient</button></Link>
            <Link to="/contact"><button className="btn-secondary" style={{ padding: '14px 30px', fontSize: '0.95rem' }}>Contact Sales</button></Link>
          </div>
        </div>
      </section>

    </div>
  );
}

/* ── Footer ──────────────────────────────────────────────────────────── */
function Footer() {
  const year = new Date().getFullYear();
  const { user } = useAuth();

  // Platform links tailored per audience.
  const platformLinks = user
    ? user.role === 'doctor'
      ? [
          { to: '/doctor', label: 'Doctor Dashboard' },
          { to: '/consultation/schedule', label: 'Schedule a Call' },
          { to: '/consultation/join', label: 'Join a Call' },
        ]
      : [
          { to: '/patient', label: 'Patient Dashboard' },
          { to: '/consultation/join', label: 'Join a Call' },
        ]
    : [
        { to: '/doctor', label: 'Doctor Portal' },
        { to: '/patient', label: 'Patient Portal' },
        { to: '/consultation/schedule', label: 'Schedule a Call' },
        { to: '/consultation/join', label: 'Join a Call' },
      ];

  // Marketing links hidden from logged-in users.
  const companyLinks = user
    ? []
    : [
        { to: '/about', label: 'About Us' },
        { to: '/use-cases', label: 'Use Cases' },
        { to: '/features', label: 'Features' },
        { to: '/pricing', label: 'Pricing' },
        { to: '/integrations', label: 'Integrations' },
        { to: '/resources', label: 'Resources' },
        { to: '/security', label: 'Trust Center' },
        { to: '/contact', label: 'Contact' },
      ];

  return (
    <footer style={{
      padding: '56px 24px 28px',
      borderTop: '1px solid var(--border-subtle)',
      background: 'rgba(6,13,27,0.7)',
      marginTop: 40,
    }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: 40, marginBottom: 36,
        }}>
          {/* Brand column */}
          <div style={{ gridColumn: 'span 1', minWidth: 240 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
              <span style={{ fontSize: '1.5rem' }}>💊</span>
              <span style={{
                fontWeight: 800, fontSize: '1.1rem',
                background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
                WebkitTextFillColor: 'transparent',
              }}>
                MediSense AI
              </span>
            </div>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.85rem', lineHeight: 1.6, marginBottom: 16 }}>
              AI-powered medical intelligence for doctors and patients. From consultation to care.
            </p>
            <div style={{ display: 'flex', gap: 10 }}>
              {['🐦', '💼', '📺', '📸'].map((ic, i) => (
                <a key={i} href="#" style={{
                  width: 36, height: 36, borderRadius: 10,
                  border: '1px solid var(--border-subtle)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  textDecoration: 'none', fontSize: '1rem',
                  transition: 'all 0.2s',
                }}>
                  {ic}
                </a>
              ))}
            </div>
          </div>

          {/* Links columns */}
          {[
            { title: 'Platform', links: platformLinks },
            { title: 'Company', links: companyLinks },
            {
              title: 'Legal',
              links: [
                { to: '#', label: 'Privacy Policy' },
                { to: '#', label: 'Terms of Service' },
                { to: '#', label: 'HIPAA Compliance' },
                { to: '#', label: 'Cookie Policy' },
              ],
            },
          ].filter(col => col.links.length > 0).map(col => (
            <div key={col.title}>
              <h4 style={{
                fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-teal)',
                marginBottom: 16, textTransform: 'uppercase', letterSpacing: '0.6px',
              }}>
                {col.title}
              </h4>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                {col.links.map(link => (
                  <Link key={link.label} to={link.to} style={{
                    textDecoration: 'none', color: 'var(--text-secondary)',
                    fontSize: '0.85rem', transition: 'color 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.color = 'var(--brand-teal)')}
                  onMouseLeave={e => (e.currentTarget.style.color = 'var(--text-secondary)')}
                  >
                    {link.label}
                  </Link>
                ))}
              </div>
            </div>
          ))}
        </div>

        <div style={{
          paddingTop: 24,
          borderTop: '1px solid var(--border-subtle)',
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          flexWrap: 'wrap', gap: 12,
        }}>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.78rem' }}>
            © {year} MediSense AI. All rights reserved.
          </p>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.75rem', maxWidth: 560, textAlign: 'right' }}>
            For educational and demonstration purposes. Always consult a qualified healthcare professional for medical decisions.
          </p>
        </div>
      </div>
    </footer>
  );
}

/* ── Public-only wrapper: bounce logged-in users to their dashboard ── */
function PublicOnly({ children }: { children: ReactNode }) {
  const { user, loading } = useAuth();
  if (loading) return null;
  if (user) {
    return <Navigate to={user.role === 'patient' ? '/patient' : '/doctor'} replace />;
  }
  return <>{children}</>;
}

/* ── Main App ────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <div className="bg-mesh" />
        <Navbar />
        <Routes>
          <Route path="/" element={<PublicOnly><LandingPage /></PublicOnly>} />
          <Route path="/about" element={<PublicOnly><AboutPage /></PublicOnly>} />
          <Route path="/contact" element={<PublicOnly><ContactPage /></PublicOnly>} />
          <Route path="/features" element={<PublicOnly><FeaturesPage /></PublicOnly>} />
          <Route path="/use-cases" element={<PublicOnly><UseCasesPage /></PublicOnly>} />
          <Route path="/pricing" element={<PublicOnly><PricingPage /></PublicOnly>} />
          <Route path="/security" element={<PublicOnly><SecurityPage /></PublicOnly>} />
          <Route path="/integrations" element={<PublicOnly><IntegrationsPage /></PublicOnly>} />
          <Route path="/resources" element={<PublicOnly><ResourcesPage /></PublicOnly>} />
          <Route path="/login" element={<PublicOnly><Login /></PublicOnly>} />
          <Route path="/register" element={<PublicOnly><Register /></PublicOnly>} />
          <Route
            path="/doctor"
            element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <DoctorDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/patient"
            element={
              <ProtectedRoute allowedRoles={['patient']}>
                <PatientDashboard />
              </ProtectedRoute>
            }
          />
          <Route
            path="/consultation/schedule"
            element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <SchedulePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/consultation/join"
            element={
              <ProtectedRoute>
                <JoinConsultation />
              </ProtectedRoute>
            }
          />
          <Route
            path="/consultation/room/:roomId"
            element={
              <ProtectedRoute>
                <ConsultationRoom />
              </ProtectedRoute>
            }
          />
        </Routes>
        <Footer />
      </Router>
    </AuthProvider>
  );
}
