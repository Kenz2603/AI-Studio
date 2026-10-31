import { app, BrowserWindow, session } from 'electron';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseClient } from '../database/DatabaseClient';
import { AccountService } from '../services/AccountService';
import { AgentService } from '../services/AgentService';
import { PermissionEngine } from '../services/PermissionEngine';
import { ProviderService } from '../services/ProviderService';
import { StudioService } from '../services/StudioService';
import { TaskOrchestrator } from '../services/TaskOrchestrator';
import { UsageQuotaService } from '../services/UsageQuotaService';
import { ProjectService } from '../services/workspace/ProjectService';
import { RuntimeManager } from '../services/runtime/RuntimeManager';
import { RuntimeOrchestratorBridge } from '../services/runtime/RuntimeOrchestratorBridge';
import { TelemetryService } from '../services/telemetry/TelemetryService';
import { UnityMetaIntegrityGuard } from '../services/workspace/UnityMetaIntegrityGuard';
import { UnityProjectInspector } from '../services/workspace/UnityProjectInspector';
import { WorkspaceFileMonitor } from '../services/workspace/WorkspaceFileMonitor';
import { WorkspaceManagerService } from '../services/workspace/WorkspaceManagerService';
import { WorkspaceSnapshotService } from '../services/workspace/WorkspaceSnapshotService';
import { ArtifactExchangeService } from '../services/collaboration/ArtifactExchangeService';
import { MultiAgentOrchestrator } from '../services/collaboration/MultiAgentOrchestrator';
import { ResourceMonitor } from '../services/system/ResourceMonitor';
import { RuntimeIsolationAdapter } from '../services/security/RuntimeIsolationAdapter';
import { registerIpcHandlers } from './ipc/registerIpcHandlers';

/**
 * ELECTRON MAIN PROCESS ENTRY POINT (G2.4 TASK HUB & ORCHESTRATION)
 *
 * Bảo mật bắt buộc:
 * - contextIsolation: true
 * - nodeIntegration: false
 * - sandbox: true
 * - webSecurity: true
 * - SQLite chỉ được mở tại Main Process và đóng an toàn khi thoát.
 */

const WORKSPACE_ROOT = path.resolve(__dirname, '../../..');
const DB_FILE_PATH = path.join(WORKSPACE_ROOT, 'storage', 'studio.db');

const databaseLayer = new DatabaseClient(DB_FILE_PATH);
databaseLayer.initialize();

const providerService = new ProviderService(databaseLayer);
const accountService = new AccountService(databaseLayer);
const agentService = new AgentService(databaseLayer);
const usageQuotaService = new UsageQuotaService(databaseLayer);
const permissionEngine = new PermissionEngine({
  db: databaseLayer,
  agentService,
});
const studioService = new StudioService({
  workspaceRoot: WORKSPACE_ROOT,
  db: databaseLayer,
  agentService,
  providerService,
  permissionEngine,
});
const unityMetaGuard = new UnityMetaIntegrityGuard({
  db: databaseLayer,
  studioService,
});
const unityInspector = new UnityProjectInspector();
const workspaceSnapshotService = new WorkspaceSnapshotService({
  studioRoot: WORKSPACE_ROOT,
  db: databaseLayer,
  studioService,
  metaGuard: unityMetaGuard,
});
const workspaceFileMonitor = new WorkspaceFileMonitor({
  db: databaseLayer,
  studioService,
});
const workspaceManagerService = new WorkspaceManagerService({
  studioRoot: WORKSPACE_ROOT,
  db: databaseLayer,
  studioService,
  metaGuard: unityMetaGuard,
  unityInspector,
  snapshotService: workspaceSnapshotService,
  fileMonitor: workspaceFileMonitor,
});
const projectService = new ProjectService({
  db: databaseLayer,
  studioService,
  workspaceManager: workspaceManagerService,
  unityInspector,
  metaGuard: unityMetaGuard,
});
const taskOrchestrator = new TaskOrchestrator({
  db: databaseLayer,
  workspaceRoot: WORKSPACE_ROOT,
  agentService,
  providerService,
  accountService,
  permissionEngine,
  studioService,
  workspaceManager: workspaceManagerService,
  metaGuard: unityMetaGuard,
});

