import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

export interface SystemResourceMetrics {
  readonly timestamp: string;
  readonly systemMemory: {
    readonly totalBytes: number;
    readonly freeBytes: number;
    readonly usedPercent: number;
  };
  readonly processMemory: {
    readonly rssBytes: number;
    readonly heapTotalBytes: number;
    readonly heapUsedBytes: number;
    readonly externalBytes: number;
  };
  readonly diskStorage: {
    readonly rootPath: string;
    readonly totalBytes: number;
    readonly freeBytes: number;
    readonly availableBytes: number;
    readonly freePercent: number;
  };
  readonly studioStorage: {
    readonly sqliteDbSizeBytes: number;
    readonly sqliteWalSizeBytes: number;
    readonly artifactStorageSizeBytes: number;
    readonly logStorageSizeBytes: number;
    readonly totalStudioBytes: number;
  };
  readonly activeWorkload: {
    readonly activeProcessCount: number;
    readonly queueLength: number;
  };
  readonly healthStatus: 'healthy' | 'warning' | 'critical';
  readonly warnings: readonly string[];
}

export interface ResourceMonitorDependencies {
  readonly dbPath?: string;
  readonly storageRoot?: string;
  readonly getActiveProcessCount?: () => number;
  readonly getQueueLength?: () => number;
}

/**
 * RESOURCE MONITOR (G2.10 RELIABILITY & HEALTH MONITORING)
 *
 * Thu thập và phân tích tài nguyên thực tế:
 * - RAM (Hệ thống & Node Process Memory)
 * - Ổ đĩa (Dung lượng trống thực tế qua fs.statfs)
 * - Lưu trữ Studio (Kích thước SQLite, WAL, Collaboration Artifacts, Logs)
 * - Khối lượng tải công việc (Tiến trình đang chạy, Hàng đợi điều phối)
 * - Cảnh báo tự động khi tiệm cận ngưỡng quá tải hoặc cạn kiệt dung lượng.
 */
export class ResourceMonitor {
  private readonly dbPath: string;
  private readonly storageRoot: string;
  private readonly getActiveProcessCount: () => number;
  private readonly getQueueLength: () => number;

  constructor(deps?: ResourceMonitorDependencies) {
    this.dbPath = deps?.dbPath ?? path.resolve(process.cwd(), 'storage', 'studio.db');
    this.storageRoot = deps?.storageRoot ?? path.resolve(process.cwd(), 'storage');
    this.getActiveProcessCount = deps?.getActiveProcessCount ?? (() => 0);
    this.getQueueLength = deps?.getQueueLength ?? (() => 0);
  }

