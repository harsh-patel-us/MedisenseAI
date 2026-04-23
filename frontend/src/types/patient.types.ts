export interface Finding {
  test_name: string;
  patient_value: string;
  unit: string;
  reference_range: string;
  status: 'low' | 'high' | 'normal';
  flag: boolean;
}

export interface Specialist {
  type: string;
  reason: string;
  priority: number;
}

export type UrgencyLevel = 'routine' | 'within_1_week' | 'go_today';

export interface DietItem {
  food: string;
  reason: string;
  how_much?: string;
}

export interface AvoidItem {
  food: string;
  reason: string;
}

export interface ExerciseItem {
  activity: string;
  duration: string;
  frequency: string;
  benefit: string;
  caution?: string;
}

export interface DietPlan {
  foods_to_eat: DietItem[];
  foods_to_avoid: AvoidItem[];
  meal_timing_tips: string;
}

export interface Precautions {
  daily_habits: string[];
  lifestyle_warnings: string[];
  emergency_signs: string[];
}

export interface PatientAnalysis {
  report_type: string;
  findings: Finding[];
  conditions_suggested: string[];
  critical_alerts: string[];
  plain_summary: string;
  what_this_means: string;
  specialists: Specialist[];
  urgency: UrgencyLevel;
  urgency_reason: string;
  diet_plan: DietPlan;
  exercise_plan: ExerciseItem[];
  exercises_to_avoid: string[];
  precautions: Precautions;
}

export interface UploadResponse {
  file_id: string;
  file_name: string;
  raw_text: string;
  file_type: string;
  char_count: number;
}
