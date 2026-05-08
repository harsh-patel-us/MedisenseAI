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

export interface HistoryItem {
  id: string;
  created_at: string;
  file_name: string;
  file_type: string;
  file_size: number | null;
  summary: string;
  urgency: string;
  has_uploaded_file: boolean;
  has_generated_pdf: boolean;
  generated_pdf_size: number | null;
}

export interface HistoryListResponse {
  patient_id: string;
  items: HistoryItem[];
}

export interface HistoryDetail {
  id: string;
  created_at: string;
  file_name: string;
  file_type: string;
  file_size: number | null;
  summary: string;
  urgency: string;
  findings: Finding[];
  specialists: Specialist[];
  diet_plan: DietPlan;
  exercise_plan: ExerciseItem[];
  precautions: Precautions;
  has_uploaded_file: boolean;
  has_generated_pdf: boolean;
  generated_pdf_size: number | null;
}

// ── Lab biomarker trends ─────────────────────────────────────────────

export type BiomarkerStatus = 'normal' | 'low' | 'high' | 'critical' | string;
export type BiomarkerTrendDirection =
  | 'improving'
  | 'worsening'
  | 'stable'
  | 'new'
  | string;

export interface BiomarkerReading {
  id: string;
  biomarker_name: string;
  value: number;
  unit: string;
  reference_min: number | null;
  reference_max: number | null;
  status: BiomarkerStatus;
  report_date: string | null;
  created_at: string | null;
  analysis_record_id: string | null;
}

export interface BiomarkerTrend {
  biomarker_name: string;
  unit: string;
  reference_min: number | null;
  reference_max: number | null;
  latest_value: number | null;
  previous_value: number | null;
  latest_status: BiomarkerStatus;
  trend: BiomarkerTrendDirection;
  percent_change: number | null;
  history: BiomarkerReading[];
}

export interface BiomarkerTrendResponse {
  patient_id: string;
  biomarkers: BiomarkerTrend[];
}

export interface LabTrendChartProps {
  patientId: string;
}
