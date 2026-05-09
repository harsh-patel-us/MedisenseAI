import { useCallback, useEffect, useState } from 'react';
import {
  addMedication,
  deleteMedication,
  dismissAlert,
  getAdherenceReminder,
  getInteractions,
  getMedications,
} from '../../api/medicationApi';
import type {
  InteractionSeverity,
  MedicationInteractionAlert,
  MedicationTrackerProps,
  PatientMedication,
} from '../../types/medication.types';

const SEVERITY_STYLE: Record<
  InteractionSeverity,
  { bg: string; border: string; label: string; text: string }
> = {
  contraindicated: {
    bg: 'rgba(220, 38, 38, 0.18)',
    border: 'rgba(220, 38, 38, 0.55)',
    label: 'CONTRAINDICATED',
    text: '#fca5a5',
  },
  major: {
    bg: 'rgba(234, 88, 12, 0.18)',
    border: 'rgba(234, 88, 12, 0.55)',
    label: 'MAJOR',
    text: '#fdba74',
  },
  moderate: {
    bg: 'rgba(202, 138, 4, 0.18)',
    border: 'rgba(202, 138, 4, 0.55)',
    label: 'MODERATE',
    text: '#fde68a',
  },
  minor: {
    bg: 'rgba(37, 99, 235, 0.18)',
    border: 'rgba(37, 99, 235, 0.55)',
    label: 'MINOR',
    text: '#93c5fd',
  },
};

function severityStyle(sev: string) {
  if (sev === 'contraindicated' || sev === 'major' || sev === 'moderate' || sev === 'minor') {
    return SEVERITY_STYLE[sev];
  }
  return SEVERITY_STYLE.minor;
}

function sourceBadge(source: string): { label: string; color: string } {
  if (source === 'prescription_upload') return { label: 'From Report', color: '#05aebb' };
  if (source === 'chatbot_mention') return { label: 'From Chat', color: '#a78bfa' };
  return { label: 'Manual', color: '#4ade80' };
}

