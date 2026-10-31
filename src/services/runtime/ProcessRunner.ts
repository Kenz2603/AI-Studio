import { execFile, spawn, type ChildProcess } from 'node:child_process';
import fs from 'node:fs';
import { StringDecoder } from 'node:string_decoder';
import { validateWorkspaceTargetSafety } from '../security/WindowsPathGuard';
import { resolveCommand } from './WindowsExecutableResolver';
import { probeWindowsProcess } from './ProcessMonitor';
import type { ProcessRunResult, ProcessSpawnOptions } from './RuntimeTypes';

const SENSITIVE_ENV_NAME = /(TOKEN|SECRET|PASSWORD|PASSWD|CREDENTIAL|COOKIE|API_?KEY)/i;

interface ActiveProcess {
  readonly process: ChildProcess;
  readonly pid: number;
  creationDate: string | null;
  terminationReason: string | null;
}

/**
 * PROCESS RUNNER (G2.6 → G2.7 audit)
 *
 * - shell: false, đối số tách rời; .cmd/.bat được giải quyết thành node.exe + script (WindowsExecutableResolver),
 *   tuyệt đối không dùng cmd.exe và không nối chuỗi lệnh.
 * - stdin được đóng ngay (hoặc ghi stdinText rồi đóng) để CLI như `codex exec` không treo chờ stdin.
 * - Output được stream theo chunk (StringDecoder xử lý ký tự UTF-8 bị cắt), bộ đệm giới hạn theo BYTE.
 * - Hủy cả cây tiến trình bằng taskkill (execFile, đối số tách rời).
 * - Biến môi trường nhạy cảm của Studio KHÔNG được kế thừa sang tiến trình con (trừ khi truyền tường minh qua options.env).
 */
export class ProcessRunner {
  private readonly activeProcesses = new Map<string, ActiveProcess>();
  private readonly defaultTimeoutMs = 120_000;
  private readonly defaultMaxBufferBytes = 10 * 1024 * 1024;

