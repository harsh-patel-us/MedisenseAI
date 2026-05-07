import { useState, useEffect, useRef } from 'react';
import { BrowserRouter as Router, Routes, Route, Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import DoctorDashboard from './pages/DoctorDashboard';
import DoctorChat from './pages/DoctorChat';
import PatientDashboard from './pages/PatientDashboard';
import AboutPage from './pages/AboutPage';
import ContactPage from './pages/ContactPage';
import SchedulePage from './pages/SchedulePage';
import Login from './pages/Login';
import Register from './pages/Register';
import ProfilePage from './pages/ProfilePage';
import ProtectedRoute from './components/ProtectedRoute';
import ScrollToTop from './components/ScrollToTop';
import ChatbotWidget from './components/ChatbotWidget';
import PatientChat from './pages/PatientChat';
import PatientReportUpload from './pages/PatientReportUpload';
import UseCasesPage from './pages/UseCasesPage';
import FeaturesPage from './pages/FeaturesPage';
import PricingPage from './pages/PricingPage';
import SecurityPage from './pages/SecurityPage';
import IntegrationsPage from './pages/IntegrationsPage';
import ResourcesPage from './pages/ResourcesPage';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { getProfilePicUrl } from './api/authApi';
import PatientLayout from './components/patient/PatientLayout';
import DoctorLayout from './components/doctor/DoctorLayout';
import './index.css';

/* ── Navigation Bar ──────────────────────────────────────────────────── */
function Navbar() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (profileRef.current && !profileRef.current.contains(event.target as Node)) {
        setProfileOpen(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

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
    setProfileOpen(false);
    navigate('/', { replace: true });
  };

  const dashboardPath = user?.role === 'patient' ? '/patient' : '/doctor';
  const profilePath = user?.role === 'patient' ? '/patient/profile' : '/doctor/profile';

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
      <div className="nav-actions-desktop" style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
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
            <Link to="/consultation/schedule">
              <button
                className={location.pathname === '/consultation/schedule' ? 'btn-primary' : 'btn-secondary'}
                style={{ padding: '8px 16px', fontSize: '0.82rem' }}
              >
                📅 Schedule
              </button>
            </Link>
            
            {/* Profile Dropdown */}
            <div style={{ position: 'relative' }} ref={profileRef}>
              <button
                onClick={() => setProfileOpen(!profileOpen)}
                style={{
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '6px 14px', borderRadius: 12,
                  background: profileOpen ? 'rgba(5,174,187,0.15)' : 'rgba(5,174,187,0.08)',
                  border: `1px solid ${profileOpen ? 'var(--brand-teal)' : 'rgba(5,174,187,0.25)'}`,
                  fontSize: '0.85rem', color: 'var(--text-primary)',
                  cursor: 'pointer', transition: 'all 0.2s ease',
                }}
              >
                <div style={{
                  width: 28, height: 28, borderRadius: '50%',
                  background: 'var(--gradient-brand)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1rem', flexShrink: 0,
                  overflow: 'hidden',
                }}>
                  {user.has_profile_pic ? (
                    <img src={getProfilePicUrl()} alt={user.full_name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} />
                  ) : (
                    user.role === 'doctor' ? '🩺' : '🧬'
                  )}
                </div>
                <span style={{ fontWeight: 700 }}>{user.full_name.split(' ')[0]}</span>
                <span style={{ fontSize: '0.7rem', opacity: 0.7, transform: profileOpen ? 'rotate(180deg)' : 'none', transition: 'transform 0.2s' }}>▼</span>
              </button>

              {profileOpen && (
                <div className="glass-card animate-float" style={{
                  position: 'absolute', top: 'calc(100% + 10px)', right: 0,
                  width: 220, padding: 8, zIndex: 1000,
                  boxShadow: '0 20px 40px rgba(0,0,0,0.4)',
                  animation: 'demo-fade 0.2s ease-out',
                }}>
                  <div style={{ padding: '12px 16px', borderBottom: '1px solid var(--border-subtle)', marginBottom: 8 }}>
                    <div style={{ fontWeight: 800, fontSize: '0.9rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user.full_name}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>{user.email}</div>
                  </div>
                  
                  <Link to={profilePath} onClick={() => setProfileOpen(false)} style={{ textDecoration: 'none' }}>
                    <button style={{
                      width: '100%', padding: '10px 16px', borderRadius: 8,
                      textAlign: 'left', background: 'transparent', border: 'none',
                      color: 'var(--text-primary)', fontSize: '0.85rem', fontWeight: 600,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(5,174,187,0.1)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                    >
                      👤 View Profile
                    </button>
                  </Link>

                  <button 
                    onClick={handleLogout}
                    style={{
                      width: '100%', padding: '10px 16px', borderRadius: 8,
                      textAlign: 'left', background: 'transparent', border: 'none',
                      color: '#fca5a5', fontSize: '0.85rem', fontWeight: 600,
                      cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 10,
                      transition: 'background 0.2s',
                    }}
                    onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'rgba(220, 38, 38, 0.1)'}
                    onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = 'transparent'}
                  >
                    🚪 Logout
                  </button>
                </div>
              )}
            </div>
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
                <Link to="/consultation/schedule" onClick={() => setMobileOpen(false)}>
                  <button className="btn-secondary" style={{ fontSize: '0.82rem' }}>📅 Schedule</button>
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
  lines: Array<{ label?: string; text: string; emphasis?: boolean; subtext?: string }>;
  cta: { to: string; label: string };
}> = {
  doctor: {
    label: 'Doctor Side',
    icon: '🩺',
    color: '#0d9488',
    heading: 'Documentation at the Speed of Thought',
    intro:
      'Focus on your patient, not your screen. MediSense captures the conversation, identifies medical entities, and drafts a structured SOAP note in seconds.',
    panelTitle: 'Clinical Intelligence Engine v2.0',
    lines: [
      { label: 'TRANSCRIPT', text: 'Dr: Any family history of hypertension?', subtext: '00:14' },
      { label: 'TRANSCRIPT', text: 'Pt: Yes, my father and older brother.', subtext: '00:18' },
      { text: '→ Extracting Entities: [Hypertension], [Family History]', emphasis: true },
      { label: 'SOAP DRAFT', text: 'S: Significant family history of HTN (father, brother).' },
      { label: 'SOAP DRAFT', text: 'A: Screen for early-stage hypertension; baseline EKG.' },
    ],
    cta: { to: '/doctor', label: 'Try Doctor Workspace →' },
  },
  patient: {
    label: 'Patient Side',
    icon: '🧬',
    color: '#06b6d4',
    heading: 'Your Health, Finally Explained',
    intro:
      'Upload complex lab reports and get immediate, plain-language insights. No more Googling symptoms—just clear, personalized guidance.',
    panelTitle: 'MediSense Health Lab · Analysis',
    lines: [
      { text: 'Creatinine: 1.4 mg/dL (Ref: 0.7-1.3) HIGH', emphasis: true },
      { text: 'eGFR: 58 mL/min/1.73m² (Ref: >60) LOW', emphasis: true },
      { text: '→ AI Interpretation: Mild renal impairment detected.', emphasis: true },
      { label: 'GUIDE', text: 'Your kidney markers are slightly high. This needs a follow-up.' },
      { label: 'PLAN', text: 'Diet: Reduce sodium <1500mg. Increase water to 2L/day.' },
      { label: 'REFER', text: 'Recommended specialist: Nephrologist.' },
    ],
    cta: { to: '/patient', label: 'Try Patient Portal →' },
  },
  video: {
    label: 'Video Consults',
    icon: '🎥',
    color: '#1e40af',
    heading: 'Seamless Virtual Care',
    intro:
      'Integrated Google Meet scheduling with automated post-call processing. Every virtual visit becomes a permanent, searchable clinical record.',
    panelTitle: 'Meet Integration · Active Stream',
    lines: [
      { text: '→ Booking: Wed Oct 14 @ 10:00 AM' },
      { text: '→ Google Meet link synced to both calendars' },
      { text: '→ Post-Call: Transcript automatically fetched', emphasis: true },
      { label: 'RESULT', text: 'SOAP draft generated from Meet transcript.' },
      { label: 'STATUS', text: 'PDF Health Guide sent to patient portal.' },
    ],
    cta: { to: '/consultation/schedule', label: 'Schedule Demo Call →' },
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
    }, 500);
    return () => window.clearInterval(timer);
  }, [tab, demo.lines.length]);

  return (
    <section style={{ padding: '100px 24px', background: 'var(--surface-0)' }}>
      <div style={{ maxWidth: 1200, margin: '0 auto' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <span className="live-indicator" style={{ marginRight: 8 }} />
          <span style={{ fontSize: '0.9rem', fontWeight: 800, color: 'var(--brand-teal)', textTransform: 'uppercase', letterSpacing: '1px' }}>
            Interactive Demo
          </span>
          <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 900, marginTop: 16 }}>
            The Platform in Action
          </h2>
        </div>

        <div className="glass-card" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(350px, 1fr))', padding: 0 }}>
          {/* Controls */}
          <div style={{ padding: 40, borderRight: '1px solid var(--border-subtle)' }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 40 }}>
              {(Object.keys(demoContent) as DemoKey[]).map(k => {
                const d = demoContent[k];
                const active = tab === k;
                return (
                  <button
                    key={k}
                    onClick={() => setTab(k)}
                    style={{
                      padding: '20px', borderRadius: 16, textAlign: 'left',
                      background: active ? 'rgba(13, 148, 136, 0.1)' : 'transparent',
                      border: `1px solid ${active ? 'var(--brand-teal)' : 'transparent'}`,
                      cursor: 'pointer', transition: 'all 0.3s ease',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 15 }}>
                      <span style={{ fontSize: '1.5rem', opacity: active ? 1 : 0.5 }}>{d.icon}</span>
                      <div>
                        <div style={{ fontWeight: 800, color: active ? 'var(--text-primary)' : 'var(--text-secondary)' }}>{d.label}</div>
                        <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>{active ? 'Active Flow' : 'View Workflow'}</div>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>

            <div style={{ animation: 'demo-fade 0.5s ease-out' }}>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: 15 }}>{demo.heading}</h3>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 30 }}>{demo.intro}</p>
              <Link to={demo.cta.to}>
                <button className="btn-primary" style={{ background: demo.color }}>{demo.cta.label}</button>
              </Link>
            </div>
          </div>

          {/* Visualization */}
          <div style={{ padding: 40, background: 'rgba(2, 6, 23, 0.5)', position: 'relative' }}>
             <div className="demo-window">
                <div className="demo-header">
                   <div className="dot red" />
                   <div className="dot yellow" />
                   <div className="dot green" />
                   <div style={{ marginLeft: 'auto', fontSize: '0.7rem', color: 'var(--text-muted)', fontWeight: 600 }}>{demo.panelTitle}</div>
                </div>
                <div style={{ padding: 30, display: 'flex', flexDirection: 'column', gap: 15, minHeight: 350 }}>
                   {demo.lines.slice(0, visibleLines).map((line, i) => (
                     <div key={i} style={{ 
                        animation: 'demo-fade 0.4s ease-out forwards',
                        padding: '12px 16px',
                        background: line.emphasis ? `${demo.color}15` : 'rgba(255,255,255,0.03)',
                        borderRadius: 12,
                        borderLeft: `3px solid ${line.emphasis ? demo.color : 'transparent'}`,
                      }}>
                        {line.label && (
                          <div style={{ fontSize: '0.65rem', fontWeight: 900, color: demo.color, marginBottom: 4, textTransform: 'uppercase' }}>
                            {line.label} {line.subtext && <span style={{ color: 'var(--text-muted)', marginLeft: 8 }}>{line.subtext}</span>}
                          </div>
                        )}
                        <div style={{ fontSize: '0.9rem', color: line.emphasis ? demo.color : 'var(--text-primary)', fontWeight: line.emphasis ? 700 : 400 }}>
                          {line.text}
                        </div>
                     </div>
                   ))}
                   {visibleLines < demo.lines.length && (
                      <div style={{ padding: '0 16px' }}>
                        <div style={{ width: 10, height: 18, background: demo.color, animation: 'demo-cursor 0.8s infinite' }} />
                      </div>
                   )}
                </div>
             </div>
             
             {/* Floating decorative cards */}
             <div className="glass-card animate-float" style={{ 
                position: 'absolute', bottom: 20, right: 20, padding: '15px 20px', 
                fontSize: '0.75rem', fontWeight: 800, background: 'var(--gradient-brand)', color: 'white' 
              }}>
               Processing Complete ✓
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
    a: 'Yes. Schedule a consultation and we create a Google Calendar event with a Meet link for both parties. After the call, process the Meet transcript from your dashboard to generate a SOAP note automatically.',
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
export function AnimatedCounter({ end, suffix = '', duration = 1500 }: { end: number; suffix?: string; duration?: number }) {
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
        padding: '120px 24px 140px',
        textAlign: 'center',
        position: 'relative',
      }}>
        <div style={{ maxWidth: 1000, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 12,
            padding: '8px 20px', borderRadius: 99,
            background: 'rgba(13, 148, 136, 0.1)',
            border: '1px solid var(--border-subtle)',
            fontSize: '0.85rem', fontWeight: 800, color: 'var(--brand-teal)',
            marginBottom: 32,
          }}>
            <span className="live-indicator" />
            Empowering 500+ Healthcare Providers in 2026
          </div>

          <h1 style={{
            fontSize: 'clamp(2.5rem, 8vw, 5rem)',
            fontWeight: 950, lineHeight: 1, letterSpacing: '-2px',
            marginBottom: 30,
          }}>
            AI Intelligence for the{' '}
            <span style={{
              background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              Next Generation
            </span>{' '}
            of Care
          </h1>

          <p style={{
            fontSize: 'clamp(1.1rem, 2vw, 1.35rem)',
            color: 'var(--text-secondary)', lineHeight: 1.6,
            maxWidth: 750, margin: '0 auto 45px',
          }}>
            MediSense AI bridges the clinical documentation gap. From automated SOAP notes to personalized patient health guides, we build tools that make healthcare human again.
          </p>

          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap', marginBottom: 80 }}>
            <Link to="/doctor"><button className="btn-primary">🩺 For Clinicians</button></Link>
            <Link to="/patient"><button className="btn-secondary">🧬 For Patients</button></Link>
          </div>

          {/* Interactive Dash Preview */}
          <div className="glass-card animate-float" style={{ 
            maxWidth: 850, margin: '0 auto', padding: 0, 
            boxShadow: '0 40px 100px -20px rgba(0,0,0,0.8)',
            border: '1px solid rgba(13, 148, 136, 0.2)'
          }}>
            <div style={{ height: 45, background: '#1e293b', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 8 }}>
               <div className="dot red" /> <div className="dot yellow" /> <div className="dot green" />
               <div style={{ marginLeft: 'auto', fontSize: '0.75rem', fontWeight: 800, color: 'var(--text-muted)' }}>medisense.ai/dashboard</div>
            </div>
            <div style={{ padding: 40, background: '#0f172a', display: 'grid', gridTemplateColumns: '200px 1fr', gap: 30 }}>
               <div style={{ display: 'flex', flexDirection: 'column', gap: 15 }}>
                  {[1, 2, 3, 4].map(i => <div key={i} style={{ height: 12, background: 'rgba(255,255,255,0.05)', borderRadius: 4, width: i === 1 ? '80%' : '100%' }} />)}
               </div>
               <div style={{ textAlign: 'left' }}>
                  <div style={{ height: 24, width: '40%', background: 'var(--gradient-brand)', borderRadius: 6, marginBottom: 20 }} />
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 15 }}>
                     <div style={{ height: 120, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }} />
                     <div style={{ height: 120, background: 'rgba(255,255,255,0.03)', borderRadius: 12, border: '1px solid rgba(255,255,255,0.05)' }} />
                  </div>
               </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── BENTO FEATURES ────────────────────────────── */}
      <section style={{ padding: '100px 24px', background: 'rgba(13, 148, 136, 0.02)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 60 }}>
            <h2 style={{ fontSize: 'clamp(2rem, 4vw, 3rem)', fontWeight: 900 }}>Powerfully Integrated</h2>
            <p style={{ color: 'var(--text-secondary)', marginTop: 10 }}>Tools designed to work together, so you don't have to.</p>
          </div>

          <div className="bento-grid">
            <div className="glass-card" style={{ gridColumn: 'span 2', gridRow: 'span 2', padding: 40 }}>
              <div className="feature-icon-wrapper">🎤</div>
              <h3 style={{ fontSize: '1.5rem', fontWeight: 900, marginBottom: 15 }}>AI Clinical Scribe</h3>
              <p style={{ color: 'var(--text-secondary)', lineHeight: 1.7 }}>
                Proprietary medical-grade transcription that understands clinical context. It doesn't just record—it synthesizes conversations into structured data.
              </p>
              <div style={{ marginTop: 30, display: 'flex', gap: 10, flexWrap: 'wrap' }}>
                {['98% Accuracy', 'HIPAA Secure', 'Real-time Diarization'].map(t => (
                  <span key={t} style={{ fontSize: '0.7rem', fontWeight: 800, padding: '6px 12px', background: 'rgba(255,255,255,0.05)', borderRadius: 8 }}>{t}</span>
                ))}
              </div>
            </div>

            <div className="glass-card" style={{ gridColumn: 'span 2', padding: 30 }}>
              <div style={{ display: 'flex', gap: 20, alignItems: 'center' }}>
                <div className="feature-icon-wrapper" style={{ marginBottom: 0 }}>📋</div>
                <div>
                  <h3 style={{ fontSize: '1.2rem', fontWeight: 900 }}>Automated SOAP Notes</h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.9rem' }}>Generate chart-ready clinical notes in one click.</p>
                </div>
              </div>
            </div>

            <div className="glass-card" style={{ padding: 30 }}>
               <div className="feature-icon-wrapper" style={{ width: 40, height: 40, fontSize: '1.2rem' }}>🧪</div>
               <h4 style={{ fontWeight: 800, marginTop: 15 }}>Lab Analysis</h4>
               <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 5 }}>OCR-powered report interpretation.</p>
            </div>

            <div className="glass-card" style={{ padding: 30 }}>
               <div className="feature-icon-wrapper" style={{ width: 40, height: 40, fontSize: '1.2rem' }}>🥗</div>
               <h4 style={{ fontWeight: 800, marginTop: 15 }}>Health Plans</h4>
               <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginTop: 5 }}>AI-personalized diet & exercise.</p>
            </div>

            <div className="glass-card" style={{ gridColumn: 'span 2', padding: 30, background: 'var(--gradient-brand)' }}>
               <div style={{ color: 'white' }}>
                  <h3 style={{ fontSize: '1.5rem', fontWeight: 900 }}>Secure & Private</h3>
                  <p style={{ opacity: 0.9 }}>Military-grade encryption for all health data.</p>
               </div>
               <button className="btn-primary" style={{ background: 'rgba(255,255,255,0.2)', boxShadow: 'none', border: '1px solid rgba(255,255,255,0.3)', marginTop: 20 }}>
                 Learn about Security center
               </button>
            </div>
          </div>
        </div>
      </section>

      {/* ── INTERACTIVE DEMO ──────────────────────────── */}
      <InteractiveDemo />

      {/* ── STATS BAR ─────────────────────────────────── */}
      <section style={{ padding: '60px 24px', borderTop: '1px solid var(--border-subtle)', background: 'rgba(2, 6, 23, 0.5)' }}>
        <div style={{ maxWidth: 1000, margin: '0 auto', display: 'flex', justifyContent: 'space-between', flexWrap: 'wrap', gap: 40 }}>
           {[
             { val: '250K+', label: 'Notes Generated' },
             { val: '99.9%', label: 'Platform Uptime' },
             { val: '15min', label: 'Average Time Saved' },
             { val: '30+', label: 'Specialties Supported' }
           ].map(s => (
             <div key={s.label} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2rem', fontWeight: 950, color: 'var(--brand-teal)' }}>{s.val}</div>
                <div style={{ fontSize: '0.8rem', fontWeight: 700, color: 'var(--text-muted)', textTransform: 'uppercase' }}>{s.label}</div>
             </div>
           ))}
        </div>
      </section>

      {/* ── FAQ ───────────────────────────────────────── */}
      <FaqSection />

      {/* ── CTA ───────────────────────────────────────── */}
      <section style={{ padding: '120px 24px' }}>
        <div className="glass-card" style={{ 
          maxWidth: 1000, margin: '0 auto', padding: '80px 40px', textAlign: 'center',
          background: 'radial-gradient(circle at center, rgba(13, 148, 136, 0.1) 0%, transparent 70%)'
        }}>
          <h2 style={{ fontSize: 'clamp(2rem, 5vw, 3.5rem)', fontWeight: 950, marginBottom: 20 }}>
            The Future of Clinical Intelligence is Here.
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '1.2rem', maxWidth: 600, margin: '0 auto 40px' }}>
            Join thousands of providers who are reclaiming their time with MediSense AI.
          </p>
          <div style={{ display: 'flex', gap: 20, justifyContent: 'center', flexWrap: 'wrap' }}>
            <Link to="/register"><button className="btn-primary" style={{ padding: '16px 40px' }}>Get Started Free</button></Link>
            <Link to="/contact"><button className="btn-secondary" style={{ padding: '16px 40px' }}>Schedule a Demo</button></Link>
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
      ]
      : [
        { to: '/patient', label: 'Patient Dashboard' },
        { to: '/consultation/schedule', label: 'Schedule a Call' },
      ]
    : [
      { to: '/doctor', label: 'Doctor Portal' },
      { to: '/patient', label: 'Patient Portal' },
      { to: '/consultation/schedule', label: 'Schedule a Call' },
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
            Crafted Mindfully at Logicwind
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

/* ── Visitor-only wrapper for the global ChatbotWidget.
   Doctors get no chatbot at all; patients use the dedicated /patient/chat page. */
function VisitorOnlyChatbot() {
  const { user, loading } = useAuth();
  if (loading || user) return null;
  return <ChatbotWidget />;
}

/* ── Main App ────────────────────────────────────────────────────────── */
export default function App() {
  return (
    <AuthProvider>
      <Router>
        <ScrollToTop />
        <div className="bg-mesh" />
        <Navbar />
        <PatientLayoutWrapper>
        <DoctorLayoutWrapper>
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
            path="/doctor/profile"
            element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/doctor/chat"
            element={
              <ProtectedRoute allowedRoles={['doctor']}>
                <DoctorChat />
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
            path="/patient/profile"
            element={
              <ProtectedRoute allowedRoles={['patient']}>
                <ProfilePage />
              </ProtectedRoute>
            }
          />
          <Route
            path="/patient/chat"
            element={
              <ProtectedRoute allowedRoles={['patient']}>
                <PatientChat />
              </ProtectedRoute>
            }
          />
          <Route
            path="/patient/upload"
            element={
              <ProtectedRoute allowedRoles={['patient']}>
                <PatientReportUpload />
              </ProtectedRoute>
            }
          />
          <Route
            path="/consultation/schedule"
            element={
              <ProtectedRoute>
                <SchedulePage />
              </ProtectedRoute>
            }
          />
        </Routes>
        </DoctorLayoutWrapper>
        </PatientLayoutWrapper>
        <Footer />
        <VisitorOnlyChatbot />
      </Router>
    </AuthProvider>
  );
}

function PatientLayoutWrapper({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const isPatientRoute = 
    location.pathname.startsWith('/patient') || 
    location.pathname === '/consultation/schedule';

  if (user?.role === 'patient' && isPatientRoute) {
    return <PatientLayout>{children}</PatientLayout>;
  }
  return <>{children}</>;
}

function DoctorLayoutWrapper({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const location = useLocation();
  const isDoctorRoute = 
    location.pathname.startsWith('/doctor') || 
    location.pathname === '/consultation/schedule';

  if (user?.role === 'doctor' && isDoctorRoute) {
    return <DoctorLayout>{children}</DoctorLayout>;
  }
  return <>{children}</>;
}
