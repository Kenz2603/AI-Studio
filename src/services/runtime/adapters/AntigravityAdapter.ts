import type {
  AgentRuntimeType,
  RuntimeIsolationMode,
  RuntimeProviderStatusRecord,
  TaskArtifactRecord,
  TaskExecutionStepRecord,
} from '../../../shared/types';
import type { IRuntimeExecutionAdapter } from '../RuntimeTypes';
import type { RuntimeCapabilityRegistry } from '../RuntimeCapabilityRegistry';

export class AntigravityAdapter implements IRuntimeExecutionAdapter {
  public readonly adapterId = 'adapter-antigravity-ide';
  public readonly providerId = 'antigravity';
  public readonly runtimeType: AgentRuntimeType = 'ide-extension';

  private readonly capabilityRegistry: RuntimeCapabilityRegistry;

  constructor(dependencies: { capabilityRegistry: RuntimeCapabilityRegistry }) {
    this.capabilityRegistry = dependencies.capabilityRegistry;
  }

  public async discoverCapabilities(): Promise<RuntimeProviderStatusRecord> {
    const status = this.capabilityRegistry.getProviderStatus('antigravity');
    if (status) return status;

    return {
      providerId: 'antigravity',
      displayName: 'Google Antigravity',
      availabilityStatus: 'manual_only',
      cliPath: null,
      cliVersion: null,
      capabilities: {
        authStatus: 'manual_only',
        executionStatus: 'manual_only',
        modelSelectionStatus: 'supported',
        reasoningStatus: 'supported',
        streamingStatus: 'manual_only',
        toolEventsStatus: 'unsupported',
        usageStatus: 'unsupported',
        quotaStatus: 'unsupported',
        cancellationStatus: 'manual_only',
        sessionStatus: 'partially_supported',
        workspaceStatus: 'supported',
      },
      notes: 'Antigravity hoạt động trong VS Code. Không có headless CLI bên ngoài.',
      checkedAt: new Date().toISOString(),
    };
  }

  public async checkAvailability(): Promise<{ isAvailable: boolean; reason: string }> {
    return {
      isAvailable: false,
      reason: 'Google Antigravity là AI trợ lý chính trong VS Code. Chưa có giao diện headless CLI độc lập để điều khiển từ bên ngoài Studio.',
    };
  }

  public async checkAuthentication(): Promise<{ status: 'authenticated'; isAuthenticated: boolean; maskedAccount?: string; reason?: string }> {
    return {
      status: 'authenticated',
      isAuthenticated: true,
      maskedAccount: 'IDE Active Session (Google Account)',
      reason: 'Xác thực qua phiên đăng nhập của Antigravity Extension trong VS Code.',
    };
  }

  public async startSession(): Promise<{ accepted: boolean; pid?: number | null; reason?: string }> {
    return {
      accepted: false,
      reason: 'Antigravity chỉ hoạt động dưới hình thức IDE Companion. Vui lòng mở VS Code và giao tiếp trực tiếp qua khung chat Antigravity.',
    };
  }

  public async executeStep(): Promise<{ success: boolean; artifacts?: Omit<TaskArtifactRecord, 'id' | 'createdAt'>[]; errorMessage?: string }> {
    return {
      success: false,
      errorMessage: 'Không thể tự động dispatch step cho Antigravity qua CLI bên ngoài.',
    };
  }

  public async cancelSession(): Promise<{ cancelled: boolean; reason?: string }> {
    return {
      cancelled: true,
      reason: 'Đã gửi tín hiệu hủy phiên (Vui lòng bấm Stop Generation trong VS Code nếu đang chạy).',
    };
  }
}
