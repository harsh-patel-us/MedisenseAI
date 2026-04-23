import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

type Cycle = 'monthly' | 'annual';

type Tier = {
  key: string;
  name: string;
  price: { monthly: number; annual: number };
  tagline: string;
  popular?: boolean;
  features: string[];
  cta: { label: string; to: string };
  note: string;
  accent: string;
};

const tiers: Tier[] = [
  {
    key: 'starter',
    name: 'Starter',
    price: { monthly: 0, annual: 0 },
    tagline: 'For solo doctors exploring AI documentation.',
    features: [
      'Up to 30 consultations / month',
      'Live transcription + SOAP note generation',
      'Patient-side lab report analysis',
      'PDF export (watermarked)',
      'Community support',
    ],
    cta: { label: 'Start Free', to: '/register' },
    note: 'No credit card required.',
    accent: '#60a5fa',
  },
  {
    key: 'pro',
    name: 'Professional',
    price: { monthly: 49, annual: 39 },
    tagline: 'For practicing clinicians who bill per visit.',
    popular: true,
    features: [
      'Unlimited consultations',
      'Real-time video consultation rooms',
      'Unwatermarked PDFs with custom branding',
      'Persistent session + PDF history',
      'Specialty templates (30+)',
      'Priority email support',
      'EHR-ready FHIR export',
    ],
    cta: { label: 'Start 14-day Trial', to: '/register' },
    note: 'Per clinician. Cancel anytime.',
    accent: '#05aebb',
  },
  {
    key: 'clinic',
    name: 'Clinic',
    price: { monthly: 149, annual: 119 },
    tagline: 'For multi-provider teams and small hospitals.',
    features: [
      'Everything in Professional',
      'Up to 15 clinicians',
      'Admin dashboard + audit logs',
      'SSO (SAML + OAuth)',
      'Team-level analytics',
      'SLA + dedicated onboarding',
      'Named customer-success manager',
    ],
    cta: { label: 'Book a Demo', to: '/contact' },
    note: 'Billed per seat, volume discounts available.',
    accent: '#a78bfa',
  },
  {
    key: 'enterprise',
    name: 'Enterprise',
    price: { monthly: -1, annual: -1 },
    tagline: 'For hospital systems and insurers.',
    features: [
      'Unlimited clinicians and sites',
      'Private cloud or on-prem deployment',
      'Custom LLM fine-tuning',
      'BAA + SOC 2 Type II + HIPAA report',
      'Deep EHR integration (Epic, Cerner, Athena)',
      'Custom SLAs up to 99.99%',
      '24 / 7 phone + on-call engineer',
    ],
    cta: { label: 'Contact Sales', to: '/contact' },
    note: 'Tailored commercials with your procurement team.',
    accent: '#fbbf24',
  },
];

const comparison: Array<{
  category: string;
  items: Array<{ label: string; starter: string; pro: string; clinic: string; enterprise: string }>;
}> = [
  {
    category: 'Usage',
    items: [
      { label: 'Consultations per month', starter: '30', pro: 'Unlimited', clinic: 'Unlimited', enterprise: 'Unlimited' },
      { label: 'Video consultation rooms', starter: '—', pro: '✓', clinic: '✓', enterprise: '✓' },
      { label: 'Clinicians per account', starter: '1', pro: '1', clinic: 'Up to 15', enterprise: 'Unlimited' },
    ],
  },
  {
    category: 'AI features',
    items: [
      { label: 'Live transcription', starter: '✓', pro: '✓', clinic: '✓', enterprise: '✓' },
      { label: 'SOAP note generation', starter: '✓', pro: '✓', clinic: '✓', enterprise: '✓' },
      { label: 'Specialty note templates', starter: '5', pro: '30+', clinic: '30+', enterprise: 'Custom' },
      { label: 'Custom LLM fine-tuning', starter: '—', pro: '—', clinic: '—', enterprise: '✓' },
    ],
  },
  {
    category: 'Data & compliance',
    items: [
      { label: 'HIPAA-aligned handling', starter: '✓', pro: '✓', clinic: '✓', enterprise: '✓' },
      { label: 'BAA available', starter: '—', pro: '✓', clinic: '✓', enterprise: '✓' },
      { label: 'SOC 2 Type II report', starter: '—', pro: '—', clinic: '✓', enterprise: '✓' },
      { label: 'Private cloud / on-prem', starter: '—', pro: '—', clinic: '—', enterprise: '✓' },
    ],
  },
  {
    category: 'Support',
    items: [
      { label: 'Community support', starter: '✓', pro: '✓', clinic: '✓', enterprise: '✓' },
      { label: 'Priority email', starter: '—', pro: '✓', clinic: '✓', enterprise: '✓' },
      { label: 'Dedicated CSM', starter: '—', pro: '—', clinic: '✓', enterprise: '✓' },
      { label: '24 / 7 phone + on-call', starter: '—', pro: '—', clinic: '—', enterprise: '✓' },
    ],
  },
];

