export interface ProfilePreferences {
  theme: 'light' | 'dark' | 'system';
  notifications: boolean;
  timezone: string;
  emailNotifications: boolean;
  smsNotifications: boolean;
  marketingEmails: boolean;
  pushNotifications: boolean;
}

export interface UserProfile {
  id: string;
  name: string | null;
  email: string;
  role: 'ADMIN' | 'USER';
  emailVerified: Date | null;
  createdAt: Date;
  updatedAt: Date;
  phone: string | null;
  avatar: string | null;
  preferences: ProfilePreferences;
}

export interface ProfileResponse {
  profile: UserProfile;
}

export interface ProfileError {
  error: string;
  code?: string;
}
