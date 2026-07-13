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
  PythonPackageVersionListResponse,
} from '../../types/backend';
import { DbtCoreVersionService } from './dbtCoreVersion.service';

export class DbtVersionManagerService {
  static async listDbtCoreVersions(
    options?: DbtVersionListOptions,
  ): Promise<DbtVersionListResponse> {
    return DbtCoreVersionService.listDbtCoreVersions(options);
  }

  static async listPackageVersions(
    packageName: string | undefined,
  ): Promise<PythonPackageVersionListResponse> {
    return DbtCoreVersionService.listPackageVersions(packageName);
  }

  static async getInstalledDbtCore(): Promise<InstalledDbtCoreInfo> {
    return DbtCoreVersionService.getInstalledDbtCore();
  }

  static async planVersionChange(
    request: DbtVersionChangePlanRequest,
  ): Promise<DbtVersionChangePlan> {
    return DbtCoreVersionService.planVersionChange(request);
  }

  static async installVersionChange(
    request: DbtVersionChangeRequest,
  ): Promise<PythonPackageInstallVersionResponse> {
    return DbtCoreVersionService.installVersionChange(request);
  }

  static async checkCurrentProjectCompatibility(): Promise<DbtProjectCompatibilityResult> {
    return DbtCoreVersionService.checkCurrentProjectCompatibility();
  }

  static async getInstalledPackages(): Promise<InstalledPythonPackagesResponse> {
    return DbtCoreVersionService.getInstalledPackages();
  }

  static async installLatestPackage(
    request: PythonPackageActionRequest,
  ): Promise<PythonPackageInstallVersionResponse> {
    return DbtCoreVersionService.installLatestPackage(request);
  }

  static async uninstallPackage(
    request: PythonPackageActionRequest,
  ): Promise<PythonPackageInstallVersionResponse> {
    return DbtCoreVersionService.uninstallPackage(request);
  }

  static async installPackageVersion(
    req: PythonPackageInstallVersionRequest,
  ): Promise<PythonPackageInstallVersionResponse> {
    return DbtCoreVersionService.installPackageVersion(req);
  }
}
