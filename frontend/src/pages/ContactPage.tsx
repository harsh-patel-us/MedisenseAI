import { useState } from 'react';

const contactInfo = [
  {
    icon: '📧',
    title: 'Email Us',
    detail: 'support@medisense.ai',
    sub: 'We respond within 24 hours',
  },
  {
    icon: '📞',
    title: 'Call Us',
    detail: '+1 (800) 635-4726',
    sub: 'Mon–Fri, 9 AM – 6 PM EST',
  },
  {
    icon: '📍',
    title: 'Headquarters',
    detail: '340 Pine Medical Plaza, Suite 900',
    sub: 'San Francisco, CA 94104',
  },
  {
    icon: '💬',
    title: 'Live Chat',
    detail: 'Available in-app',
    sub: 'Typical reply in under 5 min',
  },
];

const faqs = [
  {
    q: 'Is MediSense AI HIPAA compliant?',
    a: 'Yes. All data in transit is encrypted with TLS 1.3 and we follow HIPAA guidelines for PHI handling. Session data is purged after export unless explicitly retained.',
  },
  {
    q: 'Which EHR systems do you integrate with?',
    a: 'We offer FHIR-compatible export for Epic, Cerner, and Athenahealth. Native integrations are on our roadmap for Q3 2026.',
  },
  {
    q: 'Can I use MediSense AI without an internet connection?',
    a: 'The current platform is cloud-based. An offline / on-premise edition for hospital networks is in private beta — contact us to join.',
  },
  {
    q: 'How accurate is the AI transcription?',
    a: 'Our transcription achieves >95% word accuracy on clear audio. Medical terminology accuracy is enhanced via our clinical vocabulary layer.',
  },
  {
    q: 'Is there a free trial?',
    a: 'Yes — new accounts get 30 days free with full access to both the Doctor and Patient modules. No credit card required.',
  },
];

