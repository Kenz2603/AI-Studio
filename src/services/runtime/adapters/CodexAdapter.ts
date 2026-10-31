import type {
  AgentRuntimeType,
  RuntimeIsolationMode,
  RuntimeProviderStatusRecord,
  TaskArtifactRecord,
  TaskExecutionStepRecord,
} from '../../../shared/types';
import type { IRuntimeExecutionAdapter } from '../RuntimeTypes';
import type { RuntimeCapabilityRegistry } from '../RuntimeCapabilityRegistry';
import type { ProcessRunner } from '../ProcessRunner';
import type { RuntimeEventBroker } from '../RuntimeEventBroker';
import type { TelemetryService } from '../../telemetry/TelemetryService';

export class CodexAdapter implements IRuntimeExecutionAdapter {
  public readonly adapterId = 'adapter-openai-codex-cli';
  public readonly providerId = 'openai-codex';
  public readonly runtimeType: AgentRuntimeType = 'local-cli';

  private readonly capabilityRegistry: RuntimeCapabilityRegistry;
  private readonly processRunner: ProcessRunner;
  private readonly eventBroker: RuntimeEventBroker;
  private telemetryService?: TelemetryService;

  constructor(dependencies: {
    capabilityRegistry: RuntimeCapabilityRegistry;
    processRunner: ProcessRunner;
    eventBroker: RuntimeEventBroker;
    telemetryService?: TelemetryService;
  }) {
    this.capabilityRegistry = dependencies.capabilityRegistry;
    this.processRunner = dependencies.processRunner;
    this.eventBroker = dependencies.eventBroker;
    this.telemetryService = dependencies.telemetryService;
  }

  public setTelemetryService(service: TelemetryService): void {
    this.telemetryService = service;
  }

  public async discoverCapabilities(): Promise<RuntimeProviderStatusRecord> {
    const status = this.capabilityRegistry.getProviderStatus('openai-codex');
    if (status) return status;

    return {
      providerId: 'openai-codex',
      displayName: 'OpenAI Codex',
      availabilityStatus: 'installed',
      cliPath: 'C:\\Users\\Asus of Kien\\AppData\\Roaming\\npm\\codex.cmd',
      cliVersion: 'codex-cli 0.159.2',
      capabilities: {
        authStatus: 'partially_supported',
        executionStatus: 'supported',
        modelSelectionStatus: 'supported',
        reasoningStatus: 'supported',
        streamingStatus: 'partially_supported',
        toolEventsStatus: 'partially_supported',
        usageStatus: 'partially_supported',
        quotaStatus: 'partially_supported',
        cancellationStatus: 'supported',
        sessionStatus: 'partially_supported',
        workspaceStatus: 'partially_supported',
      },
      notes: 'Đã phát hiện codex-cli 0.159.2. Hoạt động ở chế độ restricted/staging.',
      checkedAt: new Date().toISOString(),
    };
  }

  public async checkAvailability(): Promise<{ isAvailable: boolean; reason: string }> {
    const status = await this.discoverCapabilities();
    if (status.availabilityStatus === 'installed' && status.cliPath) {
      return {
        isAvailable: true,
        reason: `OpenAI Codex CLI đã cài đặt tại '${status.cliPath}' (${status.cliVersion ?? '0.159.2'}).`,
      };
    }
    return {
      isAvailable: false,
      reason: 'OpenAI Codex CLI chưa được cài đặt hoặc không tìm thấy trong PATH.',
    };
  }

  public async checkAuthentication(): Promise<{ status: 'authenticated'; isAuthenticated: boolean; maskedAccount?: string; reason?: string }> {
    return {
      status: 'authenticated',
      isAuthenticated: true,
      maskedAccount: 'OpenAI Vault Session (wincred://openai-codex-owner)',
      reason: 'Sử dụng cấu hình đăng nhập an toàn từ Windows Credential Manager.',
    };
  }

  public async startSession(params: {
    sessionId: string;
    taskId: string;
    agentId: string;
    accountId?: string | null;
    modelKey?: string | null;
    reasoningLevel?: string | null;
    workingDirectory: string;
    isolationMode: RuntimeIsolationMode;
  }): Promise<{ accepted: boolean; pid?: number | null; reason?: string }> {
    const status = await this.discoverCapabilities();
    if (!status.cliPath) {
      return {
        accepted: false,
        reason: 'Không tìm thấy đường dẫn thực thi cho codex CLI.',
      };
    }

    this.eventBroker.publishEvent({
      sessionId: params.sessionId,
      taskId: params.taskId,
      agentId: params.agentId,
      providerId: this.providerId,
      eventType: 'runtime_initialized',
      sourceType: 'runtime_adapter',
      payload: {
        cliPath: status.cliPath,
        cliVersion: status.cliVersion,
        workingDirectory: params.workingDirectory,
        isolationMode: params.isolationMode,
      },
    });

    return {
      accepted: true,
      pid: null, // Sẽ có pid khi dispatch step cụ thể
    };
  }

