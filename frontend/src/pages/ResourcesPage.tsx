import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

type Resource = {
  kind: 'Article' | 'Case Study' | 'Guide' | 'Video' | 'Webinar';
  category: 'Documentation' | 'Patient Care' | 'AI & Accuracy' | 'Compliance' | 'Workflow';
  title: string;
  excerpt: string;
  author: string;
  authorRole: string;
  date: string;
  readMinutes: number;
  featured?: boolean;
  color: string;
};

const resources: Resource[] = [
  {
    kind: 'Article',
    category: 'Documentation',
    title: 'The hidden cost of SOAP notes — and why AI scribing is more than convenience',
    excerpt:
      'Clinicians spend 2 hours documenting for every 1 hour of patient care. We look at the evidence and the three measurable ways ambient AI changes that ratio.',
    author: 'Dr. Rachel Kim',
    authorRole: 'Family Medicine · Seattle',
    date: 'Apr 18, 2026',
    readMinutes: 7,
    featured: true,
    color: '#22d3ee',
  },
  {
    kind: 'Case Study',
    category: 'Workflow',
    title: 'How BayCare Family Clinic cut after-hours charting by 71 %',
    excerpt:
      'A 12-physician primary care group rolled out MediSense over 6 weeks. Before/after metrics on documentation time, burnout scores, and patient satisfaction.',
    author: 'MediSense Research',
    authorRole: 'Customer Success',
    date: 'Apr 11, 2026',
    readMinutes: 9,
    featured: true,
    color: '#4ade80',
  },
  {
    kind: 'Guide',
    category: 'Compliance',
    title: 'A procurement checklist: what to ask any AI scribing vendor',
    excerpt:
      '22 questions your compliance and IT teams should ask before approving an ambient-AI documentation tool — answered honestly for MediSense and generically for the category.',
    author: 'Priya Nair, MD',
    authorRole: 'Head of Clinical Research',
    date: 'Apr 04, 2026',
    readMinutes: 11,
    color: '#a78bfa',
  },
  {
    kind: 'Article',
    category: 'AI & Accuracy',
    title: 'Diarization in noisy exam rooms — what we learned tuning speaker labels',
    excerpt:
      'An honest engineering post on where voice activity detection fails, how we handle overlapping speech, and why we still keep a clinician-editable transcript.',
    author: 'Arjun Mehta',
    authorRole: 'Co-Founder & CTO',
    date: 'Mar 28, 2026',
    readMinutes: 8,
    color: '#60a5fa',
  },
  {
    kind: 'Case Study',
    category: 'Patient Care',
    title: 'Plain-language lab reports: a pilot with 2,400 patients across 4 cities',
    excerpt:
      'We measured comprehension and follow-up appointment adherence before and after patients received AI-generated guides alongside their normal lab PDFs. The numbers surprised us.',
    author: 'MediSense Research',
    authorRole: 'Patient Experience',
    date: 'Mar 21, 2026',
    readMinutes: 10,
    color: '#fbbf24',
  },
  {
    kind: 'Webinar',
    category: 'Compliance',
    title: 'Live Q&A — HIPAA, BAAs, and AI vendors in 2026',
    excerpt:
      'A 45-minute session with our CMO and an external compliance officer. What changed in HIPAA guidance this year, and what to rewrite in your AI vendor contracts.',
    author: 'Dr. Sarah Chen',
    authorRole: 'Chief Medical Officer',
    date: 'Mar 14, 2026',
    readMinutes: 45,
    color: '#f87171',
  },
  {
    kind: 'Guide',
    category: 'Workflow',
    title: 'Getting your clinic to week 2: a rollout runbook',
    excerpt:
      'The 14-day rollout playbook our customer success team runs. Includes a day-by-day checklist, sample staff emails, and the top 3 reasons rollouts stall.',
    author: 'Marcus Webb',
    authorRole: 'VP of Product',
    date: 'Mar 07, 2026',
    readMinutes: 6,
    color: '#22d3ee',
  },
  {
    kind: 'Article',
    category: 'AI & Accuracy',
    title: 'Why we do not auto-submit SOAP notes (and probably never will)',
    excerpt:
      'The strongest safety argument against fully autonomous clinical AI isn\'t technical — it\'s design. Here is our position and the research behind it.',
    author: 'Dr. Rachel Kim',
    authorRole: 'Family Medicine · Seattle',
    date: 'Feb 28, 2026',
    readMinutes: 5,
    color: '#a78bfa',
  },
  {
    kind: 'Video',
    category: 'Documentation',
    title: '90-second product tour — consult to chart-ready PDF',
    excerpt:
      'Watch a full doctor-side workflow end-to-end: start a session, talk normally, review the draft SOAP, edit, export. No voiceover, no marketing.',
    author: 'Product Team',
    authorRole: 'Demo',
    date: 'Feb 21, 2026',
    readMinutes: 2,
    color: '#60a5fa',
  },
  {
    kind: 'Case Study',
    category: 'AI & Accuracy',
    title: 'Accuracy on specialty terminology: an audit across 1,200 hours of cardiology consults',
    excerpt:
      'Word-error rate by speaker, by accent, by drug name. An external-validated report from a 6-physician cardiology practice.',
    author: 'MediSense Research',
    authorRole: 'Clinical Validation',
    date: 'Feb 14, 2026',
    readMinutes: 13,
    color: '#4ade80',
  },
  {
    kind: 'Article',
    category: 'Patient Care',
    title: 'What patients actually do with their AI health guide',
    excerpt:
      'We interviewed 60 patients who received an AI-generated lifestyle plan. Three surprising behaviors, and two we thought we\'d see and didn\'t.',
    author: 'Priya Nair, MD',
    authorRole: 'Head of Clinical Research',
    date: 'Feb 07, 2026',
    readMinutes: 7,
    color: '#fbbf24',
  },
  {
    kind: 'Guide',
    category: 'Compliance',
    title: 'BYOK — bringing your own encryption keys to MediSense',
    excerpt:
      'A technical walkthrough for security teams: wiring your KMS to MediSense, key rotation schedules, and break-glass procedures.',
    author: 'Platform Engineering',
    authorRole: 'Infra',
    date: 'Jan 31, 2026',
    readMinutes: 8,
    color: '#f87171',
  },
];

