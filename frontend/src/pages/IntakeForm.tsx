import { useEffect, useMemo, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import axios from 'axios';
import { getIntakeForm, submitIntakeForm } from '../api/meetApi';
import type { IntakeFormData } from '../types/consultation.types';

/**
 * Public-facing pre-visit intake form. No login required — the URL is the
 * authentication. The form is rendered as a step-per-question wizard so it
 * is comfortable on a phone, then a review step before submitting.
 */
type Phase = 'loading' | 'invalid' | 'thank_you' | 'form' | 'submitted';

const PRIVACY_NOTICE =
  'Your information is shared only with your doctor for this consultation.';

export default function IntakeForm() {
  const { token } = useParams<{ token: string }>();

  const [phase, setPhase] = useState<Phase>('loading');
  const [errorMsg, setErrorMsg] = useState('');
  const [intake, setIntake] = useState<IntakeFormData | null>(null);

  const [patientName, setPatientName] = useState('');
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [step, setStep] = useState(0); // 0 = name, 1..N = questions, N+1 = review
  const [submitting, setSubmitting] = useState(false);
  const [submitErr, setSubmitErr] = useState('');

  useEffect(() => {
    if (!token) {
      setPhase('invalid');
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const data = await getIntakeForm(token);
        if (cancelled) return;
        setIntake(data);
        setPatientName(data.patient_name || '');
        setPhase('form');
      } catch (err) {
        if (cancelled) return;
        const status = axios.isAxiosError(err) ? err.response?.status : 0;
        if (status === 410) {
          setPhase('thank_you');
        } else {
          setPhase('invalid');
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [token]);

  const totalQuestions = intake?.questions.length ?? 0;
  const reviewStep = totalQuestions + 1; // 0 = name, 1..N = qs, N+1 = review

  const canAdvance = useMemo(() => {
    if (step === 0) return patientName.trim().length > 0;
    if (step >= 1 && step <= totalQuestions) {
      // First question (chief complaint) is required; others optional.
      const idx = step - 1;
      const ans = (answers[String(idx)] || '').trim();
      if (idx === 0) return ans.length > 0;
      return true;
    }
    return true;
  }, [step, patientName, answers, totalQuestions]);

  function handleNext() {
    if (!canAdvance) return;
    setStep((s) => Math.min(s + 1, reviewStep));
  }

  function handleBack() {
    setStep((s) => Math.max(s - 1, 0));
  }

  async function handleSubmit() {
    if (!token || !intake) return;
    setSubmitting(true);
    setSubmitErr('');
    try {
      await submitIntakeForm(token, {
        patient_name: patientName.trim(),
        answers,
      });
      setPhase('submitted');
    } catch (err) {
      const status = axios.isAxiosError(err) ? err.response?.status : 0;
      if (status === 410) {
        setPhase('thank_you');
      } else if (status === 404) {
        setErrorMsg('This intake form link is invalid or has expired.');
        setPhase('invalid');
      } else {
        setSubmitErr('Could not submit your form. Please try again.');
      }
    } finally {
      setSubmitting(false);
    }
  }

  /* ── Render: phase shells ─────────────────────────────────────── */

  if (phase === 'loading') {
    return (
      <Shell>
        <div style={{ textAlign: 'center', padding: '40px 16px' }}>
          <div className="spinner" style={{ margin: '0 auto 16px' }} />
          <p style={{ color: 'var(--text-secondary)' }}>Loading your intake form…</p>
        </div>
      </Shell>
    );
  }

  if (phase === 'invalid') {
    return (
      <Shell>
        <Card>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: '2.6rem', marginBottom: 10 }}>🔗</div>
            <h2 style={titleStyle}>Link not found</h2>
            <p style={paragraphStyle}>
              {errorMsg || 'This intake form link is invalid or has expired.'}
            </p>
            <p style={{ ...paragraphStyle, marginTop: 14 }}>
              If your doctor sent you a different link, please use that one.
            </p>
            <Link to="/" style={{ textDecoration: 'none' }}>
              <button className="btn-secondary" style={{ marginTop: 18 }}>
                Go to MediSense AI
              </button>
            </Link>
          </div>
        </Card>
      </Shell>
    );
  }

  if (phase === 'thank_you') {
    return (
      <Shell>
        <Card>
          <ThankYou message="Your doctor has received your information. Please join your call using the link you were sent." />
        </Card>
      </Shell>
    );
  }

  if (phase === 'submitted') {
    return (
      <Shell>
        <Card>
          <ThankYou
            message="We've notified your doctor and they'll have your information ready when your consultation begins. Please join your call at the scheduled time using the Google Meet link you were sent."
            highlight
          />
        </Card>
      </Shell>
    );
  }

  /* ── Render: step-by-step form ────────────────────────────────── */

  if (!intake) return null;

  const totalSteps = reviewStep + 1; // name + N questions + review
  const progress = Math.round((step / Math.max(reviewStep, 1)) * 100);

  return (
    <Shell>
      <Card>
        {/* Header */}
        <div style={{ marginBottom: 22, textAlign: 'center' }}>
          <div style={{ fontSize: '2rem', marginBottom: 8 }}>📝</div>
          <h2 style={titleStyle}>Pre-Visit Intake</h2>
          <p style={paragraphStyle}>
            A few questions before your consultation, so your doctor can be prepared.
          </p>
        </div>

        {/* Progress */}
        <div style={{ marginBottom: 22 }}>
          <div
            style={{
              fontSize: '0.78rem',
              fontWeight: 700,
              color: 'var(--brand-teal)',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.5px',
            }}
          >
            Step {step + 1} of {totalSteps}
          </div>
          <div
            style={{
              height: 8,
              background: 'rgba(15,30,60,0.6)',
              borderRadius: 999,
              overflow: 'hidden',
            }}
          >
            <div
              style={{
                width: `${progress}%`,
                height: '100%',
                background: 'var(--gradient-brand)',
                transition: 'width 0.3s ease',
              }}
            />
          </div>
        </div>

        {/* Step content */}
        <div style={{ minHeight: 220 }}>
          {step === 0 && (
            <div>
              <label style={labelStyle}>Your full name</label>
              <input
                style={inputStyle}
                placeholder="e.g. Priya Sharma"
                value={patientName}
                onChange={(e) => setPatientName(e.target.value)}
                autoFocus
              />
              <p
                style={{
                  fontSize: '0.78rem',
                  color: 'var(--text-muted)',
                  marginTop: 8,
                  lineHeight: 1.5,
                }}
              >
                {PRIVACY_NOTICE}
              </p>
            </div>
          )}

          {step >= 1 && step <= totalQuestions && (
            <QuestionStep
              index={step - 1}
              question={intake.questions[step - 1]}
              value={answers[String(step - 1)] || ''}
              onChange={(v) =>
                setAnswers((a) => ({ ...a, [String(step - 1)]: v }))
              }
            />
          )}

          {step === reviewStep && (
            <ReviewStep
              patientName={patientName}
              questions={intake.questions}
              answers={answers}
              onJumpTo={(i) => setStep(i + 1)}
            />
          )}
        </div>

        {submitErr && (
          <div
            style={{
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(220,38,38,0.1)',
              border: '1px solid rgba(220,38,38,0.3)',
              color: '#fca5a5',
              fontSize: '0.85rem',
              marginTop: 14,
            }}
          >
            ⚠ {submitErr}
          </div>
        )}

        {/* Nav buttons */}
        <div
          style={{
            marginTop: 22,
            display: 'flex',
            justifyContent: 'space-between',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <button
            type="button"
            className="btn-secondary"
            onClick={handleBack}
            disabled={step === 0 || submitting}
            style={{
              padding: '11px 18px',
              fontSize: '0.88rem',
              opacity: step === 0 || submitting ? 0.5 : 1,
            }}
          >
            ← Back
          </button>

          {step < reviewStep ? (
            <button
              type="button"
              className="btn-primary"
              onClick={handleNext}
              disabled={!canAdvance}
              style={{
                padding: '11px 22px',
                fontSize: '0.92rem',
                opacity: canAdvance ? 1 : 0.5,
              }}
            >
              Next →
            </button>
          ) : (
            <button
              type="button"
              className="btn-primary"
              onClick={handleSubmit}
              disabled={submitting || !patientName.trim()}
              style={{ padding: '11px 22px', fontSize: '0.92rem' }}
            >
              {submitting ? (
                <>
                  <span
                    className="spinner"
                    style={{ width: 16, height: 16, borderWidth: 2 }}
                  />
                  Submitting…
                </>
              ) : (
                '✅ Submit'
              )}
            </button>
          )}
        </div>

        <p
          style={{
            marginTop: 22,
            fontSize: '0.74rem',
            color: 'var(--text-muted)',
            textAlign: 'center',
            lineHeight: 1.5,
          }}
        >
          🔒 {PRIVACY_NOTICE}
        </p>
      </Card>
    </Shell>
  );
}

/* ── Sub-components ────────────────────────────────────────────────── */

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        minHeight: '100vh',
        padding: '40px 16px',
        display: 'flex',
        alignItems: 'flex-start',
        justifyContent: 'center',
      }}
    >
      <div style={{ width: '100%', maxWidth: 620 }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            marginBottom: 22,
            color: 'var(--text-secondary)',
            fontSize: '0.86rem',
          }}
        >
          <span style={{ fontSize: '1.4rem' }}>💊</span>
          <span
            style={{
              fontWeight: 800,
              background: 'var(--gradient-brand)',
              WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent',
            }}
          >
            MediSense AI
          </span>
        </div>
        {children}
      </div>
    </div>
  );
}

