import { useCallback, useEffect, useState } from 'react';
import axios from 'axios';
import {
  uploadWearableData,
  getWearableRecords,
  getWearableRecord,
} from '../../api/patientApi';
import type {
  WearableDataRecord,
  WearableRecordListItem,
  WearableSource,
  WearableUploaderProps,
} from '../../types/patient.types';

const MAX_MB = 50;

const SOURCE_META: Record<
  string,
  { label: string; icon: string; color: string }
> = {
  apple_health: { label: 'Apple Health', icon: '', color: '#0aa1ff' },
  fitbit: { label: 'Fitbit', icon: '⌚', color: '#00b0b9' },
  google_fit: { label: 'Google Fit', icon: '🟢', color: '#4285f4' },
  manual_csv: { label: 'Manual upload', icon: '📄', color: '#94a3b8' },
  unknown: { label: 'Unknown source', icon: '📁', color: '#94a3b8' },
};

function fmtNum(n: number | null | undefined, digits = 0): string {
  if (n === null || n === undefined) return '—';
  return digits > 0 ? n.toFixed(digits) : Math.round(n).toLocaleString();
}

function fmtRange(start: string | null, end: string | null): string {
  if (!start && !end) return 'Date range unknown';
  if (start && end && start === end) return start;
  return `${start || '?'} → ${end || '?'}`;
}

function fmtUploadedAt(iso: string): string {
  if (!iso) return '';
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString();
}

function sourceMeta(source: WearableSource) {
  return SOURCE_META[source] || SOURCE_META.unknown;
}

