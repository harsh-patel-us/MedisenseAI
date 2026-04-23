import { useState } from 'react';
import type { SoapNote } from '../../types/doctor.types';
import { exportSoapPdf } from '../../api/doctorApi';

interface SoapNoteEditorProps {
  soapNote: SoapNote;
  sessionId: string | null;
  onUpdate: (note: SoapNote) => void;
}

const SECTION_CONFIG = [
  {
    key: 'subjective' as const,
    title: 'S — Subjective',
    icon: '💬',
    fields: [
      { key: 'chief_complaint', label: 'Chief Complaint' },
      { key: 'history_of_present_illness', label: 'History of Present Illness' },
      { key: 'review_of_systems', label: 'Review of Systems' },
      { key: 'patient_reported_medications', label: 'Patient Reported Medications' },
    ],
  },
  {
    key: 'objective' as const,
    title: 'O — Objective',
    icon: '🔬',
    fields: [
      { key: 'vitals', label: 'Vitals' },
      { key: 'physical_examination', label: 'Physical Examination' },
      { key: 'relevant_findings', label: 'Relevant Findings' },
    ],
  },
  {
    key: 'assessment' as const,
    title: 'A — Assessment',
    icon: '🩺',
    fields: [
      { key: 'primary_diagnosis', label: 'Primary Diagnosis' },
      { key: 'differential_diagnoses', label: 'Differential Diagnoses' },
      { key: 'clinical_impression', label: 'Clinical Impression' },
    ],
  },
  {
    key: 'plan' as const,
    title: 'P — Plan',
    icon: '📋',
    fields: [
      { key: 'investigations_ordered', label: 'Investigations Ordered' },
      { key: 'medications_prescribed', label: 'Medications Prescribed' },
      { key: 'referrals', label: 'Referrals' },
      { key: 'patient_instructions', label: 'Patient Instructions' },
      { key: 'follow_up', label: 'Follow Up' },
    ],
  },
];

export default function SoapNoteEditor({ soapNote, sessionId, onUpdate }: SoapNoteEditorProps) {
  const [exporting, setExporting] = useState(false);
  const [copied, setCopied] = useState(false);

  const handleFieldChange = (section: keyof SoapNote, field: string, value: string) => {
    const updatedNote = { ...soapNote };
    (updatedNote[section] as any)[field] = value;
    onUpdate(updatedNote);
  };

  const handleCopy = () => {
    const text = SECTION_CONFIG.map((sec) => {
      const data = soapNote[sec.key];
      return `${sec.title}\n${sec.fields.map((f) => `  ${f.label}: ${(data as any)[f.key] || 'N/A'}`).join('\n')}`;
    }).join('\n\n');

    navigator.clipboard.writeText(text).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleExportPdf = async () => {
    setExporting(true);
    try {
      const blob = await exportSoapPdf(soapNote, 'Patient', 'Doctor', sessionId || undefined);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'medisense_soap_note.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="glass-card" style={{ padding: '28px' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px', flexWrap: 'wrap', gap: '12px' }}>
        <h2 style={{ fontSize: '1.2rem', fontWeight: 700 }}>
          📄 SOAP Clinical Note
        </h2>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button className="btn-secondary" onClick={handleCopy} id="copy-soap-btn">
            {copied ? '✓ Copied!' : '📋 Copy'}
          </button>
          <button className="btn-primary" onClick={handleExportPdf} disabled={exporting} id="export-soap-pdf-btn">
            {exporting ? (
              <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Exporting...</>
            ) : (
              '📥 Download PDF'
            )}
          </button>
        </div>
      </div>

      {/* SOAP Sections */}
      {SECTION_CONFIG.map((sec) => (
        <div key={sec.key} className="soap-section">
          <h3>{sec.icon} {sec.title}</h3>
          {sec.fields.map((field) => (
            <div key={field.key} className="soap-field" style={{ marginBottom: '12px' }}>
              <label htmlFor={`soap-${sec.key}-${field.key}`}>{field.label}</label>
              <textarea
                id={`soap-${sec.key}-${field.key}`}
                value={(soapNote[sec.key] as any)[field.key] || ''}
                onChange={(e) => handleFieldChange(sec.key, field.key, e.target.value)}
                rows={2}
              />
            </div>
          ))}
        </div>
      ))}

      {/* Disclaimer */}
      <div className="disclaimer">
        ⚠️ <strong>IMPORTANT:</strong> This SOAP note is an AI-generated draft for physician review.
        It is NOT a finalized medical record until reviewed and approved by the attending physician.
        Always verify all clinical details before incorporating into patient records.
      </div>
    </div>
  );
}
