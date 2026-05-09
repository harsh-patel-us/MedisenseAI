import { useCallback, useEffect, useState } from 'react';

import ReportUploader from '../components/patient/ReportUploader';
import ReportSummary from '../components/patient/ReportSummary';
import SpecialistGuide from '../components/patient/SpecialistGuide';
import DietExercisePlan from '../components/patient/DietExercisePlan';
import PrecautionsList from '../components/patient/PrecautionsList';
import MedicationTracker from '../components/patient/MedicationTracker';
import LabTrendChart from '../components/patient/LabTrendChart';
import WearableUploader from '../components/patient/WearableUploader';
import { useAuth } from '../contexts/AuthContext';
import {
  uploadReport,
  analyzeReport,
  exportPatientPdf,
  listPatientHistory,
  getPatientHistoryItem,
  downloadHistoryUpload,
  downloadHistoryPdf,
} from '../api/patientApi';
import type {
  PatientAnalysis,
  UploadResponse,
  HistoryItem,
  UrgencyLevel,
} from '../types/patient.types';

type TabKey =
  | 'summary'
  | 'specialist'
  | 'diet'
  | 'precautions'
  | 'medications'
  | 'trends'
  | 'wearables';

const TABS: { key: TabKey; label: string; icon: string }[] = [
  { key: 'summary', label: 'Report Summary', icon: '📋' },
  { key: 'specialist', label: 'Specialist Guide', icon: '🏥' },
  { key: 'diet', label: 'Diet & Exercise', icon: '🥗' },
  { key: 'precautions', label: 'Precautions', icon: '⚠️' },
  { key: 'medications', label: 'Medications', icon: '💊' },
  { key: 'trends', label: 'Trends', icon: '📈' },
  { key: 'wearables', label: 'Wearables', icon: '⌚' },
];

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function formatHistoryDate(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

export default function PatientReportUpload() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState<TabKey>('summary');
  const [isUploading, setIsUploading] = useState(false);
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [uploadData, setUploadData] = useState<UploadResponse | null>(null);
  const [analysis, setAnalysis] = useState<PatientAnalysis | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);

  // ── History state ──────────────────────────────────────────────────
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);
  const [historyError, setHistoryError] = useState<string | null>(null);
  const [openHistoryId, setOpenHistoryId] = useState<string | null>(null);
  const [historyBusyId, setHistoryBusyId] = useState<string | null>(null);

  const refreshHistory = useCallback(async () => {
    setHistoryLoading(true);
    setHistoryError(null);
    try {
      const res = await listPatientHistory();
      setHistory(res.items);
    } catch (err: any) {
      setHistoryError(
        err?.response?.data?.detail || err?.message || 'Could not load past reports',
      );
    } finally {
      setHistoryLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshHistory();
  }, [refreshHistory]);

  const handleUpload = async (file: File) => {
    setIsUploading(true);
    setError(null);
    setAnalysis(null);
    setOpenHistoryId(null);

    try {
      const uploadRes = await uploadReport(file);
      setUploadData(uploadRes);
      setIsUploading(false);

      // Immediately analyze
      setIsAnalyzing(true);
      const analysisRes = await analyzeReport(uploadRes.file_id, uploadRes.raw_text);
      setAnalysis(analysisRes);
      // Surface the new record in the history list right away.
      void refreshHistory();
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
      downloadBlob(blob, 'medisense_health_guide.pdf');
      // The PDF is now stored on the record, so the history list flips to
      // "PDF available" — refresh to reflect that.
      void refreshHistory();
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
    setOpenHistoryId(null);
  };

  const handleOpenHistory = async (item: HistoryItem) => {
    setHistoryBusyId(item.id);
    setError(null);
    try {
      const detail = await getPatientHistoryItem(item.id);
      const reanimated: PatientAnalysis = {
        report_type: 'other',
        findings: detail.findings,
        conditions_suggested: [],
        critical_alerts: [],
        plain_summary: detail.summary || '',
        what_this_means: '',
        specialists: detail.specialists,
        urgency: (detail.urgency as UrgencyLevel) || 'routine',
        urgency_reason: '',
        diet_plan: detail.diet_plan,
        exercise_plan: detail.exercise_plan,
        exercises_to_avoid: [],
        precautions: detail.precautions,
      };
      setAnalysis(reanimated);
      setUploadData({
        file_id: detail.id,
        file_name: detail.file_name,
        raw_text: '',
        file_type: detail.file_type,
        char_count: 0,
      });
      setOpenHistoryId(detail.id);
      setActiveTab('summary');
      // Smooth scroll to the analysis area for context.
      setTimeout(() => {
        document.getElementById('analysis-area')?.scrollIntoView({ behavior: 'smooth' });
      }, 50);
    } catch (err: any) {
      setError(err?.response?.data?.detail || err?.message || 'Could not open past report');
    } finally {
      setHistoryBusyId(null);
    }
  };

  const handleDownloadHistoryFile = async (item: HistoryItem) => {
    setHistoryBusyId(item.id);
    try {
      const blob = await downloadHistoryUpload(item.id);
      downloadBlob(blob, item.file_name || `report_${item.id}`);
    } catch (err: any) {
      setHistoryError(err?.response?.data?.detail || 'Could not download original file');
    } finally {
      setHistoryBusyId(null);
    }
  };

  const handleDownloadHistoryPdf = async (item: HistoryItem) => {
    setHistoryBusyId(item.id);
    try {
      const blob = await downloadHistoryPdf(item.id);
      downloadBlob(blob, `medisense_health_guide_${item.id}.pdf`);
    } catch (err: any) {
      setHistoryError(
        err?.response?.data?.detail
          || 'No PDF stored yet — open the report and click Download PDF to generate one.',
      );
    } finally {
      setHistoryBusyId(null);
    }
  };

  return (
    <div style={{ maxWidth: '960px', margin: '0 auto', padding: '24px 20px', width: '100%' }}>
        {/* Header */}
        <div style={{ marginBottom: '32px' }}>
          <h1 style={{
            fontSize: '1.8rem', fontWeight: 800,
            background: 'linear-gradient(135deg, #05aebb 0%, #4ade80 100%)',
            WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent',
            marginBottom: '8px',
          }}>
            📋 Report Analysis
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
          <div id="analysis-area" style={{ marginTop: '24px' }}>
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
              {activeTab === 'medications' && user?.id && (
                <MedicationTracker patientId={user.id} />
              )}
              {activeTab === 'trends' && user?.id && (
                <LabTrendChart patientId={user.id} />
              )}
              {activeTab === 'wearables' && user?.id && (
                <WearableUploader patientId={user.id} />
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

        {/* Past Reports */}
        <div className="glass-card" style={{ marginTop: '32px', padding: '24px' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            marginBottom: '16px', flexWrap: 'wrap', gap: '8px',
          }}>
            <div>
              <h3 style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '4px' }}>
                📚 Past Reports
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>
                Every report you've uploaded — open the summary or download the original/PDF anytime.
              </p>
            </div>
            <button
              className="btn-secondary"
              onClick={() => void refreshHistory()}
              disabled={historyLoading}
              style={{ fontSize: '0.82rem' }}
            >
              {historyLoading ? 'Refreshing…' : '🔄 Refresh'}
            </button>
          </div>

          {historyError && (
            <div style={{
              padding: '10px 14px', marginBottom: '12px',
              background: 'rgba(220, 38, 38, 0.1)',
              border: '1px solid rgba(220, 38, 38, 0.3)',
              borderRadius: '10px', color: '#fca5a5', fontSize: '0.85rem',
            }}>
              ⚠️ {historyError}
            </div>
          )}

          {!historyLoading && history.length === 0 && !historyError && (
            <div style={{
              padding: '24px', textAlign: 'center',
              color: 'var(--text-muted)', fontSize: '0.88rem',
            }}>
              No past reports yet. Your first upload will show up here.
            </div>
          )}

          {history.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
              {history.map((item) => {
                const isOpen = openHistoryId === item.id;
                const busy = historyBusyId === item.id;
                return (
                  <div
                    key={item.id}
                    className={`history-item-card ${isOpen ? 'active' : ''}`}
                    onClick={() => !isOpen && handleOpenHistory(item)}
                    style={{ cursor: isOpen ? 'default' : 'pointer' }}
                  >
                    <div style={{
                      display: 'flex', justifyContent: 'space-between',
                      alignItems: 'flex-start', gap: 12, flexWrap: 'wrap',
                    }}>
                      <div style={{ flex: 1, minWidth: 200 }}>
                        <div style={{
                          fontSize: '0.95rem', fontWeight: 800,
                          color: isOpen ? 'var(--brand-teal)' : 'var(--text-primary)', 
                          marginBottom: '4px',
                          wordBreak: 'break-word',
                          display: 'flex', alignItems: 'center', gap: '8px'
                        }}>
                          {isOpen ? '📖' : '📄'} {item.file_name || 'Untitled report'}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-muted)', display: 'flex', gap: '12px' }}>
                          <span>📅 {formatHistoryDate(item.created_at)}</span>
                          {item.urgency && (
                            <span style={{ 
                              color: item.urgency === 'routine' ? '#4ade80' : '#f87171',
                              fontWeight: 700, textTransform: 'uppercase', fontSize: '0.7rem'
                            }}>
                              • {item.urgency}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: '0.78rem', padding: '6px 12px', background: isOpen ? 'rgba(5,174,187,0.2)' : '' }}
                          disabled={busy}
                          onClick={(e) => { e.stopPropagation(); handleOpenHistory(item); }}
                        >
                          {busy && !isOpen ? 'Opening…' : isOpen ? '✓ Open' : 'View'}
                        </button>
                        <button
                          className="btn-secondary"
                          style={{ fontSize: '0.78rem', padding: '6px 12px' }}
                          disabled={busy || !item.has_uploaded_file}
                          onClick={(e) => { e.stopPropagation(); handleDownloadHistoryFile(item); }}
                          title={item.has_uploaded_file ? 'Download original file' : 'Original file not stored'}
                        >
                          📎 File
                        </button>
                        <button
                          className="btn-primary"
                          style={{ fontSize: '0.78rem', padding: '6px 12px', background: item.has_generated_pdf ? 'var(--gradient-brand)' : 'rgba(255,255,255,0.05)', color: item.has_generated_pdf ? 'white' : 'var(--text-muted)' }}
                          disabled={busy || !item.has_generated_pdf}
                          onClick={(e) => { e.stopPropagation(); handleDownloadHistoryPdf(item); }}
                          title={item.has_generated_pdf ? 'Download generated PDF' : 'No PDF generated yet'}
                        >
                          📥 PDF
                        </button>
                      </div>
                    </div>
                    {item.summary && (
                      <div style={{
                        fontSize: '0.82rem', color: 'var(--text-secondary)',
                        lineHeight: 1.5,
                      }}>
                        {item.summary.length > 220
                          ? `${item.summary.slice(0, 220)}…`
                          : item.summary}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
  );
}
