import type {
  AgentRuntimeType,
  RuntimeIsolationMode,
  RuntimeProviderStatusRecord,
  TaskArtifactRecord,
  TaskExecutionStepRecord,
} from '../../../shared/types';
import type { IRuntimeExecutionAdapter } from '../RuntimeTypes';
import type { RuntimeEventBroker } from '../RuntimeEventBroker';

/**
 * ADAPTER KIỂM THỬ TỰ ĐỘNG (ISOLATED TEST MOCK ONLY)
 *
 * Chỉ được sử dụng trong các bài kiểm tra tự động nội bộ.
 * Tuyệt đối KHÔNG đăng ký vào Production Registry và KHÔNG hiển thị trên UI.
 */
export class MockTestAdapter implements IRuntimeExecutionAdapter {
  public readonly adapterId = 'test_mock_adapter';
  public readonly providerId = 'test-mock-provider';
  public readonly runtimeType: AgentRuntimeType = 'local-cli';

  private readonly eventBroker: RuntimeEventBroker;
  public simulateTimeout = false;
  public simulateFailure = false;
  public delayMs = 10;

  constructor(dependencies: { eventBroker: RuntimeEventBroker }) {
    this.eventBroker = dependencies.eventBroker;
  }

  public async discoverCapabilities(): Promise<RuntimeProviderStatusRecord> {
    return {
      providerId: this.providerId,
      displayName: 'Automated Test Mock Provider (TEST ONLY)',
      availabilityStatus: 'installed',
      cliPath: 'C:\\AI-Studio\\test\\mock-runner.exe',
      cliVersion: 'mock-1.0.0',
      capabilities: {
        authStatus: 'supported',
        executionStatus: 'supported',
        modelSelectionStatus: 'supported',
        reasoningStatus: 'supported',
        streamingStatus: 'supported',
        toolEventsStatus: 'supported',
        usageStatus: 'supported',
        quotaStatus: 'supported',
        cancellationStatus: 'supported',
        sessionStatus: 'supported',
        workspaceStatus: 'supported',
      },
      notes: 'MOCK ADAPTER FOR AUTOMATED UNIT TESTS ONLY',
      checkedAt: new Date().toISOString(),
    };
  }

  public async checkAvailability(): Promise<{ isAvailable: boolean; reason: string }> {
    return { isAvailable: true, reason: 'Test Mock Adapter Available' };
  }

  public async checkAuthentication(): Promise<{ status: 'authenticated'; isAuthenticated: boolean; maskedAccount?: string; reason?: string }> {
    return { status: 'authenticated', isAuthenticated: true, maskedAccount: 'mock-test-account' };
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
    this.eventBroker.publishEvent({
      sessionId: params.sessionId,
      taskId: params.taskId,
      agentId: params.agentId,
      providerId: this.providerId,
      eventType: 'runtime_initialized',
      sourceType: 'runtime_adapter',
      payload: { mode: params.isolationMode, testMock: true },
    });

    return { accepted: true, pid: 99999 };
  }

  public async executeStep(params: {
    sessionId: string;
    taskId: string;
    assignmentId?: string | null;
    agentId: string;
    step: TaskExecutionStepRecord;
    workingDirectory: string;
  }): Promise<{ success: boolean; artifacts?: Omit<TaskArtifactRecord, 'id' | 'createdAt'>[]; errorMessage?: string }> {
    this.eventBroker.publishEvent({
      sessionId: params.sessionId,
      taskId: params.taskId,
      agentId: params.agentId,
      providerId: this.providerId,
      eventType: 'runtime_started',
      sourceType: 'runtime_adapter',
      payload: { stepTitle: params.step.title },
    });

    if (this.delayMs > 0) {
      await new Promise((r) => setTimeout(r, this.delayMs));
    }

    if (this.simulateFailure) {
      this.eventBroker.publishEvent({
        sessionId: params.sessionId,
        taskId: params.taskId,
        agentId: params.agentId,
        providerId: this.providerId,
        eventType: 'runtime_failed',
        sourceType: 'runtime_adapter',
        payload: { error: 'Simulated Test Failure' },
      });
      return { success: false, errorMessage: 'Simulated Test Failure' };
    }

    this.eventBroker.publishEvent({
      sessionId: params.sessionId,
      taskId: params.taskId,
      agentId: params.agentId,
      providerId: this.providerId,
      eventType: 'runtime_output',
      sourceType: 'process_runner',
      payload: { chunk: 'Simulated mock output' },
    });

    this.eventBroker.publishEvent({
      sessionId: params.sessionId,
      taskId: params.taskId,
      agentId: params.agentId,
      providerId: this.providerId,
      eventType: 'runtime_completed',
      sourceType: 'runtime_adapter',
      payload: { exitCode: 0 },
    });

    return {
      success: true,
      artifacts: [
        {
          taskId: params.taskId,
          assignmentId: params.assignmentId ?? null,
          artifactType: 'text_output',
          title: 'Mock Artifact',
          contentText: 'Mock artifact content',
          filePath: null,
          mimeType: 'text/plain',
          sourceRuntime: 'test_mock_adapter',
        },
      ],
    };
  }

  public async cancelSession(sessionId: string, reason: string): Promise<{ cancelled: boolean; reason?: string }> {
    return { cancelled: true, reason: `Mock cancelled: ${reason}` };
  }
}
