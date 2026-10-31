import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'storage', 'studio.db');
const db = new DatabaseSync(dbPath);

const now = new Date().toISOString();

// 1. Seed perm-full-access into agent_permissions
db.prepare(`
  INSERT INTO agent_permissions (
    id, name, description, filesystem_scope,
    network_access, shell_execution, git_safety_mode,
    requires_owner_approval, created_at, updated_at, is_builtin
  ) VALUES (
    'perm-full-access',
    'Full Access Developer (Codex Mode)',
    'Toàn quyền tự chủ tương tự Codex Full Access: Tự động chạy lệnh shell, đọc ghi tệp và biên dịch trong Workspace không cần phê duyệt từng bước.',
    'workspace-read-write',
    1, 'allowed', 'strict-owner-approval', 0,
    ?, ?, 1
  )
  ON CONFLICT(id) DO UPDATE SET
    name = excluded.name,
    description = excluded.description,
    filesystem_scope = excluded.filesystem_scope,
    network_access = excluded.network_access,
    shell_execution = excluded.shell_execution,
    requires_owner_approval = excluded.requires_owner_approval,
    updated_at = excluded.updated_at
`).run(now, now);

// 2. Seed rules for perm-full-access
const rules = [
  { key: 'fs.read_file', cat: 'filesystem', state: 'allowed' },
  { key: 'fs.create_file', cat: 'filesystem', state: 'allowed' },
  { key: 'fs.modify_file', cat: 'filesystem', state: 'allowed' },
  { key: 'fs.delete_file', cat: 'filesystem', state: 'allowed' },
  { key: 'fs.create_directory', cat: 'filesystem', state: 'allowed' },
  { key: 'fs.list_directory', cat: 'filesystem', state: 'allowed' },
  { key: 'fs.access_outside_workspace', cat: 'filesystem', state: 'denied' },
  { key: 'shell.run_command', cat: 'shell', state: 'allowed' },
  { key: 'shell.powershell', cat: 'shell', state: 'allowed' },
  { key: 'shell.cmd', cat: 'shell', state: 'allowed' },
  { key: 'shell.git_command', cat: 'shell', state: 'allowed' },
  { key: 'shell.package_manager', cat: 'shell', state: 'allowed' },
  { key: 'shell.build_tool', cat: 'shell', state: 'allowed' },
  { key: 'shell.unity_cli', cat: 'shell', state: 'allowed' },
  { key: 'net.network_access', cat: 'network', state: 'allowed' },
  { key: 'net.localhost_access', cat: 'network', state: 'allowed' },
  { key: 'net.internet_access', cat: 'network', state: 'allowed' },
  { key: 'app.launch', cat: 'application', state: 'allowed' },
  { key: 'app.interact', cat: 'application', state: 'allowed' },
  { key: 'app.control_ui', cat: 'application', state: 'denied' },
  { key: 'git.read_status_diff', cat: 'git', state: 'allowed' },
  { key: 'git.create_branch', cat: 'git', state: 'denied' },
  { key: 'git.commit', cat: 'git', state: 'denied' },
  { key: 'git.push', cat: 'git', state: 'denied' },
  { key: 'git.merge', cat: 'git', state: 'denied' },
  { key: 'git.remote_modify', cat: 'git', state: 'denied' },
];

const insertRuleStmt = db.prepare(`
  INSERT INTO permission_rules (
    id, profile_id, agent_id, category, permission_key,
    tri_state, source, notes, updated_at
  ) VALUES (?, 'perm-full-access', NULL, ?, ?, ?, 'profile_inherited', '', ?)
  ON CONFLICT(id) DO UPDATE SET
    tri_state = excluded.tri_state,
    updated_at = excluded.updated_at
`);

for (const r of rules) {
  insertRuleStmt.run(`pr-perm-full-access-${r.key}`, r.cat, r.key, r.state, now);
}

// 3. Update supported reasoning levels for Codex models & Gemini models to include full-access
const models = db.prepare('SELECT id, supported_reasoning_levels_json FROM models WHERE supports_reasoning = 1').all();
const updateMdlStmt = db.prepare('UPDATE models SET supported_reasoning_levels_json = ?, updated_at = ? WHERE id = ?');

for (const m of models) {
  let levels = [];
  try {
    levels = JSON.parse(m.supported_reasoning_levels_json);
  } catch {
    levels = ['low', 'medium', 'high'];
  }
  if (!levels.includes('full-access')) {
    levels.push('full-access');
    updateMdlStmt.run(JSON.stringify(levels), now, m.id);
    console.log(`[MODEL] Updated model ${m.id} to support 'full-access' reasoning.`);
  }
}

// 4. Update agt-codex-6 to use full-access reasoning and perm-full-access profile
db.prepare(`
  UPDATE agents
  SET reasoning_level = 'full-access',
      permission_profile_id = 'perm-full-access',
      updated_at = ?
  WHERE id = 'agt-codex-6'
`).run(now);

console.log('\n--- VERIFICATION OF PROFILES ---');
console.table(db.prepare('SELECT id, name, shell_execution, requires_owner_approval FROM agent_permissions').all());

console.log('\n--- VERIFICATION OF AGENTS ---');
console.table(db.prepare('SELECT id, name, reasoning_level, permission_profile_id FROM agents').all());

db.close();