function Card({ children }: { children: React.ReactNode }) {
  return (
    <div className="glass-card" style={{ padding: '28px 26px' }}>
      {children}
    </div>
  );
}

function QuestionStep({
  index,
  question,
  value,
  onChange,
}: {
  index: number;
  question: string;
  value: string;
  onChange: (v: string) => void;
}) {
  // Question 3 (severity) gets a 1-10 slider; everything else is free-text.
  const isSeverity = index === 2;
  const isLong = index === 0 || index === 8 || index === 4;

  return (
    <div>
      <label style={labelStyle}>
        {isSeverity ? 'Pain severity (0–10)' : 'Your answer'}
      </label>
      <p
        style={{
          fontSize: '0.95rem',
          color: 'var(--text-primary)',
          fontWeight: 600,
          marginBottom: 12,
          lineHeight: 1.5,
        }}
      >
        {question}
      </p>

      {isSeverity ? (
        <SeverityInput value={value} onChange={onChange} />
      ) : isLong ? (
        <textarea
          rows={4}
          autoFocus
          style={{ ...inputStyle, resize: 'vertical', minHeight: 110 }}
          placeholder="Type your answer here…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      ) : (
        <input
          autoFocus
          style={inputStyle}
          placeholder="Type your answer here…"
          value={value}
          onChange={(e) => onChange(e.target.value)}
        />
      )}

      {index === 0 && (
        <p
          style={{
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            marginTop: 8,
            lineHeight: 1.5,
          }}
        >
          This is required so your doctor knows what to expect.
        </p>
      )}
    </div>
  );
}