const runtimeManager = new RuntimeManager({
  db: databaseLayer,
  studioRoot: WORKSPACE_ROOT,
  agentService,
  permissionEngine,
  studioService,
  workspaceManager: workspaceManagerService,
  snapshotService: workspaceSnapshotService,
  metaGuard: unityMetaGuard,
  concurrencyManager: usageQuotaService.concurrencyManager,
});
const runtimeBridge = new RuntimeOrchestratorBridge({ runtimeManager });
taskOrchestrator.setRuntimeAdapter(runtimeBridge);

const telemetryService = new TelemetryService({
  db: databaseLayer,
  broker: runtimeManager.eventBroker,
  usageQuotaService,
});
runtimeManager.setTelemetryService(telemetryService);
workspaceFileMonitor.setTelemetryService(telemetryService);

const artifactExchangeService = new ArtifactExchangeService({
  db: databaseLayer,
  metaGuard: unityMetaGuard,
});

const multiAgentOrchestrator = new MultiAgentOrchestrator({
  db: databaseLayer,
  agentService,
  permissionEngine,
  taskOrchestrator,
  runtimeManager,
  artifactExchange: artifactExchangeService,
});

const resourceMonitor = new ResourceMonitor({
  dbPath: DB_FILE_PATH,
  storageRoot: path.join(WORKSPACE_ROOT, 'storage'),
  getActiveProcessCount: () => runtimeManager.listSessions().filter((s) => s.status === 'running').length,
  getQueueLength: () => usageQuotaService.concurrencyManager.getConcurrencyState('runtime', 'global').queuedCount,
});

const runtimeIsolationAdapter = new RuntimeIsolationAdapter();

let mainWindow: BrowserWindow | null = null;

function getSecureWebPreferences(): Electron.WebPreferences {
  const preloadPath = path.join(__dirname, '../preload/index.js');
  return {
    preload: preloadPath,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    nodeIntegrationInSubFrames: false,
    sandbox: true,
    webSecurity: true,
    allowRunningInsecureContent: false,
    spellcheck: false,
  };
}

function createMainWindow(): BrowserWindow {
  const win = new BrowserWindow({
    width: 1400,
    height: 880,
    minWidth: 980,
    minHeight: 640,
    title: 'Personal AI Studio',
    backgroundColor: '#020617',
    autoHideMenuBar: true,
    show: false,
    webPreferences: getSecureWebPreferences(),
  });

  win.webContents.setWindowOpenHandler(() => {
    return { action: 'deny' };
  });

  win.webContents.on('will-navigate', (event, targetUrl) => {
    const devServerUrl = process.env.VITE_DEV_SERVER_URL;
    const isAllowedDev = devServerUrl ? targetUrl.startsWith(devServerUrl) : false;
    const isAllowedFile = targetUrl.startsWith('file://');
    if (!isAllowedDev && !isAllowedFile) {
      event.preventDefault();
    }
  });

  win.once('ready-to-show', () => {
    win.show();
  });

  const devServerUrl = process.env.VITE_DEV_SERVER_URL;
  if (devServerUrl) {
    void win.loadURL(devServerUrl);
  } else {
    const indexHtmlPath = path.join(WORKSPACE_ROOT, 'dist', 'renderer', 'index.html');
    void win.loadFile(indexHtmlPath);
  }

  win.on('closed', () => {
    mainWindow = null;
  });

  return win;
}