export default function WearableUploader({ patientId }: WearableUploaderProps) {
  const [records, setRecords] = useState<WearableRecordListItem[]>([]);
  const [active, setActive] = useState<WearableDataRecord | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [loadingList, setLoadingList] = useState(false);
  const [loadingActive, setLoadingActive] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [showHelp, setShowHelp] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(true);
  const [dragOver, setDragOver] = useState(false);

  const refresh = useCallback(async () => {
    setLoadingList(true);
    try {
      const res = await getWearableRecords(patientId);
      setRecords(res.items);
      // Auto-select most recent if nothing chosen yet.
      if (!activeId && res.items.length > 0) {
        const first = res.items[0];
        setActiveId(first.id);
        setLoadingActive(true);
        try {
          const detail = await getWearableRecord(first.id);
          setActive(detail);
        } finally {
          setLoadingActive(false);
        }
      }
    } catch (err) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.detail
          ? String(err.response.data.detail)
          : 'Could not load wearable history.';
      setError(msg);
    } finally {
      setLoadingList(false);
    }
  }, [patientId, activeId]);

  useEffect(() => {
    void refresh();
    // refresh on patientId change only — activeId guards against re-fetch loop
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  async function handleSelect(id: string) {
    if (id === activeId && active) return;
    setActiveId(id);
    setLoadingActive(true);
    setError(null);
    try {
      const detail = await getWearableRecord(id);
      setActive(detail);
    } catch (err) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.detail
          ? String(err.response.data.detail)
          : 'Could not load this wearable record.';
      setError(msg);
    } finally {
      setLoadingActive(false);
    }
  }

  async function handleFile(file: File) {
    setError(null);
    if (!file) return;
    if (file.size > MAX_MB * 1024 * 1024) {
      setError(`File too large. Maximum ${MAX_MB} MB.`);
      return;
    }
    setUploading(true);
    setProgress(0);
    try {
      const result = await uploadWearableData(file, setProgress);
      setActive(result);
      setActiveId(result.id);
      // Refresh history list (keeps the selection we just set).
      const list = await getWearableRecords(patientId);
      setRecords(list.items);
    } catch (err) {
      const msg =
        axios.isAxiosError(err) && err.response?.data?.detail
          ? String(err.response.data.detail)
          : 'Upload failed. Please try again.';
      setError(msg);
    } finally {
      setUploading(false);
      setProgress(0);
    }
  }

  function onDrop(e: React.DragEvent<HTMLDivElement>) {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) void handleFile(file);
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* ── Upload area ──────────────────────────────────────── */}
      <div
        className="glass-card"
        style={{
          padding: '22px 22px',
          border: dragOver
            ? '2px dashed var(--brand-teal)'
            : '2px dashed rgba(13, 148, 136, 0.3)',
          background: dragOver ? 'rgba(13,148,136,0.06)' : undefined,
          transition: 'all 0.2s ease',
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDragOver(true);
        }}
        onDragLeave={() => setDragOver(false)}
        onDrop={onDrop}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 14,
            flexWrap: 'wrap',
            marginBottom: 12,
          }}
        >
          <div>
            <h3
              style={{
                fontSize: '1.05rem',
                fontWeight: 800,
                marginBottom: 6,
              }}
            >
              ⌚ Upload Wearable / Health-App Data
            </h3>
            <p
              style={{
                fontSize: '0.85rem',
                color: 'var(--text-secondary)',
                lineHeight: 1.5,
                margin: 0,
              }}
            >
              Supported formats: Apple Health (export.zip / export.xml),
              Fitbit (JSON or ZIP export), Google Fit (JSON or ZIP export).
              Maximum {MAX_MB} MB per file.
            </p>
          </div>
          <button
            type="button"
            onClick={() => setShowHelp(true)}
            style={{
              background: 'transparent',
              color: 'var(--brand-teal)',
              border: '1px solid var(--border-subtle)',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: '0.78rem',
              fontWeight: 600,
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            ❓ How to export
          </button>
        </div>

        <label
          htmlFor="wearable-file-input"
          style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            gap: 10,
            padding: '24px 16px',
            background: 'rgba(15,30,60,0.4)',
            borderRadius: 12,
            cursor: uploading ? 'wait' : 'pointer',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <input
            id="wearable-file-input"
            type="file"
            accept=".xml,.json,.zip,application/xml,text/xml,application/json,application/zip,application/x-zip-compressed"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void handleFile(f);
              e.target.value = '';
            }}
            disabled={uploading}
            style={{ display: 'none' }}
          />
          <div style={{ fontSize: '2rem' }}>{uploading ? '⏳' : '📤'}</div>
          <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
            {uploading
              ? `Uploading… ${progress}%`
              : 'Drop a file here or click to browse'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
            We parse your data on the server and only store the summary —
            the raw export is never written to disk.
          </div>
          {uploading && (
            <div
              style={{
                width: '100%',
                maxWidth: 320,
                height: 6,
                background: 'rgba(255,255,255,0.06)',
                borderRadius: 999,
                overflow: 'hidden',
                marginTop: 6,
              }}
            >
              <div
                style={{
                  width: `${progress}%`,
                  height: '100%',
                  background: 'var(--gradient-brand)',
                  transition: 'width 0.2s ease',
                }}
              />
            </div>
          )}
        </label>

        {error && (
          <div
            style={{
              marginTop: 12,
              padding: '10px 14px',
              borderRadius: 10,
              background: 'rgba(220,38,38,0.1)',
              border: '1px solid rgba(220,38,38,0.3)',
              color: '#fca5a5',
              fontSize: '0.85rem',
            }}
          >
            ⚠ {error}
          </div>
        )}
      </div>

      {showHelp && <ExportInstructions onClose={() => setShowHelp(false)} />}

      {/* ── Stats display ────────────────────────────────────── */}
      {loadingActive ? (
        <div
          className="glass-card"
          style={{
            padding: '40px 20px',
            textAlign: 'center',
            color: 'var(--text-secondary)',
            fontSize: '0.9rem',
          }}
        >
          <div
            className="spinner"
            style={{ width: 24, height: 24, margin: '0 auto 12px' }}
          />
          Loading your wearable record…
        </div>
      ) : active ? (
        <ActiveRecordView
          record={active}
          findingsOpen={findingsOpen}
          onToggleFindings={() => setFindingsOpen((v) => !v)}
        />
      ) : (
        <div
          className="glass-card"
          style={{
            padding: '36px 20px',
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.9rem',
          }}
        >
          ⌚ No wearable data yet. Upload an export above to see your
          activity, sleep, and vitals trends.
        </div>
      )}

      {/* ── Upload history ───────────────────────────────────── */}
      {records.length > 0 && (
        <div className="glass-card" style={{ padding: '18px 22px' }}>
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              marginBottom: 12,
              gap: 10,
            }}
          >
            <h4 style={{ fontSize: '0.95rem', fontWeight: 800 }}>
              📚 Upload History ({records.length})
            </h4>
            {loadingList && (
              <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                ↻ Refreshing…
              </span>
            )}
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {records.map((r) => {
              const meta = sourceMeta(r.source);
              const selected = r.id === activeId;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => void handleSelect(r.id)}
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 10,
                    background: selected
                      ? 'rgba(5,174,187,0.10)'
                      : 'rgba(15,30,60,0.4)',
                    border: `1px solid ${
                      selected ? 'var(--brand-teal)' : 'var(--border-subtle)'
                    }`,
                    color: 'inherit',
                    cursor: 'pointer',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    gap: 10,
                    flexWrap: 'wrap',
                  }}
                >
                  <div>
                    <div
                      style={{
                        fontSize: '0.82rem',
                        fontWeight: 700,
                        color: meta.color,
                        marginBottom: 2,
                      }}
                    >
                      {meta.icon ? `${meta.icon} ` : ''}
                      {meta.label}
                    </div>
                    <div style={{ fontSize: '0.76rem', color: 'var(--text-secondary)' }}>
                      {fmtRange(r.date_range_start, r.date_range_end)}
                    </div>
                  </div>
                  <div style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
                    {fmtUploadedAt(r.upload_date)}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Sub-components ────────────────────────────────────────────────── */

function ActiveRecordView({
  record,
  findingsOpen,
  onToggleFindings,
}: {
  record: WearableDataRecord;
  findingsOpen: boolean;
  onToggleFindings: () => void;
}) {
  const meta = sourceMeta(record.source);
  const summary = record.summary;
  const hasGlucose =
    !!summary && summary.blood_glucose.readings.length > 0;
  const glucoseAvg = hasGlucose
    ? summary!.blood_glucose.readings.reduce((s, r) => s + r.value, 0) /
      summary!.blood_glucose.readings.length
    : null;

  // 2×3 metric grid → six tiles. Order chosen so the most-actionable
  // signals (resting HR, sleep, steps) sit on the first row.
  const tiles: { label: string; value: string; sub?: string; color?: string }[] = [
    {
      label: 'Avg Resting Heart Rate',
      value:
        summary?.heart_rate.resting_avg != null
          ? `${fmtNum(summary.heart_rate.resting_avg, 0)} bpm`
          : summary?.heart_rate.avg != null
          ? `${fmtNum(summary.heart_rate.avg, 0)} bpm`
          : '—',
      sub:
        summary?.heart_rate.min != null && summary?.heart_rate.max != null
          ? `Range ${fmtNum(summary.heart_rate.min, 0)}–${fmtNum(
              summary.heart_rate.max,
              0,
            )}`
          : 'No HR readings',
      color: '#f87171',
    },
    {
      label: 'Avg Sleep Duration',
      value:
        summary?.sleep.avg_hours != null
          ? `${fmtNum(summary.sleep.avg_hours, 1)} h`
          : '—',
      sub:
        summary?.sleep.nights_below_6
          ? `${summary.sleep.nights_below_6} night(s) under 6h`
          : 'Recommended: 7–9h',
      color: '#a78bfa',
    },
    {
      label: 'Avg Daily Steps',
      value:
        summary?.steps.daily_avg != null
          ? fmtNum(summary.steps.daily_avg, 0)
          : '—',
      sub:
        summary?.steps.days_above_8000
          ? `${summary.steps.days_above_8000} day(s) ≥ 8,000 steps`
          : 'Target: 10,000/day',
      color: '#34d399',
    },
    {
      label: 'Avg SpO2',
      value:
        summary?.spo2.avg != null
          ? `${fmtNum(summary.spo2.avg, 1)}%`
          : '—',
      sub:
        summary && summary.spo2.readings_below_94.length > 0
          ? `${summary.spo2.readings_below_94.length} reading(s) below 94%`
          : 'Normal: 95–100%',
      color: '#60a5fa',
    },
    {
      label: 'Latest Weight',
      value:
        summary?.weight.latest_kg != null
          ? `${fmtNum(summary.weight.latest_kg, 1)} kg`
          : '—',
      sub:
        summary?.weight.change_kg != null
          ? `${
              summary.weight.change_kg > 0 ? '+' : ''
            }${summary.weight.change_kg.toFixed(1)} kg over period`
          : 'No trend data',
      color: '#fbbf24',
    },
    {
      label: 'Blood Glucose',
      value:
        glucoseAvg != null ? `${fmtNum(glucoseAvg, 1)} (avg)` : '—',
      sub: hasGlucose
        ? `${summary!.blood_glucose.readings.length} reading(s)`
        : 'No readings on file',
      color: '#fb923c',
    },
  ];

  return (
    <div className="glass-card" style={{ padding: '22px 22px' }}>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          marginBottom: 14,
        }}
      >
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            flexWrap: 'wrap',
          }}
        >
          <span
            style={{
              padding: '4px 12px',
              borderRadius: 999,
              fontSize: '0.74rem',
              fontWeight: 700,
              background: `${meta.color}20`,
              color: meta.color,
              border: `1px solid ${meta.color}40`,
            }}
          >
            {meta.icon ? `${meta.icon} ` : ''}
            {meta.label}
          </span>
          <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)' }}>
            {fmtRange(record.date_range_start, record.date_range_end)}
          </span>
        </div>
        <span style={{ fontSize: '0.74rem', color: 'var(--text-muted)' }}>
          Uploaded {fmtUploadedAt(record.upload_date)}
        </span>
      </div>

      {/* Parser warnings (if any) */}
      {summary && summary.errors && summary.errors.length > 0 && (
        <div
          style={{
            padding: '10px 14px',
            borderRadius: 10,
            background: 'rgba(245,158,11,0.08)',
            border: '1px solid rgba(245,158,11,0.3)',
            color: '#fbbf24',
            fontSize: '0.82rem',
            marginBottom: 14,
          }}
        >
          ⚠ The parser found some issues but extracted what it could:
          <ul style={{ margin: '6px 0 0 18px' }}>
            {summary.errors.slice(0, 3).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Metric grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: 12,
          marginBottom: 18,
        }}
      >
        {tiles.map((t) => (
          <div
            key={t.label}
            style={{
              padding: '14px 16px',
              borderRadius: 12,
              background: 'rgba(15,30,60,0.4)',
              border: '1px solid var(--border-subtle)',
            }}
          >
            <div
              style={{
                fontSize: '0.68rem',
                fontWeight: 700,
                textTransform: 'uppercase',
                letterSpacing: '0.4px',
                color: t.color || 'var(--brand-teal)',
                marginBottom: 6,
              }}
            >
              {t.label}
            </div>
            <div style={{ fontSize: '1.4rem', fontWeight: 800 }}>
              {t.value}
            </div>
            {t.sub && (
              <div
                style={{
                  fontSize: '0.74rem',
                  color: 'var(--text-muted)',
                  marginTop: 4,
                }}
              >
                {t.sub}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* AI narrative */}
      {record.ai_narrative && (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 12,
            background: 'rgba(13,148,136,0.06)',
            border: '1px solid rgba(13,148,136,0.25)',
            marginBottom: 14,
          }}
        >
          <div
            style={{
              fontSize: '0.74rem',
              fontWeight: 700,
              color: 'var(--brand-teal)',
              marginBottom: 6,
              textTransform: 'uppercase',
              letterSpacing: '0.4px',
            }}
          >
            🩺 What Your Data Shows
          </div>
          <p
            style={{
              fontSize: '0.92rem',
              lineHeight: 1.6,
              color: 'var(--text-primary)',
              margin: 0,
            }}
          >
            {record.ai_narrative}
          </p>
        </div>
      )}

      {/* Key findings — collapsible */}
      {record.key_findings && record.key_findings.length > 0 && (
        <div
          style={{
            padding: '14px 16px',
            borderRadius: 12,
            background: 'rgba(15,30,60,0.4)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <button
            type="button"
            onClick={onToggleFindings}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              width: '100%',
              background: 'transparent',
              border: 'none',
              color: 'inherit',
              padding: 0,
              cursor: 'pointer',
              fontSize: '0.9rem',
              fontWeight: 700,
              marginBottom: findingsOpen ? 8 : 0,
            }}
          >
            <span>📌 Key Findings ({record.key_findings.length})</span>
            <span
              style={{
                color: 'var(--brand-teal)',
                fontSize: '1rem',
                transform: findingsOpen ? 'rotate(45deg)' : 'rotate(0)',
                transition: 'transform 0.2s',
              }}
            >
              +
            </span>
          </button>
          {findingsOpen && (
            <ul
              style={{
                margin: 0,
                paddingLeft: 20,
                fontSize: '0.88rem',
                lineHeight: 1.55,
                color: 'var(--text-secondary)',
              }}
            >
              {record.key_findings.map((f, i) => (
                <li key={i} style={{ marginBottom: 4 }}>
                  {f}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

function ExportInstructions({ onClose }: { onClose: () => void }) {
  return (
    <div
      onClick={onClose}
      style={{
        position: 'fixed',
        inset: 0,
        background: 'rgba(2, 6, 23, 0.7)',
        zIndex: 1000,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 16,
      }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="glass-card"
        style={{
          maxWidth: 600,
          width: '100%',
          padding: '26px 28px',
          maxHeight: '90vh',
          overflowY: 'auto',
        }}
      >
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginBottom: 14,
          }}
        >
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
            How to export your health data
          </h3>
          <button
            onClick={onClose}
            style={{
              background: 'transparent',
              border: 'none',
              color: 'var(--text-muted)',
              fontSize: '1.4rem',
              cursor: 'pointer',
            }}
          >
            ✕
          </button>
        </div>

        <Section title=" Apple Health (iPhone)">
          <ol style={olStyle}>
            <li>Open the <strong>Health</strong> app on your iPhone.</li>
            <li>Tap your profile photo in the top-right corner.</li>
            <li>Scroll down and tap <strong>Export All Health Data</strong>.</li>
            <li>Tap <strong>Export</strong> — a ZIP archive will be prepared (this takes a few minutes).</li>
            <li>Share / save the resulting <code>export.zip</code>, then upload it here.</li>
          </ol>
        </Section>

        <Section title="⌚ Fitbit">
          <ol style={olStyle}>
            <li>Sign in at <code>fitbit.com</code> on a desktop browser.</li>
            <li>Click your profile icon → <strong>Settings</strong> → <strong>Data Export</strong>.</li>
            <li>Choose <strong>Export Your Account Archive</strong> — Fitbit emails you a ZIP when it's ready.</li>
            <li>Upload the ZIP here, or upload a single per-metric JSON (e.g. <code>heart_rate-2025-04-12.json</code>).</li>
          </ol>
        </Section>

        <Section title="🟢 Google Fit">
          <ol style={olStyle}>
            <li>Go to <code>takeout.google.com</code> while signed in.</li>
            <li>Click <strong>Deselect all</strong>, then check <strong>Fit</strong>.</li>
            <li>At the bottom, choose <strong>Export once</strong> → <strong>.zip</strong> → <strong>Create export</strong>.</li>
            <li>Once the email arrives, download and upload the ZIP here.</li>
          </ol>
        </Section>

        <p
          style={{
            fontSize: '0.78rem',
            color: 'var(--text-muted)',
            marginTop: 16,
            lineHeight: 1.55,
          }}
        >
          We never store the raw export — only the parsed summary, AI
          narrative, and key findings end up in your record.
        </p>
      </div>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div style={{ marginBottom: 18 }}>
      <h4
        style={{
          fontSize: '0.92rem',
          fontWeight: 800,
          marginBottom: 8,
          color: 'var(--brand-teal)',
        }}
      >
        {title}
      </h4>
      {children}
    </div>
  );
}

const olStyle: React.CSSProperties = {
  paddingLeft: 20,
  margin: 0,
  fontSize: '0.86rem',
  lineHeight: 1.6,
  color: 'var(--text-secondary)',
};
