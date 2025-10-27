import { client } from '../config/client';
import { UserProfile } from '../../types/profile';

const getProfile = async (): Promise<UserProfile | null> => {
  const { data } = await client.get<UserProfile | null>('profile:get');
  return data;
};

const refreshProfile = async (): Promise<UserProfile | null> => {
  const { data } = await client.get<UserProfile | null>('profile:refresh');
  return data;
};

const getCachedProfile = async (): Promise<UserProfile | null> => {
  const { data } = await client.get<UserProfile | null>('profile:getCached');
  return data;
};

export const profileService = {
  getProfile,
  refreshProfile,
  getCachedProfile,
};

export default profileService;
