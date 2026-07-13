import { useCallback } from 'react';
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
import * as dbtVersionsService from '../services/dbtVersions.service';

export const useListDbtCoreVersions = (): ((
  options?: DbtVersionListOptions,
) => Promise<DbtVersionListResponse>) =>
  useCallback(
    (options = {}) => dbtVersionsService.listDbtCoreVersions(options),
    [],
  );

export const useGetInstalledDbtCore =
  (): (() => Promise<InstalledDbtCoreInfo>) =>
    useCallback(() => dbtVersionsService.getInstalledDbtCore(), []);

export const usePlanDbtVersionChange = (): ((
  request: DbtVersionChangePlanRequest,
) => Promise<DbtVersionChangePlan>) =>
  useCallback((request) => dbtVersionsService.planVersionChange(request), []);

export const useInstallDbtVersionChange = (): ((
  request: DbtVersionChangeRequest,
) => Promise<PythonPackageInstallVersionResponse>) =>
  useCallback(
    (request) => dbtVersionsService.installVersionChange(request),
    [],
  );

export const useCheckCurrentProjectCompatibility =
  (): (() => Promise<DbtProjectCompatibilityResult>) =>
    useCallback(
      () => dbtVersionsService.checkCurrentProjectCompatibility(),
      [],
    );

export const useGetInstalledPackages =
  (): (() => Promise<InstalledPythonPackagesResponse>) =>
    useCallback(() => dbtVersionsService.getInstalledPackages(), []);

export const useInstallLatestPackage = (): ((
  request: PythonPackageActionRequest,
) => Promise<PythonPackageInstallVersionResponse>) =>
  useCallback(
    (request) => dbtVersionsService.installLatestPackage(request),
    [],
  );

export const useUninstallPackage = (): ((
  request: PythonPackageActionRequest,
) => Promise<PythonPackageInstallVersionResponse>) =>
  useCallback((request) => dbtVersionsService.uninstallPackage(request), []);

export const useListPackageVersions = (): ((
  request: PythonPackageVersionListRequest,
) => Promise<PythonPackageVersionListResponse>) =>
  useCallback((request) => dbtVersionsService.listPackageVersions(request), []);

export const useInstallPackageVersion = (): ((
  request: PythonPackageInstallVersionRequest,
) => Promise<PythonPackageInstallVersionResponse>) =>
  useCallback(
    (request) => dbtVersionsService.installPackageVersion(request),
    [],
  );
