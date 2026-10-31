import fs from 'node:fs';
import path from 'node:path';
import { WindowsPathGuard } from './WindowsPathGuard';

export type RuntimeIsolationLevel =
  | 'none'
  | 'process_lifecycle_only'
  | 'restricted_filesystem'
  | 'restricted_network'
  | 'full_sandbox'
  | 'unsupported';

export interface RuntimeIsolationCapabilities {
  readonly level: RuntimeIsolationLevel;
  readonly isOsKernelSandbox: boolean;
  readonly supportsJobObjects: boolean;
  readonly supportsProcessTreeKill: boolean;
  readonly applicationLevelEnforcement: boolean;
  readonly stagingRequired: boolean;
  readonly networkFilterLevel: 'none' | 'application_domain_gate' | 'wfp_kernel_driver';
  readonly filesystemFilterLevel: 'none' | 'staging_and_path_guard' | 'filter_driver_kernel';
  readonly notes: string;
}

/**
 * RUNTIME ISOLATION ADAPTER (WINDOWS SECURITY ARCHITECTURE - G2.10)
 *
 * Nguyên tắc trung thực kỹ thuật (Technical Honesty):
 * 1. Không tự nhận là OS-level kernel filesystem sandbox nếu chỉ dùng staging directory và PathGuard.
 * 2. Trên Windows hiện tại, cô lập tiến trình được thực thi qua:
 *    - Process Tree Termination (taskkill /t /f không thông qua shell).
 *    - Main Process WindowsPathGuard & Staging Directory.
 *    - Application Domain Gate (CommandAnalyzer).
 * 3. Báo cáo trung thực cấp độ cô lập để hệ thống và Owner luôn nắm bắt chính xác ranh giới an toàn.
 */
export class RuntimeIsolationAdapter {
  private readonly platform: string;

  constructor(platform = process.platform) {
    this.platform = platform;
  }

  /**
   * Truy vấn năng lực cô lập runtime trên môi trường thực tế
   */
  public getCapabilities(): RuntimeIsolationCapabilities {
    if (this.platform !== 'win32') {
      return {
        level: 'unsupported',
        isOsKernelSandbox: false,
        supportsJobObjects: false,
        supportsProcessTreeKill: false,
        applicationLevelEnforcement: false,
        stagingRequired: false,
        networkFilterLevel: 'none',
        filesystemFilterLevel: 'none',
        notes: `Nền tảng '${this.platform}' chưa được cấu hình cô lập runtime chuyên biệt cho Windows.`,
      };
    }

    return {
      level: 'process_lifecycle_only',
      isOsKernelSandbox: false,
      supportsJobObjects: true,
      supportsProcessTreeKill: true,
      applicationLevelEnforcement: true,
      stagingRequired: true,
      networkFilterLevel: 'application_domain_gate',
      filesystemFilterLevel: 'staging_and_path_guard',
      notes:
        'Windows 11 Runtime: Cô lập vòng đời tiến trình qua Process Tree Kill (taskkill /t /f). Kiểm soát tệp tin qua Main Process WindowsPathGuard và Staging Directory. KHÔNG PHẢI sandbox nhân OS (Kernel Filter Driver/AppContainer).',
    };
  }

  /**
   * Xác thực yêu cầu cô lập trước khi thực thi tiến trình
   */
  public validateExecutionIsolation(
    requestedLevel: RuntimeIsolationLevel,
    targetDirectory: string
  ): { allowed: boolean; code?: string; reason?: string } {
    // 1. Kiểm tra cấp độ yêu cầu
    if (requestedLevel === 'full_sandbox') {
      return {
        allowed: false,
        code: 'SANDBOX_LEVEL_UNSUPPORTED',
        reason:
          'Cấp độ full_sandbox (AppContainer/Kernel Container) chưa được hỗ trợ trên môi trường hiện tại. Hệ thống từ chối chạy để tránh giả định an toàn sai.',
      };
    }

    if (requestedLevel === 'unsupported') {
      return {
        allowed: false,
        code: 'ISOLATION_UNSUPPORTED',
        reason: 'Cấp độ cô lập không được hỗ trợ.',
      };
    }

    // 2. Kiểm tra an toàn đường dẫn thư mục làm việc bằng WindowsPathGuard
    if (!fs.existsSync(targetDirectory)) {
      return {
        allowed: false,
        code: 'TARGET_DIR_NOT_FOUND',
        reason: `Thư mục làm việc không tồn tại: '${targetDirectory}'`,
      };
    }

    const evalResult = WindowsPathGuard.evaluatePath(targetDirectory, targetDirectory);
    if (!evalResult.valid) {
      return {
        allowed: false,
        code: 'TARGET_DIR_INSECURE',
        reason: `Thư mục làm việc vi phạm quy tắc an toàn Windows: ${evalResult.violationReason}`,
      };
    }

    return { allowed: true };
  }
}