async function runAutomatedG22VerificationIfRequested(win: BrowserWindow): Promise<void> {
  if (process.env.STUDIO_VERIFY_G22 !== '1') {
    return;
  }

  const reportOutputPath = process.env.STUDIO_VERIFY_REPORT_PATH;
  const screenshotDir = process.env.STUDIO_SCREENSHOT_DIR;
  const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

  await new Promise<void>((resolve) => {
    if (win.webContents.isLoading()) {
      win.webContents.once('did-finish-load', () => resolve());
    } else {
      resolve();
    }
  });

  await sleep(1000);

  // Chạy bộ kiểm thử tích hợp G2.2 từ Renderer qua Preload -> IPC -> Services -> SQLite
  const rendererTestResults = await win.webContents.executeJavaScript(`
    (async () => {
      const api = window.studioApi;

      // 1. Kiểm tra bảo mật & không lộ đường dẫn SQLite
      const runtimeRes = await api.getRuntimeInfo();

      // 2. Kiểm tra Provider CRUD (Tạo Custom Provider + Thêm Model)
      const provListBefore = await api.getRegisteredProviders();
      const customProvRes = await api.createProvider({
        id: 'test-custom-prov',
        displayName: 'Custom Test Provider',
        vendor: 'Local Test Lab',
        authMechanisms: ['api-key-vault'],
        sessionModel: 'stateless-request',
        supportsModelSelection: true,
        supportsReasoningLevel: true,
        supportsStreaming: true,
        supportsUsageMetrics: true,
        supportsQuotaMetrics: true,
        supportsLocalWorkspaceAccess: false,
        requiresExternalBinary: false,
        notes: 'Test provider for G2.2 verification'
      });
      const customModelRes = await api.createModel({
        providerId: 'test-custom-prov',
        modelKey: 'custom-model-v1',
        displayName: 'Custom Model V1',
        contextWindowTokens: 128000,
        maxOutputTokens: 16384,
        supportsReasoning: true,
        supportsCaching: true
      });

      // 3. Kiểm tra chặn lưu secret dạng văn bản thuần (Plaintext Secret Rejection)
      const plaintextReject1 = await api.createAccount({
        providerId: 'openai-codex',
        displayName: 'Unsafe Raw Key Account',
        authMethod: 'api-key-vault',
        credentialRef: 'sk-proj-1234567890abcdefghijklmnop',
        storageBackend: 'windows-credential-manager'
      });
      const plaintextReject2 = await api.createAccount({
        providerId: 'openai-codex',
        displayName: 'Unsafe Embedded Key Account',
        authMethod: 'api-key-vault',
        credentialRef: 'wincred://personal-ai-studio/sk-proj-1234567890abcdef',
        storageBackend: 'windows-credential-manager'
      });

      // 4. Tạo 2 Account hợp lệ (để kiểm tra tách biệt dữ liệu giữa các tài khoản)
      const acc1Res = await api.createAccount({
        providerId: 'openai-codex',
        displayName: 'OpenAI Primary Account',
        authMethod: 'api-key-vault',
        credentialRef: 'wincred://personal-ai-studio/openai-primary',
        storageBackend: 'windows-credential-manager',
        maskedHint: '***a1b2',
        authStatus: 'authenticated'
      });
      const acc2Res = await api.createAccount({
        providerId: 'openai-codex',
        displayName: 'OpenAI Secondary Account',
        authMethod: 'api-key-vault',
        credentialRef: 'wincred://personal-ai-studio/openai-secondary',
        storageBackend: 'windows-credential-manager',
        maskedHint: '***c3d4',
        authStatus: 'authenticated'
      });

      const acc1Id = acc1Res.data?.id;
      const acc2Id = acc2Res.data?.id;

      // 5. Kiểm tra CRUD Agent (Create, Read, Update, Toggle Pause/Active, Filter, Delete)
      const createAgentRes = await api.createAgent({
        name: 'Unity 2D Physics Agent',
        description: 'Chuyên trách tối ưu Rigidbody2D và Collider2D',
        providerId: 'openai-codex',
        accountId: acc1Id,
        modelId: 'mdl-openai-codex-mini',
        reasoningLevel: 'high',
        workspacePath: 'C:\\\\AI-Studio\\\\projects',
        permissionProfileId: 'perm-standard',
        runtimeType: 'local-cli',
        status: 'active'
      });
      const agentId = createAgentRes.data?.id;

      const updateAgentRes = await api.updateAgent({
        id: agentId,
        name: 'Unity 2D Physics & Tilemap Agent',
        description: 'Đã cập nhật phạm vi xử lý Tilemap',
        providerId: 'openai-codex',
        accountId: acc1Id,
        modelId: 'mdl-openai-codex-mini',
        reasoningLevel: 'medium',
        workspacePath: 'C:\\\\AI-Studio\\\\projects',
        permissionProfileId: 'perm-standard',
        runtimeType: 'local-cli',
        status: 'active'
      });

      const togglePauseRes = await api.toggleAgentStatus(agentId);
      const toggleActiveRes = await api.toggleAgentStatus(agentId);

      // 6. Ghi nhận Usage cho Account 1 và Account 2 (Kiểm tra không trộn dữ liệu giữa 2 tài khoản)
      const usage1Res = await api.recordUsage({
        providerId: 'openai-codex',
        accountId: acc1Id,
        agentId: agentId,
        modelId: 'mdl-openai-codex-mini',
        inputTokens: 10000,
        outputTokens: 5000,
        cachedInputTokens: 2000,
        reasoningTokens: 1000,
        averageDurationMs: 920,
        source: 'runtime-telemetry',
        dataConfidence: 'actual_usage'
      });

      const usage2Res = await api.recordUsage({
        providerId: 'openai-codex',
        accountId: acc2Id,
        agentId: null,
        modelId: 'mdl-openai-gpt-4.1',
        inputTokens: 4000,
        outputTokens: 1000,
        cachedInputTokens: 0,
        reasoningTokens: 0,
        averageDurationMs: 610,
        source: 'provider-sync',
        dataConfidence: 'actual_usage'
      });

      // Kiểm tra chặn ghi trộn Agent của Account 1 vào Account 2
      const crossAccountMixAttempt = await api.recordUsage({
        providerId: 'openai-codex',
        accountId: acc2Id,
        agentId: agentId,
        modelId: 'mdl-openai-codex-mini',
        inputTokens: 500,
        outputTokens: 500,
        source: 'runtime-telemetry',
        dataConfidence: 'actual_usage'
      });

      // Ghi nhận Quota Snapshot cho Account 1
      const quota1Res = await api.recordQuotaSnapshot({
        providerId: 'openai-codex',
        accountId: acc1Id,
        agentId: agentId,
        modelId: 'mdl-openai-codex-mini',
        quotaPeriod: 'monthly',
        usageLimit: 2000000,
        usedAmount: 18000,
        unit: 'tokens',
        rateLimitRpm: 500,
        rateLimitTpm: 200000,
        quotaSource: 'provider-api',
        dataConfidence: 'provider_reported_quota'
      });

      const overviewAll = await api.getUsageQuotaOverview();
      const overviewAcc1Only = await api.getUsageQuotaOverview({ accountId: acc1Id });
      const overviewAcc2Only = await api.getUsageQuotaOverview({ accountId: acc2Id });
      const dashWithData = await api.getDashboardSnapshot();

      return {
        runtimeInfo: runtimeRes.data,
        providerTests: {
          initialCount: provListBefore.data?.length ?? 0,
          customCreated: customProvRes.ok,
          customModelCreated: customModelRes.ok
        },
        secretProtectionTests: {
          rawApiKeyRejected: plaintextReject1.ok === false && plaintextReject1.error?.code === 'PLAINTEXT_SECRET_REJECTED',
          embeddedApiKeyRejected: plaintextReject2.ok === false && plaintextReject2.error?.code === 'PLAINTEXT_SECRET_REJECTED'
        },
        accountTests: {
          acc1Created: acc1Res.ok,
          acc2Created: acc2Res.ok
        },
        agentCrudTests: {
          createdOk: createAgentRes.ok,
          updatedOk: updateAgentRes.ok && updateAgentRes.data?.reasoningLevel === 'medium',
          pausedOk: togglePauseRes.ok && togglePauseRes.data?.status === 'paused',
          reactivatedOk: toggleActiveRes.ok && toggleActiveRes.data?.status === 'active'
        },
        usageAndIsolationTests: {
          usage1TotalTokens: usage1Res.data?.totalTokens,
          usage1CostCalculated: (usage1Res.data?.estimatedTotalCostUsd ?? 0) > 0,
          usage2TotalTokens: usage2Res.data?.totalTokens,
          crossAccountMixRejected: crossAccountMixAttempt.ok === false,
          acc1IsolatedTokens: overviewAcc1Only.data?.totals.totalTokens,
          acc2IsolatedTokens: overviewAcc2Only.data?.totals.totalTokens,
          combinedTokens: overviewAll.data?.totals.totalTokens,
          quotaRemaining: quota1Res.data?.remainingAmount
        },
        dashboardRealData: {
          totalAgentsInDash: dashWithData.data?.metrics.totalAgents,
          activeAgentsInDash: dashWithData.data?.metrics.activeAgents
        }
      };
    })();
  `);

  // Chụp ảnh màn hình các trang G2.2 khi đang có dữ liệu kiểm thử thực tế
  const pagesToCapture: Array<{ navId: string; fileName: string }> = [
    { navId: 'agents', fileName: 'g22-agents.png' },
    { navId: 'providers', fileName: 'g22-providers.png' },
    { navId: 'accounts', fileName: 'g22-accounts.png' },
    { navId: 'usage-quota', fileName: 'g22-usage-quota.png' },
  ];

  if (screenshotDir) {
    fs.mkdirSync(screenshotDir, { recursive: true });
    for (const item of pagesToCapture) {
      await win.webContents.executeJavaScript(`
        (() => {
          const btn = document.querySelector('[data-nav-id="${item.navId}"]');
          if (btn) btn.click();
        })();
      `);
      await sleep(450);
      const img = await win.webContents.capturePage();
      fs.writeFileSync(path.join(screenshotDir, item.fileName), img.toPNG());
    }
  }

  // Dọn dẹp dữ liệu kiểm thử để trả lại trạng thái sạch sẽ (không để lại dữ liệu demo giả cho Owner)
  databaseLayer.runInTransaction(() => {
    databaseLayer.prepare('DELETE FROM usage_records').run();
    databaseLayer.prepare('DELETE FROM quota_snapshots').run();
    databaseLayer.prepare('DELETE FROM agents').run();
    databaseLayer.prepare('DELETE FROM accounts').run();
    databaseLayer.prepare("DELETE FROM models WHERE provider_id = 'test-custom-prov'").run();
    databaseLayer.prepare("DELETE FROM providers WHERE id = 'test-custom-prov'").run();
    databaseLayer
      .prepare(
        "DELETE FROM activity_logs WHERE category IN ('agent', 'account', 'usage') OR title LIKE '%Custom Test Provider%' OR title LIKE '%Custom Model V1%'"
      )
      .run();
  });

  // Kiểm tra đóng và mở lại Database thành công
  databaseLayer.close();
  databaseLayer.initialize();

  const tablesAfterReopen = databaseLayer.listTables();

  if (reportOutputPath) {
    fs.mkdirSync(path.dirname(reportOutputPath), { recursive: true });
    fs.writeFileSync(
      reportOutputPath,
      JSON.stringify(
        {
          verifiedAt: new Date().toISOString(),
          databaseReopenedSuccessfully: databaseLayer.status === 'connected',
          schemaVersion: databaseLayer.schemaVersion,
          tablesInSqlite: tablesAfterReopen,
          rendererTestResults,
        },
        null,
        2
      ),
      'utf-8'
    );
  }

  await sleep(200);
  app.quit();
}