export default function ContactPage() {
  const [form, setForm] = useState({ name: '', email: '', subject: '', message: '' });
  const [submitted, setSubmitted] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSubmitted(true);
  }

  const inputStyle: React.CSSProperties = {
    width: '100%',
    padding: '12px 16px',
    background: 'rgba(15,30,60,0.6)',
    border: '1px solid var(--border-subtle)',
    borderRadius: 10,
    color: 'var(--text-primary)',
    fontSize: '0.9rem',
    outline: 'none',
    transition: 'border-color 0.2s',
  };

  return (
    <div style={{ flex: 1 }}>

      {/* Hero */}
      <section style={{
        padding: '80px 24px 60px',
        textAlign: 'center',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(5,174,187,0.12) 0%, transparent 70%)',
      }}>
        <div style={{ maxWidth: 640, margin: '0 auto' }}>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 8,
            padding: '6px 18px', borderRadius: 20,
            border: '1px solid rgba(5,174,187,0.3)',
            background: 'rgba(5,174,187,0.08)',
            fontSize: '0.8rem', fontWeight: 700, color: 'var(--brand-teal)',
            marginBottom: 24, textTransform: 'uppercase', letterSpacing: '0.6px',
          }}>
            Get In Touch
          </div>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3rem)', fontWeight: 900, lineHeight: 1.15,
            background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
            WebkitTextFillColor: 'transparent', marginBottom: 16,
          }}>
            We're Here to Help
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Whether you're a clinic looking to onboard, a developer with integration questions,
            or a patient needing support — our team is ready.
          </p>
        </div>
      </section>

      {/* Contact Info Cards */}
      <section style={{ padding: '64px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 20 }}>
            {contactInfo.map(c => (
              <div key={c.title} className="glass-card" style={{ padding: '28px 24px' }}>
                <div style={{
                  width: 48, height: 48, borderRadius: 12,
                  background: 'rgba(5,174,187,0.12)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: '1.5rem', marginBottom: 14,
                }}>
                  {c.icon}
                </div>
                <h3 style={{ fontWeight: 700, marginBottom: 6, fontSize: '0.95rem' }}>{c.title}</h3>
                <div style={{ color: 'var(--brand-teal)', fontWeight: 600, fontSize: '0.9rem', marginBottom: 4 }}>
                  {c.detail}
                </div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>{c.sub}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Form + Map */}
      <section style={{
        padding: '24px 24px 72px',
        borderTop: '1px solid var(--border-subtle)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto', display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 48 }}>

          {/* Form */}
          <div className="glass-card" style={{ padding: '40px 36px' }}>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 6 }}>Send a Message</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 28 }}>
              Fill out the form and our team will get back to you within one business day.
            </p>

            {submitted ? (
              <div style={{
                textAlign: 'center', padding: '48px 24px',
              }}>
                <div style={{ fontSize: '3.5rem', marginBottom: 20 }}>✅</div>
                <h3 style={{ fontWeight: 800, fontSize: '1.3rem', marginBottom: 10 }}>Message Sent!</h3>
                <p style={{ color: 'var(--text-secondary)', lineHeight: 1.6 }}>
                  Thanks for reaching out, <strong>{form.name}</strong>.
                  We'll reply to <strong>{form.email}</strong> within 24 hours.
                </p>
                <button
                  className="btn-secondary"
                  style={{ marginTop: 28 }}
                  onClick={() => { setSubmitted(false); setForm({ name: '', email: '', subject: '', message: '' }); }}
                >
                  Send Another
                </button>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--brand-teal)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      Full Name *
                    </label>
                    <input
                      required
                      style={inputStyle}
                      placeholder="Dr. Jane Smith"
                      value={form.name}
                      onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                      onFocus={e => (e.target.style.borderColor = 'var(--brand-teal)')}
                      onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--brand-teal)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                      Email *
                    </label>
                    <input
                      required
                      type="email"
                      style={inputStyle}
                      placeholder="jane@clinic.com"
                      value={form.email}
                      onChange={e => setForm(f => ({ ...f, email: e.target.value }))}
                      onFocus={e => (e.target.style.borderColor = 'var(--brand-teal)')}
                      onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                    />
                  </div>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--brand-teal)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Subject *
                  </label>
                  <select
                    required
                    style={{ ...inputStyle, cursor: 'pointer' }}
                    value={form.subject}
                    onChange={e => setForm(f => ({ ...f, subject: e.target.value }))}
                    onFocus={e => (e.target.style.borderColor = 'var(--brand-teal)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                  >
                    <option value="">Select a topic…</option>
                    <option>General Inquiry</option>
                    <option>Clinic Onboarding</option>
                    <option>Technical Support</option>
                    <option>Billing & Pricing</option>
                    <option>EHR Integration</option>
                    <option>Partnership / Enterprise</option>
                    <option>Data Privacy / HIPAA</option>
                  </select>
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', fontWeight: 700, color: 'var(--brand-teal)', marginBottom: 6, textTransform: 'uppercase', letterSpacing: '0.4px' }}>
                    Message *
                  </label>
                  <textarea
                    required
                    rows={5}
                    style={{ ...inputStyle, resize: 'vertical', minHeight: 120 }}
                    placeholder="Tell us how we can help…"
                    value={form.message}
                    onChange={e => setForm(f => ({ ...f, message: e.target.value }))}
                    onFocus={e => (e.target.style.borderColor = 'var(--brand-teal)')}
                    onBlur={e => (e.target.style.borderColor = 'var(--border-subtle)')}
                  />
                </div>
                <button type="submit" className="btn-primary" style={{ width: '100%', justifyContent: 'center', marginTop: 4 }}>
                  Send Message →
                </button>
                <p style={{ fontSize: '0.75rem', color: 'var(--text-muted)', textAlign: 'center', lineHeight: 1.5 }}>
                  By submitting this form you agree to our privacy policy. We never share your information.
                </p>
              </form>
            )}
          </div>

          {/* FAQ */}
          <div>
            <h2 style={{ fontSize: '1.5rem', fontWeight: 800, marginBottom: 6 }}>Frequently Asked Questions</h2>
            <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', marginBottom: 28 }}>
              Quick answers to the most common questions we receive.
            </p>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              {faqs.map((faq, i) => (
                <div
                  key={i}
                  className="glass-card"
                  style={{ overflow: 'hidden', cursor: 'pointer' }}
                  onClick={() => setOpenFaq(openFaq === i ? null : i)}
                >
                  <div style={{
                    padding: '18px 20px',
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 12,
                  }}>
                    <span style={{ fontWeight: 600, fontSize: '0.9rem' }}>{faq.q}</span>
                    <span style={{
                      color: 'var(--brand-teal)', fontWeight: 700, fontSize: '1.1rem', flexShrink: 0,
                      transform: openFaq === i ? 'rotate(45deg)' : 'none',
                      transition: 'transform 0.2s',
                    }}>+</span>
                  </div>
                  {openFaq === i && (
                    <div style={{
                      padding: '0 20px 18px',
                      color: 'var(--text-secondary)', fontSize: '0.86rem', lineHeight: 1.7,
                    }}>
                      {faq.a}
                    </div>
                  )}
                </div>
              ))}
            </div>

            {/* Emergency Disclaimer */}
            <div style={{
              marginTop: 28,
              padding: '16px 20px',
              background: 'rgba(220,38,38,0.07)',
              border: '1px solid rgba(220,38,38,0.25)',
              borderRadius: 12,
            }}>
              <div style={{ fontWeight: 700, color: '#f87171', marginBottom: 6, fontSize: '0.85rem' }}>
                🚨 Medical Emergency?
              </div>
              <p style={{ fontSize: '0.8rem', color: '#fca5a5', lineHeight: 1.6 }}>
                MediSense AI is not for emergencies. If you or someone is in danger, call{' '}
                <strong>911</strong> (US) or your local emergency number immediately.
              </p>
            </div>
          </div>

        </div>
      </section>

    </div>
  );
}
