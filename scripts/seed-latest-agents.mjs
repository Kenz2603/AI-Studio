import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'storage', 'studio.db');
const db = new DatabaseSync(dbPath);

const agentsToSeed = [
  {
    id: 'agt-lead-architect',
    name: 'Antigravity Lead Architect',
    description: 'Điều phối viên chính, phân tích kiến trúc hệ thống, lập kế hoạch DAG và điều hướng các Agent con.',
    providerId: 'antigravity',
    modelId: 'mdl-google-gemini-3.8-pro',
    reasoningLevel: 'high',
    workspacePath: 'C:\\AI-Studio',
    permissionProfileId: 'perm-standard',
    runtimeType: 'api-client',
    status: 'active',
  },
  {
    id: 'agt-unity2d-engineer',
    name: 'Unity 2D Game Engineer',
    description: 'Chuyên gia lập trình C# Unity 2D, tối ưu hóa ScriptableObjects, Sprite/Physics2D, bảo toàn tệp .meta GUID.',
    providerId: 'antigravity',
    modelId: 'mdl-google-gemini-3.8-pro',
    reasoningLevel: 'medium',
    workspacePath: 'C:\\AI-Studio',
    permissionProfileId: 'perm-standard',
    runtimeType: 'api-client',
    status: 'active',
  },
  {
    id: 'agt-code-reviewer',
    name: 'Senior Code Reviewer & QA',
    description: 'Thẩm định chất lượng mã nguồn, kiểm tra ranh giới đường dẫn, thực hiện Anti-Self-Review và tự động chạy test hồi quy.',
    providerId: 'antigravity',
    modelId: 'mdl-google-gemini-3.8-flash',
    reasoningLevel: 'low',
    workspacePath: 'C:\\AI-Studio',
    permissionProfileId: 'perm-standard',
    runtimeType: 'api-client',
    status: 'active',
  },
  {
    id: 'agt-security-sentinel',
    name: 'Security & Reliability Sentinel',
    description: 'Giám sát an ninh hệ thống tệp Windows, phát hiện rò rỉ secret, ngăn chặn ADS/DOS/UNC traversal và kiểm tra SQLite integrity.',
    providerId: 'antigravity',
    modelId: 'mdl-google-gemini-3.8-flash',
    reasoningLevel: null,
    workspacePath: 'C:\\AI-Studio',
    permissionProfileId: 'perm-standard',
    runtimeType: 'api-client',
    status: 'active',
  },
  {
    id: 'agt-codex-6',
    name: 'OpenAI Codex 6 Code Synthesizer',
    description: 'Tối ưu hóa thuật toán chuyên sâu, sinh mã backend logic hiệu năng cao với mô hình Codex 6 mới nhất.',
    providerId: 'openai-codex',
    modelId: 'mdl-openai-codex-6',
    reasoningLevel: 'high',
    workspacePath: 'C:\\AI-Studio',
    permissionProfileId: 'perm-standard',
    runtimeType: 'api-client',
    status: 'active',
  },
  {
    id: 'agt-claude-55',
    name: 'Claude 5.5 Systems Specialist',
    description: 'Tái cấu trúc module phần mềm phức tạp, tài liệu hóa kiến trúc và phân tích thiết kế với Claude 5.5 Sonnet.',
    providerId: 'anthropic-claude',
    modelId: 'mdl-anthropic-claude-5.5-sonnet',
    reasoningLevel: 'high',
    workspacePath: 'C:\\AI-Studio',
    permissionProfileId: 'perm-standard',
    runtimeType: 'api-client',
    status: 'active',
  },
];

const insertStmt = db.prepare(`
  INSERT INTO agents (
    id, name, description, provider_id, account_id, model_id,
    reasoning_level, workspace_path, permission_profile_id,
    runtime_type, status, isolated_namespace, last_error_message,
    created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, datetime('now'), datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    provider_id = excluded.provider_id,
    model_id = excluded.model_id,
    reasoning_level = excluded.reasoning_level,
    workspace_path = excluded.workspace_path,
    permission_profile_id = excluded.permission_profile_id,
    runtime_type = excluded.runtime_type,
    status = excluded.status,
    updated_at = datetime('now')
`);

// Find any matching account for each provider if present
const accounts = db.prepare('SELECT id, provider_id FROM accounts').all();
const accountMap = new Map();
for (const acc of accounts) {
  if (!accountMap.has(acc.provider_id)) {
    accountMap.set(acc.provider_id, acc.id);
  }
}

for (const a of agentsToSeed) {
  const accountId = accountMap.get(a.providerId) || null;
  const isolatedNamespace = `ns-${a.id}`;
  insertStmt.run(
    a.id,
    a.name,
    a.description,
    a.providerId,
    accountId,
    a.modelId,
    a.reasoningLevel,
    a.workspacePath,
    a.permissionProfileId,
    a.runtimeType,
    a.status,
    isolatedNamespace
  );
  console.log(`[SEED] Provisioned agent: ${a.name} (${a.id}) -> Model: ${a.modelId}`);
}

console.log('\n--- CURRENT AGENTS IN DB ---');
const currentAgents = db.prepare(`
  SELECT a.id, a.name, a.provider_id, m.display_name AS model_name, a.reasoning_level, a.status
  FROM agents a
  LEFT JOIN models m ON m.id = a.model_id
`).all();
console.table(currentAgents);

db.close();
