import type {
  AgentRuntimeType,
  PermissionEvaluationResult,
  TaskExecutionStepRecord,
} from '../../shared/types';
import type {
  IRuntimeExecutionAdapter,
  RuntimeCapabilityStatus,
} from '../contracts/FutureStageContracts';
import type { RuntimeManager } from './RuntimeManager';

export class RuntimeOrchestratorBridge implements IRuntimeExecutionAdapter {
  public readonly adapterId = 'runtime-core-g2.6-bridge';
  private readonly runtimeManager: RuntimeManager;

  constructor(dependencies: { runtimeManager: RuntimeManager }) {
    this.runtimeManager = dependencies.runtimeManager;
  }

  public getCapabilityStatus(
    providerId: string,
    runtimeType: AgentRuntimeType
  ): RuntimeCapabilityStatus {
    const status = this.runtimeManager.capabilityRegistry.getProviderStatus(providerId);

    if (!status) {
      return {
        providerId,
        runtimeType,
        isAvailable: false,
        statusCode: 'runtime_unavailable',
        statusMessage: `Chưa cấu hình Runtime Adapter cho Provider '${providerId}'.`,
      };
    }

    if (status.availabilityStatus === 'installed') {
      return {
        providerId,
        runtimeType,
        isAvailable: true,
        statusCode: 'runtime_ready',
        statusMessage: `Runtime '${providerId}' (${status.cliVersion ?? 'installed'}) đã sẵn sàng.`,
      };
    }

    return {
      providerId,
      runtimeType,
      isAvailable: false,
      statusCode: 'runtime_unavailable',
      statusMessage: status.notes || `Provider '${providerId}' đang ở trạng thái ${status.availabilityStatus}.`,
    };
  }

  public async dispatchTaskStep(params: {
    taskId: string;
    assignmentId: string;
    agentId: string;
    step: TaskExecutionStepRecord;
    authorization: PermissionEvaluationResult;
  }): Promise<{ dispatched: boolean; reason: string }> {
    const res = await this.runtimeManager.dispatchTask({
      taskId: params.taskId,
      assignmentId: params.assignmentId,
      isolationMode: 'restricted',
    });

    return {
      dispatched: res.success,
      reason: res.reason ?? (res.success ? 'Đã dispatch thành công qua Runtime Core' : 'Dispatch thất bại'),
    };
  }

  public async stopTaskExecution(taskId: string, reason: string): Promise<void> {
    await this.runtimeManager.cancelTask({
      taskId,
      reason,
    });
  }
}

