import {
  DbtVersionListResponse,
  PythonPackageInstallVersionRequest,
  PythonPackageInstallVersionResponse,
  PythonPackageVersionListRequest,
  PythonPackageVersionListResponse,
} from '../../types/backend';
import { client } from '../config/client';

export const listDbtCoreVersions =
  async (): Promise<DbtVersionListResponse> => {
    const { data } =
      await client.get<DbtVersionListResponse>('dbt:versions:list');
    return data;
  };

export const listPackageVersions = async (
  body: PythonPackageVersionListRequest,
): Promise<PythonPackageVersionListResponse> => {
  const { data } = await client.post<
    PythonPackageVersionListRequest,
    PythonPackageVersionListResponse
  >('dbt:packageVersions:list', body);
  return data;
};

export const installPackageVersion = async (
  body: PythonPackageInstallVersionRequest,
): Promise<PythonPackageInstallVersionResponse> => {
  const { data } = await client.post<
    PythonPackageInstallVersionRequest,
    PythonPackageInstallVersionResponse
  >('dbt:packageVersion:install', body);
  return data;
};