app.whenReady().then(async () => {
  session.defaultSession.webRequest.onHeadersReceived((details, callback) => {
    callback({
      responseHeaders: {
        ...details.responseHeaders,
        'Content-Security-Policy': [
          "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data:; font-src 'self' data:; connect-src 'self' ws://127.0.0.1:5173 http://127.0.0.1:5173;",
        ],
      },
    });
  });

  // G2.7: Phục hồi trạng thái Session sau khi Studio khởi động lại
  try {
    const recovered = await telemetryService.recoverAfterRestart();
    if (recovered.length > 0) {
      console.log(`[Main] G2.7 Recovery: Đã đánh dấu ${recovered.length} session chưa kết thúc là 'unknown_after_restart'.`);
    }
  } catch (err) {
    console.warn('[Main] Lỗi trong recoverAfterRestart:', err);
  }

  // G2.9: Phục hồi các phiên cộng tác đang chạy sau khi Studio khởi động lại
  try {
    const colRecon = multiAgentOrchestrator.recoverSessions();
    if (colRecon.recoveredSessions > 0) {
      console.log(`[Main] G2.9 Recovery: Đã phục hồi ${colRecon.recoveredSessions} phiên cộng tác (${colRecon.recoveredTasks} task con).`);
    }
  } catch (err) {
    console.warn('[Main] Lỗi trong recoverSessions:', err);
  }

  registerIpcHandlers({
    studioService,
    agentService,
    providerService,
    accountService,
    usageQuotaService,
    permissionEngine,
    taskOrchestrator,
    projectService,
    workspaceManagerService,
    unityMetaGuard,
    workspaceSnapshotService,
    runtimeManager,
    telemetryService,
    multiAgentOrchestrator,
    databaseLayer,
    artifactExchange: artifactExchangeService,
    resourceMonitor,
    runtimeIsolationAdapter,
  });

  mainWindow = createMainWindow();
  void runAutomatedG22VerificationIfRequested(mainWindow);

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      mainWindow = createMainWindow();
    }
  });
});

app.on('will-quit', () => {
  try {
    telemetryService.dispose();
  } catch (err) {
    console.warn('[Main] Lỗi khi dispose TelemetryService:', err);
  }
  workspaceFileMonitor.stopAllWatchers();
  databaseLayer.close();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
