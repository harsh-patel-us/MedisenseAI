
import type { Specialist, UrgencyLevel } from '../../types/patient.types';

interface SpecialistGuideProps {
  specialists: Specialist[];
  urgency: UrgencyLevel;
  urgencyReason: string;
}

const URGENCY_LABELS: Record<UrgencyLevel, { label: string; icon: string }> = {
  routine: { label: 'Routine', icon: '🟢' },
  within_1_week: { label: 'Within 1 Week', icon: '🟡' },
  go_today: { label: 'Go Today!', icon: '🔴' },
};

export default function SpecialistGuide({ specialists, urgency, urgencyReason }: SpecialistGuideProps) {
  const urgencyInfo = URGENCY_LABELS[urgency] || URGENCY_LABELS.routine;

  return (
    <div>
      {/* Urgency Banner */}
      <div
        className={`glass-card`}
        style={{
          padding: '20px 24px',
          marginBottom: '20px',
          borderColor: urgency === 'go_today' ? 'rgba(220, 38, 38, 0.4)' : undefined,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '8px' }}>
          <span style={{ fontSize: '1.5rem' }}>{urgencyInfo.icon}</span>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <span style={{ fontSize: '1rem', fontWeight: 700 }}>Urgency Level</span>
              <span className={`badge badge-${urgency}`}>{urgencyInfo.label}</span>
            </div>
          </div>
        </div>
        {urgencyReason && (
          <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', marginTop: '8px' }}>
            {urgencyReason}
          </p>
        )}
      </div>

      {/* Specialist Cards */}
      <div style={{ display: 'grid', gap: '14px' }}>
        {specialists.map((sp, i) => (
          <div key={i} className="specialist-card">
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: '14px' }}>
              <div style={{
                width: '44px', height: '44px',
                borderRadius: '12px',
                background: 'var(--gradient-brand)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '1.2rem', flexShrink: 0,
              }}>
                🏥
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '6px' }}>
                  <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>{sp.type}</h3>
                  <span style={{
                    fontSize: '0.7rem', fontWeight: 600,
                    padding: '2px 8px', borderRadius: '8px',
                    background: 'rgba(5, 174, 187, 0.15)', color: 'var(--brand-teal)',
                  }}>
                    Priority #{sp.priority}
                  </span>
                </div>
                <p style={{ fontSize: '0.88rem', color: 'var(--text-secondary)', lineHeight: 1.5 }}>
                  {sp.reason}
                </p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {specialists.length === 0 && (
        <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
          <p style={{ fontSize: '1.5rem', marginBottom: '8px' }}>👨‍⚕️</p>
          <p>No specialist recommendations at this time.</p>
          <p style={{ fontSize: '0.82rem', marginTop: '6px' }}>Consider a routine checkup with your general physician.</p>
        </div>
      )}
    </div>
  );
}
