import { execFile } from 'node:child_process';
import os from 'node:os';

/**
 * PROCESS MONITOR (G2.7) — chỉ báo cáo những gì QUAN SÁT ĐƯỢC TRỰC TIẾP từ Windows (CIM Win32_Process).
 *
 * - Định danh tiến trình = pid + process_start_time (PID có thể bị Windows tái sử dụng).
 * - CPU% suy ra từ chênh lệch Kernel+User time giữa 2 lần đo thật; lần đo đầu tiên = 'unknown' (không đoán).
 * - Chỉ đo tiến trình gốc (root process); KHÔNG cộng dồn tiến trình con (ghi rõ sampleScope).
 * - Không lấy được → 'unsupported' / 'unknown' / 'not_found', tuyệt đối không bịa số liệu.
 */
export type ProcessProbeStatus = 'sampled' | 'unsupported' | 'unknown' | 'not_found';

export interface ProcessProbeResult {
  readonly pid: number;
  readonly status: ProcessProbeStatus;
  readonly parentPid: number | null;
  /** ISO-8601 UTC */
  readonly startTime: string | null;
  /** Kernel + User CPU time tích lũy (ms) */
  readonly cpuTimeMs: number | null;
  readonly workingSetBytes: number | null;
  readonly error?: string;
}

export type ProcessProbeFn = (pid: number) => Promise<ProcessProbeResult>;

export interface ProcessSample {
  readonly sessionId: string;
  readonly pid: number;
  readonly status: ProcessProbeStatus;
  readonly parentPid: number | null;
  readonly startTime: string | null;
  readonly cpuPercent: number | null;
  readonly workingSetBytes: number | null;
  readonly sampledAt: string;
  readonly processIdentityChanged: boolean;
}

const POWERSHELL_SCRIPT = (pid: number): string =>
  `$ErrorActionPreference='Stop';` +
  `$p=Get-CimInstance Win32_Process -Filter "ProcessId=${pid}";` +
  `if($null -eq $p){''}else{` +
  `[pscustomobject]@{ParentProcessId=$p.ParentProcessId;Start=$p.CreationDate.ToUniversalTime().ToString('o');` +
  `WorkingSetSize=[double]$p.WorkingSetSize;KernelModeTime=[double]$p.KernelModeTime;UserModeTime=[double]$p.UserModeTime}` +
  `|ConvertTo-Json -Compress}`;

export const probeWindowsProcess: ProcessProbeFn = (pid: number) =>
  new Promise<ProcessProbeResult>((resolve) => {
    if (!Number.isInteger(pid) || pid <= 0) {
      return resolve({ pid, status: 'unknown', parentPid: null, startTime: null, cpuTimeMs: null, workingSetBytes: null, error: 'PID không hợp lệ.' });
    }
    if (process.platform !== 'win32') {
      return resolve({ pid, status: 'unsupported', parentPid: null, startTime: null, cpuTimeMs: null, workingSetBytes: null, error: 'Chỉ hỗ trợ Windows.' });
    }
    execFile(
      'powershell.exe',
      ['-NoProfile', '-NonInteractive', '-Command', POWERSHELL_SCRIPT(pid)],
      { windowsHide: true, timeout: 10_000, maxBuffer: 64 * 1024 },
      (err, stdout) => {
        if (err) {
          return resolve({ pid, status: 'unknown', parentPid: null, startTime: null, cpuTimeMs: null, workingSetBytes: null, error: err.message.slice(0, 200) });
        }
        const text = String(stdout ?? '').trim();
        if (!text) {
          return resolve({ pid, status: 'not_found', parentPid: null, startTime: null, cpuTimeMs: null, workingSetBytes: null });
        }
        try {
          const parsed = JSON.parse(text) as {
            ParentProcessId: number;
            Start: string;
            WorkingSetSize: number;
            KernelModeTime: number;
            UserModeTime: number;
          };
          resolve({
            pid,
            status: 'sampled',
            parentPid: Number.isFinite(parsed.ParentProcessId) ? parsed.ParentProcessId : null,
            startTime: typeof parsed.Start === 'string' ? parsed.Start : null,
            // Win32_Process KernelModeTime/UserModeTime: đơn vị 100 ns
            cpuTimeMs: (Number(parsed.KernelModeTime) + Number(parsed.UserModeTime)) / 10_000,
            workingSetBytes: Number.isFinite(parsed.WorkingSetSize) ? parsed.WorkingSetSize : null,
          });
        } catch {
          resolve({ pid, status: 'unknown', parentPid: null, startTime: null, cpuTimeMs: null, workingSetBytes: null, error: 'Không phân tích được kết quả CIM.' });
        }
      }
    );
  });