const categoryFilters = ['All', 'Documentation', 'Patient Care', 'AI & Accuracy', 'Compliance', 'Workflow'] as const;
const kindFilters: Array<Resource['kind'] | 'All'> = ['All', 'Article', 'Case Study', 'Guide', 'Video', 'Webinar'];

export default function ResourcesPage() {
  const [category, setCategory] = useState<(typeof categoryFilters)[number]>('All');
  const [kind, setKind] = useState<Resource['kind'] | 'All'>('All');
  const [query, setQuery] = useState('');

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return resources.filter(r => {
      const matchCat = category === 'All' || r.category === category;
      const matchKind = kind === 'All' || r.kind === kind;
      const matchQuery =
        !q ||
        r.title.toLowerCase().includes(q) ||
        r.excerpt.toLowerCase().includes(q) ||
        r.author.toLowerCase().includes(q);
      return matchCat && matchKind && matchQuery;
    });
  }, [category, kind, query]);

  const featured = resources.filter(r => r.featured);
  const remaining = filtered.filter(r => !r.featured || kind !== 'All' || category !== 'All' || query);

  return (
    <div style={{ flex: 1 }}>
      {/* Hero */}
      <section style={{
        padding: '80px 24px 40px',
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
            📚 Resources
          </div>
          <h1 style={{
            fontSize: 'clamp(2rem, 5vw, 3.2rem)', fontWeight: 900, lineHeight: 1.15, marginBottom: 18,
          }}>
            Honest writing about{' '}
            <span style={{
              background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}>
              AI in the clinic.
            </span>
          </h1>
          <p style={{ fontSize: '1.05rem', color: 'var(--text-secondary)', lineHeight: 1.7 }}>
            Case studies, compliance guides, engineering deep dives, and research findings —
            from our clinicians, engineers, and customers.
          </p>
        </div>
      </section>

      {/* Featured */}
      {(category === 'All' && kind === 'All' && !query) && (
        <section style={{ padding: '40px 24px 16px' }}>
          <div style={{ maxWidth: 1100, margin: '0 auto' }}>
            <div style={{
              fontSize: '0.72rem', fontWeight: 700, letterSpacing: '0.6px',
              color: 'var(--brand-teal)', textTransform: 'uppercase', marginBottom: 14,
            }}>
              ★ Featured this month
            </div>
            <div style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))',
              gap: 18,
            }}>
              {featured.map(r => (
                <article
                  key={r.title}
                  className="glass-card"
                  style={{
                    padding: '28px 26px',
                    background: `linear-gradient(135deg, ${r.color}14 0%, transparent 60%)`,
                    border: `1px solid ${r.color}40`,
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'none')}
                >
                  <div style={{ display: 'flex', gap: 8, marginBottom: 14 }}>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px',
                      padding: '3px 8px', borderRadius: 5,
                      background: `${r.color}1f`, color: r.color,
                      border: `1px solid ${r.color}40`,
                      textTransform: 'uppercase',
                    }}>
                      {r.kind}
                    </span>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700, letterSpacing: '0.5px',
                      padding: '3px 8px', borderRadius: 5,
                      background: 'rgba(15,30,60,0.5)', color: 'var(--text-secondary)',
                      border: '1px solid var(--border-subtle)',
                      textTransform: 'uppercase',
                    }}>
                      {r.category}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1.15rem', fontWeight: 800, lineHeight: 1.35, marginBottom: 12 }}>
                    {r.title}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.88rem', lineHeight: 1.6, marginBottom: 16 }}>
                    {r.excerpt}
                  </p>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: '0.78rem', color: 'var(--text-muted)',
                  }}>
                    <span>
                      <strong style={{ color: 'var(--text-primary)' }}>{r.author}</strong> · {r.authorRole}
                    </span>
                    <span>{r.readMinutes} min read</span>
                  </div>
                </article>
              ))}
            </div>
          </div>
        </section>
      )}

      {/* Filters */}
      <section style={{ padding: '32px 24px 16px' }}>
        <div style={{
          maxWidth: 1100, margin: '0 auto',
          display: 'flex', flexDirection: 'column', gap: 14,
        }}>
          <input
            type="search"
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder="Search resources…"
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

          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
            {categoryFilters.map(c => {
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
                    cursor: 'pointer', transition: 'all 0.2s',
                  }}
                >
                  {c}
                </button>
              );
            })}
          </div>

          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {kindFilters.map(k => {
              const active = kind === k;
              return (
                <button
                  key={k}
                  onClick={() => setKind(k)}
                  style={{
                    padding: '5px 11px',
                    borderRadius: 6,
                    border: `1px solid ${active ? 'var(--text-primary)' : 'var(--border-subtle)'}`,
                    background: active ? 'rgba(255,255,255,0.06)' : 'transparent',
                    color: active ? 'var(--text-primary)' : 'var(--text-muted)',
                    fontSize: '0.78rem', fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {k}
                </button>
              );
            })}
          </div>
        </div>
      </section>

      {/* List */}
      <section style={{ padding: '24px 24px 64px' }}>
        <div style={{ maxWidth: 1100, margin: '0 auto' }}>
          {remaining.length === 0 ? (
            <div style={{
              textAlign: 'center', padding: '60px 20px',
              color: 'var(--text-muted)',
            }}>
              Nothing matches those filters yet.{' '}
              <button
                onClick={() => { setCategory('All'); setKind('All'); setQuery(''); }}
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
              gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
              gap: 16,
            }}>
              {remaining.map(r => (
                <article
                  key={r.title}
                  className="glass-card"
                  style={{
                    padding: '22px 22px',
                    borderLeft: `4px solid ${r.color}`,
                    cursor: 'pointer',
                    transition: 'transform 0.2s',
                  }}
                  onMouseEnter={e => (e.currentTarget.style.transform = 'translateY(-3px)')}
                  onMouseLeave={e => (e.currentTarget.style.transform = 'none')}
                >
                  <div style={{ display: 'flex', gap: 6, marginBottom: 10 }}>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 700, letterSpacing: '0.5px',
                      padding: '2px 7px', borderRadius: 5,
                      background: `${r.color}1f`, color: r.color,
                      border: `1px solid ${r.color}40`,
                      textTransform: 'uppercase',
                    }}>
                      {r.kind}
                    </span>
                    <span style={{
                      fontSize: '0.68rem', fontWeight: 600, letterSpacing: '0.4px',
                      padding: '2px 7px', borderRadius: 5,
                      color: 'var(--text-muted)',
                      border: '1px solid var(--border-subtle)',
                      textTransform: 'uppercase',
                    }}>
                      {r.category}
                    </span>
                  </div>
                  <h3 style={{ fontSize: '1rem', fontWeight: 800, lineHeight: 1.35, marginBottom: 10 }}>
                    {r.title}
                  </h3>
                  <p style={{ color: 'var(--text-secondary)', fontSize: '0.83rem', lineHeight: 1.55, marginBottom: 14 }}>
                    {r.excerpt}
                  </p>
                  <div style={{
                    display: 'flex', justifyContent: 'space-between', alignItems: 'center',
                    fontSize: '0.74rem', color: 'var(--text-muted)',
                  }}>
                    <span>{r.author}</span>
                    <span>{r.date} · {r.readMinutes} min</span>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Newsletter */}
      <section style={{
        padding: '56px 24px',
        borderTop: '1px solid var(--border-subtle)',
        background: 'rgba(23,89,176,0.04)',
      }}>
        <div className="glass-card" style={{
          maxWidth: 720, margin: '0 auto',
          padding: '36px 32px',
          textAlign: 'center',
          background: 'linear-gradient(135deg, rgba(23,89,176,0.15) 0%, rgba(5,174,187,0.12) 100%)',
          border: '1px solid rgba(5,174,187,0.25)',
        }}>
          <h2 style={{ fontSize: 'clamp(1.3rem, 2.2vw, 1.6rem)', fontWeight: 800, marginBottom: 10 }}>
            Get new writing in your inbox
          </h2>
          <p style={{ color: 'var(--text-secondary)', fontSize: '0.92rem', marginBottom: 22, maxWidth: 460, margin: '0 auto 22px' }}>
            One email a month. Clinical AI research, new guides, and honest retrospectives.
            Unsubscribe any time.
          </p>
          <form
            onSubmit={e => { e.preventDefault(); alert('Thanks — we\'ll add you to the list.'); }}
            style={{ display: 'flex', gap: 10, justifyContent: 'center', flexWrap: 'wrap', maxWidth: 480, margin: '0 auto' }}
          >
            <input
              type="email"
              required
              placeholder="you@clinic.com"
              style={{
                flex: '1 1 220px',
                padding: '12px 16px',
                borderRadius: 10,
                border: '1px solid var(--border-subtle)',
                background: 'rgba(6,13,27,0.7)',
                color: 'var(--text-primary)',
                fontSize: '0.9rem',
                outline: 'none',
              }}
            />
            <button type="submit" className="btn-primary" style={{ padding: '12px 22px' }}>
              Subscribe
            </button>
          </form>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.72rem', marginTop: 14 }}>
            We never share your email. See our{' '}
            <Link to="/security" style={{ color: 'var(--brand-teal)' }}>privacy stance</Link>.
          </p>
        </div>
      </section>
    </div>
  );
}