  private calculateDirectorySize(dirPath: string): number {
    if (!fs.existsSync(dirPath)) return 0;
    let totalSize = 0;
    try {
      const entries = fs.readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        const fullPath = path.join(dirPath, entry.name);
        try {
          if (entry.isDirectory()) {
            totalSize += this.calculateDirectorySize(fullPath);
          } else if (entry.isFile()) {
            totalSize += fs.statSync(fullPath).size;
          }
        } catch {
          // Bỏ qua lỗi đọc file tạm thời
        }
      }
    } catch {
      // Bỏ qua lỗi mở thư mục
    }
    return totalSize;
  }

  private getFileSize(filePath: string): number {
    if (!fs.existsSync(filePath)) return 0;
    try {
      return fs.statSync(filePath).size;
    } catch {
      return 0;
    }
  }

  /**
   * Đo lường chỉ số tài nguyên toàn diện
   */
  public sampleMetrics(): SystemResourceMetrics {
    const timestamp = new Date().toISOString();
    const warnings: string[] = [];

    // 1. Bộ nhớ Hệ thống
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMemPercent = totalMem > 0 ? Math.round(((totalMem - freeMem) / totalMem) * 100) : 0;

    if (freeMem < 1024 * 1024 * 1024) {
      warnings.push(`CẢNH BÁO: Bộ nhớ RAM tự do của hệ điều hành còn dưới 1 GB (${Math.round(freeMem / (1024 * 1024))} MB).`);
    }

    // 2. Bộ nhớ Node / Electron Process
    const procMem = process.memoryUsage();
    if (procMem.heapUsed > 1.5 * 1024 * 1024 * 1024) {
      warnings.push(
        `CẢNH BÁO: Bộ nhớ Heap của tiến trình Studio vượt quá 1.5 GB (${Math.round(procMem.heapUsed / (1024 * 1024))} MB).`
      );
    }

    // 3. Ổ đĩa lưu trữ (Dùng native fs.statfsSync của Node.js)
    let diskTotal = 0;
    let diskFree = 0;
    let diskAvailable = 0;
    const diskRoot = path.parse(this.storageRoot).root || 'C:\\';

    try {
      const statfs = fs.statfsSync(diskRoot);
      const bsize = statfs.bsize;
      diskTotal = statfs.blocks * bsize;
      diskFree = statfs.bfree * bsize;
      diskAvailable = statfs.bavail * bsize;
    } catch {
      // Nếu statfsSync gặp lỗi trên đường dẫn mạng, giữ 0
    }

    const freePercent = diskTotal > 0 ? Math.round((diskAvailable / diskTotal) * 100) : 0;
    if (diskAvailable > 0 && diskAvailable < 1024 * 1024 * 1024) {
      warnings.push(
        `NGUY CẤP: Dung lượng ổ đĩa '${diskRoot}' còn dưới 1 GB (${Math.round(diskAvailable / (1024 * 1024))} MB). Có nguy cơ lỗi ghi dữ liệu!`
      );
    } else if (diskAvailable > 0 && diskAvailable < 5 * 1024 * 1024 * 1024) {
      warnings.push(
        `CẢNH BÁO: Dung lượng ổ đĩa '${diskRoot}' còn dưới 5 GB (${Math.round(diskAvailable / (1024 * 1024))} MB).`
      );
    }

    // 4. Kích thước lưu trữ Studio
    const sqliteDbSizeBytes = this.getFileSize(this.dbPath);
    const sqliteWalSizeBytes = this.getFileSize(`${this.dbPath}-wal`);
    const artifactDir = path.join(this.storageRoot, 'collaboration_artifacts');
    const artifactStorageSizeBytes = this.calculateDirectorySize(artifactDir);
    const logDir = path.join(this.storageRoot, 'logs');
    const logStorageSizeBytes = this.calculateDirectorySize(logDir);
    const totalStudioBytes =
      sqliteDbSizeBytes + sqliteWalSizeBytes + artifactStorageSizeBytes + logStorageSizeBytes;

    if (sqliteDbSizeBytes > 500 * 1024 * 1024) {
      warnings.push(
        `CẢNH BÁO: Kích thước SQLite Studio đạt ${Math.round(sqliteDbSizeBytes / (1024 * 1024))} MB (> 500 MB). Cần kiểm tra dọn dẹp hoặc vacuum.`
      );
    }

    // 5. Tải công việc
    const activeProcessCount = this.getActiveProcessCount();
    const queueLength = this.getQueueLength();

    if (queueLength > 20) {
      warnings.push(`CẢNH BÁO: Hàng đợi tác vụ đang có ${queueLength} công việc chờ điều phối.`);
    }

    // 6. Đánh giá trạng thái tổng thể
    let healthStatus: 'healthy' | 'warning' | 'critical' = 'healthy';
    if (warnings.some((w) => w.startsWith('NGUY CẤP'))) {
      healthStatus = 'critical';
    } else if (warnings.length > 0) {
      healthStatus = 'warning';
    }

    return {
      timestamp,
      systemMemory: {
        totalBytes: totalMem,
        freeBytes: freeMem,
        usedPercent: usedMemPercent,
      },
      processMemory: {
        rssBytes: procMem.rss,
        heapTotalBytes: procMem.heapTotal,
        heapUsedBytes: procMem.heapUsed,
        externalBytes: procMem.external,
      },
      diskStorage: {
        rootPath: diskRoot,
        totalBytes: diskTotal,
        freeBytes: diskFree,
        availableBytes: diskAvailable,
        freePercent,
      },
      studioStorage: {
        sqliteDbSizeBytes,
        sqliteWalSizeBytes,
        artifactStorageSizeBytes,
        logStorageSizeBytes,
        totalStudioBytes,
      },
      activeWorkload: {
        activeProcessCount,
        queueLength,
      },
      healthStatus,
      warnings,
    };
  }
}

