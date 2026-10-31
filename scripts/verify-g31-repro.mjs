/**
 * G3.1 REPRODUCTION SCRIPT
 * Tái hiện các lỗi tiềm ẩn trước khi áp dụng bản vá (Bug Reproduction Suite)
 */
import assert from 'node:assert';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const PROJECT_ROOT = path.resolve(__dirname, '..');

const { TelemetryRedactor } = await import(pathToFileURL(path.join(PROJECT_ROOT, 'dist/main/services/telemetry/TelemetryRedactor.js')).href);
const { WindowsPathGuard } = await import(pathToFileURL(path.join(PROJECT_ROOT, 'dist/main/services/security/WindowsPathGuard.js')).href);
const { DatabaseClient } = await import(pathToFileURL(path.join(PROJECT_ROOT, 'dist/main/database/DatabaseClient.js')).href);
const { AgentService } = await import(pathToFileURL(path.join(PROJECT_ROOT, 'dist/main/services/AgentService.js')).href);
const { PermissionEngine } = await import(pathToFileURL(path.join(PROJECT_ROOT, 'dist/main/services/PermissionEngine.js')).href);
const { MultiAgentOrchestrator } = await import(pathToFileURL(path.join(PROJECT_ROOT, 'dist/main/services/collaboration/MultiAgentOrchestrator.js')).href);

console.log('================================================================');
console.log('G3.1 BUG REPRODUCTION SUITE (PRE-FIX VALIDATION)');
console.log('================================================================\n');

// 1. Tái hiện BUG-G31-06: TelemetryRedactor bỏ lọt ya29 Google OAuth tokens, github_pat và Basic Auth
console.log('--- REPRODUCING BUG-G31-06 (Telemetry Redaction Gaps) ---');
const redactor = new TelemetryRedactor({});
const sampleGoogleOauth = 'Authorization header: Bearer ya29.a0AfH6SMBabc1234567890defghijk';
const redactedGoogle = redactor.redactText(sampleGoogleOauth);
const sampleGithubPat = 'GitHub PAT token: github_pat_11AAAAAAA_0123456789abcdefghijklmnopqrstuvwxyz';
const redactedGithub = redactor.redactText(sampleGithubPat);
const sampleBasicAuth = 'Authorization: Basic dXNlcjpwYXNzd29yZDEyMw==';
const redactedBasic = redactor.redactText(sampleBasicAuth);

console.log('  Original Google OAuth:', sampleGoogleOauth);
console.log('  Redacted Google OAuth:', redactedGoogle);
console.log('  Original GitHub PAT  :', sampleGithubPat);
console.log('  Redacted GitHub PAT  :', redactedGithub);
console.log('  Original Basic Auth  :', sampleBasicAuth);
console.log('  Redacted Basic Auth  :', redactedBasic);

const hasGoogleOauthGap = redactedGoogle.includes('ya29.a0AfH6SMBabc1234567890defghijk');
const hasGithubPatGap = redactedGithub.includes('github_pat_11AAAAAAA_0123456789abcdefghijklmnopqrstuvwxyz');
const hasBasicAuthGap = redactedBasic.includes('dXNlcjpwYXNzd29yZDEyMw==');

console.log(`  [REPRO RESULT] Google OAuth ya29 unredacted: ${hasGoogleOauthGap}`);
console.log(`  [REPRO RESULT] GitHub PAT unredacted       : ${hasGithubPatGap}`);
console.log(`  [REPRO RESULT] Basic Auth unredacted      : ${hasBasicAuthGap}`);

// 2. Tái hiện BUG-G31-10: WindowsPathGuard không chặn trailing dots/spaces
console.log('\n--- REPRODUCING BUG-G31-10 (Windows Trailing Dots / Spaces) ---');
const testWs = 'C:\\AI-Studio\\projects\\game';
const trailingDotTarget = 'C:\\AI-Studio\\projects\\game\\Assets\\secret.cs.';
const evalTrailingDot = WindowsPathGuard.evaluatePath(trailingDotTarget, testWs);
console.log('  Target with trailing dot:', trailingDotTarget);
console.log('  WindowsPathGuard outcome:', {
  valid: evalTrailingDot.valid,
  isInsideWorkspace: evalTrailingDot.isInsideWorkspace,
  traversalOrLinkEscapeDetected: evalTrailingDot.traversalOrLinkEscapeDetected,
});
console.log(`  [REPRO RESULT] Trailing dot was accepted as valid: ${evalTrailingDot.valid}`);

// 3. Tái hiện BUG-G31-03: decideApprovalRequest cho phép duyệt request đã hết hạn
console.log('\n--- REPRODUCING BUG-G31-03 (Approving Expired Requests) ---');
const reproDbPath = path.join(PROJECT_ROOT, 'storage', 'repro-test.db');
if (fs.existsSync(reproDbPath)) fs.unlinkSync(reproDbPath);
const dbClient = new DatabaseClient(reproDbPath);
dbClient.initialize();
const agentService = new AgentService(dbClient);
const permEngine = new PermissionEngine({ db: dbClient, agentService });

const agent = agentService.createAgent({
  name: 'Test Agent',
  providerId: 'antigravity',
  permissionProfileId: 'perm-standard',
  workspacePath: testWs,
  runtimeType: 'api-client',
});

