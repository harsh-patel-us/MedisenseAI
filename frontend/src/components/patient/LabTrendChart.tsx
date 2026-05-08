import { useEffect, useMemo, useState } from 'react';
import { getBiomarkerTrends } from '../../api/patientApi';
import type {
  BiomarkerReading,
  BiomarkerStatus,
  BiomarkerTrend,
  BiomarkerTrendDirection,
  LabTrendChartProps,
} from '../../types/patient.types';

const TEAL = '#05aebb';

// Y-axis is normalized per biomarker so very different ranges (HbA1c at
// ~5 vs WBC at ~7000) all fit cleanly. Reference range lines are drawn
// when the latest reading carries one. Single-data-point series collapse
// to a centered dot with the explanatory message.

const CHART_HEIGHT = 220;
const CHART_PADDING_X = 36;
const CHART_PADDING_TOP = 16;
const CHART_PADDING_BOTTOM = 32;

function statusColor(status: BiomarkerStatus): string {
  if (status === 'critical') return '#dc2626'; // red
  if (status === 'high' || status === 'low') return '#eab308'; // yellow
  return '#22c55e'; // green / normal
}

function trendBadge(trend: BiomarkerTrendDirection): {
  label: string;
  bg: string;
  border: string;
  text: string;
} {
  switch (trend) {
    case 'improving':
      return {
        label: '↑ Improving',
        bg: 'rgba(34, 197, 94, 0.18)',
        border: 'rgba(34, 197, 94, 0.55)',
        text: '#86efac',
      };
    case 'worsening':
      return {
        label: '↓ Worsening',
        bg: 'rgba(220, 38, 38, 0.18)',
        border: 'rgba(220, 38, 38, 0.55)',
        text: '#fca5a5',
      };
    case 'stable':
      return {
        label: '→ Stable',
        bg: 'rgba(5, 174, 187, 0.18)',
        border: 'rgba(5, 174, 187, 0.55)',
        text: '#a5f3fc',
      };
    default:
      return {
        label: '✦ New baseline',
        bg: 'rgba(148, 163, 184, 0.16)',
        border: 'rgba(148, 163, 184, 0.45)',
        text: 'var(--text-muted)',
      };
  }
}

