import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';

/**
 * WINDOWS EXECUTABLE RESOLVER (G2.7 audit)
 *
 * Bối cảnh (đã xác minh thực tế trên máy này, Node v24.18.0):
 *   spawn('...\\codex.cmd', [...], { shell: false })  ->  Error: spawn EINVAL
 *   (Node ≥ 20.12 / CVE-2024-27980 chặn spawn .cmd/.bat khi không dùng shell.)
 *
 * Giải pháp an toàn: KHÔNG dùng cmd.exe và KHÔNG nối chuỗi lệnh. Với shim npm, đọc dòng
 * `"%dp0%\\node_modules\\<pkg>\\bin\\<entry>.js"` trong shim, rồi chạy trực tiếp:
 *     node.exe <entry.js> <args...>      (shell: false, mảng đối số tách rời)
 * Cách này giữ nguyên ngữ nghĩa shim (shim cũng chỉ gọi node + script) và loại bỏ hoàn toàn
 * bề mặt command injection / lỗi quoting của cmd.exe.
 */

export class ExecutableResolutionError extends Error {
  constructor(public readonly code: string, message: string) {
    super(message);
    this.name = 'ExecutableResolutionError';
  }
}

const SHIM_EXTENSIONS = new Set(['.cmd', '.bat']);
const DIRECT_EXTENSIONS = new Set(['.exe', '.com']);

export function isWindowsShim(executablePath: string): boolean {
  return SHIM_EXTENSIONS.has(path.extname(executablePath).toLowerCase());
}

export function isDirectlySpawnable(executablePath: string): boolean {
  if (process.platform !== 'win32') return true;
  return DIRECT_EXTENSIONS.has(path.extname(executablePath).toLowerCase());
}

/** Tìm file thực thi trong PATH (không dùng shell). Trả về đường dẫn tuyệt đối hoặc null. */
export function findInPath(names: readonly string[], pathEnv = process.env.PATH ?? ''): string | null {
  const dirs = pathEnv.split(path.delimiter).map((d) => d.replace(/^"|"$/g, '')).filter(Boolean);
  for (const dir of dirs) {
    for (const name of names) {
      const candidate = path.join(dir, name);
      try {
        if (fs.statSync(candidate).isFile()) return candidate;
      } catch {
        // tiếp tục
      }
    }
  }
  return null;
}

/** Tìm node.exe THẬT (không phải electron.exe). Ưu tiên node.exe nằm cạnh shim, giống logic của shim npm. */
export function findNodeExecutable(shimDir?: string): string | null {
  if (shimDir) {
    const local = path.join(shimDir, 'node.exe');
    try {
      if (fs.statSync(local).isFile()) return local;
    } catch {
      // tiếp tục
    }
  }
  return findInPath(['node.exe']);
}

/** `where.exe <name>` bằng execFile (đối số tách rời, không shell). */
export function whereExecutable(name: string): string[] {
  if (!/^[A-Za-z0-9._-]+$/.test(name)) return [];
  try {
    const out = execFileSync('where.exe', [name], {
      encoding: 'utf8',
      windowsHide: true,
      stdio: ['ignore', 'pipe', 'ignore'],
      timeout: 8000,
    });
    return out.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  } catch {
    return [];
  }
}

export interface ResolvedCommand {
  /** Đường dẫn tuyệt đối tới .exe sẽ được spawn (shell:false) */
  readonly executable: string;
  /** Đối số đứng trước đối số của người dùng (ví dụ đường dẫn script .js) */
  readonly prefixArgs: readonly string[];
  readonly viaShimResolution: boolean;
  readonly shimPath: string | null;
  readonly entryScript: string | null;
}

/**
 * Chuẩn hóa một lệnh: .exe/.com -> dùng trực tiếp; .cmd/.bat (shim npm) -> node.exe + entry .js.
 * Mọi trường hợp khác -> từ chối với mã lỗi rõ ràng (không bao giờ fallback sang cmd.exe).
 */
export function resolveCommand(executablePath: string): ResolvedCommand {
  if (!path.isAbsolute(executablePath)) {
    throw new ExecutableResolutionError('EXECUTABLE_NOT_ABSOLUTE', `Đường dẫn thực thi phải là đường dẫn tuyệt đối: '${executablePath}'.`);
  }
  let stat: fs.Stats;
  try {
    stat = fs.statSync(executablePath);
  } catch {
    throw new ExecutableResolutionError('EXECUTABLE_NOT_FOUND', `Không tìm thấy file thực thi: '${executablePath}'.`);
  }
  if (!stat.isFile()) {
    throw new ExecutableResolutionError('EXECUTABLE_NOT_FILE', `Đường dẫn thực thi không phải file: '${executablePath}'.`);
  }

  if (isDirectlySpawnable(executablePath)) {
    return { executable: executablePath, prefixArgs: [], viaShimResolution: false, shimPath: null, entryScript: null };
  }

  if (isWindowsShim(executablePath)) {
    const shimText = fs.readFileSync(executablePath, 'utf8');
    const match = /"%dp0%\\([^"\r\n]+?\.(?:js|mjs|cjs))"/i.exec(shimText) ?? /"%~dp0\\([^"\r\n]+?\.(?:js|mjs|cjs))"/i.exec(shimText);
    if (!match) {
      throw new ExecutableResolutionError(
        'WINDOWS_SHIM_UNRESOLVABLE',
        `Shim '${executablePath}' không phải dạng shim npm (node + script .js) nên không thể chạy an toàn mà không qua cmd.exe. Studio từ chối dùng cmd.exe.`
      );
    }
    const shimDir = path.dirname(executablePath);
    const entryScript = path.resolve(shimDir, match[1].replace(/\\/g, path.sep));
    // Chặn thoát khỏi thư mục shim (path traversal qua nội dung shim)
    const rel = path.relative(shimDir, entryScript);
    if (rel.startsWith('..') || path.isAbsolute(rel)) {
      throw new ExecutableResolutionError('WINDOWS_SHIM_ESCAPES_DIR', `Script của shim nằm ngoài thư mục shim: '${entryScript}'.`);
    }
    if (!fs.existsSync(entryScript)) {
      throw new ExecutableResolutionError('WINDOWS_SHIM_ENTRY_MISSING', `Script đích của shim không tồn tại: '${entryScript}'.`);
    }
    const nodePath = findNodeExecutable(shimDir);
    if (!nodePath) {
      throw new ExecutableResolutionError('NODE_NOT_FOUND', 'Không tìm thấy node.exe trong PATH để chạy script của shim.');
    }
    return { executable: nodePath, prefixArgs: [entryScript], viaShimResolution: true, shimPath: executablePath, entryScript };
  }

  throw new ExecutableResolutionError(
    'EXECUTABLE_TYPE_NOT_ALLOWED',
    `Loại file '${path.extname(executablePath) || '(không có phần mở rộng)'}' không được phép spawn trực tiếp. Chỉ cho phép .exe/.com hoặc shim npm đã giải quyết được.`
  );
}

