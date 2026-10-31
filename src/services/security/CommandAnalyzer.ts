import path from 'node:path';
import type { PermissionKey, RiskLevel } from '../../shared/types';

/**
 * STRUCTURED COMMAND ANALYZER (PROCESS & ARGUMENT INSPECTION)
 *
 * Nguyên tắc bắt buộc (Mục 3.2):
 * - Không dùng cách kiểm tra chuỗi đơn giản để khẳng định một command an toàn.
 * - Phân tích có cấu trúc: executable, mảng arguments, working directory và danh sách biến môi trường.
 * - Tự động ánh xạ lệnh Git sang chính sách Git Permission (chặn tự ý commit, push, merge, tạo branch).
 * - Nhận diện các lệnh có nguy cơ xóa dữ liệu, thay đổi cấu hình hệ thống hoặc trích xuất thông tin nhạy cảm.
 */

export interface StructuredCommandAnalysis {
  readonly normalizedExecutable: string;
  readonly baseExecutableName: string;
  readonly inferredPermissionKey: PermissionKey;
  readonly inferredGitPermissionKey: PermissionKey | null;
  readonly riskLevel: RiskLevel;
  readonly isBlockedCriticalDanger: boolean;
  readonly dangerReasons: readonly string[];
  readonly canonicalSummary: string;
}

const CRITICAL_SYSTEM_EXECUTABLES = new Set<string>([
  'format',
  'format.com',
  'diskpart',
  'diskpart.exe',
  'bcdedit',
  'bcdedit.exe',
  'cipher',
  'cipher.exe',
  'vssadmin',
  'vssadmin.exe',
  'wbadmin',
  'wbadmin.exe',
  'cmdkey',
  'cmdkey.exe',
  'mimikatz',
  'mimikatz.exe',
  'runas',
  'runas.exe',
]);

