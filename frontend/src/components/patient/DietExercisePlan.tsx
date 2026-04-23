
import type { DietPlan, ExerciseItem } from '../../types/patient.types';

interface DietExercisePlanProps {
  dietPlan: DietPlan;
  exercisePlan: ExerciseItem[];
  exercisesToAvoid: string[];
}

export default function DietExercisePlanComponent({
  dietPlan,
  exercisePlan,
  exercisesToAvoid,
}: DietExercisePlanProps) {
  return (
    <div>
      {/* Diet Section */}
      <div className="glass-card" style={{ padding: '24px', marginBottom: '20px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          🥗 Diet Plan
        </h3>

        {/* Foods to eat */}
        {dietPlan.foods_to_eat.length > 0 && (
          <div style={{ marginBottom: '20px' }}>
            <h4 style={{
              fontSize: '0.85rem', fontWeight: 700, color: '#4ade80',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
            }}>
              ✓ Foods to Eat
            </h4>
            {dietPlan.foods_to_eat.map((item, i) => (
              <div key={i} className="lifestyle-item">
                <div className="lifestyle-icon icon-eat">✓</div>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{item.food}</span>
                  {item.how_much && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--brand-teal)', marginLeft: '8px' }}>
                      ({item.how_much})
                    </span>
                  )}
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {item.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Foods to avoid */}
        {dietPlan.foods_to_avoid.length > 0 && (
          <div style={{ marginBottom: '16px' }}>
            <h4 style={{
              fontSize: '0.85rem', fontWeight: 700, color: '#f87171',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
            }}>
              ✗ Foods to Avoid
            </h4>
            {dietPlan.foods_to_avoid.map((item, i) => (
              <div key={i} className="lifestyle-item">
                <div className="lifestyle-icon icon-avoid">✗</div>
                <div>
                  <span style={{ fontWeight: 600, fontSize: '0.92rem' }}>{item.food}</span>
                  <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)', marginTop: '2px' }}>
                    {item.reason}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Meal timing */}
        {dietPlan.meal_timing_tips && (
          <div style={{
            padding: '14px 16px', background: 'rgba(5, 174, 187, 0.06)',
            borderRadius: '10px', border: '1px solid rgba(5, 174, 187, 0.15)',
          }}>
            <span style={{ fontSize: '0.82rem', fontWeight: 600, color: 'var(--brand-teal)' }}>
              ⏰ Meal Timing:
            </span>
            <span style={{ fontSize: '0.85rem', color: 'var(--text-secondary)', marginLeft: '8px' }}>
              {dietPlan.meal_timing_tips}
            </span>
          </div>
        )}
      </div>

      {/* Exercise Section */}
      <div className="glass-card" style={{ padding: '24px' }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 700, marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '10px' }}>
          🏃 Exercise Plan
        </h3>

        {exercisePlan.map((ex, i) => (
          <div key={i} className="lifestyle-item">
            <div className="lifestyle-icon icon-exercise">🏋</div>
            <div style={{ flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap', marginBottom: '4px' }}>
                <span style={{ fontWeight: 700, fontSize: '0.95rem' }}>{ex.activity}</span>
                <span className="badge badge-normal" style={{ fontSize: '0.68rem' }}>
                  {ex.duration} • {ex.frequency}
                </span>
              </div>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-secondary)' }}>{ex.benefit}</p>
              {ex.caution && (
                <p style={{ fontSize: '0.78rem', color: '#fbbf24', marginTop: '4px' }}>
                  ⚠ {ex.caution}
                </p>
              )}
            </div>
          </div>
        ))}

        {/* Exercises to avoid */}
        {exercisesToAvoid.length > 0 && (
          <div style={{ marginTop: '16px' }}>
            <h4 style={{
              fontSize: '0.85rem', fontWeight: 700, color: '#f87171',
              textTransform: 'uppercase', letterSpacing: '0.5px', marginBottom: '10px',
            }}>
              ✗ Exercises to Avoid
            </h4>
            {exercisesToAvoid.map((ex, i) => (
              <div key={i} className="lifestyle-item">
                <div className="lifestyle-icon icon-avoid">✗</div>
                <span style={{ fontSize: '0.88rem' }}>{ex}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