interface SamplerState {
  readonly pid: number;
  readonly timer: NodeJS.Timeout;
  inFlight: boolean;
  lastCpuTimeMs: number | null;
  lastWallMs: number | null;
  knownStartTime: string | null;
}

export class ProcessMonitor {
  private readonly probeFn: ProcessProbeFn;
  private readonly samplers = new Map<string, SamplerState>();
  private readonly logicalCpuCount = Math.max(1, os.cpus().length);

  constructor(options?: { probe?: ProcessProbeFn; probeFn?: ProcessProbeFn }) {
    this.probeFn = options?.probe ?? options?.probeFn ?? probeWindowsProcess;
  }

  public probe(pid: number): Promise<ProcessProbeResult> {
    return this.probeFn(pid);
  }

  public isSampling(sessionId: string): boolean {
    return this.samplers.has(sessionId);
  }

  public startSampling(options: {
    sessionId: string;
    pid: number;
    intervalMs?: number;
    onSample: (sample: ProcessSample) => void;
  }): void {
    const { sessionId, pid, onSample } = options;
    if (this.samplers.has(sessionId)) return;
    const intervalMs = Math.max(50, options.intervalMs ?? 5000);

    const tick = async (): Promise<void> => {
      const current = this.samplers.get(sessionId);
      if (!current || current.inFlight) return;
      current.inFlight = true;
      try {
        const probe = await this.probeFn(pid);
        if (!this.samplers.has(sessionId)) return; // đã dừng trong lúc đo
        const wallNow = Date.now();
        let identityChanged = false;
        if (probe.status === 'sampled' && probe.startTime) {
          if (current.knownStartTime && current.knownStartTime !== probe.startTime) {
            identityChanged = true; // PID đã bị tái sử dụng bởi tiến trình khác
          }
          current.knownStartTime = current.knownStartTime ?? probe.startTime;
        }

        let cpuPercent: number | null = null;
        if (
          !identityChanged &&
          probe.status === 'sampled' &&
          probe.cpuTimeMs !== null &&
          current.lastCpuTimeMs !== null &&
          current.lastWallMs !== null &&
          wallNow > current.lastWallMs
        ) {
          const cpuDelta = probe.cpuTimeMs - current.lastCpuTimeMs;
          const wallDelta = wallNow - current.lastWallMs;
          if (cpuDelta >= 0) {
            cpuPercent = Math.min(100, Math.round((cpuDelta / wallDelta / this.logicalCpuCount) * 1000) / 10);
          }
        }
        if (probe.status === 'sampled' && !identityChanged) {
          current.lastCpuTimeMs = probe.cpuTimeMs;
          current.lastWallMs = wallNow;
        }

        onSample({
          sessionId,
          pid,
          status: identityChanged ? 'unknown' : probe.status,
          parentPid: probe.parentPid,
          startTime: probe.startTime,
          cpuPercent,
          workingSetBytes: identityChanged ? null : probe.workingSetBytes,
          sampledAt: new Date(wallNow).toISOString(),
          processIdentityChanged: identityChanged,
        });
      } finally {
        const again = this.samplers.get(sessionId);
        if (again) again.inFlight = false;
      }
    };

    const state: SamplerState = {
      pid,
      inFlight: false,
      lastCpuTimeMs: null,
      lastWallMs: null,
      knownStartTime: null,
      timer: setInterval(() => void tick(), intervalMs),
    };
    state.timer.unref();
    this.samplers.set(sessionId, state);
    void tick();
  }

  public stopSampling(sessionId: string): void {
    const state = this.samplers.get(sessionId);
    if (state) {
      clearInterval(state.timer);
      this.samplers.delete(sessionId);
    }
  }

  public stopAll(): void {
    for (const sessionId of [...this.samplers.keys()]) {
      this.stopSampling(sessionId);
    }
  }
}

