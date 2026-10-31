import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';

const dbPath = path.resolve(process.cwd(), 'storage', 'studio.db');
const db = new DatabaseSync(dbPath);

const stmt = db.prepare(`
  INSERT OR REPLACE INTO models (
    id, provider_id, model_key, display_name,
    context_window_tokens, max_output_tokens,
    supports_reasoning, supported_reasoning_levels_json, supports_caching,
    is_enabled, created_at, updated_at
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 1, datetime('now'), datetime('now'))
`);

// 1. Google / Antigravity Gemini 3.8 models
stmt.run(
  'mdl-google-gemini-3.8-pro',
  'antigravity',
  'gemini-3.8-pro',
  'Gemini 3.8 Pro (Advanced Reasoning)',
  2097152,
  65536,
  1,
  JSON.stringify(['low', 'medium', 'high']),
  1
);

stmt.run(
  'mdl-google-gemini-3.8-flash',
  'antigravity',
  'gemini-3.8-flash',
  'Gemini 3.8 Flash (High-Speed & Multimodal)',
  1048576,
  65536,
  1,
  JSON.stringify(['low', 'medium']),
  1
);

// 2. OpenAI Codex 6 models
stmt.run(
  'mdl-openai-codex-6',
  'openai-codex',
  'codex-6',
  'OpenAI Codex 6 (State-of-the-art)',
  1048576,
  65536,
  1,
  JSON.stringify(['low', 'medium', 'high']),
  1
);

stmt.run(
  'mdl-openai-codex-6-mini',
  'openai-codex',
  'codex-6-mini',
  'OpenAI Codex 6 Mini',
  524288,
  32768,
  1,
  JSON.stringify(['low', 'medium']),
  1
);

// 3. Anthropic Claude 5.5 models
stmt.run(
  'mdl-anthropic-claude-5.5-sonnet',
  'anthropic-claude',
  'claude-5.5-sonnet',
  'Claude 5.5 Sonnet',
  1048576,
  65536,
  1,
  JSON.stringify(['low', 'medium', 'high']),
  1
);

stmt.run(
  'mdl-anthropic-claude-5.5-opus',
  'anthropic-claude',
  'claude-5.5-opus',
  'Claude 5.5 Opus',
  2097152,
  65536,
  1,
  JSON.stringify(['low', 'medium', 'high']),
  1
);

console.log('Seeded latest models successfully:');
const models = db.prepare('SELECT id, provider_id, display_name FROM models').all();
console.table(models);
db.close();
