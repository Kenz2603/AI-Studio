import fs from 'node:fs';
import path from 'node:path';

/**
 * WINDOWS PATH GUARD (REAL FILESYSTEM PATH CANONICALIZATION & ESCAPE PROTECTION)
 *
 * Thực thi tại Main Process:
 * 1. Chuẩn hóa đường dẫn Windows (Drive letter, backslash, loại bỏ trailing slash).
 * 2. Chặn Null-byte, UNC path trái phép (\\?\, \\.\) và Path Traversal (../).
 * 3. Kiểm tra thực tế fs.lstatSync & fs.realpathSync trên chuỗi thư mục cha để
 *    phát hiện và chặn Symbolic Link / Windows Junction trỏ ra ngoài Workspace.
 * 4. Phân biệt chính xác đường dẫn nằm trong hay ngoài Workspace được giao cho Agent.
 */

export interface PathEvaluationOutcome {
  readonly valid: boolean;
  readonly normalizedTarget: string;
  readonly normalizedWorkspace: string;
  readonly isInsideWorkspace: boolean;
  readonly traversalOrLinkEscapeDetected: boolean;
  readonly violationReason?: string;
}

export class WindowsPathGuard {
  public static normalizeWindowsPath(rawPath: string): string {
    const trimmed = rawPath.trim().replace(/\//g, '\\');
    const resolved = path.win32.resolve(trimmed);
    // Chuẩn hóa ký tự ổ đĩa thành chữ hoa (ví dụ C:\...)
    if (/^[a-z]:\\/i.test(resolved)) {
      return resolved.charAt(0).toUpperCase() + resolved.slice(1);
    }
    return resolved;
  }

  public static isSubPathOrEqual(parentDir: string, candidatePath: string): boolean {
    const normParent = this.normalizeWindowsPath(parentDir).toLowerCase();
    const normCandidate = this.normalizeWindowsPath(candidatePath).toLowerCase();

    if (normParent === normCandidate) {
      return true;
    }

    const parentWithSlash = normParent.endsWith('\\')
      ? normParent
      : `${normParent}\\`;
    return normCandidate.startsWith(parentWithSlash);
  }

  /**
   * Kiểm tra xem đường dẫn hoặc bất kỳ thư mục cha nào đang tồn tại có phải là
   * Symbolic Link / Windows Junction trỏ ra ngoài phạm vi cho phép hay không.
   */
  private static detectSymlinkOrJunctionEscape(
    normalizedTarget: string,
    normalizedWorkspace: string
  ): { escaped: boolean; reason?: string } {
    try {
      let current = normalizedTarget;
      const visited = new Set<string>();

      while (current && !visited.has(current.toLowerCase())) {
        visited.add(current.toLowerCase());

        if (fs.existsSync(current)) {
          const stat = fs.lstatSync(current);
          const real = this.normalizeWindowsPath(fs.realpathSync(current));

          if (stat.isSymbolicLink()) {
            if (!this.isSubPathOrEqual(normalizedWorkspace, real)) {
              return {
                escaped: true,
                reason: `Phát hiện Symbolic Link / Windows Junction tại '${current}' trỏ ra ngoài Workspace ('${real}').`,
              };
            }
          }

          // Ngay cả khi lstat không báo ở node hiện tại, nếu một thư mục cha là Junction
          // thì realpathSync sẽ khác với đường dẫn logic và có thể thoát khỏi Workspace
          if (
            this.isSubPathOrEqual(normalizedWorkspace, current) &&
            !this.isSubPathOrEqual(normalizedWorkspace, real)
          ) {
            return {
              escaped: true,
              reason: `Đường dẫn thực tế sau khi phân giải Junction/Symlink ('${real}') vượt ra ngoài Workspace ('${normalizedWorkspace}').`,
            };
          }
          break;
        }

        const parent = path.win32.dirname(current);
        if (parent === current) {
          break;
        }
        current = parent;
      }
    } catch {
      // Nếu không thể đọc metadata hệ thống trên ổ đĩa không tồn tại, xử lý theo đường dẫn chuẩn hóa
    }
    return { escaped: false };
  }

  public static evaluatePath(
    rawTarget: string,
    rawWorkspace: string
  ): PathEvaluationOutcome {
    if (!rawTarget || typeof rawTarget !== 'string' || !rawTarget.trim()) {
      return {
        valid: false,
        normalizedTarget: '',
        normalizedWorkspace: '',
        isInsideWorkspace: false,
        traversalOrLinkEscapeDetected: true,
        violationReason: 'Đường dẫn mục tiêu không được để trống.',
      };
    }

    if (rawTarget.includes('\0')) {
      return {
        valid: false,
        normalizedTarget: '',
        normalizedWorkspace: '',
        isInsideWorkspace: false,
        traversalOrLinkEscapeDetected: true,
        violationReason: 'Phát hiện ký tự Null-byte độc hại trong đường dẫn.',
      };
    }

    const nfcTarget = rawTarget.normalize('NFC');
    const nfcWorkspace = (rawWorkspace || '').normalize('NFC');

    // Chặn khoảng trắng hoặc dấu chấm ở cuối phân đoạn (Win32 evasion) trước khi trim
    const rawWithoutDrive = nfcTarget.replace(/^[a-zA-Z]:/, '');
    const rawSegments = rawWithoutDrive.split(/[\\/]+/).filter(Boolean);
    for (const seg of rawSegments) {
      if (seg !== '.' && seg !== '..' && (seg.endsWith('.') || seg.endsWith(' '))) {
        return {
          valid: false,
          normalizedTarget: nfcTarget,
          normalizedWorkspace: nfcWorkspace,
          isInsideWorkspace: false,
          traversalOrLinkEscapeDetected: true,
          violationReason: `Từ chối đường dẫn chứa khoảng trắng hoặc dấu chấm ở cuối phân đoạn ('${seg}').`,
        };
      }
    }

    const trimmedTarget = nfcTarget.trim();

    // Chặn đường dẫn drive-relative nguy hiểm trên Windows (ví dụ C:foo.txt không có backslash)
    if (/^[a-zA-Z]:[^\\/]/.test(trimmedTarget)) {
      return {
        valid: false,
        normalizedTarget: trimmedTarget,
        normalizedWorkspace: nfcWorkspace,
        isInsideWorkspace: false,
        traversalOrLinkEscapeDetected: true,
        violationReason: 'Từ chối đường dẫn drive-relative không an toàn (thiếu dấu gạch chéo sau ký tự ổ đĩa).',
      };
    }

    // Chặn Windows Device Namespace / UNC raw bypass (\\?\, \\.\, \\Server\Share)
    if (
      trimmedTarget.startsWith('\\\\?\\') ||
      trimmedTarget.startsWith('\\\\.\\') ||
      trimmedTarget.startsWith('//?/') ||
      trimmedTarget.startsWith('//./') ||
      trimmedTarget.startsWith('\\\\')
    ) {
      return {
        valid: false,
        normalizedTarget: trimmedTarget,
        normalizedWorkspace: nfcWorkspace,
        isInsideWorkspace: false,
        traversalOrLinkEscapeDetected: true,
        violationReason:
          'Từ chối đường dẫn UNC / Windows Device Namespace (\\\\?\\, \\\\.\\).',
      };
    }

    // Chặn NTFS Alternate Data Streams (ADS) ngoài dấu ':' của ký tự ổ đĩa (ví dụ file.txt:stream)
    const withoutDrive = trimmedTarget.replace(/^[a-zA-Z]:/, '');
    if (withoutDrive.includes(':')) {
      return {
        valid: false,
        normalizedTarget: trimmedTarget,
        normalizedWorkspace: nfcWorkspace,
        isInsideWorkspace: false,
        traversalOrLinkEscapeDetected: true,
        violationReason:
          'Từ chối đường dẫn chứa NTFS Alternate Data Stream (:).',
      };
    }

    // Chặn Windows Reserved Device Names (CON, PRN, AUX, NUL, COM1-9, LPT1-9)
    const segments = withoutDrive.split(/[\\/]+/).filter(Boolean);
    for (const seg of segments) {
      const baseName = seg.split('.')[0].toUpperCase();
      if (/^(CON|PRN|AUX|NUL|COM[1-9]|LPT[1-9])$/.test(baseName)) {
        return {
          valid: false,
          normalizedTarget: trimmedTarget,
          normalizedWorkspace: nfcWorkspace,
          isInsideWorkspace: false,
          traversalOrLinkEscapeDetected: true,
          violationReason: `Từ chối tên thiết bị hệ thống dành riêng trên Windows (DOS reserved device name: ${baseName}).`,
        };
      }
    }

    // Chặn định dạng tên ngắn Windows 8.3 Short Name (ví dụ PROGRA~1)
    if (/[a-zA-Z0-9]~[1-9]/.test(withoutDrive)) {
      return {
        valid: false,
        normalizedTarget: trimmedTarget,
        normalizedWorkspace: rawWorkspace,
        isInsideWorkspace: false,
        traversalOrLinkEscapeDetected: true,
        violationReason: 'Từ chối định dạng tên ngắn Windows 8.3 short name (chứa ký tự ~ và số).',
      };
    }

    const normalizedWorkspace = this.normalizeWindowsPath(rawWorkspace);

    // Nếu đường dẫn đầu vào là tương đối, phân giải theo Workspace của Agent
    const candidateFull = path.win32.isAbsolute(trimmedTarget.replace(/\//g, '\\'))
      ? this.normalizeWindowsPath(trimmedTarget)
      : this.normalizeWindowsPath(
          path.win32.join(normalizedWorkspace, trimmedTarget)
        );

    const insideWorkspace = this.isSubPathOrEqual(
      normalizedWorkspace,
      candidateFull
    );

    // Nếu người dùng truyền đường dẫn có chứa '..' và kết quả nhảy ra ngoài Workspace -> Traversal Attack
    const hasDotDotSegment = /(^|[\\/])\.\.([\\/]|$)/.test(trimmedTarget);
    if (hasDotDotSegment && !insideWorkspace) {
      return {
        valid: false,
        normalizedTarget: candidateFull,
        normalizedWorkspace,
        isInsideWorkspace: false,
        traversalOrLinkEscapeDetected: true,
        violationReason: `Chặn hành vi Path Traversal ('..') thoát khỏi Workspace '${normalizedWorkspace}'.`,
      };
    }

    const linkCheck = this.detectSymlinkOrJunctionEscape(
      candidateFull,
      normalizedWorkspace
    );
    if (linkCheck.escaped) {
      return {
        valid: false,
        normalizedTarget: candidateFull,
        normalizedWorkspace,
        isInsideWorkspace: false,
        traversalOrLinkEscapeDetected: true,
        violationReason: linkCheck.reason,
      };
    }

    return {
      valid: true,
      normalizedTarget: candidateFull,
      normalizedWorkspace,
      isInsideWorkspace: insideWorkspace,
      traversalOrLinkEscapeDetected: false,
    };
  }
}

export function normalizeWindowsPathForComparison(rawPath: string): string {
  return WindowsPathGuard.normalizeWindowsPath(rawPath).toLowerCase();
}

export function validateWorkspaceTargetSafety(
  rawTarget: string,
  rawWorkspace: string
): {
  safe: boolean;
  normalizedTarget: string;
  reason?: string;
} {
  const outcome = WindowsPathGuard.evaluatePath(rawTarget, rawWorkspace);
  if (
    !outcome.valid ||
    outcome.traversalOrLinkEscapeDetected ||
    !outcome.isInsideWorkspace
  ) {
    return {
      safe: false,
      normalizedTarget: outcome.normalizedTarget,
      reason:
        outcome.violationReason ??
        `Đường dẫn "${rawTarget}" vượt ra ngoài phạm vi Workspace "${rawWorkspace}".`,
    };
  }
  return {
    safe: true,
    normalizedTarget: outcome.normalizedTarget,
  };
}