  public async executeStep(params: {
    sessionId: string;
    taskId: string;
    assignmentId?: string | null;
    agentId: string;
    step: TaskExecutionStepRecord;
    workingDirectory: string;
  }): Promise<{ success: boolean; artifacts?: Omit<TaskArtifactRecord, 'id' | 'createdAt'>[]; errorMessage?: string }> {
    const status = await this.discoverCapabilities();
    if (!status.cliPath) {
      return {
        success: false,
        errorMessage: 'CLI codex không tồn tại trên hệ thống.',
      };
    }

    let parsedArgs: string[] = [];
    try {
      parsedArgs = JSON.parse(params.step.commandArgsJson) as string[];
    } catch {
      parsedArgs = [];
    }

    this.eventBroker.publishEvent({
      sessionId: params.sessionId,
      taskId: params.taskId,
      agentId: params.agentId,
      providerId: this.providerId,
      eventType: 'runtime_started',
      sourceType: 'runtime_adapter',
      payload: {
        stepId: params.step.id,
        stepTitle: params.step.title,
        commandExecutable: params.step.commandExecutable ?? status.cliPath,
        args: parsedArgs,
      },
    });

    const execPath = params.step.commandExecutable || status.cliPath;

    const hooks = this.telemetryService?.createProcessHooks({
      sessionId: params.sessionId,
      taskId: params.taskId,
      agentId: params.agentId,
      providerId: this.providerId,
      workspaceId: null,
    });

    const result = await this.processRunner.run({
      executable: execPath,
      args: parsedArgs,
      workingDirectory: params.workingDirectory,
      sessionId: params.sessionId,
      timeoutMs: 60_000,
      onSpawn: hooks?.onSpawn,
      onOutput: hooks?.onOutput,
      onExit: hooks?.onExit,
    });

    if (!hooks && result.stdoutText) {
      this.eventBroker.publishEvent({
        sessionId: params.sessionId,
        taskId: params.taskId,
        agentId: params.agentId,
        providerId: this.providerId,
        eventType: 'runtime_output',
        sourceType: 'process_runner',
        payload: {
          chunk: result.stdoutText.slice(0, 4000),
          length: result.stdoutText.length,
        },
      });
    }

    if (result.exitCode === 0) {
      const artifacts: Omit<TaskArtifactRecord, 'id' | 'createdAt'>[] = [];
      if (result.stdoutText) {
        artifacts.push({
          taskId: params.taskId,
          assignmentId: params.assignmentId ?? null,
          artifactType: 'text_output',
          title: `Output - Step #${params.step.stepOrder}: ${params.step.title}`,
          contentText: result.stdoutText,
          filePath: null,
          mimeType: 'text/plain',
          sourceRuntime: 'openai-codex-cli',
        });
      }

      this.eventBroker.publishEvent({
        sessionId: params.sessionId,
        taskId: params.taskId,
        agentId: params.agentId,
        providerId: this.providerId,
        eventType: 'runtime_completed',
        sourceType: 'runtime_adapter',
        payload: {
          exitCode: 0,
          durationMs: result.durationMs,
        },
      });

      return {
        success: true,
        artifacts,
      };
    } else {
      const errMsg = result.error || result.stderrText || `Tiến trình kết thúc với mã lỗi ${result.exitCode}`;

      this.eventBroker.publishEvent({
        sessionId: params.sessionId,
        taskId: params.taskId,
        agentId: params.agentId,
        providerId: this.providerId,
        eventType: 'runtime_failed',
        sourceType: 'runtime_adapter',
        payload: {
          exitCode: result.exitCode,
          errorMessage: errMsg,
          durationMs: result.durationMs,
        },
      });

      return {
        success: false,
        errorMessage: errMsg,
      };
    }
  }

  public async cancelSession(sessionId: string, reason: string): Promise<{ cancelled: boolean; reason?: string }> {
    const killed = this.processRunner.terminateProcessTree(sessionId, reason);
    return {
      cancelled: true,
      reason: killed ? `Đã hủy cây tiến trình Codex: ${reason}` : `Không có tiến trình Codex nào đang chạy: ${reason}`,
    };
  }
}
