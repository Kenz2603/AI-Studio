import type {
  AgentRuntimeType,
  RuntimeIsolationMode,
  RuntimeProviderStatusRecord,
  TaskArtifactRecord,
  TaskExecutionStepRecord,
} from '../../../shared/types';
import type { IRuntimeExecutionAdapter } from '../RuntimeTypes';
import type { RuntimeCapabilityRegistry } from '../RuntimeCapabilityRegistry';

export class ClaudeAdapter implements IRuntimeExecutionAdapter {
  public readonly adapterId = 'adapter-anthropic-claude-cli';
  public readonly providerId = 'anthropic-claude';
  public readonly runtimeType: AgentRuntimeType = 'local-cli';

  private readonly capabilityRegistry: RuntimeCapabilityRegistry;

  constructor(dependencies: { capabilityRegistry: RuntimeCapabilityRegistry }) {
    this.capabilityRegistry = dependencies.capabilityRegistry;
  }

  public async discoverCapabilities(): Promise<RuntimeProviderStatusRecord> {
    const status = this.capabilityRegistry.getProviderStatus('anthropic-claude');
    if (status) return status;

    return {
      providerId: 'anthropic-claude',
      displayName: 'Anthropic Claude',
      availabilityStatus: 'not_installed',
      cliPath: null,
      cliVersion: null,
      capabilities: {
        authStatus: 'unsupported',
        executionStatus: 'unsupported',
        modelSelectionStatus: 'unsupported',
        reasoningStatus: 'unsupported',
        streamingStatus: 'unsupported',
        toolEventsStatus: 'unsupported',
        usageStatus: 'unsupported',
        quotaStatus: 'unsupported',
        cancellationStatus: 'unsupported',
        sessionStatus: 'unsupported',
        workspaceStatus: 'unsupported',
      },
      notes: 'CLI claude chưa được cài đặt. Chỉ có Claude Desktop GUI.',
      checkedAt: new Date().toISOString(),
    };
  }

  public async checkAvailability(): Promise<{ isAvailable: boolean; reason: string }> {
    return {
      isAvailable: false,
      reason: 'CLI Anthropic Claude chưa được cài đặt trên máy (Lệnh "claude" không tìm thấy trong PATH). Cần cài đặt "@anthropic-ai/claude-code" để kích hoạt.',
    };
  }

  public async checkAuthentication(): Promise<{ status: 'unknown'; isAuthenticated: boolean; maskedAccount?: string; reason?: string }> {
    return {
      status: 'unknown',
      isAuthenticated: false,
      reason: 'Chưa có CLI để kiểm tra trạng thái đăng nhập Claude.',
    };
  }

  public async startSession(): Promise<{ accepted: boolean; pid?: number | null; reason?: string }> {
    return {
      accepted: false,
      reason: 'CLI Claude chưa được cài đặt trên máy. Không thể khởi chạy tiến trình.',
    };
  }

  public async executeStep(): Promise<{ success: boolean; artifacts?: Omit<TaskArtifactRecord, 'id' | 'createdAt'>[]; errorMessage?: string }> {
    return {
      success: false,
      errorMessage: 'Runtime Claude chưa sẵn sàng.',
    };
  }

  public async cancelSession(): Promise<{ cancelled: boolean; reason?: string }> {
    return {
      cancelled: true,
      reason: 'Không có tiến trình Claude nào đang chạy.',
    };
  }
}
