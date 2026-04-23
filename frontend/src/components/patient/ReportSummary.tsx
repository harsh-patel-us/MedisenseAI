
import type { Finding } from '../../types/patient.types';

interface ReportSummaryProps {
  findings: Finding[];
  plainSummary: string;
  whatThisMeans: string;
  criticalAlerts: string[];
}

export default function ReportSummary({ findings, plainSummary, whatThisMeans, criticalAlerts }: ReportSummaryProps) {
  return (
    <div>
      {/* Critical alerts */}
      {criticalAlerts.length > 0 && (
        <div style={{
          marginBottom: '20px', padding: '16px 20px',
          background: 'rgba(220, 38, 38, 0.1)', border: '1px solid rgba(220, 38, 38, 0.3)',
          borderRadius: '12px',
        }}>
          <h3 style={{ fontSize: '0.95rem', color: '#f87171', fontWeight: 700, marginBottom: '8px' }}>
            🚨 Critical Alerts
          </h3>
          {criticalAlerts.map((alert, i) => (
            <p key={i} style={{ fontSize: '0.88rem', color: '#fca5a5', marginBottom: '4px' }}>
              • {alert}
            </p>
          ))}
        </div>
      )}

      {/* Summary */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700, marginBottom: '12px', color: 'var(--brand-teal)' }}>
          📋 Summary
        </h3>
        <p style={{ fontSize: '0.95rem', lineHeight: 1.7, marginBottom: '12px' }}>{plainSummary}</p>
        {whatThisMeans && (
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.6 }}>
            {whatThisMeans}
          </p>
        )}
      </div>

      {/* Findings table */}
      {findings.length > 0 && (
        <div style={{ overflowX: 'auto' }}>
          <table className="findings-table" id="findings-table">
            <thead>
              <tr>
                <th>Test Name</th>
                <th>Your Value</th>
                <th>Normal Range</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {findings.map((f, i) => (
                <tr key={i}>
                  <td style={{ fontWeight: 600 }}>{f.test_name}</td>
                  <td>
                    {f.patient_value} {f.unit}
                  </td>
                  <td style={{ color: 'var(--text-secondary)' }}>{f.reference_range}</td>
                  <td>
                    <span className={`badge badge-${f.status}`}>
                      {f.status === 'high' ? '↑ HIGH' : f.status === 'low' ? '↓ LOW' : '✓ Normal'}
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