export default function MedicationTracker({ patientId }: MedicationTrackerProps) {
  const [meds, setMeds] = useState<PatientMedication[]>([]);
  const [alerts, setAlerts] = useState<MedicationInteractionAlert[]>([]);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Add-form state
  const [showAddForm, setShowAddForm] = useState(false);
  const [adding, setAdding] = useState(false);
  const [drugName, setDrugName] = useState('');
  const [dosage, setDosage] = useState('');
  const [frequency, setFrequency] = useState('');
  const [notes, setNotes] = useState('');

  // Adherence reminder modal
  const [reminder, setReminder] = useState<string | null>(null);
  const [reminderLoading, setReminderLoading] = useState(false);

  // Per-row busy ids for delete / dismiss so the affected row dims while
  // the API call is in flight (otherwise the user clicks ✕ and sees nothing
  // until the row vanishes — feels like the click was lost).
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [dismissingId, setDismissingId] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    if (!patientId) return;
    try {
      const res = await getMedications(patientId);
      setMeds(res.medications);
    } catch (err) {
      console.error('Failed to load medications', err);
      setError('Could not load your medications.');
    }
  }, [patientId]);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [m, a] = await Promise.all([
          getMedications(patientId),
          getInteractions(patientId).catch(() => ({ patient_id: patientId, alerts: [] })),
        ]);
        if (cancelled) return;
        setMeds(m.medications);
        setAlerts(a.alerts);
      } catch (err) {
        if (!cancelled) {
          console.error('Initial medication load failed', err);
          setError('Could not load your medications.');
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [patientId]);

  const handleAdd = async () => {
    const name = drugName.trim();
    if (!name) return;
    setAdding(true);
    setError(null);
    try {
      await addMedication(patientId, {
        drug_name: name,
        dosage: dosage.trim() || null,
        frequency: frequency.trim() || null,
        notes: notes.trim() || null,
      });
      setDrugName('');
      setDosage('');
      setFrequency('');
      setNotes('');
      setShowAddForm(false);
      await refresh();
    } catch (err) {
      console.error('Failed to add medication', err);
      setError('Could not add the medication.');
    } finally {
      setAdding(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (deletingId) return;
    setDeletingId(id);
    try {
      await deleteMedication(patientId, id);
      setMeds((prev) => prev.filter((m) => m.id !== id));
    } catch (err) {
      console.error('Failed to delete medication', err);
      setError('Could not remove that medication.');
    } finally {
      setDeletingId(null);
    }
  };

  const handleCheck = async () => {
    setChecking(true);
    setError(null);
    try {
      const res = await getInteractions(patientId);
      setAlerts(res.alerts);
    } catch (err) {
      console.error('Interaction check failed', err);
      setError('Could not check for interactions right now.');
    } finally {
      setChecking(false);
    }
  };

  const handleDismiss = async (alertId: string) => {
    if (dismissingId) return;
    setDismissingId(alertId);
    try {
      await dismissAlert(patientId, alertId);
      setAlerts((prev) => prev.filter((a) => a.id !== alertId));
    } catch (err) {
      console.error('Failed to dismiss alert', err);
    } finally {
      setDismissingId(null);
    }
  };

  const handleReminder = async () => {
    setReminderLoading(true);
    setReminder('');
    try {
      const res = await getAdherenceReminder(patientId);
      setReminder(res.message);
    } catch (err) {
      console.error('Reminder generation failed', err);
      setReminder('Could not generate a reminder right now. Please try again.');
    } finally {
      setReminderLoading(false);
    }
  };

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        Loading your medications…
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>
      {/* ── Header / actions ───────────────────────────────────────── */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: 12,
        }}
      >
        <div>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 800, marginBottom: 4 }}>
            💊 Your Medications
          </h3>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
            {meds.length === 0
              ? 'No medications on file yet.'
              : `${meds.length} active medication${meds.length === 1 ? '' : 's'}`}
          </div>
        </div>
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap' }}>
          <button
            className="btn-secondary"
            onClick={() => setShowAddForm((v) => !v)}
            style={{ padding: '8px 16px', fontSize: '0.85rem', fontWeight: 700 }}
          >
            {showAddForm ? '× Cancel' : '＋ Add Medication'}
          </button>
          <button
            className="btn-secondary"
            onClick={handleCheck}
            disabled={checking || meds.length < 2}
            title={meds.length < 2 ? 'Add at least 2 medications to check' : ''}
            style={{ padding: '8px 16px', fontSize: '0.85rem', fontWeight: 700 }}
          >
            {checking ? 'Checking…' : '🔍 Check Interactions'}
          </button>
          <button
            className="btn-primary"
            onClick={handleReminder}
            disabled={reminderLoading || meds.length === 0}
            style={{ padding: '8px 16px', fontSize: '0.85rem', fontWeight: 700 }}
          >
            {reminderLoading ? 'Writing…' : '🔔 Adherence Reminder'}
          </button>
        </div>
      </div>

      {error && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(220, 38, 38, 0.12)',
            border: '1px solid rgba(220, 38, 38, 0.3)',
            color: '#fca5a5',
            fontSize: '0.85rem',
          }}
        >
          ⚠️ {error}
        </div>
      )}

      {/* ── Add form ───────────────────────────────────────────────── */}
      {showAddForm && (
        <div
          className="glass-card"
          style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
        >
          <h4 style={{ fontSize: '0.95rem', fontWeight: 700 }}>Add a medication</h4>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
            <input
              placeholder="Drug name (required)"
              value={drugName}
              onChange={(e) => setDrugName(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="Dosage (e.g. 500 mg)"
              value={dosage}
              onChange={(e) => setDosage(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="Frequency (e.g. twice daily)"
              value={frequency}
              onChange={(e) => setFrequency(e.target.value)}
              style={inputStyle}
            />
            <input
              placeholder="Notes (optional)"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
            <button
              className="btn-primary"
              onClick={handleAdd}
              disabled={adding || !drugName.trim()}
              style={{ padding: '8px 18px', fontSize: '0.85rem', fontWeight: 700 }}
            >
              {adding ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      )}

      {/* ── Medication cards ───────────────────────────────────────── */}
      {meds.length === 0 ? (
        <div
          className="glass-card"
          style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}
        >
          No medications yet. Upload a prescription, mention a drug to MediSense AI,
          or add one manually with the button above.
        </div>
      ) : (
        <div
          style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
            gap: 14,
          }}
        >
          {meds.map((m) => {
            const badge = sourceBadge(m.source);
            const isDeleting = deletingId === m.id;
            return (
              <div
                key={m.id}
                className="glass-card"
                style={{
                  padding: 18,
                  display: 'flex',
                  flexDirection: 'column',
                  gap: 8,
                  position: 'relative',
                  opacity: isDeleting ? 0.55 : 1,
                  transition: 'opacity 0.18s',
                }}
              >
                <button
                  onClick={() => handleDelete(m.id)}
                  disabled={isDeleting}
                  aria-label={`Remove ${m.drug_name}`}
                  title={isDeleting ? 'Removing…' : 'Remove medication'}
                  style={{
                    position: 'absolute',
                    top: 10,
                    right: 10,
                    width: 26,
                    height: 26,
                    borderRadius: '50%',
                    background: 'rgba(220, 38, 38, 0.15)',
                    color: '#fca5a5',
                    border: 'none',
                    cursor: isDeleting ? 'wait' : 'pointer',
                    fontSize: 14,
                    lineHeight: 1,
                  }}
                >
                  {isDeleting ? '⏳' : '×'}
                </button>
                <div style={{ fontWeight: 800, fontSize: '1rem' }}>{m.drug_name}</div>
                <div style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
                  {[m.dosage, m.frequency].filter(Boolean).join(' • ') || 'Schedule not set'}
                </div>
                {m.notes && (
                  <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                    {m.notes}
                  </div>
                )}
                <div
                  style={{
                    fontSize: '0.66rem',
                    fontWeight: 800,
                    letterSpacing: '0.4px',
                    textTransform: 'uppercase',
                    color: badge.color,
                    marginTop: 'auto',
                  }}
                >
                  {badge.label}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ── Interaction alerts ─────────────────────────────────────── */}
      <div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          <h3 style={{ fontSize: '1.05rem', fontWeight: 800 }}>
            ⚠️ Interaction Alerts
          </h3>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            {alerts.length === 0
              ? 'No active alerts.'
              : `${alerts.length} alert${alerts.length === 1 ? '' : 's'}`}
          </div>
        </div>
        {alerts.length === 0 ? (
          <div
            className="glass-card"
            style={{
              padding: 20,
              textAlign: 'center',
              color: 'var(--text-muted)',
              fontSize: '0.86rem',
            }}
          >
            No interaction alerts. Tap{' '}
            <strong style={{ color: 'var(--text-primary)' }}>Check Interactions</strong>{' '}
            to scan your current medication list.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {alerts.map((a) => {
              const sev = severityStyle(a.severity);
              return (
                <div
                  key={a.id}
                  style={{
                    padding: '14px 16px',
                    borderRadius: 12,
                    background: sev.bg,
                    border: `1px solid ${sev.border}`,
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 6,
                  }}
                >
                  <div
                    style={{
                      display: 'flex',
                      justifyContent: 'space-between',
                      alignItems: 'center',
                      gap: 12,
                      flexWrap: 'wrap',
                    }}
                  >
                    <div
                      style={{
                        fontSize: '0.7rem',
                        fontWeight: 800,
                        letterSpacing: '0.6px',
                        color: sev.text,
                      }}
                    >
                      {sev.label}
                    </div>
                    <button
                      onClick={() => handleDismiss(a.id)}
                      disabled={dismissingId === a.id}
                      style={{
                        background: 'transparent',
                        border: '1px solid rgba(255,255,255,0.18)',
                        borderRadius: 8,
                        padding: '4px 10px',
                        color: 'var(--text-secondary)',
                        fontSize: '0.74rem',
                        cursor:
                          dismissingId === a.id ? 'wait' : 'pointer',
                      }}
                    >
                      {dismissingId === a.id ? 'Dismissing…' : 'Dismiss'}
                    </button>
                  </div>
                  <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
                    {a.drug_a} + {a.drug_b}
                  </div>
                  {a.description && (
                    <div
                      style={{
                        fontSize: '0.85rem',
                        color: 'var(--text-secondary)',
                        lineHeight: 1.5,
                      }}
                    >
                      {a.description}
                    </div>
                  )}
                  <div
                    style={{
                      fontSize: '0.7rem',
                      color: 'var(--text-muted)',
                      marginTop: 4,
                    }}
                  >
                    Source: {a.source}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Adherence reminder modal ───────────────────────────────── */}
      {reminder !== null && (
        <div
          role="dialog"
          aria-modal="true"
          onClick={() => setReminder(null)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.55)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
        >
          <div
            className="glass-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 520,
              width: '100%',
              padding: 28,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
            }}
          >
            <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
              🔔 Your Adherence Reminder
            </h3>
            <div
              style={{
                whiteSpace: 'pre-wrap',
                fontSize: '0.92rem',
                lineHeight: 1.6,
                color: 'var(--text-secondary)',
                minHeight: 60,
              }}
            >
              {reminderLoading ? 'Generating a personalized reminder…' : reminder}
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <button
                className="btn-primary"
                onClick={() => setReminder(null)}
                style={{ padding: '8px 18px', fontSize: '0.85rem', fontWeight: 700 }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  background: 'rgba(15,30,60,0.6)',
  border: '1px solid var(--border-subtle)',
  borderRadius: 10,
  padding: '10px 14px',
  color: 'var(--text-primary)',
  outline: 'none',
  fontSize: '0.88rem',
};
