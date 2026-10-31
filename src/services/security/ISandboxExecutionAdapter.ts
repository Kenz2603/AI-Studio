/**
 * OS-LEVEL SANDBOX EXECUTION ADAPTER CONTRACT (FOR G2.4 / G2.6+)
 *
 * Nguyên tắc trung thực kỹ thuật (Mục 9 & 10):
 * - Authorization tại Permission Engine không đồng nghĩa với OS-level sandbox.
 * - Trong G2.3, hệ thống thực thi Policy Evaluation, Path Canonicalization,
 *   Structured Command Inspection, Approval Gate và Audit Logging tại Main Process.
 * - Hợp đồng ISandboxExecutionAdapter được định nghĩa sẵn để giai đoạn G2.4 / G2.6
 *   tích hợp Windows Job Objects, Restricted Tokens hoặc AppContainer.
 */

export interface SandboxCapabilitiesReport {
  readonly adapterId: string;
  readonly isOsLevelSandboxActive: boolean;
  readonly supportsWindowsJobObjects: boolean;
  readonly supportsRestrictedTokens: boolean;
  readonly supportsAppContainer: boolean;
  readonly supportsNetworkFilterDriver: boolean;
  readonly statusDescription: string;
}

export interface ISandboxExecutionAdapter {
  getCapabilities(): SandboxCapabilitiesReport;
}

export class PolicyOnlySandboxAdapter implements ISandboxExecutionAdapter {
  public getCapabilities(): SandboxCapabilitiesReport {
    return {
      adapterId: 'g2.3-main-process-policy-gate',
      isOsLevelSandboxActive: false,
      supportsWindowsJobObjects: false,
      supportsRestrictedTokens: false,
      supportsAppContainer: false,
      supportsNetworkFilterDriver: false,
      statusDescription:
        'G2.3 Active: Kiểm soát tại Main Process Policy Gate (WindowsPathGuard, CommandAnalyzer, Approval Fingerprinting). Chưa kích hoạt cô lập nhân OS (Windows Job Objects / AppContainer sẽ triển khai ở G2.4/G2.6).',
    };
  }
}

