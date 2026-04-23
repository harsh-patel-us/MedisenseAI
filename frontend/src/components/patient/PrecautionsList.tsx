
import type { Precautions } from '../../types/patient.types';

interface PrecautionsListProps {
  precautions: Precautions;
}

export default function PrecautionsList({ precautions }: PrecautionsListProps) {
  return (
    <div>
      {/* Daily Habits */}
      {precautions.daily_habits.length > 0 && (
        <div className="glass-card" style={{ padding: '24px', marginBottom: '16px' }}>
          <h3 style={{
            fontSize: '1rem', fontWeight: 700, marginBottom: '14px',
            display: 'flex', alignItems: 'center', gap: '10px',
          }}>
            📅 Daily Habits
          </h3>
          {precautions.daily_habits.map((habit, i) => (
            <div
              key={i}
              className="lifestyle-item"
              style={{ borderLeftColor: 'rgba(5, 174, 187, 0.4)', borderLeftWidth: '3px' }}
            >
              <span style={{ fontSize: '0.9rem' }}>• {habit}</span>
            </div>
          ))}
        </div>
      )}

      {/* Lifestyle Warnings */}
      {precautions.lifestyle_warnings.length > 0 && (
        <div className="glass-card" style={{
          padding: '24px', marginBottom: '16px',
          borderColor: 'rgba(245, 158, 11, 0.2)',
        }}>
          <h3 style={{
            fontSize: '1rem', fontWeight: 700, marginBottom: '14px',
            display: 'flex', alignItems: 'center', gap: '10px',
            color: '#fbbf24',
          }}>
            ⚠️ Lifestyle Warnings
          </h3>
          {precautions.lifestyle_warnings.map((warning, i) => (
            <div
              key={i}
              className="lifestyle-item"
              style={{
                borderLeftColor: 'rgba(245, 158, 11, 0.4)', borderLeftWidth: '3px',
                background: 'rgba(245, 158, 11, 0.04)',
              }}
            >
              <span style={{ fontSize: '0.9rem', color: '#fde68a' }}>⚠ {warning}</span>
            </div>
          ))}
        </div>
      )}

      {/* Emergency Signs */}
      {precautions.emergency_signs.length > 0 && (
        <div style={{
          padding: '24px',
          background: 'rgba(220, 38, 38, 0.06)',
          border: '1px solid rgba(220, 38, 38, 0.25)',
          borderRadius: '14px',
        }}>
          <h3 style={{
            fontSize: '1rem', fontWeight: 700, marginBottom: '14px',
            display: 'flex', alignItems: 'center', gap: '10px',
            color: '#f87171',
          }}>
            🚨 Emergency — Go to ER Immediately
          </h3>
          {precautions.emergency_signs.map((sign, i) => (
            <div
              key={i}
              className="lifestyle-item"
              style={{
                borderLeftColor: 'rgba(220, 38, 38, 0.5)', borderLeftWidth: '3px',
                background: 'rgba(220, 38, 38, 0.06)',
              }}
            >
              <span style={{ fontSize: '0.9rem', color: '#fca5a5', fontWeight: 600 }}>
                🚨 {sign}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
