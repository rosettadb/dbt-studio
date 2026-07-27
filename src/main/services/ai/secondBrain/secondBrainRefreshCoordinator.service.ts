import { randomUUID } from 'crypto';
import type { SecondBrainProgressEvent } from '../../../../types/secondBrain';
import SecondBrainRefreshService, {
  type SecondBrainRefreshResult,
} from './secondBrainRefresh.service';
import type SecondBrainService from './secondBrain.service';
import { SecondBrainError } from './secondBrain.types';

export type SecondBrainRefreshOwner = {
  ownerId: number;
  isDestroyed: () => boolean;
  onDestroyed: (callback: () => void) => () => void;
  emitProgress: (event: SecondBrainProgressEvent) => void;
};

type SecondBrainRefreshCoordinatorDependencies = {
  isEnabled: () => Promise<boolean>;
  createService: () => Promise<SecondBrainService>;
  createOperationId?: () => string;
};

export default class SecondBrainRefreshCoordinator {
  private readonly dependencies: SecondBrainRefreshCoordinatorDependencies;

  private activeOperation: {
    operationId: string;
    ownerId: number;
    controller: AbortController;
    completion: Promise<void>;
  } | null = null;

  constructor(dependencies: SecondBrainRefreshCoordinatorDependencies) {
    this.dependencies = dependencies;
  }

  public getStatus(): { busy: boolean; activeOperationId?: string } {
    return {
      busy: Boolean(this.activeOperation),
      activeOperationId: this.activeOperation?.operationId,
    };
  }

  public async run(
    owner: SecondBrainRefreshOwner,
    options: { initialize?: boolean; dryRun?: boolean },
  ): Promise<{ operationId: string; result: SecondBrainRefreshResult }> {
    if (!(await this.dependencies.isEnabled())) {
      throw new SecondBrainError(
        'DISABLED',
        'Enable Wiki Memory before initializing or refreshing memory.',
      );
    }
    if (this.activeOperation) {
      throw new SecondBrainError(
        'BUSY',
        'Another Wiki Memory operation is already running.',
        { operationId: this.activeOperation.operationId },
      );
    }

    const operationId = this.dependencies.createOperationId?.() ?? randomUUID();
    const controller = new AbortController();
    let resolveCompletion: () => void = () => {};
    const completion = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });
    this.activeOperation = {
      operationId,
      ownerId: owner.ownerId,
      controller,
      completion,
    };
    const removeDestroyedListener = owner.onDestroyed(() => controller.abort());
    try {
      const service = await this.dependencies.createService();
      const refresh = new SecondBrainRefreshService(service);
      const result = await refresh.refresh({
        ...options,
        operationId,
        abortSignal: controller.signal,
        onProgress: (progress) => {
          if (!owner.isDestroyed()) {
            owner.emitProgress({
              operationId,
              ...progress,
              timestamp: new Date().toISOString(),
              cancellable: !['completed', 'cancelled', 'failed'].includes(
                progress.stage,
              ),
            });
          }
        },
      });
      return { operationId, result };
    } catch (error) {
      if (error instanceof SecondBrainError && error.code === 'CANCELLED') {
        return {
          operationId,
          result: {
            status: 'cancelled',
            dryRun: Boolean(options.dryRun),
            modelCalled: false,
            itemsCollected: 0,
            operationsProposed: 0,
            operationsSkipped: 0,
            operationsApplied: 0,
            operationsFailed: 0,
            failures: [],
            changedPageIds: [],
            truncated: false,
          },
        };
      }
      throw error;
    } finally {
      removeDestroyedListener();
      if (this.activeOperation?.operationId === operationId) {
        this.activeOperation = null;
      }
      resolveCompletion();
    }
  }

  public cancel(ownerId: number, operationId: string): { cancelled: true } {
    if (
      !this.activeOperation ||
      this.activeOperation.operationId !== operationId ||
      this.activeOperation.ownerId !== ownerId
    ) {
      throw new SecondBrainError(
        'NOT_FOUND',
        'Active Wiki Memory operation not found.',
      );
    }
    this.activeOperation.controller.abort();
    return { cancelled: true };
  }

  public cancelActive(): { cancelled: boolean } {
    if (!this.activeOperation) return { cancelled: false };
    this.activeOperation.controller.abort();
    return { cancelled: true };
  }

  public async cancelActiveAndWait(): Promise<{ cancelled: boolean }> {
    const { activeOperation } = this;
    if (!activeOperation) return { cancelled: false };
    const { controller, completion } = activeOperation;
    controller.abort();
    await completion;
    return { cancelled: true };
  }

  public reset(): void {
    this.activeOperation?.controller.abort();
    this.activeOperation = null;
  }
}
