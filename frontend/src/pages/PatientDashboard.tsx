import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import ReportUploader from '../components/patient/ReportUploader';
import ReportSummary from '../components/patient/ReportSummary';
import SpecialistGuide from '../components/patient/SpecialistGuide';
import DietExercisePlan from '../components/patient/DietExercisePlan';
import PrecautionsList from '../components/patient/PrecautionsList';
import { uploadReport, analyzeReport, exportPatientPdf } from '../api/patientApi';
import type { PatientAnalysis, UploadResponse } from '../types/patient.types';

type TabKey = 'summary' | 'specialist' | 'diet' | 'precautions';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'summary', label: 'Report Summary', icon: '📋' },
  { key: 'specialist', label: 'Specialist Guide', icon: '🏥' },
  { key: 'diet', label: 'Diet & Exercise', icon: '🥗' },
  { key: 'precautions', label: 'Precautions', icon: '⚠️' },
];

const SIDEBAR_LINKS: { to: string; label: string; icon: string }[] = [
  { to: '/patient', label: 'Upload Report', icon: '🧾' },
  { to: '/patient/chat', label: 'Chat with MediSense', icon: '💬' },
];

function PatientSidebar() {
  const location = useLocation();
  return (
    <aside
      style={{
        width: 240,
        flexShrink: 0,
        borderRight: '1px solid var(--border-subtle)',
        background: 'rgba(6,13,27,0.55)',
        padding: '24px 14px',
        display: 'flex',
        flexDirection: 'column',
        gap: 6,
        minHeight: 'calc(100vh - 64px)',
      }}
    >
      <div
        style={{
          fontSize: '0.7rem',
          textTransform: 'uppercase',
          letterSpacing: '0.6px',
          color: 'var(--text-muted)',
          padding: '4px 12px 8px',
          fontWeight: 700,
        }}
      >
        Patient Workspace
      </div>
      {SIDEBAR_LINKS.map((link) => {
        const active = location.pathname === link.to;
        return (
          <Link
            key={link.to}
            to={link.to}
            style={{
              textDecoration: 'none',
              padding: '10px 14px',
              borderRadius: 10,
              fontSize: '0.88rem',
              fontWeight: 600,
              color: active ? 'var(--brand-teal)' : 'var(--text-secondary)',
              background: active ? 'rgba(5,174,187,0.12)' : 'transparent',
              border: active
                ? '1px solid rgba(5,174,187,0.3)'
                : '1px solid transparent',
              display: 'flex',
              alignItems: 'center',
              gap: 10,
              transition: 'background 0.15s, color 0.15s',
            }}
          >
            <span style={{ fontSize: '1rem' }}>{link.icon}</span>
            {link.label}
          </Link>
        );
      })}
    </aside>
  );
}

