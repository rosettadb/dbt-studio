import {
  DbtProjectCompatibilityResult,
  DbtVersionChangePlan,
  DbtVersionChangePlanRequest,
  DbtVersionChangeRequest,
  DbtVersionListOptions,
  DbtVersionListResponse,
  InstalledDbtCoreInfo,
  InstalledPythonPackagesResponse,
  PythonPackageActionRequest,
  PythonPackageInstallVersionRequest,
  PythonPackageInstallVersionResponse,
  PythonPackageVersionListRequest,
  PythonPackageVersionListResponse,
} from '../../types/backend';
import { client } from '../config/client';

export const listDbtCoreVersions = async (
  body: DbtVersionListOptions = {},
): Promise<DbtVersionListResponse> => {
  const { data } = await client.post<
    DbtVersionListOptions,
    DbtVersionListResponse
  >('dbt:versions:list', body);
  return data;
};

export const getInstalledDbtCore = async (): Promise<InstalledDbtCoreInfo> => {
  const { data } = await client.get<InstalledDbtCoreInfo>('dbt:installed:get');
  return data;
};

export const planVersionChange = async (
  body: DbtVersionChangePlanRequest,
): Promise<DbtVersionChangePlan> => {
  const { data } = await client.post<
    DbtVersionChangePlanRequest,
    DbtVersionChangePlan
  >('dbt:versionChange:plan', body);
  return data;
};

export const installVersionChange = async (
  body: DbtVersionChangeRequest,
): Promise<PythonPackageInstallVersionResponse> => {
  const { data } = await client.post<
    DbtVersionChangeRequest,
    PythonPackageInstallVersionResponse
  >('dbt:versionChange:install', body);
  return data;
};

export const checkCurrentProjectCompatibility =
  async (): Promise<DbtProjectCompatibilityResult> => {
    const { data } = await client.get<DbtProjectCompatibilityResult>(
      'dbt:compatibility:check',
    );
    return data;
  };

export const getInstalledPackages =
  async (): Promise<InstalledPythonPackagesResponse> => {
    const { data } = await client.get<InstalledPythonPackagesResponse>(
      'dbt:packages:installed',
    );
    return data;
  };

export const installLatestPackage = async (
  body: PythonPackageActionRequest,
): Promise<PythonPackageInstallVersionResponse> => {
  const { data } = await client.post<
    PythonPackageActionRequest,
    PythonPackageInstallVersionResponse
  >('dbt:package:installLatest', body);
  return data;
};

export const uninstallPackage = async (
  body: PythonPackageActionRequest,
): Promise<PythonPackageInstallVersionResponse> => {
  const { data } = await client.post<
    PythonPackageActionRequest,
    PythonPackageInstallVersionResponse
  >('dbt:package:uninstall', body);
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