  public async run(options: ProcessSpawnOptions): Promise<ProcessRunResult> {
    const {
      executable,
      args,
      workingDirectory,
      sessionId,
      timeoutMs = this.defaultTimeoutMs,
      maxBufferBytes = this.defaultMaxBufferBytes,
    } = options;

    if (!executable || executable.trim().length === 0) {
      throw new Error('ProcessRunner: Đường dẫn thực thi (executable) không được để trống.');
    }
    if (!fs.existsSync(workingDirectory) || !fs.statSync(workingDirectory).isDirectory()) {
      throw new Error(`ProcessRunner: Thư mục làm việc không tồn tại: '${workingDirectory}'`);
    }
    const pathSafety = validateWorkspaceTargetSafety(workingDirectory, workingDirectory);
    if (!pathSafety.safe) {
      throw new Error(`ProcessRunner: Thư mục làm việc vi phạm bảo mật Windows: ${pathSafety.reason}`);
    }
    for (const arg of args) {
      if (typeof arg !== 'string' || arg.includes('\0')) {
        throw new Error('ProcessRunner: Đối số không hợp lệ (phải là chuỗi, không chứa NUL).');
      }
    }

    // Có thể ném ExecutableResolutionError (mã lỗi rõ ràng) — không fallback sang shell
    const resolved = resolveCommand(executable);
    const finalArgs = [...resolved.prefixArgs, ...args];

    const childEnv: NodeJS.ProcessEnv = {};
    for (const [name, value] of Object.entries(process.env)) {
      if (!SENSITIVE_ENV_NAME.test(name)) childEnv[name] = value;
    }
    Object.assign(childEnv, options.env ?? {});
    childEnv.AI_STUDIO_SESSION_ID = sessionId;

    const startTime = Date.now();

    return new Promise<ProcessRunResult>((resolve) => {
      let stdoutAcc = '';
      let stderrAcc = '';
      let stdoutBytes = 0;
      let stderrBytes = 0;
      let bytesRead = 0;
      let timedOut = false;
      let outputTruncated = false;
      let settled = false;
      let timer: NodeJS.Timeout | null = null;
      const stdoutDecoder = new StringDecoder('utf8');
      const stderrDecoder = new StringDecoder('utf8');

      let child: ChildProcess;
      try {
        child = spawn(resolved.executable, finalArgs, {
          cwd: workingDirectory,
          env: childEnv,
          shell: false,
          windowsHide: true,
          stdio: ['pipe', 'pipe', 'pipe'],
        });
      } catch (err) {
        return resolve({
          pid: null,
          exitCode: null,
          exitSignal: null,
          stdoutText: '',
          stderrText: '',
          durationMs: Date.now() - startTime,
          timedOut: false,
          cancelled: false,
          terminationReason: null,
          outputTruncated: false,
          bytesRead: 0,
          bytesWritten: 0,
          error: `spawn thất bại: ${(err as Error).message}`,
        });
      }

      const finish = (exitCode: number | null, exitSignal: string | null, errorMessage?: string): void => {
        if (settled) return;
        settled = true;
        if (timer) clearTimeout(timer);
        const entry = this.activeProcesses.get(sessionId);
        const terminationReason = entry?.process === child ? entry.terminationReason : null;
        if (entry?.process === child) this.activeProcesses.delete(sessionId);

        const tail1 = stdoutDecoder.end();
        const tail2 = stderrDecoder.end();
        if (tail1) stdoutAcc += tail1;
        if (tail2) stderrAcc += tail2;

        // Dọn pipe & listener
        child.stdout?.removeAllListeners();
        child.stderr?.removeAllListeners();
        child.stdin?.removeAllListeners();

        const cancelled =
          terminationReason !== null &&
          !timedOut &&
          terminationReason !== 'BUFFER_OVERFLOW' &&
          terminationReason !== 'TIMEOUT';
        try {
          options.onExit?.({
            pid: child.pid ?? null,
            exitCode,
            exitSignal,
            timedOut,
            cancelled,
            durationMs: Date.now() - startTime,
          });
        } catch {
          // callback telemetry không được làm hỏng vòng đời tiến trình
        }

        resolve({
          pid: child.pid ?? null,
          exitCode,
          exitSignal,
          stdoutText: stdoutAcc,
          stderrText: stderrAcc,
          durationMs: Date.now() - startTime,
          timedOut,
          cancelled,
          terminationReason,
          outputTruncated,
          bytesRead,
          bytesWritten: options.stdinText ? Buffer.byteLength(options.stdinText) : 0,
          error:
            errorMessage ??
            (timedOut
              ? `Tiến trình bị ngắt do vượt quá thời gian tối đa ${timeoutMs}ms.`
              : outputTruncated
              ? 'Tiến trình bị ngắt do output vượt quá giới hạn buffer an toàn.'
              : undefined),
        });
      };

      const pid = child.pid ?? null;
      if (pid) {
        const activeEntry: ActiveProcess = {
          process: child,
          pid,
          creationDate: null,
          terminationReason: null,
        };
        this.activeProcesses.set(sessionId, activeEntry);

        // Thu thập CreationDate bất đồng bộ để bảo vệ chống PID reuse khi hủy
        if (process.platform === 'win32') {
          void probeWindowsProcess(pid)
            .then((probe) => {
              if (probe.status === 'sampled' && probe.startTime) {
                activeEntry.creationDate = probe.startTime;
              }
            })
            .catch(() => undefined);
        }

        try {
          options.onSpawn?.({
            pid,
            executable: resolved.executable,
            viaShimResolution: resolved.viaShimResolution,
          });
        } catch {
          // bỏ qua lỗi callback
        }
      }

      if (timeoutMs > 0) {
        timer = setTimeout(() => {
          timedOut = true;
          this.terminateProcessTree(sessionId, 'TIMEOUT');
        }, timeoutMs);
      }

      // stdin: luôn đóng để CLI không treo
      child.stdin?.on('error', () => undefined);
      if (options.stdinText) {
        child.stdin?.end(options.stdinText);
      } else {
        child.stdin?.end();
      }

      child.stdout?.on('data', (chunk: Buffer) => {
        bytesRead += chunk.length;
        const text = stdoutDecoder.write(chunk);
        if (stdoutBytes + chunk.length > maxBufferBytes) {
          if (!outputTruncated) {
            outputTruncated = true;
            stdoutAcc += '\n[STUDIO: Đã đạt giới hạn buffer. Ngắt tiến trình.]\n';
            this.terminateProcessTree(sessionId, 'BUFFER_OVERFLOW');
          }
          return;
        }
        stdoutBytes += chunk.length;
        stdoutAcc += text;
        if (text) options.onOutput?.('stdout', text);
      });

      child.stderr?.on('data', (chunk: Buffer) => {
        bytesRead += chunk.length;
        const text = stderrDecoder.write(chunk);
        if (stderrBytes + chunk.length > maxBufferBytes) {
          if (!outputTruncated) {
            outputTruncated = true;
            stderrAcc += '\n[STUDIO: Stderr vượt giới hạn buffer. Ngắt tiến trình.]\n';
            this.terminateProcessTree(sessionId, 'BUFFER_OVERFLOW');
          }
          return;
        }
        stderrBytes += chunk.length;
        stderrAcc += text;
        if (text) options.onOutput?.('stderr', text);
      });

      child.on('error', (err: Error) => {
        finish(null, null, `Lỗi tiến trình: ${err.message}`);
      });

      child.on('close', (code: number | null, signal: string | null) => {
        finish(code, signal);
      });
    });
  }