const pricingFaqs = [
  {
    q: 'Can I switch plans later?',
    a: 'Yes. Upgrades prorate automatically. Downgrades take effect at the end of the billing cycle, and no contracts lock you in on Professional or Clinic.',
  },
  {
    q: 'Do I need a credit card for the free plan?',
    a: 'No. The Starter plan is genuinely free forever. You can run 30 consultations per month without ever entering a card.',
  },
  {
    q: 'Is there a discount for annual billing?',
    a: 'Yes. Annual billing saves ~20% on every paid plan. Use the toggle above to see annualised rates.',
  },
  {
    q: 'What does "unlimited consultations" really mean?',
    a: 'No soft cap, no throttling. We use per-clinician fair-use guidelines (about 300 sessions/month per seat). Above that, our team reaches out to upgrade you to Clinic or Enterprise.',
  },
  {
    q: 'Do you offer discounts for residents or academic clinics?',
    a: 'Yes — 50% off Professional for residents and 30% off Clinic for academic medical centres. Contact us with an .edu/.ac.uk email address.',
  },
];

export default function PricingPage() {
  const [cycle, setCycle] = useState<Cycle>('monthly');
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  // ROI calculator — inputs
  const [clinicians, setClinicians] = useState(5);
  const [avgVisits, setAvgVisits] = useState(20);
  const [notesMinutes, setNotesMinutes] = useState(8);
  const [hourlyRate, setHourlyRate] = useState(150);

  const roi = useMemo(() => {
    // MediSense reduces per-note time by ~72% (based on our own benchmark).
    const reduction = 0.72;
    const monthlyVisits = clinicians * avgVisits * 22; // 22 working days
    const minutesSaved = monthlyVisits * notesMinutes * reduction;
    const hoursSaved = minutesSaved / 60;
    const dollarsSaved = hoursSaved * hourlyRate;

    const planUnitPrice = cycle === 'annual' ? 39 : 49;
    const planCost = clinicians * planUnitPrice;
    const net = dollarsSaved - planCost;
    const roiPct = planCost > 0 ? Math.round((net / planCost) * 100) : 0;
    const payback = dollarsSaved > 0 ? (planCost / (dollarsSaved / 30)) : 0; // days

    return {
      hoursSaved: Math.round(hoursSaved),
      dollarsSaved: Math.round(dollarsSaved),
      planCost: Math.round(planCost),
      net: Math.round(net),
      roiPct,
      paybackDays: Math.round(payback),
    };
  }, [clinicians, avgVisits, notesMinutes, hourlyRate, cycle]);

  return (
    <div style={{ flex: 1 }}>

      {/* Hero */}
      <section style={{
        padding: '80px 24px 48px',
        textAlign: 'center',
        borderBottom: '1px solid var(--border-subtle)',
        background: 'radial-gradient(ellipse 70% 60% at 50% 0%, rgba(5,174,187,0.14) 0%, transparent 70%)',
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
            Pricing
          </div>
          <h1 style={{ fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 900, lineHeight: 1.15, marginBottom: 18 }}>
            Plans that{' '}
            <span style={{
              background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              pay for themselves
            </span>{' '}
            — in week one.
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', lineHeight: 1.7, marginBottom: 28 }}>
            Free for solo doctors, transparent per-seat for clinics, custom for hospital systems.
            Switch plans or cancel at any time.
          </p>

          {/* Billing toggle */}
          <div style={{
            display: 'inline-flex', padding: 4, borderRadius: 999,
            background: 'rgba(15,30,60,0.5)', border: '1px solid var(--border-subtle)', gap: 4,
          }}>
            {(['monthly', 'annual'] as Cycle[]).map(c => (
              <button
                key={c}
                onClick={() => setCycle(c)}
                style={{
                  padding: '10px 22px',
                  borderRadius: 999, border: 'none', cursor: 'pointer',
                  fontSize: '0.85rem', fontWeight: 700,
                  background: cycle === c ? 'var(--gradient-brand)' : 'transparent',
                  color: cycle === c ? 'white' : 'var(--text-secondary)',
                  transition: 'all 0.2s',
                }}
              >
                {c === 'monthly' ? 'Monthly' : 'Annual'}
                {c === 'annual' && (
                  <span style={{
                    marginLeft: 8,
                    padding: '2px 8px', borderRadius: 999,
                    background: cycle === c ? 'rgba(255,255,255,0.2)' : 'rgba(5,174,187,0.2)',
                    color: cycle === c ? 'white' : 'var(--brand-teal)',
                    fontSize: '0.68rem', fontWeight: 800,
                  }}>
                    −20%
                  </span>
                )}
              </button>
            ))}
          </div>
        </div>
      </section>

      {/* Tier grid */}
      <section style={{ padding: '48px 24px' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
            gap: 20, alignItems: 'stretch',
          }}>
            {tiers.map(t => {
              const price = t.price[cycle];
              return (
                <div
                  key={t.key}
                  className="glass-card"
                  style={{
                    padding: 28,
                    position: 'relative',
                    borderTop: `3px solid ${t.accent}`,
                    display: 'flex', flexDirection: 'column',
                    transform: t.popular ? 'translateY(-6px)' : 'none',
                    boxShadow: t.popular ? '0 10px 40px rgba(5,174,187,0.2)' : undefined,
                  }}
                >
                  {t.popular && (
                    <div style={{
                      position: 'absolute', top: -12, left: '50%', transform: 'translateX(-50%)',
                      padding: '4px 14px', borderRadius: 999,
                      background: 'var(--gradient-brand)', color: 'white',
                      fontSize: '0.72rem', fontWeight: 800,
                      letterSpacing: '0.5px', textTransform: 'uppercase',
                      boxShadow: '0 4px 12px rgba(5,174,187,0.4)',
                    }}>
                      Most Popular
                    </div>
                  )}
                  <h3 style={{ fontWeight: 800, fontSize: '1.1rem', marginBottom: 6, color: t.accent }}>
                    {t.name}
                  </h3>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', lineHeight: 1.5, marginBottom: 18, minHeight: 38 }}>
                    {t.tagline}
                  </p>

                  <div style={{ marginBottom: 20 }}>
                    {price === -1 ? (
                      <div style={{ fontSize: '1.8rem', fontWeight: 900 }}>Custom</div>
                    ) : price === 0 ? (
                      <div style={{ fontSize: '2rem', fontWeight: 900 }}>Free</div>
                    ) : (
                      <div>
                        <span style={{ fontSize: '2rem', fontWeight: 900 }}>${price}</span>
                        <span style={{ color: 'var(--text-muted)', fontSize: '0.85rem', marginLeft: 4 }}>
                          /clinician/month
                        </span>
                        {cycle === 'annual' && (
                          <div style={{ fontSize: '0.72rem', color: 'var(--brand-teal)', marginTop: 4, fontWeight: 600 }}>
                            Billed ${price * 12} / year
                          </div>
                        )}
                      </div>
                    )}
                  </div>

                  <Link to={t.cta.to} style={{ textDecoration: 'none' }}>
                    <button
                      className={t.popular ? 'btn-primary' : 'btn-secondary'}
                      style={{ width: '100%', justifyContent: 'center', marginBottom: 20 }}
                    >
                      {t.cta.label}
                    </button>
                  </Link>

                  <ul style={{ listStyle: 'none', padding: 0, display: 'flex', flexDirection: 'column', gap: 10, flex: 1 }}>
                    {t.features.map((f, i) => (
                      <li key={i} style={{
                        display: 'flex', gap: 10,
                        fontSize: '0.85rem', color: 'var(--text-primary)', lineHeight: 1.5,
                      }}>
                        <span style={{ color: t.accent, flexShrink: 0, fontWeight: 700 }}>✓</span>
                        {f}
                      </li>
                    ))}
                  </ul>

                  <p style={{
                    fontSize: '0.72rem', color: 'var(--text-muted)',
                    marginTop: 20, paddingTop: 14,
                    borderTop: '1px solid var(--border-subtle)', textAlign: 'center',
                  }}>
                    {t.note}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* ROI Calculator */}
      <section id="roi" style={{
        padding: '64px 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(23,89,176,0.04)',
      }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 40 }}>
            <div style={{
              display: 'inline-block', padding: '6px 14px', borderRadius: 20,
              background: 'rgba(5,174,187,0.08)', color: 'var(--brand-teal)',
              fontSize: '0.75rem', fontWeight: 700, marginBottom: 16,
              textTransform: 'uppercase', letterSpacing: '0.5px',
            }}>
              Interactive
            </div>
            <h2 style={{ fontSize: 'clamp(1.8rem, 3.5vw, 2.4rem)', fontWeight: 800, marginBottom: 12 }}>
              Calculate your own ROI
            </h2>
            <p style={{ color: 'var(--text-secondary)', maxWidth: 560, margin: '0 auto' }}>
              Plug in your clinic's numbers — we'll estimate hours reclaimed and dollars saved per month.
            </p>
          </div>

          <div style={{
            display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 24,
          }}>
            {/* Inputs */}
            <div className="glass-card" style={{ padding: 28 }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 20, color: 'var(--brand-teal)' }}>
                Your clinic
              </h3>
              {[
                { label: 'Number of clinicians', value: clinicians, set: setClinicians, min: 1, max: 200, step: 1, suffix: '' },
                { label: 'Avg. patient visits per clinician / day', value: avgVisits, set: setAvgVisits, min: 5, max: 60, step: 1, suffix: ' visits' },
                { label: 'Minutes spent per note today', value: notesMinutes, set: setNotesMinutes, min: 2, max: 30, step: 1, suffix: ' min' },
                { label: 'Average billed hourly rate ($)', value: hourlyRate, set: setHourlyRate, min: 50, max: 600, step: 5, suffix: '' },
              ].map(input => (
                <div key={input.label} style={{ marginBottom: 20 }}>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between',
                    marginBottom: 8, fontSize: '0.85rem',
                  }}>
                    <span style={{ color: 'var(--text-secondary)' }}>{input.label}</span>
                    <span style={{ color: 'var(--brand-teal)', fontWeight: 700 }}>
                      {input.suffix === '' && input.label.includes('rate') ? `$${input.value}` : `${input.value}${input.suffix}`}
                    </span>
                  </div>
                  <input
                    type="range"
                    min={input.min}
                    max={input.max}
                    step={input.step}
                    value={input.value}
                    onChange={e => input.set(Number(e.target.value))}
                    style={{
                      width: '100%',
                      accentColor: 'var(--brand-teal)',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Results */}
            <div className="glass-card" style={{
              padding: 28,
              background: 'linear-gradient(135deg, rgba(5,174,187,0.08) 0%, rgba(23,89,176,0.12) 100%)',
              border: '1px solid rgba(5,174,187,0.3)',
            }}>
              <h3 style={{ fontSize: '1rem', fontWeight: 800, marginBottom: 20, color: 'var(--brand-teal)' }}>
                Estimated impact per month
              </h3>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16, marginBottom: 20 }}>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Hours reclaimed
                  </div>
                  <div style={{
                    fontSize: 'clamp(1.6rem, 3vw, 2rem)', fontWeight: 900,
                    background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
                    WebkitTextFillColor: 'transparent',
                  }}>
                    {roi.hoursSaved}h
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-secondary)', marginBottom: 4 }}>
                    Value of time saved
                  </div>
                  <div style={{
                    fontSize: 'clamp(1.6rem, 3vw, 2rem)', fontWeight: 900,
                    color: '#4ade80',
                  }}>
                    ${roi.dollarsSaved.toLocaleString()}
                  </div>
                </div>
              </div>

              <div style={{
                padding: '14px 16px', borderRadius: 10,
                background: 'rgba(15,30,60,0.6)',
                border: '1px solid var(--border-subtle)',
                marginBottom: 14,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: '0.88rem',
              }}>
                <span style={{ color: 'var(--text-secondary)' }}>MediSense Professional cost</span>
                <span style={{ fontWeight: 700 }}>${roi.planCost.toLocaleString()} / mo</span>
              </div>

              <div style={{
                padding: '14px 16px', borderRadius: 10,
                background: 'rgba(33,162,87,0.08)',
                border: '1px solid rgba(33,162,87,0.3)',
                marginBottom: 18,
                display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                fontSize: '0.88rem',
              }}>
                <span style={{ color: '#4ade80' }}>Net monthly benefit</span>
                <span style={{ fontWeight: 800, color: '#4ade80' }}>
                  ${roi.net.toLocaleString()} ({roi.roiPct}% ROI)
                </span>
              </div>

              <div style={{ fontSize: '0.8rem', color: 'var(--text-muted)', lineHeight: 1.6 }}>
                Payback period: <strong style={{ color: 'var(--brand-teal)' }}>{roi.paybackDays > 0 ? `~${roi.paybackDays} days` : 'instant'}</strong>.
                Based on an internal benchmark of 72% reduction in per-note documentation time.
              </div>

              <Link to="/contact" style={{ textDecoration: 'none', display: 'block', marginTop: 22 }}>
                <button className="btn-primary" style={{ width: '100%', justifyContent: 'center' }}>
                  Get a custom quote →
                </button>
              </Link>
            </div>
          </div>
        </div>
      </section>

      {/* Comparison table */}
      <section style={{ padding: '64px 24px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, marginBottom: 8 }}>
            Compare every feature
          </h2>
          <p style={{ textAlign: 'center', color: 'var(--text-secondary)', marginBottom: 36 }}>
            Everything included in each plan, side-by-side.
          </p>

          <div className="glass-card" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ overflowX: 'auto' }}>
              <table style={{
                width: '100%', borderCollapse: 'collapse',
                fontSize: '0.85rem', minWidth: 620,
              }}>
                <thead>
                  <tr>
                    <th style={{
                      textAlign: 'left', padding: '18px 20px',
                      background: 'rgba(23,89,176,0.1)', color: 'var(--text-secondary)',
                      fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.5px',
                      borderBottom: '1px solid var(--border-subtle)',
                    }}>Feature</th>
                    {tiers.map(t => (
                      <th key={t.key} style={{
                        textAlign: 'center', padding: '18px 20px',
                        background: 'rgba(23,89,176,0.1)',
                        color: t.accent,
                        fontSize: '0.85rem', fontWeight: 800,
                        borderBottom: '1px solid var(--border-subtle)',
                      }}>
                        {t.name}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {comparison.map(section => (
                    <>
                      <tr key={`${section.category}-h`}>
                        <td colSpan={5} style={{
                          padding: '14px 20px',
                          fontSize: '0.72rem', fontWeight: 700, textTransform: 'uppercase',
                          color: 'var(--brand-teal)', letterSpacing: '0.6px',
                          background: 'rgba(5,174,187,0.04)',
                          borderTop: '1px solid var(--border-subtle)',
                        }}>
                          {section.category}
                        </td>
                      </tr>
                      {section.items.map(row => (
                        <tr key={row.label}>
                          <td style={{
                            padding: '12px 20px', color: 'var(--text-primary)',
                            borderBottom: '1px solid rgba(255,255,255,0.04)',
                          }}>
                            {row.label}
                          </td>
                          {(['starter', 'pro', 'clinic', 'enterprise'] as const).map(k => {
                            const v = row[k];
                            const isCheck = v === '✓';
                            const isDash = v === '—';
                            return (
                              <td key={k} style={{
                                padding: '12px 20px', textAlign: 'center',
                                color: isCheck ? '#4ade80' : isDash ? 'var(--text-muted)' : 'var(--text-primary)',
                                fontWeight: isCheck ? 700 : 500,
                                borderBottom: '1px solid rgba(255,255,255,0.04)',
                              }}>
                                {v}
                              </td>
                            );
                          })}
                        </tr>
                      ))}
                    </>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      {/* FAQ */}
      <section id="faq" style={{
        padding: '64px 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(23,89,176,0.04)',
      }}>
        <div style={{ maxWidth: 760, margin: '0 auto' }}>
          <h2 style={{ textAlign: 'center', fontSize: 'clamp(1.6rem, 3vw, 2.2rem)', fontWeight: 800, marginBottom: 36 }}>
            Pricing questions
          </h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {pricingFaqs.map((f, i) => (
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
                  <span style={{ fontWeight: 600, fontSize: '0.95rem' }}>{f.q}</span>
                  <span style={{
                    color: 'var(--brand-teal)', fontWeight: 700, fontSize: '1.2rem',
                    transform: openFaq === i ? 'rotate(45deg)' : 'none',
                    transition: 'transform 0.2s',
                  }}>+</span>
                </div>
                {openFaq === i && (
                  <div style={{
                    padding: '0 20px 18px',
                    color: 'var(--text-secondary)', fontSize: '0.9rem', lineHeight: 1.7,
                  }}>
                    {f.a}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </section>

    </div>
  );
}