export default function PatientDashboard() {
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [analysis, setAnalysis] = useState<PatientAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);
    setAnalysis(null);

    try {
      const uploadRes = await uploadReport(file);
      setUploadData(uploadRes);
      setIsUploading(false);

      // Immediately analyze
      setIsAnalyzing(true);
      const analysisRes = await analyzeReport(uploadRes.file_id, uploadRes.raw_text);
      setAnalysis(analysisRes);
    } catch (err: any) {
      console.error('Upload/analyze failed:', err);
      setError(err.response?.data?.detail || err.message || 'Upload or analysis failed');
    } finally {
      setIsUploading(false);
      setIsAnalyzing(false);
    }
  };

  const handleExportPdf = async () => {
    if (!analysis) return;
    setExporting(true);
    try {
      const blob = await exportPatientPdf(analysis, 'Patient', uploadData?.file_id);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'medisense_health_guide.pdf';
      a.click();
      URL.revokeObjectURL(url);
    } catch (err) {
      console.error('PDF export failed:', err);
    } finally {
      setExporting(false);
    }
  };

  const handleReset = () => {
    setUploadData(null);
    setAnalysis(null);
    setError(null);
    setActiveTab('summary');
  };

  return (
    <div style={{ display: 'flex', alignItems: 'stretch' }}>
      <PatientSidebar />
      <div style={{ flex: 1, maxWidth: '960px', margin: '0 auto', padding: '24px 20px', width: '100%' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{
            fontSize: '1.8rem', fontWeight: 800,
            background: 'linear-gradient(135deg, #05aebb 0%, #4ade80 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            marginBottom: '8px',
          }}>
            🧬 Patient Dashboard
          </h1>
          <p style={{ fontSize: '0.92rem', color: 'var(--text-secondary)' }}>
            Upload your medical report and get AI-powered health insights
          </p>
        </div>

        {/* Uploader */}
        <ReportUploader
          isUploading={isUploading}
          onUpload={handleUpload}
          uploadedFileName={uploadData?.file_name}
        />

        {/* Error */}
        {error && (
          <div style={{
            marginTop: '16px', padding: '14px 18px',
            background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.3)',
            borderRadius: '12px', color: '#fca5a5', fontSize: '0.88rem',
          }}>
            ⚠️ {error}
            <button
              onClick={handleReset}
              style={{
                marginLeft: '12px', padding: '4px 12px', fontSize: '0.8rem',
                background: 'rgba(220, 38, 38, 0.2)', border: '1px solid rgba(220, 38, 38, 0.3)',
                borderRadius: '8px', color: '#fca5a5', cursor: 'pointer',
              }}
            >
              Try Again
            </button>
          </div>
        )}

        {/* Analyzing state */}
        {isAnalyzing && (
          <div className="glass-card" style={{
            marginTop: '24px', padding: '48px', textAlign: 'center',
          }}>
            <div className="spinner" style={{ margin: '0 auto 20px', width: 48, height: 48 }} />
            <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '8px' }}>
              Analyzing Your Report...
            </h3>
            <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', maxWidth: '400px', margin: '0 auto' }}>
              Our AI is reading your medical report and generating personalized health insights.
              This usually takes 15-30 seconds.
            </p>
            <div style={{
              display: 'flex', justifyContent: 'center', gap: '20px', marginTop: '24px',
              fontSize: '0.8rem', color: 'var(--text-muted)',
            }}>
              <span>📊 Extracting findings</span>
              <span>🏥 Finding specialists</span>
              <span>🥗 Creating diet plan</span>
            </div>
          </div>
        )}

        {/* Results */}
        {analysis && (
          <div style={{ marginTop: '24px' }}>
            {/* Tab bar + actions */}
            <div style={{
              display: 'flex', alignItems: 'center', justifyContent: 'space-between',
              gap: '16px', marginBottom: '20px', flexWrap: 'wrap',
            }}>
              <div className="tab-nav" style={{ flex: 1 }}>
                {TABS.map((tab) => (
                  <button
                    key={tab.key}
                    className={`tab-btn ${activeTab === tab.key ? 'active' : ''}`}
                    onClick={() => setActiveTab(tab.key)}
                    id={`tab-${tab.key}`}
                  >
                    {tab.icon} {tab.label}
                  </button>
                ))}
              </div>
              <div style={{ display: 'flex', gap: '10px', flexShrink: 0 }}>
                <button className="btn-primary" onClick={handleExportPdf} disabled={exporting} id="export-health-pdf-btn">
                  {exporting ? (
                    <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /> Exporting...</>
                  ) : (
                    '📥 Download PDF'
                  )}
                </button>
                <button className="btn-secondary" onClick={handleReset} id="new-analysis-btn">
                  🔄 New
                </button>
              </div>
            </div>

            {/* Tab content */}
            <div className="glass-card" style={{ padding: '28px' }}>
              {activeTab === 'summary' && (
                <ReportSummary
                  findings={analysis.findings}
                  plainSummary={analysis.plain_summary}
                  whatThisMeans={analysis.what_this_means}
                  criticalAlerts={analysis.critical_alerts}
                />
              )}
              {activeTab === 'specialist' && (
                <SpecialistGuide
                  specialists={analysis.specialists}
                  urgency={analysis.urgency}
                  urgencyReason={analysis.urgency_reason}
                />
              )}
              {activeTab === 'diet' && (
                <DietExercisePlan
                  dietPlan={analysis.diet_plan}
                  exercisePlan={analysis.exercise_plan}
                  exercisesToAvoid={analysis.exercises_to_avoid}
                />
              )}
              {activeTab === 'precautions' && (
                <PrecautionsList precautions={analysis.precautions} />
              )}
            </div>

            {/* Disclaimer */}
            <div className="disclaimer">
              ⚠️ <strong>IMPORTANT:</strong> This information is AI-generated and is for educational
              purposes only. It is NOT a substitute for professional medical advice, diagnosis, or
              treatment. Always consult a qualified healthcare provider before making any health decisions.
              If you are experiencing a medical emergency, call emergency services immediately.
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