function SeverityInput({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const numeric = Number.isFinite(parseInt(value, 10))
    ? parseInt(value, 10)
    : 0;
  return (
    <div>
      <input
        type="range"
        min={0}
        max={10}
        step={1}
        value={numeric}
        onChange={(e) => onChange(e.target.value)}
        style={{ width: '100%' }}
      />
      <div
        style={{
          display: 'flex',
          justifyContent: 'space-between',
          fontSize: '0.74rem',
          color: 'var(--text-muted)',
          marginTop: 4,
        }}
      >
        <span>0 — none</span>
        <span style={{ fontSize: '1rem', fontWeight: 800, color: 'var(--brand-teal)' }}>
          {numeric}
        </span>
        <span>10 — worst</span>
      </div>
    </div>
  );
}

function ReviewStep({
  patientName,
  questions,
  answers,
  onJumpTo,
}: {
  patientName: string;
  questions: string[];
  answers: Record<string, string>;
  onJumpTo: (questionIndex: number) => void;
}) {
  return (
    <div>
      <h3
        style={{
          fontSize: '1rem',
          fontWeight: 800,
          marginBottom: 10,
        }}
      >
        Review your answers
      </h3>
      <p
        style={{
          fontSize: '0.85rem',
          color: 'var(--text-secondary)',
          marginBottom: 16,
          lineHeight: 1.5,
        }}
      >
        Please double-check before submitting. Tap any answer to edit it.
      </p>

      <div
        style={{
          padding: '12px 14px',
          borderRadius: 10,
          background: 'rgba(15,30,60,0.4)',
          border: '1px solid var(--border-subtle)',
          marginBottom: 10,
        }}
      >
        <div style={miniLabelStyle}>Your name</div>
        <div style={{ fontSize: '0.92rem', fontWeight: 600 }}>
          {patientName || <em style={{ color: 'var(--text-muted)' }}>(not set)</em>}
        </div>
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
        {questions.map((q, i) => {
          const ans = (answers[String(i)] || '').trim();
          return (
            <button
              key={i}
              type="button"
              onClick={() => onJumpTo(i)}
              style={{
                textAlign: 'left',
                padding: '12px 14px',
                borderRadius: 10,
                background: 'rgba(15,30,60,0.4)',
                border: '1px solid var(--border-subtle)',
                color: 'inherit',
                cursor: 'pointer',
              }}
            >
              <div style={miniLabelStyle}>Question {i + 1}</div>
              <div
                style={{
                  fontSize: '0.85rem',
                  marginBottom: 4,
                  color: 'var(--text-secondary)',
                  lineHeight: 1.4,
                }}
              >
                {q}
              </div>
              <div style={{ fontSize: '0.92rem', fontWeight: 600 }}>
                {ans || <em style={{ color: 'var(--text-muted)' }}>(skipped)</em>}
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
}

function ThankYou({
  message,
  highlight,
}: {
  message: string;
  highlight?: boolean;
}) {
  return (
    <div style={{ textAlign: 'center', padding: '12px 6px' }}>
      <div style={{ fontSize: '2.6rem', marginBottom: 10 }}>
        {highlight ? '✅' : '🙏'}
      </div>
      <h2 style={titleStyle}>Thank you!</h2>
      <p style={paragraphStyle}>{message}</p>
      <p
        style={{
          marginTop: 16,
          fontSize: '0.8rem',
          color: 'var(--text-muted)',
        }}
      >
        🔒 {PRIVACY_NOTICE}
      </p>
    </div>
  );
}

/* ── Inline styles ─────────────────────────────────────────────────── */

const titleStyle: React.CSSProperties = {
  fontSize: '1.4rem',
  fontWeight: 800,
  marginBottom: 8,
};

const paragraphStyle: React.CSSProperties = {
  fontSize: '0.92rem',
  color: 'var(--text-secondary)',
  lineHeight: 1.55,
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: '0.78rem',
  fontWeight: 700,
  color: 'var(--brand-teal)',
  marginBottom: 8,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
};

const miniLabelStyle: React.CSSProperties = {
  fontSize: '0.7rem',
  fontWeight: 700,
  color: 'var(--brand-teal)',
  marginBottom: 4,
  textTransform: 'uppercase',
  letterSpacing: '0.4px',
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  padding: '12px 14px',
  background: 'rgba(15,30,60,0.6)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 10,
  color: 'var(--text-primary)',
  fontSize: '0.95rem',
  outline: 'none',
};