// Chèn 1 approval_request đã hết hạn từ 1 giờ trước
const expiredId = 'appr-expired-test-1';
const pastIso = new Date(Date.now() - 3600_000).toISOString();
const olderIso = new Date(Date.now() - 7200_000).toISOString();
dbClient.prepare(`
  INSERT INTO approval_requests (
    id, agent_id, task_id, permission_type, permission_key, requested_action,
    target_resource, operation_summary, working_directory, bound_parameters_json,
    action_fingerprint, risk_level, reason, created_at, expires_at, status
  ) VALUES (?, ?, NULL, 'filesystem', 'fs.delete_file', 'delete', 'secret.txt', 'Delete secret', ?, '{}', 'dummy-fp', 'high', 'Need delete', ?, ?, 'pending')
`).run(expiredId, agent.id, testWs, olderIso, pastIso);

console.log('  Created expired approval request in DB (expired at:', pastIso, ')');
try {
  const decided = permEngine.decideApprovalRequest({
    approvalRequestId: expiredId,
    decision: 'approved',
    decisionReason: 'Owner approved expired request',
  });
  console.log(`  [REPRO RESULT] decideApprovalRequest SUCCEEDED on expired request! Status set to: ${decided.status}`);
} catch (err) {
  console.log(`  [REPRO RESULT] Rejected as expected: ${err.message}`);
}

// 4. Tái hiện BUG-G31-04: transitionState cho phép Observer chuyển sang completed
console.log('\n--- REPRODUCING BUG-G31-04 (Observer Privilege Escalation) ---');
const orch = new MultiAgentOrchestrator({
  db: dbClient,
  agentService,
  permissionEngine: permEngine,
});

const leadAgent = agentService.createAgent({
  name: 'Lead Agent',
  providerId: 'antigravity',
  permissionProfileId: 'perm-standard',
  workspacePath: testWs,
  runtimeType: 'api-client',
  status: 'active',
});

const reviewerAgent = agentService.createAgent({
  name: 'Reviewer Agent',
  providerId: 'antigravity',
  permissionProfileId: 'perm-standard',
  workspacePath: testWs,
  runtimeType: 'api-client',
  status: 'active',
});

const observerAgent = agentService.createAgent({
  name: 'Observer Agent',
  providerId: 'antigravity',
  permissionProfileId: 'perm-standard',
  workspacePath: testWs,
  runtimeType: 'api-client',
  status: 'active',
});

// Tạo 1 task hợp lệ
dbClient.prepare(`
  INSERT INTO tasks (id, title, status, priority, created_at, updated_at)
  VALUES ('task-repro-1', 'Repro Task', 'pending', 'medium', ?, ?)
`).run(pastIso, pastIso);

const session = orch.createSession({
  title: 'Repro Session',
  objective: 'Testing role permission boundary',
  parentTaskId: 'task-repro-1',
  primaryAgentId: leadAgent.id,
  reviewerAgentId: reviewerAgent.id,
  workerAgentIds: [],
  observerAgentIds: [observerAgent.id],
});

// Chuyển session sang ready -> running -> reviewing -> aggregating
orch.transitionState(session.id, 'ready', 'orchestrator');
orch.transitionState(session.id, 'running', 'orchestrator');
orch.transitionState(session.id, 'reviewing', 'orchestrator');
orch.transitionState(session.id, 'aggregating', 'orchestrator');

console.log('  Session currently in status: aggregating');
try {
  const breached = orch.transitionState(
    session.id,
    'completed',
    'observer',
    'Observer agent attempting to mark session completed',
    observerAgent.id
  );
  console.log(`  [REPRO RESULT] Observer was ALLOWED to transition session to: ${breached.status}! (BUG CONFIRMED)`);
} catch (err) {
  console.log(`  [REPRO RESULT] Observer blocked properly: ${err.message}`);
}

// 5. Tái hiện BUG-G31-05: decomposeTask bỏ qua phụ thuộc không tồn tại
console.log('\n--- REPRODUCING BUG-G31-05 (Silent Drop of Invalid Dependencies) ---');
const sessForDecomp = orch.createSession({
  title: 'Decompose Test Session',
  objective: 'Testing dependency validation',
  parentTaskId: 'task-repro-1',
  primaryAgentId: leadAgent.id,
  reviewerAgentId: reviewerAgent.id,
  workerAgentIds: [],
  observerAgentIds: [],
});

try {
  const decompRes = orch.decomposeTask({
    sessionId: sessForDecomp.id,
    childTasks: [
      {
        title: 'Child Task 1',
        objective: 'First task',
        role: 'worker',
        assignedAgentId: leadAgent.id,
        dependencies: ['NON_EXISTENT_TASK_TITLE_XYZ'],
      },
      {
        title: 'Child Task 1', // Trùng title!
        objective: 'Duplicate title task',
        role: 'worker',
        assignedAgentId: leadAgent.id,
      },
    ],
  });
  console.log(`  [REPRO RESULT] decomposeTask SUCCEEDED with duplicate titles and non-existent dependencies! Count: ${decompRes.childTaskCount} (BUG CONFIRMED)`);
} catch (err) {
  console.log(`  [REPRO RESULT] Rejected properly: ${err.message}`);
}

// Dọn dẹp
dbClient.close();
if (fs.existsSync(reproDbPath)) fs.unlinkSync(reproDbPath);
const wal = `${reproDbPath}-wal`;
if (fs.existsSync(wal)) fs.unlinkSync(wal);
const shm = `${reproDbPath}-shm`;
if (fs.existsSync(shm)) fs.unlinkSync(shm);

console.log('\n================================================================');
console.log('REPRODUCTION VERIFICATION COMPLETE');
console.log('================================================================\n');
