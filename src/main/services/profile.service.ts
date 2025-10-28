import AuthService from './auth.service';
import { ROSETTA_CLOUD_BASE_URL } from '../utils/constants';
import { UserProfile } from '../../types/profile';

export class ProfileService {
  private static cachedProfile: UserProfile | null = null;

  static async getProfile(): Promise<UserProfile | null> {
    try {
      const token = await AuthService.getToken();

      if (!token) {
        // eslint-disable-next-line no-console
        console.log('No auth token available for profile fetch');
        return null;
      }

      const response = await fetch(
        `${ROSETTA_CLOUD_BASE_URL}/api/electron/profile`,
        {
          method: 'GET',
          headers: {
            Authorization: `Bearer ${token}`,
            'Content-Type': 'application/json',
          },
        },
      );

      if (!response.ok) {
        if (response.status === 401) {
          // Token expired, clear it
          await AuthService.clearToken();
          this.cachedProfile = null;
          return null;
        }
        throw new Error(`Profile fetch failed: ${response.status}`);
      }

      const data = await response.json();
      this.cachedProfile = data.profile;
      return data.profile;
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Profile service error:', error);
      return this.cachedProfile; // Return cached data on network error
    }
  }

  static async refreshProfile(): Promise<UserProfile | null> {
    this.cachedProfile = null; // Clear cache
    return this.getProfile();
  }

  static clearProfile(): void {
    this.cachedProfile = null;
  }

  static getCachedProfile(): UserProfile | null {
    return this.cachedProfile;
  }
}

export default ProfileService;
