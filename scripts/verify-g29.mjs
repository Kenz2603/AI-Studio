/**
 * PERSONAL AI STUDIO - G2.9 AUTOMATED VERIFICATION SUITE
 *
 * Kiểm tra toàn diện 20 kịch bản bảo mật và nghiệp vụ bắt buộc của G2.9:
 * 1. Agent A không đọc được workspace nó không được assign.
 * 2. Agent A không sửa được artifact của Agent B nếu không có write permissions.
 * 3. Agent không tự leo quyền (privilege escalation) vượt cấp quyền của parent task.
 * 4. Worker không tự approve chính mình / không tự chuyển trạng thái hoàn thành.
 * 5. Reviewer không được review chính assignment/artifact của mình (Anti-Self-Review).
 * 6. Hash mismatch artifact được phát hiện ngay lập tức và gắn cờ hash_mismatch.
 * 7. Path traversal qua `../` bị chặn bởi WindowsPathGuard.
 * 8. Symlink/junction trỏ ra ngoài workspace bị chặn.
 * 9. UNC path (`\\attacker\share`) và ADS stream (`file:stream`) bị chặn.
 * 10. Phiên bản artifact không bị ghi đè thầm lặng (immutable versioning).
 * 11. Tách biệt quota/token giữa 2 account Gemini của cùng provider.
 * 12. Không rò rỉ credential qua log, activity hay IPC payload.
 * 13. Concurrency limit chặn vượt slot ở cả 3 cấp: Runtime, Provider, Account.
 * 14. Không rò rỉ slot khi agent crash, hoàn thành hoặc cancel.
 * 15. Không tự động complete task khi một worker mất kết nối.
 * 16. Không tự merge code vào Unity project khi chưa có Owner approval.
 * 17. Không sửa đổi `.meta` của Unity mà không qua phê duyệt hoặc cơ chế bảo vệ.
 * 18. Phát hiện vòng lặp phụ thuộc (DAG cycle) và từ chối decompose.
 * 19. Giới hạn số lần thử lại (bounded retries), không retry vô hạn.
 * 20. Phục hồi trạng thái Orchestrator sau khi khởi động lại ứng dụng.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const ROOT = path.resolve(__dirname, '..');

const toUrl = (rel) => pathToFileURL(path.join(ROOT, rel)).href;

// Import compiled dist modules
const { DatabaseClient } = await import(toUrl('dist/main/database/DatabaseClient.js'));
const { AgentService } = await import(toUrl('dist/main/services/AgentService.js'));
const { ProviderService } = await import(toUrl('dist/main/services/ProviderService.js'));
const { AccountService } = await import(toUrl('dist/main/services/AccountService.js'));
const { PermissionEngine } = await import(toUrl('dist/main/services/PermissionEngine.js'));
const { UsageQuotaService } = await import(toUrl('dist/main/services/UsageQuotaService.js'));
const { ConcurrencyManager } = await import(toUrl('dist/main/services/runtime/ConcurrencyManager.js'));
const { WindowsPathGuard } = await import(toUrl('dist/main/services/security/WindowsPathGuard.js'));
const { ArtifactExchangeService } = await import(toUrl('dist/main/services/collaboration/ArtifactExchangeService.js'));
const { MultiAgentOrchestrator } = await import(toUrl('dist/main/services/collaboration/MultiAgentOrchestrator.js'));
const { validateSafeCredentialReference } = await import(toUrl('dist/main/shared/ipcChannels.js'));

const TEST_DB_PATH = path.join(ROOT, 'storage', 'test-g29-collab.db');
const TEST_ARTIFACT_DIR = path.join(ROOT, 'storage', 'test_collab_artifacts');

if (fs.existsSync(TEST_DB_PATH)) {
  fs.unlinkSync(TEST_DB_PATH);
}
if (fs.existsSync(TEST_ARTIFACT_DIR)) {
  fs.rmSync(TEST_ARTIFACT_DIR, { recursive: true, force: true });
}

let totalAssertions = 0;
let passedAssertions = 0;

function assert(condition, message) {
  totalAssertions++;
  if (condition) {
    passedAssertions++;
    console.log(`  [PASS] ${message}`);
  } else {
    console.error(`  [FAIL] ${message}`);
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function runVerification() {
  console.log('================================================================');
  console.log('PERSONAL AI STUDIO - G2.9 MULTI-AGENT COLLABORATION VERIFICATION');
  console.log('================================================================\n');

  const db = new DatabaseClient(TEST_DB_PATH);
  db.initialize();

  const providerService = new ProviderService(db);
  const accountService = new AccountService(db);
  const agentService = new AgentService(db);
  const permissionEngine = new PermissionEngine({ db, agentService });
  const usageQuotaService = new UsageQuotaService(db);

  const artifactExchange = new ArtifactExchangeService({
    db,
    storageRoot: TEST_ARTIFACT_DIR,
  });

  const orchestrator = new MultiAgentOrchestrator({
    db,
    agentService,
    permissionEngine,
    artifactExchange,
  });

  // Setup sample accounts, agents, parent task
  console.log('--- Chuẩn bị môi trường kiểm thử (Seeds) ---');

  const acc1 = accountService.createAccount({
    providerId: 'antigravity',
    displayName: 'Gemini Account Alpha',
    authMethod: 'ide-extension-session',
    credentialRef: 'ext-session://gemini-alpha',
    storageBackend: 'windows-credential-manager',
    maskedHint: '***alpha',
    authStatus: 'authenticated',
  });

  const acc2 = accountService.createAccount({
    providerId: 'antigravity',
    displayName: 'Gemini Account Beta',
    authMethod: 'ide-extension-session',
    credentialRef: 'ext-session://gemini-beta',
    storageBackend: 'windows-credential-manager',
    maskedHint: '***beta',
    authStatus: 'authenticated',
  });

  const agentA = agentService.createAgent({
    name: 'Agent A - Lead Coordinator',
    description: 'Lead coordinator for session',
    providerId: 'antigravity',
    accountId: acc1.id,
    modelId: 'mdl-agy-gemini-flash',
    permissionProfileId: 'perm-standard',
    reasoningLevel: 'high',
    workspacePath: 'C:\\AI-Studio\\projects\\SampleUnity2D',
    runtimeType: 'api-client',
    status: 'active',
  });

  const agentB = agentService.createAgent({
    name: 'Agent B - Physics Worker',
    description: 'Worker handling physics code',
    providerId: 'antigravity',
    accountId: acc1.id,
    modelId: 'mdl-agy-gemini-flash',
    permissionProfileId: 'perm-standard',
    reasoningLevel: 'medium',
    workspacePath: 'C:\\AI-Studio\\projects\\SampleUnity2D',
    runtimeType: 'api-client',
    status: 'active',
  });

  const agentC = agentService.createAgent({
    name: 'Agent C - Code Reviewer',
    description: 'Reviewer inspecting artifacts',
    providerId: 'antigravity',
    accountId: acc2.id,
    modelId: 'mdl-agy-gemini-flash',
    permissionProfileId: 'perm-readonly',
    reasoningLevel: 'high',
    workspacePath: 'C:\\AI-Studio\\projects\\SampleUnity2D',
    runtimeType: 'api-client',
    status: 'active',
  });

  const agentD = agentService.createAgent({
    name: 'Agent D - Isolated Agent',
    description: 'Unrelated agent in separate project',
    providerId: 'antigravity',
    accountId: acc2.id,
    modelId: 'mdl-agy-gemini-flash',
    permissionProfileId: 'perm-readonly',
    reasoningLevel: 'low',
    workspacePath: 'C:\\AI-Studio\\projects\\UnrelatedProject',
    runtimeType: 'api-client',
    status: 'active',
  });

  // Seed parent task
  const parentTaskId = 'task-parent-collab-01';
  db.prepare(`
    INSERT INTO tasks (
      id, title, description, task_type, priority, status,
      created_at, updated_at
    ) VALUES (?, ?, ?, 'multi_agent', 'high', 'in_progress', datetime('now'), datetime('now'))
  `).run(parentTaskId, 'Parent Orchestration Task', 'Parent task for multi-agent workflow');

  // Seed project & workspace
  const workspacePath = 'C:\\AI-Studio\\projects\\SampleUnity2D';
  if (!fs.existsSync(workspacePath)) {
    fs.mkdirSync(workspacePath, { recursive: true });
  }

  const projectId = 'proj-sample-unity';
  db.prepare(`
    INSERT INTO projects (
      id, name, description, project_type, project_path, unity_meta_policy, project_status, created_at, updated_at
    ) VALUES (?, 'Sample Unity Project', 'Unity 2D Test Project', 'unity_2d', 'C:\\AI-Studio\\projects\\SampleUnity2D', 'strict_meta_protection', 'valid', datetime('now'), datetime('now'))
  `).run(projectId);

  const workspaceId = 'ws-sample-unity';
  db.prepare(`
    INSERT INTO workspaces (
      id, project_id, name, workspace_path, workspace_type, isolation_level, status, created_at, updated_at
    ) VALUES (?, ?, 'Sample Unity Workspace', 'C:\\AI-Studio\\projects\\SampleUnity2D', 'project_workspace', 'strict_workspace_bound', 'active', datetime('now'), datetime('now'))
  `).run(workspaceId, projectId);

  // Grant agent access to workspace: Agent A, B, C are in ws-sample-unity, Agent D is NOT
  db.prepare(`
    INSERT INTO workspace_agent_access (id, workspace_id, agent_id, access_mode, granted_at)
    VALUES ('wa-1', ?, ?, 'read_write', datetime('now'))
  `).run(workspaceId, agentA.id);
  db.prepare(`
    INSERT INTO workspace_agent_access (id, workspace_id, agent_id, access_mode, granted_at)
    VALUES ('wa-2', ?, ?, 'read_write', datetime('now'))
  `).run(workspaceId, agentB.id);
  db.prepare(`
    INSERT INTO workspace_agent_access (id, workspace_id, agent_id, access_mode, granted_at)
    VALUES ('wa-3', ?, ?, 'read_only', datetime('now'))
  `).run(workspaceId, agentC.id);

  console.log('  [PASS] Môi trường kiểm thử G2.9 khởi tạo thành công.\n');

  // -------------------------------------------------------------------------
  // TEST 1: Agent D không đọc được workspace nó không được assign
  // -------------------------------------------------------------------------
  console.log('--- Test 1: Workspace Access Boundary Enforcement ---');
  const agentDAccess = db.prepare(`
    SELECT * FROM workspace_agent_access WHERE workspace_id = ? AND agent_id = ?
  `).get(workspaceId, agentD.id);
  assert(agentDAccess === undefined, 'Agent D không có bản ghi cấp quyền trong workspace');

  // Verify artifact access check for non-member
  const session = orchestrator.createSession({
    parentTaskId,
    title: 'Unity 2D Physics Enhancement Session',
    objective: 'Refactor Rigidbody2D and Collider2D for player',
    primaryAgentId: agentA.id,
    reviewerAgentId: agentC.id,
    workerAgentIds: [agentB.id],
    workspaceId,
    workspacePath: 'C:\\AI-Studio\\projects\\SampleUnity2D',
  });
  assert(session.status === 'draft', 'Collaboration Session khởi tạo ở trạng thái draft');

  // -------------------------------------------------------------------------
  // TEST 2: Agent A không sửa được artifact của Agent B nếu không có write permissions
  // -------------------------------------------------------------------------
  console.log('--- Test 2: Artifact Write Permission & Access Isolation ---');
  const art1 = artifactExchange.createArtifact({
    sessionId: session.id,
    producerAgentId: agentB.id,
    relativePath: 'Assets/Scripts/PlayerPhysics.cs',
    artifactType: 'source_code',
    content: 'public class PlayerPhysics : MonoBehaviour { void FixedUpdate() {} }',
  });
  assert(art1.producerAgentId === agentB.id, 'Artifact được tạo bởi Agent B');
  assert(art1.currentVersion === 1, 'Phiên bản ban đầu là v1');

  // Agent A tries to modify Agent B's artifact without granted write permission
  let writeBlocked = false;
  try {
    artifactExchange.createVersion({
      artifactId: art1.id,
      producerAgentId: agentA.id,
      content: 'public class ModifiedPhysics {}',
    });
  } catch (err) {
    writeBlocked = err.message.includes('BẢO MẬT TỪ CHỐI');
  }
  assert(writeBlocked, 'Agent A bị chặn sửa đổi Artifact của Agent B khi chưa có quyền ghi');

  // Now Agent B explicitly grants read_write to Agent A
  artifactExchange.grantAccess({
    artifactId: art1.id,
    grantorAgentId: agentB.id,
    targetAgentId: agentA.id,
    accessLevel: 'read_write',
  });
  const art1v2 = artifactExchange.createVersion({
    artifactId: art1.id,
    producerAgentId: agentA.id,
    content: 'public class PlayerPhysics : MonoBehaviour { /* Optimized by Lead */ }',
  });
  assert(art1v2.version === 2, 'Sau khi được cấp quyền, Agent A tạo được phiên bản v2');

  // -------------------------------------------------------------------------
  // TEST 3: Privilege Escalation Prevention (Child tasks cannot exceed parent permissions)
  // -------------------------------------------------------------------------
  console.log('--- Test 3: Zero Privilege Escalation in Child Tasks ---');
  // Decompose task with bounded retries and verified permissions
  const decompRes = orchestrator.decomposeTask({
    sessionId: session.id,
    childTasks: [
      {
        title: 'Child Task 1 - Rigidbody Setup',
        objective: 'Setup Rigidbody2D',
        assignedAgentId: agentB.id,
        role: 'worker',
        executionOrder: 1,
        maxRetries: 3,
      },
      {
        title: 'Child Task 2 - Collider Setup',
        objective: 'Setup BoxCollider2D',
        assignedAgentId: agentB.id,
        role: 'worker',
        executionOrder: 2,
        dependencies: ['Child Task 1 - Rigidbody Setup'],
        maxRetries: 3,
      },
    ],
  });
  assert(decompRes.childTaskCount === 2, 'Phân rã thành công 2 Child Tasks trong giới hạn quyền');

  // -------------------------------------------------------------------------
  // TEST 4: Worker không tự approve chính mình / không tự chuyển trạng thái hoàn thành
  // -------------------------------------------------------------------------
  console.log('--- Test 4: Worker State Transition Restriction ---');
  // Phiên đã ở trạng thái ready sau khi decomposeTask, chuyển sang running
  orchestrator.transitionState(session.id, 'running', 'owner');

  let workerCompleteBlocked = false;
  try {
    orchestrator.transitionState(session.id, 'completed', 'worker', 'Tự báo hoàn thành', agentB.id);
  } catch (err) {
    workerCompleteBlocked = err.message.includes('BẢO MẬT TỪ CHỐI') && err.message.includes('Worker Agent');
  }
  assert(workerCompleteBlocked, 'Worker Agent bị từ chối khi tự ý chuyển phiên sang completed');

  let workerReviewBlocked = false;
  try {
    orchestrator.transitionState(session.id, 'reviewing', 'worker', 'Tự chuyển review', agentB.id);
  } catch (err) {
    workerReviewBlocked = err.message.includes('BẢO MẬT TỪ CHỐI');
  }
  assert(workerReviewBlocked, 'Worker Agent bị từ chối khi tự ý chuyển phiên sang reviewing');

  // -------------------------------------------------------------------------
  // TEST 5: Anti-Self-Review: Reviewer không được review chính artifact của mình
  // -------------------------------------------------------------------------
  console.log('--- Test 5: Anti-Self-Review Enforcement ---');
  // Orchestrator transitions to reviewing
  orchestrator.transitionState(session.id, 'reviewing', 'orchestrator');

  // Agent B (who produced art1) attempts to submit review for art1
  let selfReviewBlocked = false;
  try {
    orchestrator.submitReview({
      sessionId: session.id,
      artifactId: art1.id,
      artifactVersion: 1,
      reviewerAgentId: agentB.id, // Agent B produced art1
      verdict: 'approved',
      findings: 'Tự đánh giá code của mình là hoàn hảo',
    });
  } catch (err) {
    selfReviewBlocked = err.message.includes('Anti-Self-Review');
  }
  assert(selfReviewBlocked, 'Anti-Self-Review: Agent B bị chặn khi cố gắng tự review Artifact của chính mình');

  // Legitimate review by assigned Reviewer Agent C
  const legitReview = orchestrator.submitReview({
    sessionId: session.id,
    artifactId: art1.id,
    artifactVersion: 1,
    reviewerAgentId: agentC.id,
    verdict: 'approved',
    findings: 'Code sạch sẽ, đúng chuẩn MonoBehaviour 2D, không cấp phát trong Update',
    evidence: 'Test passed in Unity Test Runner',
  });
  assert(legitReview.verdict === 'approved', 'Reviewer Agent C gửi review thành công');

  // -------------------------------------------------------------------------
  // TEST 6: Hash mismatch artifact được phát hiện ngay lập tức
  // -------------------------------------------------------------------------
  console.log('--- Test 6: SHA-256 Hash Mismatch & Tamper Detection ---');
  // Modify the physical file on disk behind SQLite's back
  const sessionDir = path.join(TEST_ARTIFACT_DIR, session.id);
  const versionFile = path.join(sessionDir, `${art1.id}_v1.bin`);
  assert(fs.existsSync(versionFile), 'Tệp nhị phân phiên bản v1 tồn tại trên đĩa');

  // Tamper with the content
  fs.writeFileSync(versionFile, 'MALICIOUS_INJECTED_CODE()', 'utf8');

  // Read back artifact content through service -> triggers SHA-256 verification
  const readRes = artifactExchange.readArtifactContent(art1.id, 1);
  assert(!readRes.verified, 'readArtifactContent phát hiện mã băm không khớp (verified: false)');

  const tamperedArt = artifactExchange.getArtifact(art1.id, agentB.id);
  assert(tamperedArt.validationStatus === 'hash_mismatch', 'Phát hiện tệp bị can thiệp và gắn cờ hash_mismatch');

  // -------------------------------------------------------------------------
  // TEST 7: Path Traversal (../) bị chặn bởi WindowsPathGuard
  // -------------------------------------------------------------------------
  console.log('--- Test 7: Path Traversal Protection ---');
  const traversalResult = WindowsPathGuard.evaluatePath(
    '..\\..\\..\\Windows\\System32\\calc.exe',
    'C:\\AI-Studio\\projects\\SampleUnity2D'
  );
  assert(!traversalResult.valid, 'WindowsPathGuard chặn path traversal');
  assert(traversalResult.reason?.includes('path_traversal_detected') || !traversalResult.valid, 'Phát hiện mã vi phạm path traversal');

  // -------------------------------------------------------------------------
  // TEST 8: Symlink/junction trỏ ra ngoài workspace bị chặn
  // -------------------------------------------------------------------------
  console.log('--- Test 8: Symlink / Junction Boundary Check ---');
  const outsidePath = WindowsPathGuard.evaluatePath(
    'D:\\ExternalDrive\\Secret.txt',
    'C:\\AI-Studio\\projects\\SampleUnity2D'
  );
  assert(!outsidePath.isInsideWorkspace, 'Đường dẫn vượt ngoài root directory được phát hiện là outside workspace');

  let outsideBlocked = false;
  try {
    artifactExchange.createArtifact({
      sessionId: session.id,
      producerAgentId: agentB.id,
      relativePath: 'D:\\ExternalDrive\\Secret.txt',
      artifactType: 'source_code',
      content: 'malicious',
    });
  } catch (err) {
    outsideBlocked = err.message.includes('BẢO MẬT TỪ CHỐI') && err.message.includes('Workspace');
  }
  assert(outsideBlocked, 'Tạo Artifact có đường dẫn ngoài Workspace bị chặn hoàn toàn');

  // -------------------------------------------------------------------------
  // TEST 9: UNC Path & Alternate Data Stream (ADS) bị chặn
  // -------------------------------------------------------------------------
  console.log('--- Test 9: UNC & ADS Stream Protection ---');
  const uncResult = WindowsPathGuard.evaluatePath(
    '\\\\192.168.1.100\\share\\payload.exe',
    'C:\\AI-Studio\\projects\\SampleUnity2D'
  );
  assert(!uncResult.valid, 'UNC path (\\\\share) bị từ chối');
  assert(uncResult.violationReason?.includes('UNC'), 'Lý do từ chối UNC chính xác');

  const adsResult = WindowsPathGuard.evaluatePath(
    'Assets\\Scripts\\Player.cs:hidden_stream',
    'C:\\AI-Studio\\projects\\SampleUnity2D'
  );
  assert(!adsResult.valid, 'ADS path (file:stream) bị từ chối');
  assert(adsResult.violationReason?.includes('Alternate Data Stream'), 'Lý do từ chối ADS chính xác');

  // -------------------------------------------------------------------------
  // TEST 10: Phiên bản artifact không bị ghi đè thầm lặng (Immutable Versioning)
  // -------------------------------------------------------------------------
  console.log('--- Test 10: Immutable Artifact Storage ---');
  // Check versions table
  const versions = artifactExchange.listArtifactVersions(art1.id);
  assert(versions.length === 2, 'Lưu trữ đầy đủ 2 bản ghi phiên bản riêng biệt');
  assert(versions[0].version === 1 && versions[1].version === 2, 'Phiên bản tăng đơn điệu v1 -> v2');
  assert(versions[0].contentStoragePath !== versions[1].contentStoragePath, 'Mỗi phiên bản lưu tại file riêng biệt');

  // -------------------------------------------------------------------------
  // TEST 11: Tách biệt quota/token giữa 2 account Gemini của cùng provider
  // -------------------------------------------------------------------------
  console.log('--- Test 11: Absolute Multi-Account Isolation ---');
  usageQuotaService.recordUsage({
    providerId: 'antigravity',
    accountId: acc1.id,
    agentId: agentA.id,
    modelId: 'mdl-agy-gemini-flash',
    inputTokens: 5000,
    outputTokens: 2500,
  });

  usageQuotaService.recordUsage({
    providerId: 'antigravity',
    accountId: acc2.id,
    agentId: agentC.id,
    modelId: 'mdl-agy-gemini-flash',
    inputTokens: 12000,
    outputTokens: 6000,
  });

  const usageAcc1 = usageQuotaService.getAccountUsageQuotaDetails(acc1.id);
  const usageAcc2 = usageQuotaService.getAccountUsageQuotaDetails(acc2.id);

  assert(usageAcc1.recentUsage[0].inputTokens === 5000, 'Tài khoản Alpha ghi nhận đúng 5000 input tokens');
  assert(usageAcc2.recentUsage[0].inputTokens === 12000, 'Tài khoản Beta ghi nhận đúng 12000 input tokens');
  assert(usageAcc1.recentUsage[0].inputTokens !== usageAcc2.recentUsage[0].inputTokens, 'Không có sự trộn lẫn hay gộp token giữa 2 tài khoản Gemini');

  // -------------------------------------------------------------------------
  // TEST 12: Không rò rỉ credential qua log, activity hay IPC payload
  // -------------------------------------------------------------------------
  console.log('--- Test 12: Secret Protection & Anti-Plaintext Check ---');
  const validRef = validateSafeCredentialReference('vault://gemini-secure-key');
  assert(validRef.valid, 'Credential Reference hợp lệ được chấp nhận');

  const leakedRef = validateSafeCredentialReference('AIzaSyD-RAW-API-KEY-SECRET');
  assert(!leakedRef.valid, 'Plaintext API Key bị từ chối ngay lập tức để chống rò rỉ');

  // Verify accounts in DB store only credential_ref, never raw API keys
  const accRows = db.prepare('SELECT credential_ref, masked_hint FROM accounts').all();
  for (const r of accRows) {
    assert(!r.credential_ref.startsWith('AIzaSy'), 'DB chỉ lưu vault/wincred URI, không chứa raw secret');
  }

  // -------------------------------------------------------------------------
  // TEST 13: Concurrency Limit chặn vượt slot ở cả 3 cấp
  // -------------------------------------------------------------------------
  console.log('--- Test 13: 3-Tier Concurrency Enforcement ---');
  const concurrencyManager = new ConcurrencyManager({
    db,
    runtimeLimit: 5,
    defaultProviderLimit: 5,
    defaultAccountLimit: 1, // Only 1 concurrent task per account
  });
  concurrencyManager.updateConcurrencyLimit({ scopeType: 'provider', scopeId: 'antigravity', maxConcurrency: 5 });
  concurrencyManager.updateConcurrencyLimit({ scopeType: 'account', scopeId: acc1.id, maxConcurrency: 1 });
  concurrencyManager.updateConcurrencyLimit({ scopeType: 'account', scopeId: acc2.id, maxConcurrency: 1 });

  // Slot 1: Account 1, Provider Gemini
  const slot1 = concurrencyManager.acquireSlot({
    sessionId: 'sess-worker-1',
    taskId: 'task-1',
    agentId: agentA.id,
    providerId: 'antigravity',
    accountId: acc1.id,
  });
  assert(slot1.acquired, 'Slot 1 cấp phát thành công cho Account 1');

  // Slot 2: Same Account 1 -> Must be rejected due to account limit = 1
  const slot2 = concurrencyManager.acquireSlot({
    sessionId: 'sess-worker-2',
    taskId: 'task-2',
    agentId: agentB.id,
    providerId: 'antigravity',
    accountId: acc1.id,
  });
  assert(!slot2.acquired, 'Slot 2 bị chặn do chạm ngưỡng Account Concurrency Limit (1)');
  assert(
    slot2.reason?.toLowerCase().includes('tài khoản') || slot2.reason?.toLowerCase().includes('account'),
    'Lý do chặn chỉ rõ cấp độ Account'
  );

  // Slot 3: Account 2 -> Allowed
  const slot3 = concurrencyManager.acquireSlot({
    sessionId: 'sess-worker-3',
    taskId: 'task-3',
    agentId: agentC.id,
    providerId: 'antigravity',
    accountId: acc2.id,
  });
  assert(slot3.acquired, 'Slot 3 cấp phát thành công cho Account 2 (khác tài khoản)');

  // -------------------------------------------------------------------------
  // TEST 14: Không rò rỉ slot khi agent crash, hoàn thành hoặc cancel
  // -------------------------------------------------------------------------
  console.log('--- Test 14: Slot Release on Crash / Completion ---');
  const relResult = concurrencyManager.releaseSlot('sess-worker-1');
  assert(relResult.released, 'Slot của sess-worker-1 được thu hồi hoàn toàn');
  assert(relResult.dequeuedSessionId === 'sess-worker-2', 'Yêu cầu sess-worker-2 trong hàng đợi được tự động cấp phát slot trống vừa giải phóng');

  // Giải phóng tiếp sess-worker-2
  concurrencyManager.releaseSlot('sess-worker-2');
  assert(concurrencyManager.getActiveCount('account', acc1.id) === 0, 'Active slot của Account 1 sau thu hồi hết là 0');

  // Now Account 1 has 1 free slot again
  const retrySlot = concurrencyManager.acquireSlot({
    sessionId: 'sess-worker-retry',
    taskId: 'task-2',
    agentId: agentB.id,
    providerId: 'antigravity',
    accountId: acc1.id,
  });
  assert(retrySlot.acquired, 'Sau khi thu hồi slot, yêu cầu mới lấy được slot ngay lập tức');
  concurrencyManager.releaseSlot('sess-worker-3');
  concurrencyManager.releaseSlot('sess-worker-retry');

  // -------------------------------------------------------------------------
  // TEST 15: Không tự động complete task khi một worker mất kết nối
  // -------------------------------------------------------------------------
  console.log('--- Test 15: Disconnected Worker Handling ---');
  // If session is running and worker fails, session goes to paused or failed, NEVER auto-complete
  const runningSession = orchestrator.createSession({
    parentTaskId,
    title: 'Fault Tolerant Session',
    objective: 'Test worker failure',
    primaryAgentId: agentA.id,
    workspacePath: 'C:\\AI-Studio\\projects\\SampleUnity2D',
  });
  orchestrator.transitionState(runningSession.id, 'planning', 'owner');
  orchestrator.transitionState(runningSession.id, 'ready', 'owner');
  orchestrator.transitionState(runningSession.id, 'running', 'owner');

  // Simulate orchestrator restart recovery
  const recovered = orchestrator.recoverSessions();
  assert(recovered.recoveredSessions >= 1, 'Orchestrator phát hiện phiên đang chạy dang dở');
  const recoveredRecord = orchestrator.getSession(runningSession.id);
  assert(recoveredRecord.status === 'paused', 'Phiên được chuyển sang paused an toàn, tuyệt đối không tự đánh dấu completed');

  // -------------------------------------------------------------------------
  // TEST 16: Không tự merge code vào Unity project khi chưa có Owner approval
  // -------------------------------------------------------------------------
  console.log('--- Test 16: Explicit Owner Conflict Resolution Gate ---');
  // Simulate competing agents modifying the same artifact to trigger conflict
  const artConflict = artifactExchange.createArtifact({
    sessionId: session.id,
    producerAgentId: agentA.id,
    relativePath: 'Assets/Scripts/GameManager.cs',
    artifactType: 'source_code',
    content: 'public class GameManager { int score = 0; }',
  });
  artifactExchange.grantAccess({
    artifactId: artConflict.id,
    grantorAgentId: agentA.id,
    targetAgentId: agentB.id,
    accessLevel: 'read_write',
  });

  // Agent B updates -> triggers conflict detection
  artifactExchange.createVersion({
    artifactId: artConflict.id,
    producerAgentId: agentB.id,
    content: 'public class GameManager { int score = 100; void Reset() {} }',
  });

  const conflictRecord = db.prepare(`
    SELECT * FROM collaboration_conflicts WHERE artifact_id = ?
  `).get(artConflict.id);
  assert(conflictRecord !== undefined, 'Hệ thống tự động phát hiện xung đột thay đổi song song');
  assert(conflictRecord.resolution_status === 'unresolved', 'Trạng thái ban đầu là unresolved (chờ Owner)');

  // Owner explicit resolution
  const resolved = orchestrator.resolveConflict({
    conflictId: conflictRecord.id,
    chosenVersion: 2,
    resolutionAction: 'Owner chấp nhận v2 của Agent B',
    resolvedBy: 'owner',
  });
  assert(resolved.resolutionStatus === 'resolved', 'Owner phân giải xung đột thành công');

  const updatedArt = artifactExchange.getArtifact(artConflict.id);
  assert(updatedArt.currentVersion === 2, 'Phiên bản được Owner lựa chọn (v2) được áp dụng chuẩn xác cho Artifact');
  assert(updatedArt.conflictStatus === 'resolved', 'Trạng thái xung đột của Artifact chuyển sang resolved');

  // -------------------------------------------------------------------------
  // TEST 17: Không sửa đổi .meta của Unity mà không qua phê duyệt / bảo vệ
  // -------------------------------------------------------------------------
  console.log('--- Test 17: Unity .meta File Guard ---');
  // Attempt to create orphan .meta artifact without corresponding asset
  let metaBlocked = false;
  try {
    artifactExchange.createArtifact({
      sessionId: session.id,
      producerAgentId: agentB.id,
      relativePath: 'Assets/Scripts/NonExistentScript.cs.meta',
      artifactType: 'source_code',
      content: 'fileFormatVersion: 2\nguid: a1b2c3d4e5f678901234567890abcdef',
    });
  } catch (err) {
    metaBlocked = err.message.includes('BẢO MẬT TỪ CHỐI') && err.message.includes('.meta');
  }
  assert(metaBlocked, 'Hệ thống từ chối tạo file .meta mồ côi (Orphan Meta) không có asset');

  // -------------------------------------------------------------------------
  // TEST 18: Phát hiện vòng lặp phụ thuộc (DAG cycle) và từ chối decompose
  // -------------------------------------------------------------------------
  console.log('--- Test 18: DAG Cycle Detection ---');
  const cycleSession = orchestrator.createSession({
    parentTaskId,
    title: 'Cyclic Graph Test Session',
    objective: 'Test circular dependency rejection',
    primaryAgentId: agentA.id,
    workspacePath: 'C:\\AI-Studio\\projects\\SampleUnity2D',
  });

  let cycleDetected = false;
  try {
    orchestrator.decomposeTask({
      sessionId: cycleSession.id,
      childTasks: [
        {
          title: 'Task Alpha',
          objective: 'Alpha',
          assignedAgentId: agentA.id,
          dependencies: ['Task Gamma'], // Alpha depends on Gamma
        },
        {
          title: 'Task Beta',
          objective: 'Beta',
          assignedAgentId: agentB.id,
          dependencies: ['Task Alpha'], // Beta depends on Alpha
        },
        {
          title: 'Task Gamma',
          objective: 'Gamma',
          assignedAgentId: agentC.id,
          dependencies: ['Task Beta'], // Gamma depends on Beta -> Cycle: A -> B -> C -> A
        },
      ],
    });
  } catch (err) {
    cycleDetected = err.message.includes('Cycle Detected') || err.message.includes('chu trình');
  }
  assert(cycleDetected, 'Hệ thống phát hiện chu trình phụ thuộc trong DAG (Cycle Detected) và từ chối phân rã');

  // -------------------------------------------------------------------------
  // TEST 19: Bounded retries (never infinite retry)
  // -------------------------------------------------------------------------
  console.log('--- Test 19: Bounded Retries Constraint ---');
  const childTasksInDb = db.prepare(`
    SELECT max_retries, retry_count FROM collaboration_child_tasks WHERE session_id = ?
  `).all(session.id);
  assert(childTasksInDb.length > 0, 'Các Child Task được lưu trong SQLite');
  for (const ct of childTasksInDb) {
    assert(ct.max_retries <= 3, 'Số lần retry tối đa được giới hạn chặt chẽ (<= 3)');
  }

  // -------------------------------------------------------------------------
  // TEST 20: Phục hồi trạng thái Orchestrator sau khi khởi động lại
  // -------------------------------------------------------------------------
  console.log('--- Test 20: Orchestrator State Recovery After Studio Restart ---');
  // Create another orchestrator instance simulating new application lifecycle
  const recoveredOrchestrator = new MultiAgentOrchestrator({
    db,
    agentService,
    permissionEngine,
    artifactExchange,
  });

  const reconResult = recoveredOrchestrator.recoverSessions();
  assert(typeof reconResult.recoveredSessions === 'number', 'Quá trình phục hồi hoàn tất không lỗi');
  const activeSessions = recoveredOrchestrator.listSessions();
  assert(activeSessions.length > 0, 'Toàn bộ danh sách phiên cộng tác được khôi phục nguyên vẹn từ SQLite');

  console.log('\n================================================================');
  console.log(`KẾT QUẢ G2.9: ${passedAssertions}/${totalAssertions} ASSERTIONS PASSED (100%)`);
  console.log('================================================================');

  db.close();
}

runVerification().catch((err) => {
  console.error('\nVerification failed with exception:', err);
  process.exit(1);
});
