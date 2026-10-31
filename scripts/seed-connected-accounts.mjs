import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'storage', 'studio.db');
const db = new DatabaseSync(dbPath);

const now = new Date().toISOString();

const accountsToSeed = [
  {
    id: 'acc-google-pro',
    provider_id: 'antigravity',
    display_name: 'Google AI Studio (Pro Tier)',
    auth_method: 'api-key-vault',
    credential_ref: 'wincred://personal-ai-studio/google-owner-pro',
    storage_backend: 'windows-credential-manager',
    masked_hint: '***gapi-pro',
    auth_status: 'authenticated',
    subscription_tier: 'pro',
  },
  {
    id: 'acc-codex-plus',
    provider_id: 'openai-codex',
    display_name: 'OpenAI Codex (Plus Tier)',
    auth_method: 'api-key-vault',
    credential_ref: 'wincred://personal-ai-studio/openai-owner-plus',
    storage_backend: 'windows-credential-manager',
    masked_hint: '***sk-plus',
    auth_status: 'authenticated',
    subscription_tier: 'plus',
  },
  {
    id: 'acc-claude-free',
    provider_id: 'anthropic-claude',
    display_name: 'Anthropic Claude (Free Tier)',
    auth_method: 'api-key-vault',
    credential_ref: 'wincred://personal-ai-studio/claude-owner-free',
    storage_backend: 'windows-credential-manager',
    masked_hint: '***ant-free',
    auth_status: 'authenticated',
    subscription_tier: 'free',
  },
];

const insertStmt = db.prepare(`
  INSERT INTO accounts (
    id, provider_id, display_name, auth_method,
    credential_ref, storage_backend, masked_hint,
    auth_status, subscription_tier, last_synced_at, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), datetime('now'), datetime('now'))
  ON CONFLICT(id) DO UPDATE SET
    display_name = excluded.display_name,
    auth_method = excluded.auth_method,
    credential_ref = excluded.credential_ref,
    storage_backend = excluded.storage_backend,
    masked_hint = excluded.masked_hint,
    auth_status = excluded.auth_status,
    subscription_tier = excluded.subscription_tier,
    last_synced_at = datetime('now'),
    updated_at = datetime('now')
`);

for (const a of accountsToSeed) {
  insertStmt.run(
    a.id,
    a.provider_id,
    a.display_name,
    a.auth_method,
    a.credential_ref,
    a.storage_backend,
    a.masked_hint,
    a.auth_status,
    a.subscription_tier
  );
  console.log(`[SEED] Seeded account: ${a.display_name} -> Tier: ${a.subscription_tier.toUpperCase()}`);
}

// Link agents to matching accounts
db.prepare("UPDATE agents SET account_id = 'acc-google-pro' WHERE provider_id = 'antigravity'").run();
db.prepare("UPDATE agents SET account_id = 'acc-codex-plus' WHERE provider_id = 'openai-codex'").run();
db.prepare("UPDATE agents SET account_id = 'acc-claude-free' WHERE provider_id = 'anthropic-claude'").run();

console.log('\n--- ALL ACCOUNTS IN DB ---');
console.table(db.prepare('SELECT id, provider_id, display_name, subscription_tier, auth_status, masked_hint FROM accounts').all());

console.log('\n--- AGENTS WITH LINKED ACCOUNTS ---');
console.table(db.prepare('SELECT a.id, a.name, a.provider_id, a.account_id, acc.subscription_tier FROM agents a LEFT JOIN accounts acc ON acc.id = a.account_id').all());

db.close();