function formatDateLabel(reading: BiomarkerReading, index: number): string {
  const raw = reading.report_date || reading.created_at || '';
  if (!raw) return `#${index + 1}`;
  const d = new Date(raw);
  if (Number.isNaN(d.getTime())) return raw;
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function formatValue(value: number | null | undefined): string {
  if (value === null || value === undefined || Number.isNaN(value)) return '—';
  if (Math.abs(value) >= 1000) return Math.round(value).toLocaleString();
  if (Math.abs(value) >= 100) return value.toFixed(0);
  if (Math.abs(value) >= 10) return value.toFixed(1);
  return value.toFixed(2);
}

function formatRange(min: number | null, max: number | null, unit: string): string {
  if (min === null && max === null) return '—';
  if (min !== null && max !== null) return `${formatValue(min)} – ${formatValue(max)} ${unit}`.trim();
  if (min !== null) return `≥ ${formatValue(min)} ${unit}`.trim();
  return `≤ ${formatValue(max!)} ${unit}`.trim();
}

export default function LabTrendChart({ patientId }: LabTrendChartProps) {
  const [trends, setTrends] = useState<BiomarkerTrend[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError(null);
    (async () => {
      try {
        const res = await getBiomarkerTrends(patientId);
        if (cancelled) return;
        setTrends(res.biomarkers);
        if (res.biomarkers.length && !selected) {
          setSelected(res.biomarkers[0].biomarker_name);
        }
      } catch (err) {
        if (cancelled) return;
        console.error('Biomarker trends fetch failed', err);
        setError('Could not load your lab trends.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  const activeTrend = useMemo(
    () => trends.find((t) => t.biomarker_name === selected) || trends[0] || null,
    [trends, selected],
  );

  if (loading) {
    return (
      <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>
        <div className="spinner" style={{ margin: '0 auto 16px' }} />
        Loading your lab trends…
      </div>
    );
  }

  if (error) {
    return (
      <div
        style={{
          padding: '14px 16px',
          borderRadius: 10,
          background: 'rgba(220, 38, 38, 0.12)',
          border: '1px solid rgba(220, 38, 38, 0.3)',
          color: '#fca5a5',
          fontSize: '0.88rem',
        }}
      >
        ⚠️ {error}
      </div>
    );
  }

  if (trends.length === 0) {
    return (
      <div
        className="glass-card"
        style={{
          padding: 32,
          textAlign: 'center',
          color: 'var(--text-muted)',
          fontSize: '0.92rem',
          lineHeight: 1.55,
        }}
      >
        📈 No biomarker data yet. Upload a lab report to start tracking your
        levels over time.
      </div>
    );
  }

  return (
    <div
      style={{
        display: 'grid',
        gridTemplateColumns: 'minmax(220px, 280px) 1fr',
        gap: 18,
        alignItems: 'stretch',
      }}
    >
      {/* ── Sidebar ─────────────────────────────────────────────────── */}
      <aside
        className="glass-card"
        style={{
          padding: 14,
          maxHeight: 480,
          overflowY: 'auto',
          display: 'flex',
          flexDirection: 'column',
          gap: 6,
        }}
      >
        <div
          style={{
            fontSize: '0.72rem',
            fontWeight: 800,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            color: 'var(--text-muted)',
            padding: '4px 6px 8px',
          }}
        >
          Biomarkers ({trends.length})
        </div>
        {trends.map((t) => {
          const active = t.biomarker_name === activeTrend?.biomarker_name;
          const dot = statusColor(t.latest_status);
          return (
            <button
              key={t.biomarker_name}
              type="button"
              onClick={() => setSelected(t.biomarker_name)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                padding: '10px 12px',
                background: active ? 'rgba(5,174,187,0.15)' : 'transparent',
                border: 'none',
                borderLeft: `3px solid ${active ? TEAL : 'transparent'}`,
                borderRadius: 8,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                textAlign: 'left',
                width: '100%',
              }}
            >
              <span
                style={{
                  width: 10,
                  height: 10,
                  borderRadius: '50%',
                  background: dot,
                  flexShrink: 0,
                  boxShadow: `0 0 6px ${dot}88`,
                }}
              />
              <span
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: '0.86rem',
                  fontWeight: 600,
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}
              >
                {t.biomarker_name}
              </span>
              <span
                style={{
                  fontSize: '0.72rem',
                  color: 'var(--text-muted)',
                  flexShrink: 0,
                }}
              >
                {t.history.length}×
              </span>
            </button>
          );
        })}
      </aside>

      {/* ── Chart panel ─────────────────────────────────────────────── */}
      <section
        className="glass-card"
        style={{ padding: 22, display: 'flex', flexDirection: 'column', gap: 16 }}
      >
        {activeTrend && <TrendDetail trend={activeTrend} />}
      </section>
    </div>
  );
}

/* ── Trend detail (header + chart) ────────────────────────────────── */

function TrendDetail({ trend }: { trend: BiomarkerTrend }) {
  const badge = trendBadge(trend.trend);
  const latestColor = statusColor(trend.latest_status);

  return (
    <>
      {/* Header */}
      <div
        style={{
          display: 'flex',
          alignItems: 'flex-start',
          justifyContent: 'space-between',
          gap: 12,
          flexWrap: 'wrap',
        }}
      >
        <div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
            {trend.biomarker_name}
          </h3>
          <div
            style={{
              fontSize: '0.78rem',
              color: 'var(--text-muted)',
              marginTop: 4,
            }}
          >
            Reference: {formatRange(trend.reference_min, trend.reference_max, trend.unit)}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 10,
              background: 'rgba(15,30,60,0.55)',
              border: `1.5px solid ${latestColor}`,
            }}
          >
            <div
              style={{
                fontSize: '0.7rem',
                fontWeight: 800,
                letterSpacing: '0.4px',
                textTransform: 'uppercase',
                color: 'var(--text-muted)',
              }}
            >
              Latest
            </div>
            <div style={{ fontSize: '1.05rem', fontWeight: 800, color: latestColor }}>
              {formatValue(trend.latest_value)} {trend.unit}
            </div>
          </div>
          <div
            style={{
              padding: '8px 12px',
              borderRadius: 999,
              background: badge.bg,
              border: `1px solid ${badge.border}`,
              color: badge.text,
              fontSize: '0.82rem',
              fontWeight: 800,
              letterSpacing: '0.4px',
            }}
          >
            {badge.label}
            {trend.percent_change !== null && trend.percent_change !== undefined && (
              <span style={{ marginLeft: 8, opacity: 0.85 }}>
                {trend.percent_change > 0 ? '+' : ''}
                {trend.percent_change}%
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Chart or single-point note */}
      {trend.history.length === 0 ? (
        <div
          style={{
            padding: 20,
            textAlign: 'center',
            color: 'var(--text-muted)',
            fontSize: '0.88rem',
          }}
        >
          No readings on file for this biomarker.
        </div>
      ) : trend.history.length === 1 ? (
        <SinglePointChart trend={trend} />
      ) : (
        <SvgLineChart trend={trend} />
      )}
    </>
  );
}

/* ── Single-point: just show the dot + the explanatory message ─────── */

function SinglePointChart({ trend }: { trend: BiomarkerTrend }) {
  const reading = trend.history[0];
  const color = statusColor(reading.status);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 14,
        minHeight: 220,
        background: 'rgba(15,30,60,0.35)',
        borderRadius: 12,
        padding: 24,
      }}
    >
      <div
        style={{
          width: 44,
          height: 44,
          borderRadius: '50%',
          background: color,
          boxShadow: `0 0 18px ${color}aa`,
        }}
      />
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '1rem', fontWeight: 700 }}>
          {formatValue(reading.value)} {reading.unit}
        </div>
        <div style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
          {formatDateLabel(reading, 0)}
        </div>
      </div>
      <div
        style={{
          fontSize: '0.86rem',
          color: 'var(--text-secondary)',
          textAlign: 'center',
          maxWidth: 420,
        }}
      >
        Upload another report to see your trend over time.
      </div>
    </div>
  );
}

