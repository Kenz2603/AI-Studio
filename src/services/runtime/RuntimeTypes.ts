import type {
  AgentRuntimeType,
  RuntimeEventSource,
  RuntimeIsolationMode,
  RuntimeProviderStatusRecord,
  TaskArtifactRecord,
  TaskExecutionStepRecord,
  TelemetryEventType,
} from '../../shared/types';

export interface ProcessSpawnOptions {
  /** Đường dẫn TUYỆT ĐỐI tới .exe/.com hoặc shim npm (.cmd) — shim được giải quyết thành node.exe + script */
  readonly executable: string;
  readonly args: readonly string[];
  readonly workingDirectory: string;
  readonly env?: Record<string, string>;
  readonly timeoutMs?: number;
  readonly maxBufferBytes?: number;
  readonly sessionId: string;
  /** Văn bản ghi vào stdin rồi đóng. Mặc định: đóng stdin ngay. */
  readonly stdinText?: string;
  readonly onSpawn?: (info: { pid: number; executable: string; viaShimResolution: boolean }) => void;
  readonly onOutput?: (stream: 'stdout' | 'stderr', text: string) => void;
  readonly onExit?: (info: {
    pid: number | null;
    exitCode: number | null;
    exitSignal: string | null;
    timedOut: boolean;
    cancelled: boolean;
    durationMs: number;
  }) => void;
}

export interface ProcessRunResult {
  readonly pid: number | null;
  readonly exitCode: number | null;
  readonly exitSignal: string | null;
  readonly stdoutText: string;
  readonly stderrText: string;
  readonly durationMs: number;
  readonly timedOut: boolean;
  readonly cancelled: boolean;
  readonly terminationReason: string | null;
  readonly outputTruncated: boolean;
  readonly bytesRead: number;
  readonly bytesWritten: number;
  readonly error?: string;
}

/** Payload đã được Studio ký nội bộ (HMAC) — chỉ chứng minh toàn vẹn bản ghi phía Studio, KHÔNG xác minh Provider */
export interface AuthenticatedRuntimeEventPayload {
  readonly eventId: string;
  readonly sessionId: string;
  readonly taskId: string;
  readonly agentId: string;
  readonly providerId: string;
  readonly sequenceNumber: number;
  readonly eventType: TelemetryEventType;
  readonly sourceType: RuntimeEventSource;
  readonly payload: Record<string, unknown>;
  readonly timestamp: string;
  readonly signature: string;
}

export type AuthenticationCheckStatus =
  | 'authenticated'
  | 'authentication_required'
  | 'unknown'
  | 'manual_only'
  | 'unsupported';

export interface AuthenticationCheckResult {
  readonly status?: AuthenticationCheckStatus;
  /** Giữ để tương thích G2.6: true CHỈ KHI status === 'authenticated' */
  readonly isAuthenticated: boolean;
  readonly maskedAccount?: string;
  readonly reason?: string;
}

export interface IRuntimeExecutionAdapter {
  readonly adapterId: string;
  readonly providerId: string;
  readonly runtimeType: AgentRuntimeType;

  discoverCapabilities(): Promise<RuntimeProviderStatusRecord>;
  checkAvailability(): Promise<{ isAvailable: boolean; reason: string }>;
  checkAuthentication(accountId?: string | null): Promise<AuthenticationCheckResult>;
  startSession(params: {
    sessionId: string;
    taskId: string;
    agentId: string;
    accountId?: string | null;
    modelKey?: string | null;
    reasoningLevel?: string | null;
    workingDirectory: string;
    isolationMode: RuntimeIsolationMode;
  }): Promise<{ accepted: boolean; pid?: number | null; reason?: string }>;
  executeStep(params: {
    sessionId: string;
    taskId: string;
    assignmentId?: string | null;
    agentId: string;
    step: TaskExecutionStepRecord;
    workingDirectory: string;
  }): Promise<{ success: boolean; artifacts?: Omit<TaskArtifactRecord, 'id' | 'createdAt'>[]; errorMessage?: string }>;
  cancelSession(sessionId: string, reason: string): Promise<{ cancelled: boolean; reason?: string }>;
}
