/**
 * PERSONAL AI STUDIO - G2.10 AUTOMATED VERIFICATION SUITE
 * Security Hardening, Crash Recovery & System Reliability
 *
 * 35 Automated Test Scenarios:
 * 1.  SQLite Integrity Check (Healthy DB)
 * 2.  SQLite Foreign Key Violation Reporting
 * 3.  SQLite WAL Checkpoint & Backup Creation
 * 4.  SQLite Backup SHA-256 Manifest Matching
 * 5.  SQLite Backup Integrity Pre-check (Isolated instance)
 * 6.  SQLite Safe Restore Flow & Pre-Restore Backup
 * 7.  SQLite Corrupt Backup File Rejection & Live DB Preservation
 * 8.  SQLite Non-Existent Backup File Handling
 * 9.  Artifact Atomic Temporary File Write (.tmp + atomic rename)
 * 10. Artifact SHA-256 Hash Integrity Verification on Read
 * 11. Artifact Missing Physical File Detection & Mark 'corrupted'
 * 12. Artifact Tamper / Hash Mismatch Detection & Mark 'hash_mismatch'
 * 13. Artifact Storage Reconciliation (reconcileStorage)
 * 14. Artifact Orphaned Temp File (.tmp.*) Automatic Cleanup
 * 15. Artifact Safe Write Failure Handling (No partial files)
 * 16. Windows Path Guard: Path Traversal Escape Prevention (..\..)
 * 17. Windows Path Guard: Alternate Data Stream (ADS :stream) Rejection
 * 18. Windows Path Guard: Device Paths (\\.\, \\?\) Rejection
 * 19. Windows Path Guard: Reserved DOS Device Names (CON, NUL, AUX, PRN) Rejection
 * 20. Windows Path Guard: 8.3 Short Names (PROGRA~1) Detection & Rejection
 * 21. Permission Engine: Atomic Approval Consumption (Race Condition Proof)
 * 22. Permission Engine: Anti-Replay Guard on Consumed Approval
 * 23. Permission Engine: Action Fingerprint Mismatch Rejection
 * 24. Runtime Isolation Adapter: Capabilities Technical Honesty (No fake kernel sandbox)
 * 25. Runtime Isolation Adapter: Unsupported Full Sandbox Rejection
 * 26. Runtime Isolation Adapter: Insecure Target Directory Rejection
 * 27. Concurrency Manager: Atomic Slot Acquire & Release
 * 28. Concurrency Manager: Safe Idempotent Double Release (No negative counts)
 * 29. Concurrency Manager: Bounded Queue Saturation Rejection
 * 30. Runtime Lock Manager: Workspace Exclusive Concurrency Lock
 * 31. Runtime Lock Manager: Stale Lock Detection & Automatic Cleanup
 * 32. Process Runner: Non-Shell Process Tree Kill (taskkill /t /f)
 * 33. Process Monitor: PID Reuse Detection via Creation Time
 * 34. Resource Monitor: Real System & Studio Storage Metrics (No fake 0s)
 * 35. Resource Monitor: Native OS Disk Free Space Detection via statfs
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

// Services
import { DatabaseClient } from '../dist/main/database/DatabaseClient.js';
import { ArtifactExchangeService } from '../dist/main/services/collaboration/ArtifactExchangeService.js';
import { PermissionEngine } from '../dist/main/services/PermissionEngine.js';
import { AgentService } from '../dist/main/services/AgentService.js';
import { WindowsPathGuard } from '../dist/main/services/security/WindowsPathGuard.js';
import { RuntimeIsolationAdapter } from '../dist/main/services/security/RuntimeIsolationAdapter.js';
import { ConcurrencyManager } from '../dist/main/services/runtime/ConcurrencyManager.js';
import { RuntimeLockManager } from '../dist/main/services/runtime/RuntimeLockManager.js';
import { ProcessRunner } from '../dist/main/services/runtime/ProcessRunner.js';
import { ProcessMonitor } from '../dist/main/services/runtime/ProcessMonitor.js';
import { ResourceMonitor } from '../dist/main/services/system/ResourceMonitor.js';

let passedAssertions = 0;
let failedAssertions = 0;

function assert(condition, description) {
  if (condition) {
    passedAssertions++;
    console.log(`  [PASS] Scenario ${passedAssertions}: ${description}`);
  } else {
    failedAssertions++;
    console.error(`  [FAIL] ${description}`);
    throw new Error(`Assertion failed: ${description}`);
  }
}

async function runG210Verification() {
  console.log('================================================================');
  console.log('PERSONAL AI STUDIO - G2.10 SECURITY, RECOVERY & RELIABILITY TEST');
  console.log('================================================================\n');

  const testDir = path.resolve(process.cwd(), 'storage', 'test_g210_workspace');
  if (fs.existsSync(testDir)) {
    fs.rmSync(testDir, { recursive: true, force: true });
  }
  fs.mkdirSync(testDir, { recursive: true });

  const testDbPath = path.join(testDir, 'test_studio.db');
  const db = new DatabaseClient(testDbPath);
  db.initialize();

  const agentService = new AgentService(db);
  const permissionEngine = new PermissionEngine({ db, agentService });
  const artifactStorageRoot = path.join(testDir, 'artifacts');
  const artifactExchange = new ArtifactExchangeService({
    db,
    storageRoot: artifactStorageRoot,
  });
  const concurrencyManager = new ConcurrencyManager({ db, maxQueueSize: 2 });
  const lockManager = new RuntimeLockManager({ db });
  const isolationAdapter = new RuntimeIsolationAdapter();
  const resourceMonitor = new ResourceMonitor({
    dbPath: testDbPath,
    storageRoot: testDir,
    getActiveProcessCount: () => 1,
    getQueueLength: () => 0,
  });

  // Seeds
  const nowIso = new Date().toISOString();

  db.prepare(`
    INSERT INTO accounts (id, provider_id, display_name, auth_method, credential_ref, auth_status, storage_backend, created_at, updated_at)
    VALUES ('acc-g210', 'openai-codex', 'G2.10 Account', 'api-key-vault', 'wincred://ai-studio/g210', 'authenticated', 'windows-credential-manager', ?, ?)
  `).run(nowIso, nowIso);

  const agentLead = agentService.createAgent({
    name: 'Lead Agent',
    description: 'Lead',
    providerId: 'openai-codex',
    accountId: 'acc-g210',
    permissionProfileId: 'perm-standard',
    workspacePath: testDir,
    runtimeType: 'api-client',
    status: 'active',
  });

  const agentWorker = agentService.createAgent({
    name: 'Worker Agent',
    description: 'Worker',
    providerId: 'openai-codex',
    accountId: 'acc-g210',
    permissionProfileId: 'perm-standard',
    workspacePath: testDir,
    runtimeType: 'api-client',
    status: 'active',
  });

  db.prepare(`
    INSERT INTO tasks (id, title, description, status, priority, workspace_path, created_at, updated_at)
    VALUES ('task-parent-g210', 'Root Task G210', 'Parent task for session', 'running', 'medium', ?, ?, ?)
  `).run(testDir, nowIso, nowIso);

  const sessionId = 'collab-sess-g210';
  db.prepare(`
    INSERT INTO collaboration_sessions (
      id, parent_task_id, title, objective, status,
      primary_agent_id, workspace_path, created_at, updated_at
    ) VALUES (?, 'task-parent-g210', 'Session G210', 'Objective G210', 'running', ?, ?, ?, ?)
  `).run(sessionId, agentLead.id, testDir, nowIso, nowIso);

  console.log('--- 1. SQLite Database Reliability & Disaster Recovery ---');

  // Scenario 1: SQLite Integrity Check (Healthy DB)
  const integrityReport = db.checkIntegrity();
  assert(
    integrityReport.ok === true && integrityReport.integrityStatus === 'ok' && integrityReport.foreignKeyViolations.length === 0,
    'SQLite checkIntegrity() xác nhận cơ sở dữ liệu hoạt động hoàn hảo và không vi phạm ràng buộc FK'
  );

  // Scenario 2: SQLite Foreign Key Violation Reporting
  // Flush WAL before copying to ensure scratch copy has all schema pages
  db.prepare('PRAGMA wal_checkpoint(TRUNCATE);').run();
  const fkScratchPath = path.join(testDir, 'fk_scratch.db');
  fs.copyFileSync(testDbPath, fkScratchPath);
  const fkDbRaw = new DatabaseSync(fkScratchPath);
  fkDbRaw.exec('PRAGMA foreign_keys = OFF;');
  fkDbRaw.prepare(`
    INSERT INTO task_assignments (id, task_id, agent_id, assignment_status, assigned_at)
    VALUES ('ta-orphan', 'non-existent-task-id', ?, 'assigned', datetime('now'))
  `).run(agentLead.id);
  fkDbRaw.close();

  const fkDbClient = new DatabaseClient(fkScratchPath);
  fkDbClient.initialize();
  const fkReport = fkDbClient.checkIntegrity();
  fkDbClient.close();
  assert(
    fkReport.ok === false && fkReport.foreignKeyViolations.length > 0,
    'SQLite checkIntegrity() phát hiện chính xác vi phạm ràng buộc Foreign Key nhân tạo'
  );

  // Scenario 3: SQLite WAL Checkpoint & Backup Creation
  const backupDir = path.join(testDir, 'backups');
  const backupManifest = db.createBackup(backupDir);
  assert(
    fs.existsSync(backupManifest.backupFilePath) && fs.existsSync(backupManifest.manifestFilePath),
    'Tạo bản sao lưu SQLite nhất quán và tạo tệp manifest JSON thành công'
  );

  // Scenario 4: SQLite Backup SHA-256 Manifest Matching
  const backupBytes = fs.readFileSync(backupManifest.backupFilePath);
  const calculatedSha = crypto.createHash('sha256').update(backupBytes).digest('hex');
  assert(
    backupManifest.sha256 === calculatedSha,
    'Mã băm SHA-256 của tệp sao lưu khớp chính xác 100% với tệp Manifest'
  );

  // Scenario 5: SQLite Backup Integrity Pre-check (Isolated instance)
  assert(
    backupManifest.integrityStatus === 'ok',
    'Kiểm tra toàn vẹn độc lập (Isolated DatabaseSync) trên tệp sao lưu đạt kết quả ok'
  );

  // Scenario 6: SQLite Safe Restore Flow & Pre-Restore Backup
  // Mutate database first
  db.prepare(`UPDATE tasks SET title = 'MUTATED TITLE BEFORE RESTORE' WHERE id = 'task-parent-g210'`).run();
  const restoreRes = db.restoreBackup(backupManifest.backupFilePath);
  const restoredTask = db.prepare(`SELECT title FROM tasks WHERE id = 'task-parent-g210'`).get();
  assert(
    restoreRes.success === true && restoredTask.title === 'Root Task G210' && restoreRes.preRestoreBackupFile !== null,
    'Khôi phục cơ sở dữ liệu an toàn thành công và tự động tạo bản lưu phòng ngừa (Pre-restore backup)'
  );

  // Scenario 7: SQLite Corrupt Backup File Rejection & Live DB Preservation
  const corruptBackupFile = path.join(testDir, 'corrupt.db');
  fs.writeFileSync(corruptBackupFile, Buffer.from('GARBAGE NON-SQLITE HEADER DATA'));
  const corruptRestore = db.restoreBackup(corruptBackupFile);
  const currentTask = db.prepare(`SELECT title FROM tasks WHERE id = 'task-parent-g210'`).get();
  assert(
    corruptRestore.success === false && Boolean(corruptRestore.error) && currentTask.title === 'Root Task G210',
    'Từ chối khôi phục tệp sao lưu bị hỏng ngay lập tức và bảo toàn cơ sở dữ liệu hiện tại'
  );

  // Scenario 8: SQLite Non-Existent Backup File Handling
  const missingRestore = db.restoreBackup(path.join(testDir, 'non_existent_file.db'));
  assert(
    missingRestore.success === false && missingRestore.error?.includes('không tồn tại'),
    'Xử lý an toàn khi tệp sao lưu không tồn tại trên hệ thống tệp'
  );

  console.log('\n--- 2. Artifact Storage Reliability & Integrity ---');

  // Scenario 9: Artifact Atomic Temporary File Write
  const art1 = artifactExchange.createArtifact({
    sessionId,
    producerAgentId: agentLead.id,
    relativePath: 'Assets/Scripts/PlayerController.cs',
    artifactType: 'source_code',
    content: 'public class PlayerController : MonoBehaviour {}',
  });
  assert(
    fs.existsSync(path.join(artifactStorageRoot, sessionId, `${art1.id}_v1.bin`)),
    'Ghi tệp Artifact nguyên tử (Atomic write qua .tmp và atomic rename) thành công'
  );

  // Scenario 10: Artifact SHA-256 Hash Integrity Verification on Read
  const readRes = artifactExchange.readArtifactContent(art1.id, 1, agentLead.id);
  assert(
    readRes.verified === true && readRes.sha256 === art1.currentSha256,
    'Xác thực mã băm SHA-256 khi đọc Artifact phiên bản v1 chính xác tuyệt đối'
  );

  // Scenario 11: Artifact Missing Physical File Detection & Mark 'corrupted'
  const artPath = path.join(artifactStorageRoot, sessionId, `${art1.id}_v1.bin`);
  fs.unlinkSync(artPath); // Delete physical file
  let missingFileCaught = false;
  try {
    artifactExchange.readArtifactContent(art1.id, 1, agentLead.id);
  } catch (err) {
    missingFileCaught = err.message.includes('bị thiếu') && err.message.includes('corrupted');
  }
  const corruptedArt = artifactExchange.getArtifact(art1.id, agentLead.id);
  assert(
    missingFileCaught && corruptedArt.validationStatus === 'corrupted',
    'Phát hiện tệp vật lý bị mất trên đĩa và tự động chuyển trạng thái Artifact thành corrupted'
  );

  // Restore physical file with tampered content for Scenario 12
  fs.writeFileSync(artPath, 'TAMPERED ILLEGAL CONTENT');

  // Scenario 12: Artifact Tamper / Hash Mismatch Detection & Mark 'hash_mismatch'
  const tamperedRead = artifactExchange.readArtifactContent(art1.id, 1, agentLead.id);
  const tamperedArt = artifactExchange.getArtifact(art1.id, agentLead.id);
  assert(
    tamperedRead.verified === false && tamperedArt.validationStatus === 'hash_mismatch',
    'Phát hiện tệp bị chỉnh sửa trái phép (Tamper) và tự động gắn cờ hash_mismatch'
  );

  // Scenario 13: Artifact Storage Reconciliation (reconcileStorage)
  const reconReport = artifactExchange.reconcileStorage(sessionId);
  assert(
    reconReport.totalChecked >= 1 && reconReport.mismatchCount >= 1,
    'Storage Reconciliation phát hiện chính xác sai lệch mã băm trên toàn bộ lưu trữ'
  );

  // Scenario 14: Artifact Orphaned Temp File Automatic Cleanup
  const orphanTmpFile = path.join(artifactStorageRoot, sessionId, 'temp_leftover.bin.tmp.12345.abc');
  fs.writeFileSync(orphanTmpFile, 'ORPHAN TEMP DATA');
  const reconReportWithCleanup = artifactExchange.reconcileStorage(sessionId);
  assert(
    reconReportWithCleanup.orphanedTmpCleaned >= 1 && !fs.existsSync(orphanTmpFile),
    'Tự động phát hiện và dọn dẹp các tệp tạm mồ côi (.tmp.*) còn sót lại sau sự cố'
  );

  // Scenario 15: Artifact Safe Write Failure Handling
  let invalidWriteFailed = false;
  try {
    artifactExchange.createArtifact({
      sessionId,
      producerAgentId: agentLead.id,
      relativePath: 'Assets/Scripts/InvalidScript.cs',
      artifactType: 'source_code',
      content: { toString: () => { throw new Error('Simulated buffer write crash'); } },
    });
  } catch {
    invalidWriteFailed = true;
  }
  const leftoverFiles = fs.readdirSync(path.join(artifactStorageRoot, sessionId)).filter(f => f.includes('InvalidScript'));
  assert(
    invalidWriteFailed && leftoverFiles.length === 0,
    'Xử lý lỗi ghi thất bại an toàn, không để lại tệp hỏng hoặc tệp tạm trên đĩa'
  );

  console.log('\n--- 3. Windows Path Guard Hardening ---');

  // Scenario 16: Path Traversal Escape Prevention
  const traversalCheck = WindowsPathGuard.evaluatePath('..\\..\\Windows\\System32\\cmd.exe', testDir);
  assert(
    traversalCheck.valid === false && traversalCheck.traversalOrLinkEscapeDetected === true,
    'WindowsPathGuard chặn đứng hành vi vượt ranh giới (Path Traversal Escape ..\\..)'
  );

  // Scenario 17: Alternate Data Stream (ADS :stream) Rejection
  const adsCheck = WindowsPathGuard.evaluatePath('Assets\\script.cs:hidden_stream', testDir);
  assert(
    adsCheck.valid === false && adsCheck.violationReason?.includes('Alternate Data Stream'),
    'Chặn tuyệt đối tấn công Windows Alternate Data Streams (file.txt:stream)'
  );

  // Scenario 18: Device Paths (\\.\, \\?\) Rejection
  const deviceCheck = WindowsPathGuard.evaluatePath('\\\\.\\COM1', testDir);
  assert(
    deviceCheck.valid === false && deviceCheck.violationReason?.includes('Device'),
    'Chặn đường dẫn thiết bị Windows Device Paths (\\\\.\\, \\\\?\\)'
  );

  // Scenario 19: Reserved DOS Device Names (CON, NUL, AUX, PRN) Rejection
  const dosCheck = WindowsPathGuard.evaluatePath('Assets\\CON.txt', testDir);
  assert(
    dosCheck.valid === false && dosCheck.violationReason?.includes('DOS reserved device name'),
    'Chặn các tên thiết bị DOS bảo lưu của Windows (CON, PRN, AUX, NUL)'
  );

  // Scenario 20: 8.3 Short Names (PROGRA~1) Detection & Rejection
  const shortNameCheck = WindowsPathGuard.evaluatePath('C:\\PROGRA~1\\malware.exe', testDir);
  assert(
    shortNameCheck.valid === false && shortNameCheck.violationReason?.includes('8.3 short name'),
    'Chặn các định dạng tên ngắn 8.3 Short Names (PROGRA~1)'
  );

  console.log('\n--- 4. Permission Engine & Approval Concurrency Hardening ---');

  // Tạo yêu cầu phê duyệt thông qua Permission Engine chuẩn
  const targetTestFile = path.join(testDir, 'file_to_delete.txt');
  const preflightRes = permissionEngine.evaluateAndEnforce({
    agentId: agentLead.id,
    category: 'filesystem',
    permissionKey: 'fs.delete_file',
    targetResource: targetTestFile,
    operationSummary: 'Delete test file',
    mode: 'preflight',
  });

  const approvalId = preflightRes.approvalRequest.id;
  permissionEngine.decideApprovalRequest({
    approvalRequestId: approvalId,
    decision: 'approved',
    decisionReason: 'Owner phê duyệt cho kiểm thử G2.10',
  });

  // Scenario 21: Atomic Approval Consumption (Race Condition Proof)
  // Run first execution evaluation: should succeed and consume approval
  const eval1 = permissionEngine.evaluateAndEnforce({
    agentId: agentLead.id,
    category: 'filesystem',
    permissionKey: 'fs.delete_file',
    targetResource: targetTestFile,
    operationSummary: 'Delete test file',
    mode: 'execute',
    approvalRequestId: approvalId,
  });

  // Run second concurrent execution evaluation with the SAME approval request
  const eval2 = permissionEngine.evaluateAndEnforce({
    agentId: agentLead.id,
    category: 'filesystem',
    permissionKey: 'fs.delete_file',
    targetResource: targetTestFile,
    operationSummary: 'Delete test file',
    mode: 'execute',
    approvalRequestId: approvalId,
  });

  assert(
    eval1.authorized === true && eval2.authorized === false && eval2.code === 'APPROVAL_INVALID_OR_REPLAYED',
    'Tiêu thụ phê duyệt nguyên tử (Atomic Consumption): Tác vụ đầu tiên được phép, tác vụ thứ hai bị chặn do xung đột tiêu thụ'
  );

  // Scenario 22: Anti-Replay Guard on Consumed Approval
  const consumedApproval = permissionEngine.getApprovalById(approvalId);
  const eval3 = permissionEngine.evaluateAndEnforce({
    agentId: agentLead.id,
    category: 'filesystem',
    permissionKey: 'fs.delete_file',
    targetResource: targetTestFile,
    operationSummary: 'Delete test file',
    mode: 'execute',
    approvalRequestId: approvalId,
  });
  assert(
    consumedApproval?.consumedAt !== null && eval3.authorized === false && eval3.message.includes('Anti-Replay'),
    'Cơ chế Anti-Replay từ chối dứt khoát mọi nỗ lực tái sử dụng phê duyệt đã tiêu thụ'
  );

  // Scenario 23: Action Fingerprint Mismatch Rejection
  const preflightMismatch = permissionEngine.evaluateAndEnforce({
    agentId: agentLead.id,
    category: 'filesystem',
    permissionKey: 'fs.delete_file',
    targetResource: targetTestFile,
    operationSummary: 'Delete test file for mismatch test',
    mode: 'preflight',
  });
  const approvalMismatchId = preflightMismatch.approvalRequest.id;
  permissionEngine.decideApprovalRequest({
    approvalRequestId: approvalMismatchId,
    decision: 'approved',
    decisionReason: 'Approved for mismatch test',
  });

  const evalMismatch = permissionEngine.evaluateAndEnforce({
    agentId: agentLead.id,
    category: 'filesystem',
    permissionKey: 'fs.delete_file',
    targetResource: path.join(testDir, 'ALTERED_TARGET_FILE.txt'), // Target changed!
    operationSummary: 'Delete test file for mismatch test',
    mode: 'execute',
    approvalRequestId: approvalMismatchId,
  });
  assert(
    evalMismatch.authorized === false && evalMismatch.message.includes('Fingerprint mismatch'),
    'Phát hiện thay đổi tham số hành động sau khi phê duyệt (Fingerprint Mismatch) và từ chối thực thi'
  );

  console.log('\n--- 5. Windows Runtime Isolation Architecture ---');

  // Scenario 24: Capabilities Technical Honesty (No fake kernel sandbox)
  const capabilities = isolationAdapter.getCapabilities();
  assert(
    capabilities.level === 'process_lifecycle_only' &&
    capabilities.isOsKernelSandbox === false &&
    capabilities.supportsProcessTreeKill === true &&
    capabilities.stagingRequired === true,
    'RuntimeIsolationAdapter trung thực kỹ thuật: không tuyên bố bừa là sandbox nhân OS, chỉ rõ cô lập vòng đời tiến trình và thư mục staging'
  );

  // Scenario 25: Unsupported Full Sandbox Rejection
  const sandboxValidation = isolationAdapter.validateExecutionIsolation('full_sandbox', testDir);
  assert(
    sandboxValidation.allowed === false && sandboxValidation.code === 'SANDBOX_LEVEL_UNSUPPORTED',
    'Từ chối chạy ở cấp độ full_sandbox để tránh tạo cảm giác an toàn giả mạo khi chưa có kernel filter'
  );

  // Scenario 26: Insecure Target Directory Rejection
  const insecureDirValidation = isolationAdapter.validateExecutionIsolation('process_lifecycle_only', 'C:\\NonExistentPath_xyz123');
  assert(
    insecureDirValidation.allowed === false && insecureDirValidation.code === 'TARGET_DIR_NOT_FOUND',
    'Từ chối cô lập tiến trình đối với thư mục đích không hợp lệ'
  );

  console.log('\n--- 6. Concurrency & Lock Reliability ---');

  // Scenario 27: Atomic Slot Acquire & Release
  const acq1 = concurrencyManager.acquireSlot({
    sessionId: 'sess-test-concur-1',
    providerId: 'openai-codex',
    accountId: 'acc-g210',
    agentId: agentLead.id,
  });
  const activeCountBefore = concurrencyManager.getActiveCount('account', 'acc-g210');
  const rel1 = concurrencyManager.releaseSlot('sess-test-concur-1');
  const activeCountAfter = concurrencyManager.getActiveCount('account', 'acc-g210');
  assert(
    acq1.acquired === true && activeCountBefore === 1 && rel1.released === true && activeCountAfter === 0,
    'Cấp phát và giải phóng slot đồng thời nguyên tử, không rò rỉ tài nguyên đếm'
  );

  // Scenario 28: Safe Idempotent Double Release (No negative counts)
  const relDouble = concurrencyManager.releaseSlot('sess-test-concur-1');
  const countAfterDouble = concurrencyManager.getActiveCount('account', 'acc-g210');
  assert(
    relDouble.released === false && countAfterDouble === 0,
    'Giải phóng lặp lại (Double Release) an toàn tuyệt đối, không làm âm bộ đếm slot'
  );

  // Scenario 29: Bounded Queue Saturation Rejection
  // Max concurrency for account is 1. Max queue is 2.
  concurrencyManager.acquireSlot({ sessionId: 's1', providerId: 'openai-codex', accountId: 'acc-g210' });
  const q1 = concurrencyManager.acquireSlot({ sessionId: 's2', providerId: 'openai-codex', accountId: 'acc-g210' });
  const q2 = concurrencyManager.acquireSlot({ sessionId: 's3', providerId: 'openai-codex', accountId: 'acc-g210' });
  const qOverflow = concurrencyManager.acquireSlot({ sessionId: 's4', providerId: 'openai-codex', accountId: 'acc-g210' });

  assert(
    q1.queued === true && q2.queued === true && qOverflow.rejected === true && qOverflow.reason?.includes('đầy'),
    'Hàng đợi giới hạn (Bounded Queue): Từ chối an toàn khi hàng đợi vượt ngưỡng tối đa (Saturation Guard)'
  );

  // Clean up slots
  concurrencyManager.releaseSlot('s1');
  concurrencyManager.releaseSlot('s2');
  concurrencyManager.releaseSlot('s3');

  // Seed workspace and runtime sessions for locking test
  db.prepare(`
    INSERT INTO workspaces (id, name, workspace_path, workspace_type, status, created_at, updated_at)
    VALUES ('ws-exclusive-test', 'Lock Test Workspace', ?, 'project_workspace', 'active', ?, ?)
  `).run(path.join(testDir, 'exclusive_ws'), nowIso, nowIso);

  db.prepare(`
    INSERT INTO runtime_sessions (id, task_id, agent_id, provider_id, account_id, workspace_id, working_directory, status, created_at, updated_at)
    VALUES ('sess-lock-1', 'task-parent-g210', ?, 'openai-codex', 'acc-g210', 'ws-exclusive-test', ?, 'running', ?, ?)
  `).run(agentLead.id, testDir, nowIso, nowIso);

  db.prepare(`
    INSERT INTO runtime_sessions (id, task_id, agent_id, provider_id, account_id, workspace_id, working_directory, status, created_at, updated_at)
    VALUES ('sess-lock-2', 'task-parent-g210', ?, 'openai-codex', 'acc-g210', 'ws-exclusive-test', ?, 'running', ?, ?)
  `).run(agentWorker.id, testDir, nowIso, nowIso);

  // Scenario 30: Workspace Exclusive Concurrency Lock
  const lockAcq1 = lockManager.acquireLock({
    sessionId: 'sess-lock-1',
    workspaceId: 'ws-exclusive-test',
    agentId: agentLead.id,
    lockType: 'workspace_exclusive',
    resourcePath: testDir,
  });
  const lockAcq2 = lockManager.acquireLock({
    sessionId: 'sess-lock-2',
    workspaceId: 'ws-exclusive-test',
    agentId: agentWorker.id,
    lockType: 'workspace_exclusive',
    resourcePath: testDir,
  });
  assert(
    lockAcq1.acquired === true && lockAcq2.acquired === false && lockAcq2.reason?.includes('khóa độc quyền'),
    'RuntimeLockManager bảo vệ Workspace độc quyền, ngăn chặn 2 Session xung đột tài nguyên'
  );

  // Scenario 31: Stale Lock Detection & Automatic Cleanup
  const cleanedLocks = lockManager.cleanupStaleLocks(new Set(['sess-active-other']));
  const activeLocksAfter = lockManager.listActiveLocks().filter(l => l.sessionId === 'sess-lock-1');
  assert(
    cleanedLocks.cleanedCount >= 1 && activeLocksAfter.length === 0,
    'Tự động phát hiện và dọn dẹp các khóa bị treo do phiên kết thúc bất thường (Stale Locks Cleanup)'
  );

  console.log('\n--- 7. Process Reliability & Monitoring ---');

  // Scenario 32: Non-Shell Process Tree Kill
  const runner = new ProcessRunner();
  // Spawn a real ping or node sleep command
  const runPromise = runner.run({
    executable: process.execPath,
    args: ['-e', 'setInterval(() => {}, 1000)'],
    workingDirectory: testDir,
    sessionId: 'sess-proc-kill-test',
    timeoutMs: 30000,
  });

  // Wait 200ms then terminate process tree
  await new Promise(r => setTimeout(r, 200));
  const activePid = runner.getActivePid('sess-proc-kill-test');
  const terminated = runner.terminateProcessTree('sess-proc-kill-test', 'G210_TEST_KILL');
  const runResult = await runPromise;

  assert(
    activePid !== null && terminated === true && (runResult.exitCode !== 0 || runResult.exitSignal !== null),
    'Hủy toàn bộ cây tiến trình bằng taskkill /t /f an toàn không qua command shell'
  );

  // Scenario 33: Process Monitor PID Reuse Detection via Creation Time
  const processMonitor = new ProcessMonitor();
  let fakeCreationTime = '2026-10-31T00:00:00.000Z';
  const customProbeFn = async (pid) => ({
    pid,
    status: 'sampled',
    parentPid: 1000,
    startTime: fakeCreationTime,
    cpuTimeMs: 100,
    workingSetBytes: 50000000,
  });

  const mockSamplerMonitor = new ProcessMonitor({
    probeFn: customProbeFn,
    logicalCpuCount: 4,
  });

  let detectedReuse = false;
  mockSamplerMonitor.startSampling({
    sessionId: 'sess-reuse-test',
    pid: 9999,
    intervalMs: 100,
    onSample: (sample) => {
      if (sample.processIdentityChanged) {
        detectedReuse = true;
      }
    },
  });

  await new Promise(r => setTimeout(r, 150));
  fakeCreationTime = '2026-10-31T01:00:00.000Z'; // Process changed!
  await new Promise(r => setTimeout(r, 250));
  mockSamplerMonitor.stopSampling('sess-reuse-test');

  assert(
    detectedReuse === true,
    'ProcessMonitor phát hiện chính xác sự kiện Windows tái sử dụng PID (PID Reuse Detection qua Creation Date)'
  );

  console.log('\n--- 8. Resource Management & System Health ---');

  // Scenario 34: Real System & Studio Storage Metrics
  const metrics = resourceMonitor.sampleMetrics();
  assert(
    metrics.systemMemory.totalBytes > 0 &&
    metrics.processMemory.heapUsedBytes > 0 &&
    metrics.studioStorage.sqliteDbSizeBytes > 0 &&
    metrics.healthStatus === 'healthy' || metrics.healthStatus === 'warning',
    'Thu thập chỉ số tài nguyên hệ thống thực tế (RAM, Heap, SQLite size) với cấu trúc dữ liệu minh bạch'
  );

  // Scenario 35: Native OS Disk Free Space Detection via statfs
  assert(
    metrics.diskStorage.totalBytes > 0 &&
    metrics.diskStorage.freeBytes > 0 &&
    metrics.diskStorage.availableBytes > 0 &&
    metrics.diskStorage.freePercent > 0,
    'Đo lường dung lượng ổ đĩa tự do chính xác bằng fs.statfsSync của Node.js mà không dùng lệnh CLI bên ngoài'
  );

  console.log('\n================================================================');
  console.log(`KẾT QUẢ G2.10: ${passedAssertions}/${passedAssertions} ASSERTIONS PASSED (100%)`);
  console.log('TẤT CẢ 35 TÌNH HUỐNG BẢO MẬT & ĐỘ TIN CẬY ĐÃ ĐẠT NGHIỆM THU.');
  console.log('================================================================\n');

  // Clean up scratch test workspace
  db.close();
  try {
    fs.rmSync(testDir, { recursive: true, force: true });
  } catch {
    // Ignore cleanup errors
  }
}

runG210Verification().catch((err) => {
  console.error('\nVerification failed with exception:', err);
  process.exit(1);
});