/* ── Pure-SVG line chart ───────────────────────────────────────────── */

function SvgLineChart({ trend }: { trend: BiomarkerTrend }) {
  const readings = trend.history;
  const refMin = trend.reference_min;
  const refMax = trend.reference_max;

  // Build the Y-axis range from the data plus reference lines so both
  // the points AND the reference dashes are always visible.
  const values = readings.map((r) => r.value);
  const candidates = [...values];
  if (refMin !== null && refMin !== undefined) candidates.push(refMin);
  if (refMax !== null && refMax !== undefined) candidates.push(refMax);

  const dataMin = Math.min(...candidates);
  const dataMax = Math.max(...candidates);
  // Add a 10% padding so points don't sit on the chart edges.
  const span = Math.max(dataMax - dataMin, Math.abs(dataMax) * 0.05, 1);
  const yMin = dataMin - span * 0.1;
  const yMax = dataMax + span * 0.1;

  const width = 640;
  const innerWidth = width - CHART_PADDING_X * 2;
  const innerHeight = CHART_HEIGHT - CHART_PADDING_TOP - CHART_PADDING_BOTTOM;

  const xAt = (i: number): number => {
    if (readings.length === 1) return CHART_PADDING_X + innerWidth / 2;
    return CHART_PADDING_X + (i / (readings.length - 1)) * innerWidth;
  };
  const yAt = (v: number): number => {
    const t = (v - yMin) / (yMax - yMin);
    return CHART_PADDING_TOP + (1 - t) * innerHeight;
  };

  const linePath = readings
    .map((r, i) => `${i === 0 ? 'M' : 'L'} ${xAt(i).toFixed(2)} ${yAt(r.value).toFixed(2)}`)
    .join(' ');

  // Subtle area fill under the line (uses the brand teal).
  const areaPath =
    `M ${xAt(0).toFixed(2)} ${yAt(readings[0].value).toFixed(2)} ` +
    readings
      .slice(1)
      .map((r, i) => `L ${xAt(i + 1).toFixed(2)} ${yAt(r.value).toFixed(2)}`)
      .join(' ') +
    ` L ${xAt(readings.length - 1).toFixed(2)} ${yAt(yMin).toFixed(2)}` +
    ` L ${xAt(0).toFixed(2)} ${yAt(yMin).toFixed(2)} Z`;

  return (
    <div style={{ width: '100%', overflowX: 'auto' }}>
      <svg
        role="img"
        aria-label={`Trend chart for ${trend.biomarker_name}`}
        viewBox={`0 0 ${width} ${CHART_HEIGHT}`}
        style={{ width: '100%', minWidth: 400, height: CHART_HEIGHT }}
      >
        {/* Reference range lines */}
        {refMin !== null && refMin !== undefined && (
          <g>
            <line
              x1={CHART_PADDING_X}
              x2={width - CHART_PADDING_X}
              y1={yAt(refMin)}
              y2={yAt(refMin)}
              stroke="rgba(34, 197, 94, 0.45)"
              strokeWidth={1.2}
              strokeDasharray="6 5"
            />
            <text
              x={width - CHART_PADDING_X + 4}
              y={yAt(refMin) + 3}
              fontSize={9}
              fill="rgba(34, 197, 94, 0.8)"
            >
              min
            </text>
          </g>
        )}
        {refMax !== null && refMax !== undefined && (
          <g>
            <line
              x1={CHART_PADDING_X}
              x2={width - CHART_PADDING_X}
              y1={yAt(refMax)}
              y2={yAt(refMax)}
              stroke="rgba(220, 38, 38, 0.45)"
              strokeWidth={1.2}
              strokeDasharray="6 5"
            />
            <text
              x={width - CHART_PADDING_X + 4}
              y={yAt(refMax) + 3}
              fontSize={9}
              fill="rgba(220, 38, 38, 0.8)"
            >
              max
            </text>
          </g>
        )}

        {/* Y axis labels (min/max only — keeps the chart clean). */}
        <text
          x={CHART_PADDING_X - 6}
          y={yAt(yMax) + 3}
          fontSize={9}
          fill="rgba(255,255,255,0.55)"
          textAnchor="end"
        >
          {formatValue(yMax)}
        </text>
        <text
          x={CHART_PADDING_X - 6}
          y={yAt(yMin) + 3}
          fontSize={9}
          fill="rgba(255,255,255,0.55)"
          textAnchor="end"
        >
          {formatValue(yMin)}
        </text>

        {/* Trend area + line */}
        <path d={areaPath} fill="url(#trend-grad)" opacity={0.25} />
        <defs>
          <linearGradient id="trend-grad" x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor={TEAL} stopOpacity="0.6" />
            <stop offset="100%" stopColor={TEAL} stopOpacity="0" />
          </linearGradient>
        </defs>
        <path
          d={linePath}
          fill="none"
          stroke={TEAL}
          strokeWidth={2}
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {/* Data points */}
        {readings.map((r, i) => {
          const cx = xAt(i);
          const cy = yAt(r.value);
          const color = statusColor(r.status);
          return (
            <g key={r.id}>
              <circle cx={cx} cy={cy} r={6} fill={color} stroke="#0b1426" strokeWidth={2}>
                <title>
                  {`${formatValue(r.value)} ${r.unit} on ${formatDateLabel(r, i)} (${r.status})`}
                </title>
              </circle>
              <text
                x={cx}
                y={CHART_HEIGHT - CHART_PADDING_BOTTOM + 16}
                fontSize={10}
                textAnchor="middle"
                fill="rgba(255,255,255,0.6)"
              >
                {formatDateLabel(r, i)}
              </text>
            </g>
          );
        })}
      </svg>
    </div>
  );
}