  /** Hủy toàn bộ cây tiến trình (Windows: taskkill /T /F bất đồng bộ, xác thực PID CreationDate chống PID reuse). */
  public terminateProcessTree(sessionId: string, reason = 'CANCELLED'): boolean {
    const entry = this.activeProcesses.get(sessionId);
    if (!entry || entry.terminationReason !== null) {
      return false;
    }
    entry.terminationReason = reason;

    // Nếu tiến trình đã kết thúc hoặc bị đánh dấu killed, tránh gọi taskkill trên PID có thể đã bị hệ thống tái sử dụng
    if (entry.process.exitCode !== null || entry.process.killed || entry.process.pid !== entry.pid) {
      return true;
    }

    if (process.platform === 'win32') {
      const targetPid = entry.pid;
      const expectedStart = entry.creationDate;

      const performKill = (): void => {
        execFile(
          'taskkill.exe',
          ['/pid', String(targetPid), '/t', '/f'],
          { windowsHide: true, timeout: 5_000 },
          () => undefined
        );
      };

      if (expectedStart) {
        void probeWindowsProcess(targetPid)
          .then((probe) => {
            // Nếu PID đã bị tái sử dụng bởi một tiến trình khác có CreationDate khác -> Chặn kill
            if (probe.status === 'sampled' && probe.startTime && probe.startTime !== expectedStart) {
              return;
            }
            if (probe.status === 'not_found') {
              return; // Tiến trình đã tự thoát
            }
            performKill();
          })
          .catch(() => performKill());
      } else {
        performKill();
      }
    } else {
      try {
        entry.process.kill('SIGKILL');
      } catch {
        // tiến trình có thể đã kết thúc
      }
    }
    return true;
  }

  public async terminateProcessTreeAsync(sessionId: string, reason = 'CANCELLED'): Promise<boolean> {
    const entry = this.activeProcesses.get(sessionId);
    if (!entry || entry.terminationReason !== null) {
      return false;
    }
    entry.terminationReason = reason;

    if (entry.process.exitCode !== null || entry.process.killed || entry.process.pid !== entry.pid) {
      return true;
    }

    if (process.platform === 'win32') {
      const targetPid = entry.pid;
      const expectedStart = entry.creationDate;

      if (expectedStart) {
        const probe = await probeWindowsProcess(targetPid);
        if (probe.status === 'sampled' && probe.startTime && probe.startTime !== expectedStart) {
          return false; // PID reuse detected!
        }
        if (probe.status === 'not_found') {
          return true;
        }
      }

      await new Promise<void>((resolve) => {
        execFile(
          'taskkill.exe',
          ['/pid', String(targetPid), '/t', '/f'],
          { windowsHide: true, timeout: 5_000 },
          () => resolve()
        );
      });
    } else {
      try {
        entry.process.kill('SIGKILL');
      } catch {
        // bỏ qua
      }
    }
    return true;
  }

  public isRunning(sessionId: string): boolean {
    return this.activeProcesses.has(sessionId);
  }

  public getActivePid(sessionId: string): number | null {
    return this.activeProcesses.get(sessionId)?.pid ?? null;
  }
}
