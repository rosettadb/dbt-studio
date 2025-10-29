import { client } from '../config/client';
import { UserProfile } from '../../types/profile';

const getProfile = async (): Promise<UserProfile | null> => {
  const { data } = await client.get<UserProfile | null>(
    'rosettaCloud:getProfile',
  );
  return data;
};

const refreshProfile = async (): Promise<UserProfile | null> => {
  const { data } = await client.get<UserProfile | null>(
    'rosettaCloud:refreshProfile',
  );
  return data;
};

const getCachedProfile = async (): Promise<UserProfile | null> => {
  const { data } = await client.get<UserProfile | null>(
    'rosettaCloud:getCachedProfile',
  );
  return data;
};

export const profileService = {
  getProfile,
  refreshProfile,
  getCachedProfile,
};

export default profileService;
