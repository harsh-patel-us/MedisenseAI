import { useState, type ReactNode } from 'react';
import type {
  ConsultationRole,
  PatientExplanation,
  PostCallData,
} from '../../types/consultation.types';
import { downloadBlob, exportPatientPdf, exportSoapPdf } from '../../api/consultationApi';

interface PostCallSummaryProps {
  data: PostCallData;
  role: ConsultationRole;
  roomId: string;
  roomInfo: { doctor_name: string; patient_name: string; session_id: string } | null;
}

type Tab = 'explanation' | 'soap' | 'transcript';

export default function PostCallSummary({ data, role, roomId, roomInfo }: PostCallSummaryProps) {
  const [tab, setTab] = useState<Tab>(role === 'patient' ? 'explanation' : 'soap');
  const [downloading, setDownloading] = useState<string | null>(null);

  const explanation = data.patient_explanation as PatientExplanation | undefined;
  const soap = data.soap_note as Record<string, Record<string, string>> | undefined;

  const downloadSoap = async () => {
    setDownloading('soap');
    try {
      const blob = await exportSoapPdf(roomId);
      downloadBlob(blob, 'consultation_soap_note.pdf');
    } catch (e) {
      console.error('SOAP PDF error:', e);
    } finally {
      setDownloading(null);
    }
  };

  const downloadPatient = async () => {
    setDownloading('patient');
    try {
      const blob = await exportPatientPdf(roomId);
      downloadBlob(blob, 'consultation_patient_guide.pdf');
    } catch (e) {
      console.error('Patient PDF error:', e);
    } finally {
      setDownloading(null);
    }
  };

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: 'explanation', label: '💙 Patient Guide', show: !!explanation },
    { id: 'soap', label: '📋 SOAP Note', show: !!soap && role === 'doctor' },
    { id: 'transcript', label: '📝 Transcript', show: data.transcript.length > 0 },
  ];

  return (
    <div style={{ maxWidth: '900px', margin: '0 auto', padding: '0 0 40px' }}>
      {/* Header */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px' }}>
          <div>
            <h2 style={{
              fontSize: '1.4rem', fontWeight: 800,
              background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent', marginBottom: '4px',
            }}>
              ✅ Consultation Complete
            </h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
              {roomInfo?.doctor_name} · {roomInfo?.patient_name} · Session {data.session_id?.slice(0, 8)}
            </p>
          </div>
          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            {role === 'doctor' && soap && (
              <button
                className="btn-secondary"
                onClick={downloadSoap}
                disabled={downloading === 'soap'}
                style={{ fontSize: '0.85rem', padding: '8px 16px' }}
              >
                {downloading === 'soap' ? '⏳ Generating...' : '📄 Doctor PDF (SOAP)'}
              </button>
            )}
            {explanation && (
              <button
                className="btn-primary"
                onClick={downloadPatient}
                disabled={downloading === 'patient'}
                style={{ fontSize: '0.85rem', padding: '8px 16px' }}
              >
                {downloading === 'patient' ? '⏳ Generating...' : '📥 Patient Guide PDF'}
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '16px', flexWrap: 'wrap' }}>
        {tabs.filter(t => t.show).map(t => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            style={{
              padding: '8px 18px', borderRadius: '10px', border: 'none',
              cursor: 'pointer', fontSize: '0.85rem', fontWeight: 600,
              background: tab === t.id ? 'var(--brand-blue)' : 'rgba(255,255,255,0.06)',
              color: tab === t.id ? '#fff' : 'var(--text-secondary)',
              transition: 'all 0.15s',
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Patient Explanation Tab */}
      {tab === 'explanation' && explanation && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
          {/* Greeting */}
          <div className="glass-card" style={{ padding: '20px' }}>
            <p style={{ fontSize: '0.95rem', lineHeight: 1.7, color: 'var(--text-primary)' }}>
              {explanation.greeting}
            </p>
          </div>

          {/* What was found */}
          <SectionCard title="🔍 What the Doctor Found">
            <Field label="Diagnosis" value={explanation.what_was_found.diagnosis} />
            <Field label="In Simple Terms" value={explanation.what_was_found.in_simple_terms} />
            <Field label="Why This Happened" value={explanation.what_was_found.why_this_happened} />
            <Field label="What This Means for You" value={explanation.what_was_found.what_it_means_for_you} />
          </SectionCard>

          {/* Treatment */}
          <SectionCard title="💊 Your Treatment Plan">
            {explanation.your_treatment.overview && (
              <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginBottom: '12px' }}>
                {explanation.your_treatment.overview}
              </p>
            )}
            {explanation.your_treatment.medications.length > 0 && (
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#60a5fa', marginBottom: '8px' }}>
                  Medications Prescribed:
                </p>
                {explanation.your_treatment.medications.map((med, i) => (
                  <div key={i} style={{
                    background: 'rgba(23,89,176,0.08)', borderRadius: '10px',
                    padding: '12px 14px', marginBottom: '8px',
                    border: '1px solid rgba(23,89,176,0.15)',
                  }}>
                    <p style={{ fontWeight: 700, marginBottom: '4px' }}>{med.name}</p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                      <b>What it does:</b> {med.what_it_does}
                    </p>
                    <p style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginBottom: '2px' }}>
                      <b>How to take:</b> {med.how_to_take}
                    </p>
                    {med.side_effects_to_watch && (
                      <p style={{ fontSize: '0.85rem', color: '#fbbf24' }}>
                        <b>Watch for:</b> {med.side_effects_to_watch}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            )}
            {explanation.your_treatment.tests_ordered.length > 0 && (
              <div>
                <p style={{ fontWeight: 700, fontSize: '0.85rem', color: '#60a5fa', marginBottom: '6px' }}>
                  Tests Ordered:
                </p>
                {explanation.your_treatment.tests_ordered.map((t, i) => (
                  <p key={i} style={{ fontSize: '0.88rem', marginBottom: '4px' }}>
                    • <b>{t.test}</b> — {t.why}
                  </p>
                ))}
              </div>
            )}
          </SectionCard>

          {/* Next Steps */}
          <SectionCard title="📋 What to Do Next">
            {explanation.what_to_do_next.immediate_steps.length > 0 && (
              <BulletList label="Immediate Steps" items={explanation.what_to_do_next.immediate_steps} color="#4ade80" prefix="✓" />
            )}
            {explanation.what_to_do_next.lifestyle_changes.length > 0 && (
              <BulletList label="Lifestyle Changes" items={explanation.what_to_do_next.lifestyle_changes} color="#60a5fa" prefix="•" />
            )}
            {explanation.what_to_do_next.follow_up && (
              <Field label="Follow-Up" value={explanation.what_to_do_next.follow_up} />
            )}
            {explanation.what_to_do_next.when_to_seek_help_immediately.length > 0 && (
              <BulletList
                label="Seek Immediate Help If:"
                items={explanation.what_to_do_next.when_to_seek_help_immediately}
                color="#f87171"
                prefix="🚨"
              />
            )}
          </SectionCard>

          {/* Reassurance */}
          {explanation.reassurance && (
            <div className="glass-card" style={{
              padding: '20px',
              background: 'rgba(23,89,176,0.08)',
              border: '1px solid rgba(23,89,176,0.2)',
            }}>
              <p style={{ fontSize: '0.95rem', lineHeight: 1.7, fontStyle: 'italic' }}>
                💙 {explanation.reassurance}
              </p>
            </div>
          )}
        </div>
      )}

      {/* SOAP Note Tab */}
      {tab === 'soap' && soap && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {[
            { key: 'subjective', label: 'S — Subjective', fields: ['chief_complaint', 'history_of_present_illness', 'review_of_systems', 'patient_reported_medications'] },
            { key: 'objective', label: 'O — Objective', fields: ['vitals', 'physical_examination', 'relevant_findings'] },
            { key: 'assessment', label: 'A — Assessment', fields: ['primary_diagnosis', 'differential_diagnoses', 'clinical_impression'] },
            { key: 'plan', label: 'P — Plan', fields: ['investigations_ordered', 'medications_prescribed', 'referrals', 'patient_instructions', 'follow_up'] },
          ].map(section => (
            <SectionCard key={section.key} title={section.label}>
              {section.fields.map(f => {
                const val = soap[section.key]?.[f];
                return val ? (
                  <Field key={f} label={f.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase())} value={val} />
                ) : null;
              })}
            </SectionCard>
          ))}
        </div>
      )}

      {/* Transcript Tab */}
      {tab === 'transcript' && (
        <div className="glass-card" style={{ padding: '20px' }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {data.transcript.map((seg, i) => {
              const isDoctor = seg.speaker === 'DOCTOR';
              return (
                <div key={i} style={{
                  display: 'flex', gap: '10px', alignItems: 'flex-start',
                  flexDirection: isDoctor ? 'row' : 'row-reverse',
                }}>
                  <span style={{ fontSize: '1.2rem', flexShrink: 0 }}>
                    {isDoctor ? '🩺' : '👤'}
                  </span>
                  <div style={{ maxWidth: '75%' }}>
                    <span style={{
                      fontSize: '0.7rem', fontWeight: 700,
                      color: isDoctor ? '#60a5fa' : '#4ade80',
                      display: 'block', marginBottom: '2px',
                    }}>
                      {seg.speaker}
                    </span>
                    <div style={{
                      background: isDoctor ? 'rgba(23,89,176,0.12)' : 'rgba(5,174,187,0.1)',
                      borderRadius: '8px', padding: '8px 12px',
                      fontSize: '0.88rem', lineHeight: 1.5,
                    }}>
                      {seg.text}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="glass-card" style={{ padding: '20px' }}>
      <h3 style={{
        fontSize: '1rem', fontWeight: 700, marginBottom: '14px',
        paddingBottom: '8px', borderBottom: '1px solid rgba(255,255,255,0.08)',
        background: 'var(--gradient-brand)', WebkitBackgroundClip: 'text',
        WebkitTextFillColor: 'transparent',
      }}>
        {title}
      </h3>
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {children}
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#60a5fa', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
      <p style={{ fontSize: '0.9rem', lineHeight: 1.6, marginTop: '2px', color: 'var(--text-primary)' }}>
        {value}
      </p>
    </div>
  );
}

function BulletList({ label, items, color, prefix }: { label: string; items: string[]; color: string; prefix: string }) {
  return (
    <div>
      <span style={{ fontSize: '0.75rem', fontWeight: 700, color, textTransform: 'uppercase', letterSpacing: '0.5px' }}>
        {label}
      </span>
      <div style={{ marginTop: '4px' }}>
        {items.map((item, i) => (
          <p key={i} style={{ fontSize: '0.88rem', lineHeight: 1.6, color: 'var(--text-primary)', paddingLeft: '8px' }}>
            {prefix} {item}
          </p>
        ))}
      </div>
    </div>
  );
}
