export type UserRole = 'doctor' | 'patient';

export interface AuthUser {
  id: string;
  email: string;
  full_name: string;
  role: UserRole;
  created_at: string;
  /** Doctors only — id of the medical specialty they cover. */
  specialty?: string | null;
  
  // Profile fields
  phone_number?: string | null;
  bio?: string | null;
  date_of_birth?: string | null;
  gender?: string | null;
  blood_group?: string | null;
  address?: string | null;
  emergency_contact_name?: string | null;
  emergency_contact_phone?: string | null;
  has_profile_pic?: boolean;
}

export interface AuthResponse {
  access_token: string;
  token_type: string;
  user: AuthUser;
}

export interface RegisterRequest {
  full_name: string;
  email: string;
  password: string;
  role: UserRole;
  /** Required when `role === 'doctor'`. */
  specialty?: string | null;
}

export interface LoginRequest {
  email: string;
  password: string;
  role: UserRole;
}