export class CommandAnalyzer {
  public static analyze(spec: {
    executable: string;
    args: readonly string[];
    workingDirectory?: string | null;
  }): StructuredCommandAnalysis {
    const rawExe = (spec.executable ?? '').trim();
    const baseRaw = path.win32.basename(rawExe).toLowerCase();
    const args = Array.isArray(spec.args) ? spec.args.map((a) => String(a)) : [];
    const lowerArgs = args.map((a) => a.toLowerCase().trim());

    const dangerReasons: string[] = [];
    let riskLevel: RiskLevel = 'low';
    let isBlockedCriticalDanger = false;

    // 1. Kiểm tra các thực thi hệ thống nguy hiểm cấp độ Critical
    if (CRITICAL_SYSTEM_EXECUTABLES.has(baseRaw)) {
      isBlockedCriticalDanger = true;
      riskLevel = 'critical';
      dangerReasons.push(
        `Thực thi công cụ hệ thống nhạy cảm bị cấm: '${baseRaw}'.`
      );
    }

    // 2. Xác định nhóm PermissionKey dựa trên Executable
    let inferredPermissionKey: PermissionKey = 'shell.run_command';
    let inferredGitPermissionKey: PermissionKey | null = null;

    if (
      baseRaw === 'powershell' ||
      baseRaw === 'powershell.exe' ||
      baseRaw === 'pwsh' ||
      baseRaw === 'pwsh.exe'
    ) {
      inferredPermissionKey = 'shell.powershell';
      riskLevel = 'medium';
    } else if (baseRaw === 'cmd' || baseRaw === 'cmd.exe') {
      inferredPermissionKey = 'shell.cmd';
      riskLevel = 'medium';
    } else if (baseRaw === 'git' || baseRaw === 'git.exe') {
      inferredPermissionKey = 'shell.git_command';
      inferredGitPermissionKey = this.classifyGitSubcommand(lowerArgs);
      if (
        inferredGitPermissionKey &&
        inferredGitPermissionKey !== 'git.read_status_diff'
      ) {
        riskLevel = 'high';
        dangerReasons.push(
          `Thao tác Git thay đổi trạng thái kho lưu trữ (${inferredGitPermissionKey}).`
        );
      }
    } else if (
      ['npm', 'npm.cmd', 'npx', 'npx.cmd', 'pnpm', 'pnpm.cmd', 'yarn', 'yarn.cmd', 'pip', 'pip.exe'].includes(
        baseRaw
      )
    ) {
      inferredPermissionKey = 'shell.package_manager';
      riskLevel = 'medium';
    } else if (
      ['tsc', 'tsc.cmd', 'vite', 'vite.cmd', 'dotnet', 'dotnet.exe', 'msbuild', 'msbuild.exe'].includes(
        baseRaw
      )
    ) {
      inferredPermissionKey = 'shell.build_tool';
    } else if (baseRaw === 'unity' || baseRaw === 'unity.exe') {
      inferredPermissionKey = 'shell.unity_cli';
      riskLevel = 'medium';
    }

    // 3. Phân tích cấu trúc tham số (Arguments) để phát hiện cờ xóa dữ liệu / mã hóa / leo thang đặc quyền
    for (let i = 0; i < lowerArgs.length; i++) {
      const token = lowerArgs[i];

      // PowerShell EncodedCommand hoặc Invoke-Expression
      if (
        token === '-enc' ||
        token === '-encodedcommand' ||
        token.includes('invoke-expression') ||
        token === 'iex' ||
        token.includes('downloadstring')
      ) {
        riskLevel = 'critical';
        isBlockedCriticalDanger = true;
        dangerReasons.push(
          `Phát hiện cờ thực thi mã ẩn hoặc tải kịch bản từ xa ('${args[i]}').`
        );
      }

      // Xóa đệ quy hoặc cưỡng bức
      if (
        token === '-recurse' ||
        token === '-force' ||
        token === '/s' ||
        token === '/q' ||
        token === '-rf' ||
        token === '-fr' ||
        token.includes('remove-item') ||
        token === 'rm' ||
        token === 'del' ||
        token === 'rmdir' ||
        token === 'rd'
      ) {
        if (riskLevel !== 'critical') {
          riskLevel = 'high';
        }
        dangerReasons.push(`Tham số có nguy cơ xóa dữ liệu ('${args[i]}').`);
      }

      // Truy cập Registry hoặc Credential Store
      if (
        token.includes('hklm\\sam') ||
        token.includes('hklm\\security') ||
        token.includes('credentialmanager') ||
        token.includes('.env')
      ) {
        riskLevel = 'critical';
        dangerReasons.push(
          `Tham số truy cập vùng lưu trữ bí mật hệ thống ('${args[i]}').`
        );
      }

      // Git reset --hard / clean -fd / push --force
      if (
        (baseRaw === 'git' || baseRaw === 'git.exe') &&
        (token === '--hard' || token === '--force' || token === '-f')
      ) {
        riskLevel = 'critical';
        dangerReasons.push(
          `Lệnh Git có nguy cơ ghi đè/mất lịch sử dữ liệu ('${args[i]}').`
        );
      }
    }

    const canonicalSummary = `${rawExe}${
      args.length > 0 ? ' ' + args.join(' ') : ''
    }`.trim();

    return {
      normalizedExecutable: rawExe,
      baseExecutableName: baseRaw,
      inferredPermissionKey,
      inferredGitPermissionKey,
      riskLevel,
      isBlockedCriticalDanger,
      dangerReasons,
      canonicalSummary,
    };
  }

  private static classifyGitSubcommand(
    lowerArgs: readonly string[]
  ): PermissionKey {
    // Bỏ qua các cờ đứng trước subcommand như -C <path>
    let sub = '';
    for (let i = 0; i < lowerArgs.length; i++) {
      const t = lowerArgs[i];
      if (t === '-c' || t === '--git-dir' || t === '--work-tree') {
        i += 1;
        continue;
      }
      if (!t.startsWith('-')) {
        sub = t;
        break;
      }
    }

    switch (sub) {
      case 'status':
      case 'log':
      case 'diff':
      case 'show':
      case 'rev-parse':
        return 'git.read_status_diff';
      case 'commit':
        return 'git.commit';
      case 'push':
        return 'git.push';
      case 'merge':
      case 'rebase':
      case 'cherry-pick':
      case 'reset':
        return 'git.merge';
      case 'remote':
        return lowerArgs.includes('-v') && lowerArgs.length <= 2
          ? 'git.read_status_diff'
          : 'git.remote_modify';
      case 'branch':
        return lowerArgs.includes('--show-current') ||
          lowerArgs.includes('-a') ||
          lowerArgs.includes('--list')
          ? 'git.read_status_diff'
          : 'git.create_branch';
      case 'checkout':
      case 'switch':
        return lowerArgs.includes('-b') || lowerArgs.includes('-c')
          ? 'git.create_branch'
          : 'git.merge';
      default:
        return 'git.commit';
    }
  }
}

