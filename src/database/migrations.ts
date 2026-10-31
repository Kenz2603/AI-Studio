/**
 * SQLITE SCHEMA MIGRATIONS (G2.2 & G2.3)
 *
 * Nguyên tắc bắt buộc:
 * - Có version rõ ràng cho từng bước nâng cấp schema.
 * - Không bao giờ xóa dữ liệu hiện có (Chỉ dùng CREATE TABLE IF NOT EXISTS, ALTER TABLE ADD COLUMN, INSERT OR IGNORE).
 * - Đầy đủ Foreign Keys, Unique Constraints và Indexes.
 */

export interface MigrationDefinition {
  readonly version: number;
  readonly name: string;
  readonly upSql: string;
}

export const SCHEMA_MIGRATIONS: readonly MigrationDefinition[] = [
  {
    version: 1,
    name: '001_initial_g2_2_core_schema',
    upSql: `
      -- 1. Bảng providers
      CREATE TABLE IF NOT EXISTS providers (
        id TEXT PRIMARY KEY,
        display_name TEXT NOT NULL,
        vendor TEXT NOT NULL,
        adapter_version TEXT NOT NULL DEFAULT '0.2.2',
        adapter_status TEXT NOT NULL DEFAULT 'metadata_only',
        auth_methods_json TEXT NOT NULL DEFAULT '[]',
        session_model TEXT NOT NULL DEFAULT 'stateless-request',
        supports_model_selection INTEGER NOT NULL DEFAULT 1,
        supports_reasoning_level INTEGER NOT NULL DEFAULT 0,
        supports_streaming INTEGER NOT NULL DEFAULT 1,
        supports_usage_metrics INTEGER NOT NULL DEFAULT 0,
        supports_quota_metrics INTEGER NOT NULL DEFAULT 0,
        supports_local_workspace INTEGER NOT NULL DEFAULT 0,
        requires_external_binary INTEGER NOT NULL DEFAULT 0,
        is_builtin INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 2. Bảng models
      CREATE TABLE IF NOT EXISTS models (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        model_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        context_window_tokens INTEGER,
        max_output_tokens INTEGER,
        supports_reasoning INTEGER NOT NULL DEFAULT 0,
        supported_reasoning_levels_json TEXT NOT NULL DEFAULT '[]',
        supports_caching INTEGER NOT NULL DEFAULT 0,
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE RESTRICT,
        UNIQUE(provider_id, model_key)
      );

      -- 3. Bảng accounts (Tuyệt đối không lưu plaintext secret, chỉ lưu credential_ref)
      CREATE TABLE IF NOT EXISTS accounts (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        display_name TEXT NOT NULL,
        auth_method TEXT NOT NULL,
        credential_ref TEXT NOT NULL,
        storage_backend TEXT NOT NULL,
        masked_hint TEXT NOT NULL DEFAULT '',
        auth_status TEXT NOT NULL DEFAULT 'unverified',
        subscription_tier TEXT NOT NULL DEFAULT 'free',
        last_synced_at TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE RESTRICT
      );

      -- 4. Bảng agent_permissions
      CREATE TABLE IF NOT EXISTS agent_permissions (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL UNIQUE,
        description TEXT NOT NULL,
        filesystem_scope TEXT NOT NULL DEFAULT 'workspace-read',
        network_access INTEGER NOT NULL DEFAULT 0,
        shell_execution TEXT NOT NULL DEFAULT 'denied',
        git_safety_mode TEXT NOT NULL DEFAULT 'strict-owner-approval',
        requires_owner_approval INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 5. Bảng agents
      CREATE TABLE IF NOT EXISTS agents (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        provider_id TEXT NOT NULL,
        account_id TEXT,
        model_id TEXT,
        reasoning_level TEXT,
        workspace_path TEXT NOT NULL,
        permission_profile_id TEXT NOT NULL,
        runtime_type TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'stopped',
        isolated_namespace TEXT NOT NULL UNIQUE,
        last_error_message TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE RESTRICT,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
        FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL,
        FOREIGN KEY (permission_profile_id) REFERENCES agent_permissions(id) ON DELETE RESTRICT
      );

      -- 6. Bảng tasks
      CREATE TABLE IF NOT EXISTS tasks (
        id TEXT PRIMARY KEY,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        status TEXT NOT NULL DEFAULT 'backlog',
        priority TEXT NOT NULL DEFAULT 'medium',
        workspace_path TEXT,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- 7. Bảng task_assignments
      CREATE TABLE IF NOT EXISTS task_assignments (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        assignment_status TEXT NOT NULL DEFAULT 'assigned',
        assigned_at TEXT NOT NULL,
        completed_at TEXT,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
        UNIQUE(task_id, agent_id)
      );

      -- 8. Bảng activity_logs
      CREATE TABLE IF NOT EXISTS activity_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        category TEXT NOT NULL,
        severity TEXT NOT NULL,
        title TEXT NOT NULL,
        detail TEXT NOT NULL,
        agent_id TEXT,
        provider_id TEXT,
        account_id TEXT,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE SET NULL,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL
      );

      -- 9. Bảng pricing_records
      CREATE TABLE IF NOT EXISTS pricing_records (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        model_id TEXT NOT NULL,
        currency TEXT NOT NULL DEFAULT 'USD',
        input_price_per_million REAL NOT NULL DEFAULT 0,
        output_price_per_million REAL NOT NULL DEFAULT 0,
        cached_input_price_per_million REAL NOT NULL DEFAULT 0,
        reasoning_price_per_million REAL NOT NULL DEFAULT 0,
        pricing_source TEXT NOT NULL DEFAULT 'official-catalog',
        pricing_version TEXT NOT NULL DEFAULT '2026.10',
        effective_from TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE CASCADE,
        FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE CASCADE
      );

      -- 10. Bảng usage_records
      CREATE TABLE IF NOT EXISTS usage_records (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        agent_id TEXT,
        model_id TEXT,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        total_requests INTEGER NOT NULL DEFAULT 1,
        successful_requests INTEGER NOT NULL DEFAULT 1,
        failed_requests INTEGER NOT NULL DEFAULT 0,
        average_duration_ms REAL NOT NULL DEFAULT 0,
        input_cost_usd REAL NOT NULL DEFAULT 0,
        output_cost_usd REAL NOT NULL DEFAULT 0,
        cached_input_cost_usd REAL NOT NULL DEFAULT 0,
        estimated_total_cost_usd REAL NOT NULL DEFAULT 0,
        pricing_source TEXT NOT NULL DEFAULT 'unknown',
        pricing_version TEXT NOT NULL DEFAULT 'none',
        source TEXT NOT NULL,
        data_confidence TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE RESTRICT,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
        FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL
      );

      -- 11. Bảng quota_snapshots
      CREATE TABLE IF NOT EXISTS quota_snapshots (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL,
        account_id TEXT NOT NULL,
        agent_id TEXT,
        model_id TEXT,
        quota_period TEXT NOT NULL,
        usage_limit REAL,
        used_amount REAL,
        remaining_amount REAL,
        unit TEXT NOT NULL DEFAULT 'tokens',
        rate_limit_rpm INTEGER,
        rate_limit_tpm INTEGER,
        reset_at TEXT,
        quota_source TEXT NOT NULL,
        data_confidence TEXT NOT NULL,
        last_synced_at TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        FOREIGN KEY (provider_id) REFERENCES providers(id) ON DELETE RESTRICT,
        FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
        FOREIGN KEY (model_id) REFERENCES models(id) ON DELETE SET NULL
      );

      -- Các chỉ mục (Indexes) tối ưu truy vấn
      CREATE INDEX IF NOT EXISTS idx_models_provider ON models(provider_id);
      CREATE INDEX IF NOT EXISTS idx_accounts_provider ON accounts(provider_id);
      CREATE INDEX IF NOT EXISTS idx_agents_provider ON agents(provider_id);
      CREATE INDEX IF NOT EXISTS idx_agents_account ON agents(account_id);
      CREATE INDEX IF NOT EXISTS idx_agents_status ON agents(status);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_timestamp ON activity_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_provider_account_ts ON usage_records(provider_id, account_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_agent_ts ON usage_records(agent_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_usage_model_ts ON usage_records(model_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_quota_provider_account_ts ON quota_snapshots(provider_id, account_id, timestamp DESC);
    `,
  },
  {
    version: 2,
    name: '002_seed_builtin_providers_models_and_permission_profiles',
    upSql: `
      INSERT OR IGNORE INTO providers (
        id, display_name, vendor, adapter_version, adapter_status,
        auth_methods_json, session_model,
        supports_model_selection, supports_reasoning_level, supports_streaming,
        supports_usage_metrics, supports_quota_metrics, supports_local_workspace,
        requires_external_binary, is_builtin, is_enabled, notes, created_at, updated_at
      ) VALUES
      (
        'antigravity',
        'Google Antigravity',
        'Google DeepMind',
        '0.2.2',
        'metadata_only',
        '["ide-extension-session","cli-delegated-auth"]',
        'ide-companion',
        1, 1, 1,
        0, 0, 1,
        0, 1, 1,
        'AI trợ lý chính trong VS Code. Trong G2.2 mới đăng ký metadata & adapter contract; không công bố API quota trực tiếp.',
        '2026-10-31T00:00:00.000Z',
        '2026-10-31T00:00:00.000Z'
      ),
      (
        'openai-codex',
        'OpenAI Codex',
        'OpenAI',
        '0.2.2',
        'metadata_only',
        '["api-key-vault","cli-delegated-auth","oauth-pkce"]',
        'workspace-bound-process',
        1, 1, 1,
        1, 1, 1,
        1, 1, 1,
        'Hỗ trợ theo dõi token usage (input, output, cached, reasoning) và rate-limit/quota headers khi kết nối thực tế ở giai đoạn sau.',
        '2026-10-31T00:00:00.000Z',
        '2026-10-31T00:00:00.000Z'
      ),
      (
        'anthropic-claude',
        'Anthropic Claude',
        'Anthropic',
        '0.2.2',
        'metadata_only',
        '["api-key-vault","cli-delegated-auth","oauth-pkce"]',
        'persistent-thread',
        1, 1, 1,
        1, 1, 1,
        0, 1, 1,
        'Hỗ trợ theo dõi token usage, prompt caching và hạn mức sử dụng theo chu kỳ tài khoản khi kích hoạt runtime adapter.',
        '2026-10-31T00:00:00.000Z',
        '2026-10-31T00:00:00.000Z'
      );

      INSERT OR IGNORE INTO models (
        id, provider_id, model_key, display_name,
        context_window_tokens, max_output_tokens,
        supports_reasoning, supported_reasoning_levels_json, supports_caching,
        is_enabled, created_at, updated_at
      ) VALUES
      (
        'mdl-agy-gemini-pro',
        'antigravity',
        'gemini-pro-agent',
        'Antigravity Pro Model',
        1048576, 65536,
        1, '["low","medium","high"]', 1,
        1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'mdl-agy-gemini-flash',
        'antigravity',
        'gemini-flash-agent',
        'Antigravity Flash Model',
        1048576, 65536,
        1, '["low","medium","high"]', 1,
        1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'mdl-openai-codex-mini',
        'openai-codex',
        'codex-mini-latest',
        'OpenAI Codex Mini',
        200000, 100000,
        1, '["low","medium","high"]', 1,
        1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'mdl-openai-gpt-4.1',
        'openai-codex',
        'gpt-4.1',
        'OpenAI GPT-4.1',
        1047576, 32768,
        0, '[]', 1,
        1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'mdl-anthropic-claude-sonnet-4',
        'anthropic-claude',
        'claude-sonnet-4-20250514',
        'Claude Sonnet 4',
        200000, 64000,
        1, '["low","medium","high"]', 1,
        1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'mdl-anthropic-claude-opus-4',
        'anthropic-claude',
        'claude-opus-4-20250514',
        'Claude Opus 4',
        200000, 32000,
        1, '["low","medium","high"]', 1,
        1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'mdl-google-gemini-3.8-pro',
        'antigravity',
        'gemini-3.8-pro',
        'Gemini 3.8 Pro (Advanced Reasoning)',
        2097152, 65536,
        1, '["low","medium","high"]', 1,
        1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'mdl-google-gemini-3.8-flash',
        'antigravity',
        'gemini-3.8-flash',
        'Gemini 3.8 Flash (High-Speed & Multimodal)',
        1048576, 65536,
        1, '["low","medium"]', 1,
        1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'mdl-openai-codex-6',
        'openai-codex',
        'codex-6',
        'OpenAI Codex 6 (State-of-the-art)',
        1048576, 65536,
        1, '["low","medium","high"]', 1,
        1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'mdl-openai-codex-6-mini',
        'openai-codex',
        'codex-6-mini',
        'OpenAI Codex 6 Mini',
        524288, 32768,
        1, '["low","medium"]', 1,
        1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'mdl-anthropic-claude-5.5-sonnet',
        'anthropic-claude',
        'claude-5.5-sonnet',
        'Claude 5.5 Sonnet',
        1048576, 65536,
        1, '["low","medium","high"]', 1,
        1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'mdl-anthropic-claude-5.5-opus',
        'anthropic-claude',
        'claude-5.5-opus',
        'Claude 5.5 Opus',
        2097152, 65536,
        1, '["low","medium","high"]', 1,
        1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      );

      INSERT OR IGNORE INTO pricing_records (
        id, provider_id, model_id, currency,
        input_price_per_million, output_price_per_million,
        cached_input_price_per_million, reasoning_price_per_million,
        pricing_source, pricing_version, effective_from, created_at
      ) VALUES
      (
        'prc-openai-codex-mini',
        'openai-codex',
        'mdl-openai-codex-mini',
        'USD',
        1.50, 6.00, 0.375, 6.00,
        'official-catalog', '2026.10',
        '2026-10-01T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'prc-openai-gpt-4.1',
        'openai-codex',
        'mdl-openai-gpt-4.1',
        'USD',
        2.00, 8.00, 0.50, 0.00,
        'official-catalog', '2026.10',
        '2026-10-01T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'prc-claude-sonnet-4',
        'anthropic-claude',
        'mdl-anthropic-claude-sonnet-4',
        'USD',
        3.00, 15.00, 0.30, 15.00,
        'official-catalog', '2026.10',
        '2026-10-01T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'prc-claude-opus-4',
        'anthropic-claude',
        'mdl-anthropic-claude-opus-4',
        'USD',
        15.00, 75.00, 1.50, 75.00,
        'official-catalog', '2026.10',
        '2026-10-01T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      );

      INSERT OR IGNORE INTO agent_permissions (
        id, name, description, filesystem_scope,
        network_access, shell_execution, git_safety_mode,
        requires_owner_approval, created_at, updated_at
      ) VALUES
      (
        'perm-readonly',
        'Read-Only Inspector',
        'Chỉ được phép đọc tài liệu và mã nguồn trong Workspace; cấm ghi file và cấm chạy lệnh shell.',
        'workspace-read',
        0, 'denied', 'strict-owner-approval', 1,
        '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'perm-standard',
        'Standard Supervised Developer',
        'Được phép đọc/ghi trong Workspace dưới sự giám sát; mọi thao tác shell hoặc thay đổi lớn cần Owner phê duyệt.',
        'workspace-read-write',
        0, 'approval-required', 'strict-owner-approval', 1,
        '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'perm-restricted',
        'Strict Isolated Sandbox',
        'Cô lập hoàn toàn, chỉ xử lý văn bản/suy luận, không truy cập filesystem hay mạng.',
        'none',
        0, 'denied', 'strict-owner-approval', 1,
        '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      ),
      (
        'perm-full-access',
        'Full Access Developer (Codex Mode)',
        'Toàn quyền tự chủ tương tự Codex Full Access: Tự động chạy lệnh shell, đọc ghi tệp và biên dịch trong Workspace không cần phê duyệt từng bước.',
        'workspace-read-write',
        1, 'allowed', 'strict-owner-approval', 0,
        '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'
      );
    `,
  },
  {
    version: 3,
    name: '003_permission_engine_and_approval_system',
    upSql: `
      -- Nâng cấp tương thích bảng agent_permissions hiện có
      ALTER TABLE agent_permissions ADD COLUMN is_builtin INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE agent_permissions ADD COLUMN parent_profile_id TEXT REFERENCES agent_permissions(id) ON DELETE SET NULL;

      UPDATE agent_permissions SET is_builtin = 1 WHERE id IN ('perm-readonly', 'perm-standard', 'perm-restricted', 'perm-full-access');

      -- 12. Bảng permission_rules (Tri-state: allowed | denied | requires_approval)
      CREATE TABLE IF NOT EXISTS permission_rules (
        id TEXT PRIMARY KEY,
        profile_id TEXT,
        agent_id TEXT,
        category TEXT NOT NULL,
        permission_key TEXT NOT NULL,
        tri_state TEXT NOT NULL CHECK (tri_state IN ('allowed', 'denied', 'requires_approval')),
        source TEXT NOT NULL CHECK (source IN ('system_default', 'profile_inherited', 'agent_custom_override')),
        notes TEXT NOT NULL DEFAULT '',
        updated_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES agent_permissions(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_perm_rules_profile_key
        ON permission_rules(profile_id, permission_key)
        WHERE profile_id IS NOT NULL AND agent_id IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_perm_rules_agent_key
        ON permission_rules(agent_id, permission_key)
        WHERE agent_id IS NOT NULL;

      -- 13. Bảng permission_path_rules (Quyền giới hạn theo đường dẫn/thư mục)
      CREATE TABLE IF NOT EXISTS permission_path_rules (
        id TEXT PRIMARY KEY,
        profile_id TEXT,
        agent_id TEXT,
        path_pattern TEXT NOT NULL,
        rule_type TEXT NOT NULL CHECK (rule_type IN ('allowed', 'denied', 'requires_approval')),
        access_scope TEXT NOT NULL CHECK (access_scope IN ('read', 'write', 'delete', 'all')),
        is_outside_workspace INTEGER NOT NULL DEFAULT 0,
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES agent_permissions(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_path_rules_profile ON permission_path_rules(profile_id);
      CREATE INDEX IF NOT EXISTS idx_path_rules_agent ON permission_path_rules(agent_id);

      -- 14. Bảng permission_command_rules (Allowlist/Denylist lệnh thực thi có cấu trúc)
      CREATE TABLE IF NOT EXISTS permission_command_rules (
        id TEXT PRIMARY KEY,
        profile_id TEXT,
        agent_id TEXT,
        executable_name TEXT NOT NULL,
        args_pattern TEXT NOT NULL DEFAULT '*',
        allowed_working_dir TEXT,
        rule_type TEXT NOT NULL CHECK (rule_type IN ('allowed', 'denied', 'requires_approval')),
        risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES agent_permissions(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_cmd_rules_profile ON permission_command_rules(profile_id);
      CREATE INDEX IF NOT EXISTS idx_cmd_rules_agent ON permission_command_rules(agent_id);

      -- 15. Bảng permission_domain_rules (Allowlist/Denylist tên miền mạng)
      CREATE TABLE IF NOT EXISTS permission_domain_rules (
        id TEXT PRIMARY KEY,
        profile_id TEXT,
        agent_id TEXT,
        domain_pattern TEXT NOT NULL,
        protocol TEXT NOT NULL DEFAULT 'https',
        rule_type TEXT NOT NULL CHECK (rule_type IN ('allowed', 'denied', 'requires_approval')),
        description TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES agent_permissions(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_domain_rules_profile ON permission_domain_rules(profile_id);
      CREATE INDEX IF NOT EXISTS idx_domain_rules_agent ON permission_domain_rules(agent_id);

      -- 16. Bảng application_permissions (Quyền tương tác ứng dụng ngoài)
      CREATE TABLE IF NOT EXISTS application_permissions (
        id TEXT PRIMARY KEY,
        profile_id TEXT,
        agent_id TEXT,
        app_key TEXT NOT NULL,
        display_name TEXT NOT NULL,
        executable_hint TEXT NOT NULL DEFAULT '',
        can_launch TEXT NOT NULL DEFAULT 'denied' CHECK (can_launch IN ('allowed', 'denied', 'requires_approval')),
        can_interact TEXT NOT NULL DEFAULT 'denied' CHECK (can_interact IN ('allowed', 'denied', 'requires_approval')),
        can_control_ui TEXT NOT NULL DEFAULT 'denied' CHECK (can_control_ui IN ('allowed', 'denied', 'requires_approval')),
        adapter_integrated INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (profile_id) REFERENCES agent_permissions(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE UNIQUE INDEX IF NOT EXISTS idx_app_perm_profile_key
        ON application_permissions(profile_id, app_key)
        WHERE profile_id IS NOT NULL AND agent_id IS NULL;

      CREATE UNIQUE INDEX IF NOT EXISTS idx_app_perm_agent_key
        ON application_permissions(agent_id, app_key)
        WHERE agent_id IS NOT NULL;

      -- 17. Bảng approval_requests (Yêu cầu phê duyệt có thời hạn & chống replay)
      CREATE TABLE IF NOT EXISTS approval_requests (
        id TEXT PRIMARY KEY,
        agent_id TEXT NOT NULL,
        task_id TEXT,
        permission_type TEXT NOT NULL,
        permission_key TEXT NOT NULL,
        requested_action TEXT NOT NULL,
        target_resource TEXT NOT NULL,
        operation_summary TEXT NOT NULL,
        working_directory TEXT,
        bound_parameters_json TEXT NOT NULL DEFAULT '{}',
        action_fingerprint TEXT NOT NULL,
        risk_level TEXT NOT NULL CHECK (risk_level IN ('low', 'medium', 'high', 'critical')),
        reason TEXT NOT NULL,
        created_at TEXT NOT NULL,
        expires_at TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN ('pending', 'approved', 'rejected', 'expired', 'cancelled')),
        reviewed_by TEXT,
        reviewed_at TEXT,
        decision_reason TEXT,
        consumed_at TEXT,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_approvals_status_created ON approval_requests(status, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_approvals_agent ON approval_requests(agent_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_approvals_fingerprint ON approval_requests(action_fingerprint);

      -- 18. Bảng approval_decisions (Lịch sử quyết định của Owner)
      CREATE TABLE IF NOT EXISTS approval_decisions (
        id TEXT PRIMARY KEY,
        approval_request_id TEXT NOT NULL,
        decision TEXT NOT NULL CHECK (decision IN ('approved', 'rejected', 'cancelled', 'expired')),
        reviewed_by TEXT NOT NULL,
        decision_reason TEXT NOT NULL,
        action_fingerprint_snapshot TEXT NOT NULL,
        decided_at TEXT NOT NULL,
        FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_approval_decisions_req ON approval_decisions(approval_request_id);

      -- 19. Bảng permission_audit_logs (Nhật ký kiểm toán quyền hạn bất biến với Agent)
      CREATE TABLE IF NOT EXISTS permission_audit_logs (
        id TEXT PRIMARY KEY,
        timestamp TEXT NOT NULL,
        event_type TEXT NOT NULL,
        agent_id TEXT,
        task_id TEXT,
        profile_id TEXT,
        permission_category TEXT NOT NULL,
        permission_key TEXT NOT NULL,
        target_resource TEXT NOT NULL,
        operation_summary TEXT NOT NULL,
        decision_result TEXT NOT NULL,
        actor_source TEXT NOT NULL,
        reason TEXT NOT NULL,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE SET NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE SET NULL,
        FOREIGN KEY (profile_id) REFERENCES agent_permissions(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_perm_audit_ts ON permission_audit_logs(timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_perm_audit_agent ON permission_audit_logs(agent_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_perm_audit_event ON permission_audit_logs(event_type, timestamp DESC);
    `,
  },
  {
    version: 4,
    name: '004_task_orchestration_pipeline',
    upSql: `
      -- 1. Mở rộng bảng tasks hiện có (Không tạo cột trùng lặp với id, title, description, status, priority, workspace_path, created_at, updated_at)
      ALTER TABLE tasks ADD COLUMN task_type TEXT NOT NULL DEFAULT 'general';
      ALTER TABLE tasks ADD COLUMN allow_multi_agent INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE tasks ADD COLUMN started_at TEXT;
      ALTER TABLE tasks ADD COLUMN completed_at TEXT;
      ALTER TABLE tasks ADD COLUMN cancelled_at TEXT;
      ALTER TABLE tasks ADD COLUMN created_by TEXT NOT NULL DEFAULT 'Owner';
      ALTER TABLE tasks ADD COLUMN blocked_reason TEXT;
      ALTER TABLE tasks ADD COLUMN runtime_readiness TEXT NOT NULL DEFAULT 'runtime_unavailable';
      ALTER TABLE tasks ADD COLUMN metadata_json TEXT NOT NULL DEFAULT '{}';

      -- Chuẩn hóa giá trị mặc định cũ (nếu có) sang State Machine G2.4
      UPDATE tasks SET status = 'draft' WHERE status = 'backlog';
      UPDATE tasks SET priority = 'normal' WHERE priority = 'medium';

      CREATE INDEX IF NOT EXISTS idx_tasks_status_priority ON tasks(status, priority, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_tasks_updated ON tasks(updated_at DESC);

      -- 2. Mở rộng bảng task_assignments hiện có để hỗ trợ Multi-Agent Roles, Execution Order & Lịch sử không xóa
      ALTER TABLE task_assignments ADD COLUMN role TEXT NOT NULL DEFAULT 'primary';
      ALTER TABLE task_assignments ADD COLUMN started_at TEXT;
      ALTER TABLE task_assignments ADD COLUMN revoked_at TEXT;
      ALTER TABLE task_assignments ADD COLUMN failure_reason TEXT;
      ALTER TABLE task_assignments ADD COLUMN execution_order INTEGER NOT NULL DEFAULT 1;
      ALTER TABLE task_assignments ADD COLUMN assigned_by TEXT NOT NULL DEFAULT 'Owner';
      ALTER TABLE task_assignments ADD COLUMN compatibility_status TEXT NOT NULL DEFAULT 'compatible_runtime_standby';
      ALTER TABLE task_assignments ADD COLUMN compatibility_notes TEXT NOT NULL DEFAULT '';
      ALTER TABLE task_assignments ADD COLUMN is_active INTEGER NOT NULL DEFAULT 1;

      CREATE INDEX IF NOT EXISTS idx_task_assignments_task ON task_assignments(task_id, execution_order ASC);
      CREATE INDEX IF NOT EXISTS idx_task_assignments_agent ON task_assignments(agent_id, assignment_status);

      -- 3. Mở rộng bảng activity_logs hiện có để hỗ trợ đầy đủ G2.4 Activity Logs & Phân trang
      ALTER TABLE activity_logs ADD COLUMN event_type TEXT NOT NULL DEFAULT 'studio.system';
      ALTER TABLE activity_logs ADD COLUMN task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL;
      ALTER TABLE activity_logs ADD COLUMN assignment_id TEXT REFERENCES task_assignments(id) ON DELETE SET NULL;
      ALTER TABLE activity_logs ADD COLUMN source TEXT NOT NULL DEFAULT 'studio';
      ALTER TABLE activity_logs ADD COLUMN structured_metadata_json TEXT NOT NULL DEFAULT '{}';

      CREATE INDEX IF NOT EXISTS idx_activity_logs_task ON activity_logs(task_id, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_event_type ON activity_logs(event_type, timestamp DESC);
      CREATE INDEX IF NOT EXISTS idx_activity_logs_source ON activity_logs(source, timestamp DESC);

      -- 4. Bảng task_dependencies (Biểu diễn DAG & quan hệ phụ thuộc giữa các Task)
      CREATE TABLE IF NOT EXISTS task_dependencies (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        depends_on_task_id TEXT NOT NULL,
        dependency_type TEXT NOT NULL DEFAULT 'mandatory' CHECK (dependency_type IN ('mandatory', 'optional')),
        execution_order INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (depends_on_task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        UNIQUE(task_id, depends_on_task_id),
        CHECK (task_id <> depends_on_task_id)
      );

      CREATE INDEX IF NOT EXISTS idx_task_deps_task ON task_dependencies(task_id);
      CREATE INDEX IF NOT EXISTS idx_task_deps_depends_on ON task_dependencies(depends_on_task_id);

      -- 5. Bảng task_state_transitions (Lịch sử chuyển trạng thái State Machine của Task)
      CREATE TABLE IF NOT EXISTS task_state_transitions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        from_status TEXT NOT NULL,
        to_status TEXT NOT NULL,
        trigger_source TEXT NOT NULL CHECK (trigger_source IN ('owner', 'orchestrator', 'permission_engine', 'runtime_event')),
        actor TEXT NOT NULL DEFAULT 'Owner',
        reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_task_transitions_task ON task_state_transitions(task_id, created_at DESC);

      -- 6. Bảng task_assignment_events (Lịch sử phân công/thu hồi Agent bất biến)
      CREATE TABLE IF NOT EXISTS task_assignment_events (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        assignment_id TEXT NOT NULL,
        agent_id TEXT NOT NULL,
        event_type TEXT NOT NULL CHECK (event_type IN ('assigned', 'revoked', 'reassigned', 'role_updated', 'status_changed', 'preflight_checked')),
        role TEXT NOT NULL,
        previous_status TEXT,
        new_status TEXT NOT NULL,
        actor TEXT NOT NULL DEFAULT 'Owner',
        reason TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (assignment_id) REFERENCES task_assignments(id) ON DELETE CASCADE,
        FOREIGN KEY (agent_id) REFERENCES agents(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_task_assign_events_task ON task_assignment_events(task_id, created_at DESC);

      -- 7. Bảng task_execution_steps (Kế hoạch các bước thực thi & trạng thái Permission Preflight)
      CREATE TABLE IF NOT EXISTS task_execution_steps (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        assignment_id TEXT,
        step_order INTEGER NOT NULL DEFAULT 1,
        step_key TEXT NOT NULL,
        title TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        required_permission_category TEXT NOT NULL,
        required_permission_key TEXT NOT NULL,
        target_resource TEXT NOT NULL,
        command_executable TEXT,
        command_args_json TEXT NOT NULL DEFAULT '[]',
        working_directory TEXT,
        preflight_status TEXT NOT NULL DEFAULT 'not_checked' CHECK (preflight_status IN ('not_checked', 'allowed', 'requires_approval', 'denied', 'approved_ready')),
        approval_request_id TEXT,
        execution_status TEXT NOT NULL DEFAULT 'pending_runtime' CHECK (execution_status IN ('pending_runtime', 'blocked_permission', 'waiting_approval', 'ready_for_runtime', 'running', 'completed', 'failed', 'skipped')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (assignment_id) REFERENCES task_assignments(id) ON DELETE SET NULL,
        FOREIGN KEY (approval_request_id) REFERENCES approval_requests(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_task_exec_steps_task ON task_execution_steps(task_id, step_order ASC);

      -- 8. Bảng task_artifacts (Lưu trữ Output thực tế từ Runtime: text, code, file, report, error)
      CREATE TABLE IF NOT EXISTS task_artifacts (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        assignment_id TEXT,
        artifact_type TEXT NOT NULL CHECK (artifact_type IN ('text_output', 'code_output', 'file_artifact', 'report', 'error_report')),
        title TEXT NOT NULL,
        content_text TEXT NOT NULL DEFAULT '',
        file_path TEXT,
        mime_type TEXT NOT NULL DEFAULT 'text/plain',
        source_runtime TEXT NOT NULL,
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE,
        FOREIGN KEY (assignment_id) REFERENCES task_assignments(id) ON DELETE SET NULL
      );

      CREATE INDEX IF NOT EXISTS idx_task_artifacts_task ON task_artifacts(task_id, created_at DESC);

      -- 9. Bảng orchestration_runs (Bản ghi từng lần chạy 10-step Execution Pipeline của TaskOrchestrator)
      CREATE TABLE IF NOT EXISTS orchestration_runs (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL,
        pipeline_stage TEXT NOT NULL,
        overall_status TEXT NOT NULL,
        runtime_status TEXT NOT NULL DEFAULT 'runtime_unavailable',
        steps_report_json TEXT NOT NULL DEFAULT '[]',
        triggered_by TEXT NOT NULL DEFAULT 'Owner',
        created_at TEXT NOT NULL,
        FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
      );

      CREATE INDEX IF NOT EXISTS idx_orch_runs_task ON orchestration_runs(task_id, created_at DESC);
    `,
  },
  {
    version: 5,
    name: '005_project_workspace_manager',
    upSql: `
      -- 1. Bảng projects (Project Registry hỗ trợ Unity 2D/3D, Godot, Generic...)
      CREATE TABLE IF NOT EXISTS projects (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        description TEXT NOT NULL DEFAULT '',
        project_type TEXT NOT NULL CHECK (project_type IN ('unity_2d', 'unity_3d', 'godot_2d', 'godot_3d', 'generic', 'other')),
        project_path TEXT NOT NULL UNIQUE,
        workspace_id TEXT,
        engine_name TEXT,
        engine_version TEXT,
        detected_dimension TEXT NOT NULL DEFAULT 'not_detected' CHECK (detected_dimension IN ('2d', '3d', 'mixed', 'unknown', 'not_detected')),
        unity_meta_policy TEXT NOT NULL DEFAULT 'strict_meta_protection' CHECK (unity_meta_policy IN ('inspect_only', 'allow_asset_changes', 'require_approval_for_meta_changes', 'strict_meta_protection')),
        project_status TEXT NOT NULL DEFAULT 'valid' CHECK (project_status IN ('valid', 'invalid_structure', 'missing_directory', 'unscanned', 'archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_scanned_at TEXT,
        metadata_json TEXT NOT NULL DEFAULT '{}'
      );

      CREATE INDEX IF NOT EXISTS idx_projects_status ON projects(project_status, updated_at DESC);
      CREATE INDEX IF NOT EXISTS idx_projects_type ON projects(project_type);

      -- 2. Bảng workspaces (Workspace Manager & Isolation)
      CREATE TABLE IF NOT EXISTS workspaces (
        id TEXT PRIMARY KEY,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        name TEXT NOT NULL DEFAULT '',
        workspace_path TEXT NOT NULL UNIQUE,
        workspace_type TEXT NOT NULL DEFAULT 'project_workspace' CHECK (workspace_type IN ('studio_root', 'project_workspace', 'sandbox_workspace', 'read_only_workspace')),
        isolation_level TEXT NOT NULL DEFAULT 'strict_workspace_bound' CHECK (isolation_level IN ('strict_workspace_bound', 'subdirectory_scoped', 'read_only_enforced')),
        permitted_subdirectories_json TEXT NOT NULL DEFAULT '[]',
        read_only_mode INTEGER NOT NULL DEFAULT 0,
        unity_meta_policy TEXT NOT NULL DEFAULT 'strict_meta_protection' CHECK (unity_meta_policy IN ('inspect_only', 'allow_asset_changes', 'require_approval_for_meta_changes', 'strict_meta_protection')),
        status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'read_only', 'missing_directory', 'invalid_path', 'archived')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        last_verified_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_workspaces_project ON workspaces(project_id);
      CREATE INDEX IF NOT EXISTS idx_workspaces_status ON workspaces(status);

      -- 3. Bảng workspace_agent_access (Phân quyền Agent truy cập từng Workspace - Không mặc định cấp quyền toàn cục)
      CREATE TABLE IF NOT EXISTS workspace_agent_access (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        access_mode TEXT NOT NULL DEFAULT 'read_write' CHECK (access_mode IN ('read_only', 'read_write', 'subdirectory_scoped', 'revoked')),
        allowed_subpaths_json TEXT NOT NULL DEFAULT '[]',
        granted_by TEXT NOT NULL DEFAULT 'Owner',
        granted_at TEXT NOT NULL,
        revoked_at TEXT,
        UNIQUE(workspace_id, agent_id)
      );

      CREATE INDEX IF NOT EXISTS idx_ws_agent_access_ws ON workspace_agent_access(workspace_id, access_mode);
      CREATE INDEX IF NOT EXISTS idx_ws_agent_access_agent ON workspace_agent_access(agent_id, access_mode);

      -- 4. Bảng workspace_snapshots (Sao lưu & Phục hồi Workspace có Manifest và Checksum SHA-256)
      CREATE TABLE IF NOT EXISTS workspace_snapshots (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        snapshot_type TEXT NOT NULL CHECK (snapshot_type IN ('manual', 'pre_change', 'before_agent_execution', 'baseline_meta')),
        label TEXT NOT NULL DEFAULT '',
        description TEXT NOT NULL DEFAULT '',
        archive_path TEXT NOT NULL,
        manifest_path TEXT NOT NULL,
        file_count INTEGER NOT NULL DEFAULT 0,
        total_bytes INTEGER NOT NULL DEFAULT 0,
        meta_file_count INTEGER NOT NULL DEFAULT 0,
        excluded_patterns_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'completed' CHECK (status IN ('completed', 'partial_warnings', 'failed', 'restored')),
        created_by TEXT NOT NULL DEFAULT 'Owner',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ws_snapshots_ws ON workspace_snapshots(workspace_id, created_at DESC);

      -- 5. Bảng workspace_snapshot_files (Chi tiết từng file trong Snapshot phục vụ Compare & Restore chọn lọc)
      CREATE TABLE IF NOT EXISTS workspace_snapshot_files (
        id TEXT PRIMARY KEY,
        snapshot_id TEXT NOT NULL REFERENCES workspace_snapshots(id) ON DELETE CASCADE,
        relative_path TEXT NOT NULL,
        file_size INTEGER NOT NULL DEFAULT 0,
        sha256_hash TEXT NOT NULL,
        modified_time TEXT NOT NULL,
        is_meta_file INTEGER NOT NULL DEFAULT 0,
        unity_guid TEXT,
        UNIQUE(snapshot_id, relative_path)
      );

      CREATE INDEX IF NOT EXISTS idx_ws_snap_files_snap ON workspace_snapshot_files(snapshot_id);

      -- 6. Bảng workspace_integrity_scans (Lịch sử kiểm tra cấu trúc Unity & toàn vẹn .meta)
      CREATE TABLE IF NOT EXISTS workspace_integrity_scans (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        project_id TEXT REFERENCES projects(id) ON DELETE SET NULL,
        scan_type TEXT NOT NULL CHECK (scan_type IN ('unity_structure', 'unity_meta_guard', 'before_after_diff', 'full_workspace')),
        overall_status TEXT NOT NULL CHECK (overall_status IN ('healthy', 'warnings_detected', 'critical_violations', 'not_applicable')),
        total_assets_checked INTEGER NOT NULL DEFAULT 0,
        total_meta_checked INTEGER NOT NULL DEFAULT 0,
        missing_meta_count INTEGER NOT NULL DEFAULT 0,
        orphan_meta_count INTEGER NOT NULL DEFAULT 0,
        invalid_guid_count INTEGER NOT NULL DEFAULT 0,
        duplicate_guid_count INTEGER NOT NULL DEFAULT 0,
        summary_json TEXT NOT NULL DEFAULT '{}',
        scanned_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ws_integrity_scans_ws ON workspace_integrity_scans(workspace_id, scanned_at DESC);

      -- 7. Bảng workspace_integrity_issues (Chi tiết từng lỗi Missing .meta, Orphan .meta, GUID Conflict...)
      CREATE TABLE IF NOT EXISTS workspace_integrity_issues (
        id TEXT PRIMARY KEY,
        scan_id TEXT NOT NULL REFERENCES workspace_integrity_scans(id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        issue_type TEXT NOT NULL CHECK (issue_type IN ('missing_meta', 'orphan_meta', 'invalid_guid', 'empty_guid', 'duplicate_guid', 'invalid_yaml_structure', 'guid_mutated')),
        severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'error', 'critical')),
        relative_asset_path TEXT NOT NULL,
        relative_meta_path TEXT,
        detected_guid TEXT,
        conflicting_path TEXT,
        detail TEXT NOT NULL,
        recommendation TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ws_integrity_issues_scan ON workspace_integrity_issues(scan_id, severity);
      CREATE INDEX IF NOT EXISTS idx_ws_integrity_issues_ws ON workspace_integrity_issues(workspace_id, created_at DESC);

      -- 8. Bảng workspace_file_events (Sự kiện thay đổi file từ WorkspaceFileMonitor)
      CREATE TABLE IF NOT EXISTS workspace_file_events (
        id TEXT PRIMARY KEY,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        event_type TEXT NOT NULL CHECK (event_type IN ('file_created', 'file_modified', 'file_deleted', 'file_renamed', 'directory_created', 'directory_deleted', 'meta_file_changed')),
        relative_path TEXT NOT NULL,
        old_relative_path TEXT,
        actor_source TEXT NOT NULL DEFAULT 'external_or_unattributed' CHECK (actor_source IN ('owner', 'studio', 'agent', 'external_or_unattributed')),
        agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        is_meta_file INTEGER NOT NULL DEFAULT 0,
        detail TEXT NOT NULL DEFAULT '',
        detected_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_ws_file_events_ws ON workspace_file_events(workspace_id, detected_at DESC);

      -- 9. Mở rộng bảng tasks để liên kết chặt chẽ Task – Project – Workspace – Baseline Snapshot (Section 9)
      ALTER TABLE tasks ADD COLUMN project_id TEXT REFERENCES projects(id) ON DELETE SET NULL;
      ALTER TABLE tasks ADD COLUMN workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL;
      ALTER TABLE tasks ADD COLUMN baseline_snapshot_id TEXT REFERENCES workspace_snapshots(id) ON DELETE SET NULL;
      ALTER TABLE tasks ADD COLUMN workspace_validation_status TEXT NOT NULL DEFAULT 'not_checked';

      CREATE INDEX IF NOT EXISTS idx_tasks_project ON tasks(project_id);
      CREATE INDEX IF NOT EXISTS idx_tasks_workspace ON tasks(workspace_id);

      -- 10. Khởi tạo Project gốc và Workspace gốc cho Personal AI Studio
      INSERT OR IGNORE INTO projects (
        id, name, description, project_type, project_path, workspace_id,
        engine_name, engine_version, detected_dimension, unity_meta_policy,
        project_status, created_at, updated_at, last_scanned_at, metadata_json
      ) VALUES (
        'proj-ai-studio-core',
        'Personal AI Studio Core',
        'Dự án nền tảng Desktop Application quản lý đa AI Agent & Unity 2D Projects của Owner',
        'generic',
        'C:\\AI-Studio',
        'ws-studio-root',
        'Electron + Node.js',
        'v24',
        'not_detected',
        'strict_meta_protection',
        'valid',
        '2026-10-31T00:00:00.000Z',
        '2026-10-31T00:00:00.000Z',
        '2026-10-31T00:00:00.000Z',
        '{}'
      );

      INSERT OR IGNORE INTO workspaces (
        id, project_id, name, workspace_path, workspace_type,
        isolation_level, permitted_subdirectories_json, read_only_mode,
        unity_meta_policy, status, created_at, updated_at, last_verified_at
      ) VALUES (
        'ws-studio-root',
        'proj-ai-studio-core',
        'Personal AI Studio Root Workspace',
        'C:\\AI-Studio',
        'studio_root',
        'strict_workspace_bound',
        '["src","docs","scripts","projects"]',
        0,
        'strict_meta_protection',
        'active',
        '2026-10-31T00:00:00.000Z',
        '2026-10-31T00:00:00.000Z',
        '2026-10-31T00:00:00.000Z'
      );
    `,
  },
  {
    version: 6,
    name: '006_runtime_core_and_provider_adapters',
    upSql: `
      -- 1. Bảng runtime_sessions: Quản lý vòng đời phiên thực thi tiến trình Agent
      CREATE TABLE IF NOT EXISTS runtime_sessions (
        id TEXT PRIMARY KEY,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        assignment_id TEXT REFERENCES task_assignments(id) ON DELETE SET NULL,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
        account_id TEXT REFERENCES accounts(id) ON DELETE SET NULL,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
        baseline_snapshot_id TEXT REFERENCES workspace_snapshots(id) ON DELETE SET NULL,
        status TEXT NOT NULL DEFAULT 'initializing' CHECK (status IN ('unavailable', 'initializing', 'ready', 'starting', 'running', 'waiting_approval', 'paused', 'cancelling', 'completed', 'failed', 'cancelled', 'timeout', 'crashed')),
        pid INTEGER,
        process_executable TEXT,
        working_directory TEXT NOT NULL,
        isolation_mode TEXT NOT NULL DEFAULT 'restricted' CHECK (isolation_mode IN ('restricted', 'staging_workspace', 'full_workspace', 'manual_external')),
        staging_directory TEXT,
        started_at TEXT,
        ended_at TEXT,
        exit_code INTEGER,
        exit_signal TEXT,
        error_message TEXT,
        bytes_read INTEGER NOT NULL DEFAULT 0,
        bytes_written INTEGER NOT NULL DEFAULT 0,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_runtime_sessions_task ON runtime_sessions(task_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_runtime_sessions_agent ON runtime_sessions(agent_id, status);
      CREATE INDEX IF NOT EXISTS idx_runtime_sessions_status ON runtime_sessions(status);

      -- 2. Bảng runtime_events: Lưu trữ sự kiện thực thi có chữ ký/xác thực nguồn gốc
      CREATE TABLE IF NOT EXISTS runtime_events (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES runtime_sessions(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        sequence_number INTEGER NOT NULL DEFAULT 1,
        event_type TEXT NOT NULL CHECK (event_type IN ('runtime_initialized', 'runtime_started', 'runtime_output', 'runtime_tool_started', 'runtime_tool_completed', 'runtime_file_read', 'runtime_file_created', 'runtime_file_modified', 'runtime_file_deleted', 'runtime_approval_required', 'runtime_usage_reported', 'runtime_completed', 'runtime_failed', 'runtime_cancelled', 'runtime_crashed')),
        source_type TEXT NOT NULL DEFAULT 'runtime_adapter' CHECK (source_type IN ('runtime_adapter', 'process_runner', 'file_monitor', 'studio_service', 'external_unverified')),
        signature TEXT,
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_runtime_events_session_seq ON runtime_events(session_id, sequence_number ASC);
      CREATE INDEX IF NOT EXISTS idx_runtime_events_task ON runtime_events(task_id, created_at DESC);

      -- 3. Bảng runtime_execution_locks: Khóa tránh xung đột khi 2 Agent cùng can thiệp 1 Workspace/File
      CREATE TABLE IF NOT EXISTS runtime_execution_locks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES runtime_sessions(id) ON DELETE CASCADE,
        workspace_id TEXT NOT NULL REFERENCES workspaces(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        lock_type TEXT NOT NULL CHECK (lock_type IN ('workspace_exclusive', 'subdirectory_exclusive', 'file_exclusive')),
        resource_path TEXT NOT NULL,
        acquired_at TEXT NOT NULL,
        released_at TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_runtime_locks_ws ON runtime_execution_locks(workspace_id, released_at);
      CREATE INDEX IF NOT EXISTS idx_runtime_locks_res ON runtime_execution_locks(resource_path, released_at);

      -- 4. Bảng runtime_provider_capabilities: Lưu kết quả phát hiện năng lực thực tế của từng Provider
      CREATE TABLE IF NOT EXISTS runtime_provider_capabilities (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        runtime_type TEXT NOT NULL,
        cli_path TEXT,
        cli_version TEXT,
        availability_status TEXT NOT NULL CHECK (availability_status IN ('installed', 'not_installed', 'authentication_required', 'unsupported', 'manual_only')),
        capabilities_json TEXT NOT NULL DEFAULT '{}',
        notes TEXT NOT NULL DEFAULT '',
        checked_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_runtime_prov_caps_p ON runtime_provider_capabilities(provider_id);
    `,
  },
  {
    version: 7,
    name: '007_telemetry_stream_and_event_provenance',
    upSql: `
      -- G2.7: Mở rộng runtime_events thành bảng telemetry duy nhất (KHÔNG tạo bảng trùng chức năng).
      -- SQLite không cho sửa CHECK constraint tại chỗ nên rebuild bảng và SAO CHÉP toàn bộ dữ liệu v6.
      -- runtime_events không có bảng nào tham chiếu tới nó (không cascade khi DROP).
      CREATE TABLE runtime_events_v7 (
        id TEXT PRIMARY KEY,
        stream_seq INTEGER NOT NULL DEFAULT 0,
        session_id TEXT REFERENCES runtime_sessions(id) ON DELETE CASCADE,
        task_id TEXT REFERENCES tasks(id) ON DELETE SET NULL,
        agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
        provider_id TEXT REFERENCES providers(id) ON DELETE SET NULL,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
        sequence_number INTEGER NOT NULL DEFAULT 0,
        event_type TEXT NOT NULL,
        source_type TEXT NOT NULL,
        provenance TEXT NOT NULL CHECK (provenance IN ('provider_reported', 'runtime_observed', 'studio_recorded', 'filesystem_observed', 'external_unattributed', 'test_mock')),
        confidence TEXT NOT NULL CHECK (confidence IN ('high', 'medium', 'low', 'unverified', 'test_only')),
        signature TEXT,
        signature_status TEXT NOT NULL CHECK (signature_status IN ('internal_verified', 'internal_unsigned', 'invalid', 'key_unavailable', 'not_applicable')),
        priority TEXT NOT NULL DEFAULT 'normal' CHECK (priority IN ('critical', 'normal', 'bulk')),
        payload_json TEXT NOT NULL DEFAULT '{}',
        created_at TEXT NOT NULL,
        received_at TEXT NOT NULL
      );

      INSERT INTO runtime_events_v7 (
        id, stream_seq, session_id, task_id, agent_id, provider_id, sequence_number,
        event_type, source_type, provenance, confidence, signature, signature_status,
        priority, payload_json, created_at, received_at
      )
      SELECT
        id,
        ROW_NUMBER() OVER (ORDER BY created_at ASC, rowid ASC),
        session_id, task_id, agent_id, provider_id, sequence_number,
        event_type, source_type,
        CASE source_type
          WHEN 'process_runner' THEN 'runtime_observed'
          WHEN 'runtime_adapter' THEN 'runtime_observed'
          WHEN 'file_monitor' THEN 'filesystem_observed'
          WHEN 'studio_service' THEN 'studio_recorded'
          ELSE 'external_unattributed'
        END,
        'unverified',
        signature,
        CASE WHEN signature IS NOT NULL AND signature <> '' THEN 'key_unavailable' ELSE 'internal_unsigned' END,
        CASE WHEN event_type = 'runtime_output' THEN 'bulk' ELSE 'critical' END,
        payload_json, created_at, created_at
      FROM runtime_events;

      DROP TABLE runtime_events;
      ALTER TABLE runtime_events_v7 RENAME TO runtime_events;

      CREATE UNIQUE INDEX IF NOT EXISTS uq_runtime_events_stream_seq ON runtime_events(stream_seq);
      CREATE UNIQUE INDEX IF NOT EXISTS uq_runtime_events_session_seq ON runtime_events(session_id, sequence_number)
        WHERE session_id IS NOT NULL AND sequence_number > 0;
      CREATE INDEX IF NOT EXISTS idx_runtime_events_session ON runtime_events(session_id, stream_seq);
      CREATE INDEX IF NOT EXISTS idx_runtime_events_agent ON runtime_events(agent_id, stream_seq);
      CREATE INDEX IF NOT EXISTS idx_runtime_events_task ON runtime_events(task_id, stream_seq);
      CREATE INDEX IF NOT EXISTS idx_runtime_events_provider ON runtime_events(provider_id, stream_seq);
      CREATE INDEX IF NOT EXISTS idx_runtime_events_workspace ON runtime_events(workspace_id, stream_seq);
      CREATE INDEX IF NOT EXISTS idx_runtime_events_type ON runtime_events(event_type, stream_seq);
      CREATE INDEX IF NOT EXISTS idx_runtime_events_prune ON runtime_events(priority, created_at);

      -- Bộ đếm luồng: received / persisted / dropped ... theo phạm vi 'global' hoặc từng session
      CREATE TABLE IF NOT EXISTS telemetry_stream_stats (
        scope_id TEXT PRIMARY KEY,
        events_received INTEGER NOT NULL DEFAULT 0,
        events_persisted INTEGER NOT NULL DEFAULT 0,
        events_dropped INTEGER NOT NULL DEFAULT 0,
        output_bytes_truncated INTEGER NOT NULL DEFAULT 0,
        duplicates_rejected INTEGER NOT NULL DEFAULT 0,
        sequence_gaps INTEGER NOT NULL DEFAULT 0,
        out_of_order INTEGER NOT NULL DEFAULT 0,
        invalid_signatures INTEGER NOT NULL DEFAULT 0,
        persistence_errors INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      -- Checkpoint con trỏ stream của từng consumer (ví dụ cửa sổ Renderer chính)
      CREATE TABLE IF NOT EXISTS telemetry_checkpoints (
        consumer_id TEXT PRIMARY KEY,
        last_stream_seq INTEGER NOT NULL DEFAULT 0,
        updated_at TEXT NOT NULL
      );

      -- Chính sách retention (cấu hình, không phải dữ liệu giả). Chỉ áp dụng cho priority 'bulk' và 'normal'.
      -- Event priority 'critical' (lifecycle, security, integrity, usage, approval) KHÔNG bao giờ bị tự động xóa.
      CREATE TABLE IF NOT EXISTS telemetry_retention_policy (
        id TEXT PRIMARY KEY CHECK (id = 'default'),
        bulk_max_rows INTEGER NOT NULL DEFAULT 20000,
        bulk_max_age_days INTEGER NOT NULL DEFAULT 7,
        normal_max_rows INTEGER NOT NULL DEFAULT 100000,
        normal_max_age_days INTEGER NOT NULL DEFAULT 30,
        updated_at TEXT NOT NULL
      );
      INSERT OR IGNORE INTO telemetry_retention_policy (id, updated_at)
        VALUES ('default', '2026-10-31T00:00:00.000Z');

      -- Quan sát tiến trình thực tế: định danh = session + pid + process_start_time (PID có thể bị tái sử dụng)
      ALTER TABLE runtime_sessions ADD COLUMN process_start_time TEXT;
      ALTER TABLE runtime_sessions ADD COLUMN parent_pid INTEGER;
      ALTER TABLE runtime_sessions ADD COLUMN last_event_at TEXT;
      ALTER TABLE runtime_sessions ADD COLUMN recovery_status TEXT;
    `,
  },
  {
    version: 8,
    name: '008_usage_quota_concurrency_and_account_integration',
    upSql: `
      -- 1. Bổ sung các cột vào usage_records cho G2.8
      ALTER TABLE usage_records ADD COLUMN session_id TEXT REFERENCES runtime_sessions(id) ON DELETE SET NULL;
      ALTER TABLE usage_records ADD COLUMN request_id TEXT;
      ALTER TABLE usage_records ADD COLUMN provenance TEXT NOT NULL DEFAULT 'provider_reported';
      ALTER TABLE usage_records ADD COLUMN metric_status TEXT NOT NULL DEFAULT 'reported';
      ALTER TABLE usage_records ADD COLUMN cost_status TEXT NOT NULL DEFAULT 'estimated';
      ALTER TABLE usage_records ADD COLUMN rate_limit_hits INTEGER NOT NULL DEFAULT 0;
      ALTER TABLE usage_records ADD COLUMN provider_latency_ms REAL;

      CREATE INDEX IF NOT EXISTS idx_usage_session ON usage_records(session_id);
      CREATE INDEX IF NOT EXISTS idx_usage_metric_status ON usage_records(metric_status);

      -- 2. Bảng rate_limit_events (Lưu chi tiết các sự kiện chạm giới hạn tốc độ thực tế từ Provider)
      CREATE TABLE IF NOT EXISTS rate_limit_events (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE RESTRICT,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        model_id TEXT REFERENCES models(id) ON DELETE SET NULL,
        session_id TEXT REFERENCES runtime_sessions(id) ON DELETE SET NULL,
        limit_type TEXT NOT NULL CHECK (limit_type IN ('rpm', 'tpm', 'rpd', 'concurrency', 'credits')),
        observed_value REAL,
        limit_value REAL,
        retry_after_seconds INTEGER,
        status_code INTEGER,
        error_message TEXT NOT NULL DEFAULT '',
        source TEXT NOT NULL,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_rle_provider_acc ON rate_limit_events(provider_id, account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_rle_session ON rate_limit_events(session_id);

      -- 3. Bảng concurrency_limits (Quản lý giới hạn đồng thời 3 cấp: Runtime, Provider, Account)
      CREATE TABLE IF NOT EXISTS concurrency_limits (
        id TEXT PRIMARY KEY,
        scope_type TEXT NOT NULL CHECK (scope_type IN ('runtime', 'provider', 'account')),
        scope_id TEXT NOT NULL,
        max_concurrency INTEGER NOT NULL CHECK (max_concurrency >= 1),
        source_type TEXT NOT NULL DEFAULT 'owner_configured' CHECK (source_type IN ('provider_reported', 'owner_configured')),
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(scope_type, scope_id)
      );

      -- Cấu hình mặc định nội bộ (owner_configured)
      INSERT OR IGNORE INTO concurrency_limits (id, scope_type, scope_id, max_concurrency, source_type, notes, created_at, updated_at) VALUES
        ('clim-runtime-global', 'runtime', 'global', 5, 'owner_configured', 'Giới hạn tổng tiến trình Runtime đồng thời trên toàn Studio', '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'),
        ('clim-provider-antigravity', 'provider', 'antigravity', 1, 'owner_configured', 'Antigravity chạy trong VS Code; giới hạn 1 phiên đồng thời', '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'),
        ('clim-provider-codex', 'provider', 'openai-codex', 2, 'owner_configured', 'OpenAI Codex CLI; mặc định cho phép tối đa 2 tác vụ chạy song song', '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'),
        ('clim-provider-claude', 'provider', 'anthropic-claude', 1, 'owner_configured', 'Anthropic Claude CLI/API; an toàn tối đa 1 phiên', '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z');

      -- 4. Bảng usage_alerts_config (Quy tắc cấu hình cảnh báo)
      CREATE TABLE IF NOT EXISTS usage_alerts_config (
        id TEXT PRIMARY KEY,
        name TEXT NOT NULL,
        provider_id TEXT REFERENCES providers(id) ON DELETE CASCADE,
        account_id TEXT REFERENCES accounts(id) ON DELETE CASCADE,
        metric_type TEXT NOT NULL CHECK (metric_type IN ('quota_percentage', 'token_threshold', 'cost_threshold', 'rate_limit_hit', 'concurrency_saturated', 'stale_data', 'auth_required')),
        threshold_value REAL NOT NULL,
        severity TEXT NOT NULL CHECK (severity IN ('info', 'warning', 'critical')),
        is_enabled INTEGER NOT NULL DEFAULT 1,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      -- Quy tắc cảnh báo mẫu
      INSERT OR IGNORE INTO usage_alerts_config (id, name, provider_id, account_id, metric_type, threshold_value, severity, is_enabled, created_at, updated_at) VALUES
        ('alert-quota-80', 'Cảnh báo hạn mức sử dụng (Quota) đạt 80%', NULL, NULL, 'quota_percentage', 80.0, 'warning', 1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'),
        ('alert-quota-95', 'Cảnh báo nghiêm trọng Quota sắp cạn kiệt (95%)', NULL, NULL, 'quota_percentage', 95.0, 'critical', 1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'),
        ('alert-rate-limit', 'Cảnh báo khi gặp phản hồi giới hạn tốc độ (Rate Limit Hit)', NULL, NULL, 'rate_limit_hit', 1.0, 'warning', 1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'),
        ('alert-concurrency', 'Cảnh báo khi số tiến trình đồng thời đạt ngưỡng tối đa', NULL, NULL, 'concurrency_saturated', 1.0, 'warning', 1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z'),
        ('alert-stale-quota', 'Cảnh báo khi dữ liệu Quota quá hạn kiểm toán (>24 giờ)', NULL, NULL, 'stale_data', 24.0, 'info', 1, '2026-10-31T00:00:00.000Z', '2026-10-31T00:00:00.000Z');

      -- 5. Bảng usage_alerts_history (Lịch sử các cảnh báo đã kích hoạt)
      CREATE TABLE IF NOT EXISTS usage_alerts_history (
        id TEXT PRIMARY KEY,
        config_id TEXT REFERENCES usage_alerts_config(id) ON DELETE SET NULL,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        metric_type TEXT NOT NULL,
        current_value REAL NOT NULL,
        threshold_value REAL NOT NULL,
        severity TEXT NOT NULL,
        message TEXT NOT NULL,
        is_acknowledged INTEGER NOT NULL DEFAULT 0,
        acknowledged_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_uah_account_ts ON usage_alerts_history(account_id, created_at DESC);
      CREATE INDEX IF NOT EXISTS idx_uah_ack ON usage_alerts_history(is_acknowledged);

      -- 6. Bảng aggregated_usage_daily (Rollup tổng hợp theo ngày/tuần/tháng để truy vấn tốc độ cao và phục vụ retention)
      CREATE TABLE IF NOT EXISTS aggregated_usage_daily (
        id TEXT PRIMARY KEY,
        period_type TEXT NOT NULL CHECK (period_type IN ('daily', 'weekly', 'monthly')),
        period_key TEXT NOT NULL,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        model_id TEXT REFERENCES models(id) ON DELETE SET NULL,
        input_tokens INTEGER NOT NULL DEFAULT 0,
        output_tokens INTEGER NOT NULL DEFAULT 0,
        cached_input_tokens INTEGER NOT NULL DEFAULT 0,
        reasoning_tokens INTEGER NOT NULL DEFAULT 0,
        total_tokens INTEGER NOT NULL DEFAULT 0,
        total_requests INTEGER NOT NULL DEFAULT 0,
        successful_requests INTEGER NOT NULL DEFAULT 0,
        failed_requests INTEGER NOT NULL DEFAULT 0,
        rate_limit_hits INTEGER NOT NULL DEFAULT 0,
        estimated_cost_usd REAL NOT NULL DEFAULT 0,
        actual_cost_usd REAL,
        cost_status TEXT NOT NULL DEFAULT 'estimated' CHECK (cost_status IN ('actual', 'estimated', 'unknown', 'unsupported')),
        updated_at TEXT NOT NULL,
        UNIQUE(period_type, period_key, provider_id, account_id, model_id)
      );

      CREATE INDEX IF NOT EXISTS idx_aud_period ON aggregated_usage_daily(period_type, period_key DESC);
      CREATE INDEX IF NOT EXISTS idx_aud_account ON aggregated_usage_daily(account_id, period_key DESC);

      -- 7. Bảng provider_account_capabilities (Theo dõi khả năng cung cấp metric của từng Tài khoản)
      CREATE TABLE IF NOT EXISTS provider_account_capabilities (
        id TEXT PRIMARY KEY,
        provider_id TEXT NOT NULL REFERENCES providers(id) ON DELETE CASCADE,
        account_id TEXT NOT NULL REFERENCES accounts(id) ON DELETE CASCADE,
        metric_key TEXT NOT NULL CHECK (metric_key IN ('tokens', 'requests', 'context_window', 'quota', 'rate_limit', 'cost', 'concurrency')),
        capability_status TEXT NOT NULL CHECK (capability_status IN ('supported', 'partial', 'unsupported', 'unknown', 'not_configured', 'authentication_required', 'temporarily_unavailable')),
        data_source TEXT NOT NULL,
        freshness_status TEXT NOT NULL DEFAULT 'fresh' CHECK (freshness_status IN ('fresh', 'stale', 'unavailable')),
        last_updated_at TEXT NOT NULL,
        reason_or_error TEXT,
        UNIQUE(provider_id, account_id, metric_key)
      );

      CREATE INDEX IF NOT EXISTS idx_pac_acc_metric ON provider_account_capabilities(account_id, metric_key);

      -- 8. Bảng usage_retention_policy (Chính sách dọn dẹp bảng usage thô)
      CREATE TABLE IF NOT EXISTS usage_retention_policy (
        id TEXT PRIMARY KEY CHECK (id = 'default'),
        raw_records_max_age_days INTEGER NOT NULL DEFAULT 90,
        rate_limit_events_max_age_days INTEGER NOT NULL DEFAULT 60,
        alerts_history_max_age_days INTEGER NOT NULL DEFAULT 180,
        updated_at TEXT NOT NULL
      );

      INSERT OR IGNORE INTO usage_retention_policy (id, updated_at) VALUES ('default', '2026-10-31T00:00:00.000Z');
    `,
  },
  {
    version: 9,
    name: '009_multi_agent_collaboration_and_cross_agent_workflow',
    upSql: `
      -- 1. Bảng collaboration_sessions
      CREATE TABLE IF NOT EXISTS collaboration_sessions (
        id TEXT PRIMARY KEY,
        parent_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        title TEXT NOT NULL,
        objective TEXT NOT NULL,
        status TEXT NOT NULL CHECK (status IN (
          'draft', 'planning', 'awaiting_approval', 'ready', 'running',
          'waiting_for_workers', 'reviewing', 'revision_requested', 'aggregating',
          'completed', 'failed', 'paused', 'cancelled'
        )),
        primary_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
        reviewer_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
        workspace_path TEXT NOT NULL,
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        completed_at TEXT,
        failure_reason TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_collab_parent_task ON collaboration_sessions(parent_task_id);
      CREATE INDEX IF NOT EXISTS idx_collab_status ON collaboration_sessions(status);
      CREATE INDEX IF NOT EXISTS idx_collab_primary ON collaboration_sessions(primary_agent_id);

      -- 2. Bảng collaboration_members
      CREATE TABLE IF NOT EXISTS collaboration_members (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        role TEXT NOT NULL CHECK (role IN ('primary', 'worker', 'reviewer', 'observer')),
        assigned_at TEXT NOT NULL,
        notes TEXT NOT NULL DEFAULT '',
        UNIQUE(session_id, agent_id)
      );

      CREATE INDEX IF NOT EXISTS idx_collab_members_sess ON collaboration_members(session_id);
      CREATE INDEX IF NOT EXISTS idx_collab_members_agent ON collaboration_members(agent_id);

      -- 3. Bảng collaboration_child_tasks
      CREATE TABLE IF NOT EXISTS collaboration_child_tasks (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
        task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        parent_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        assigned_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
        role TEXT NOT NULL CHECK (role IN ('worker', 'reviewer')),
        execution_order INTEGER NOT NULL DEFAULT 1,
        dependencies_json TEXT NOT NULL DEFAULT '[]',
        input_artifact_ids_json TEXT NOT NULL DEFAULT '[]',
        expected_outputs_json TEXT NOT NULL DEFAULT '[]',
        status TEXT NOT NULL DEFAULT 'draft',
        retry_count INTEGER NOT NULL DEFAULT 0,
        max_retries INTEGER NOT NULL DEFAULT 2,
        timeout_ms INTEGER NOT NULL DEFAULT 60000,
        acceptance_criteria TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_collab_child_sess ON collaboration_child_tasks(session_id, execution_order);
      CREATE INDEX IF NOT EXISTS idx_collab_child_task ON collaboration_child_tasks(task_id);

      -- 4. Bảng collaboration_artifacts
      CREATE TABLE IF NOT EXISTS collaboration_artifacts (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
        parent_task_id TEXT NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
        producer_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
        producer_assignment_id TEXT,
        workspace_id TEXT REFERENCES workspaces(id) ON DELETE SET NULL,
        relative_path TEXT NOT NULL,
        artifact_type TEXT NOT NULL CHECK (artifact_type IN (
          'source_code', 'document', 'image', 'report', 'test_result', 'patch_diff', 'structured_data'
        )),
        mime_type TEXT NOT NULL DEFAULT 'text/plain',
        current_version INTEGER NOT NULL DEFAULT 1,
        current_sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL DEFAULT 0,
        provenance TEXT NOT NULL DEFAULT 'agent_generated',
        validation_status TEXT NOT NULL DEFAULT 'pending' CHECK (validation_status IN ('pending', 'valid', 'corrupted', 'hash_mismatch')),
        approval_status TEXT NOT NULL DEFAULT 'pending' CHECK (approval_status IN ('pending', 'approved', 'rejected', 'revision_requested', 'blocked')),
        conflict_status TEXT NOT NULL DEFAULT 'clean' CHECK (conflict_status IN ('clean', 'conflict_detected', 'resolved')),
        created_at TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        UNIQUE(session_id, relative_path)
      );

      CREATE INDEX IF NOT EXISTS idx_collab_art_sess ON collaboration_artifacts(session_id);
      CREATE INDEX IF NOT EXISTS idx_collab_art_prod ON collaboration_artifacts(producer_agent_id);

      -- 5. Bảng collaboration_artifact_versions
      CREATE TABLE IF NOT EXISTS collaboration_artifact_versions (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL REFERENCES collaboration_artifacts(id) ON DELETE CASCADE,
        version INTEGER NOT NULL,
        producer_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
        sha256 TEXT NOT NULL,
        size_bytes INTEGER NOT NULL,
        content_storage_path TEXT NOT NULL,
        change_summary TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL,
        UNIQUE(artifact_id, version)
      );

      CREATE INDEX IF NOT EXISTS idx_collab_art_ver ON collaboration_artifact_versions(artifact_id, version DESC);

      -- 6. Bảng collaboration_artifact_access
      CREATE TABLE IF NOT EXISTS collaboration_artifact_access (
        id TEXT PRIMARY KEY,
        artifact_id TEXT NOT NULL REFERENCES collaboration_artifacts(id) ON DELETE CASCADE,
        agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
        access_level TEXT NOT NULL CHECK (access_level IN ('read_only', 'read_write')),
        granted_at TEXT NOT NULL,
        UNIQUE(artifact_id, agent_id)
      );

      CREATE INDEX IF NOT EXISTS idx_collab_art_acc ON collaboration_artifact_access(artifact_id, agent_id);

      -- 7. Bảng collaboration_reviews
      CREATE TABLE IF NOT EXISTS collaboration_reviews (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
        artifact_id TEXT NOT NULL REFERENCES collaboration_artifacts(id) ON DELETE CASCADE,
        artifact_version INTEGER NOT NULL,
        reviewer_agent_id TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
        verdict TEXT NOT NULL CHECK (verdict IN ('approved', 'rejected', 'revision_requested', 'blocked', 'unable_to_verify')),
        findings TEXT NOT NULL,
        evidence TEXT NOT NULL DEFAULT '',
        reviewed_sha256 TEXT NOT NULL,
        reviewed_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_collab_rev_sess ON collaboration_reviews(session_id);
      CREATE INDEX IF NOT EXISTS idx_collab_rev_art ON collaboration_reviews(artifact_id);

      -- 8. Bảng collaboration_conflicts
      CREATE TABLE IF NOT EXISTS collaboration_conflicts (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
        artifact_id TEXT NOT NULL REFERENCES collaboration_artifacts(id) ON DELETE CASCADE,
        competing_agent_a TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
        competing_agent_b TEXT NOT NULL REFERENCES agents(id) ON DELETE RESTRICT,
        version_a INTEGER NOT NULL,
        version_b INTEGER NOT NULL,
        sha256_a TEXT NOT NULL,
        sha256_b TEXT NOT NULL,
        conflict_reason TEXT NOT NULL,
        resolution_status TEXT NOT NULL DEFAULT 'unresolved' CHECK (resolution_status IN ('unresolved', 'resolved', 'dismissed')),
        resolution_action TEXT,
        resolved_by TEXT,
        resolved_at TEXT,
        created_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_collab_conf_sess ON collaboration_conflicts(session_id);

      -- 9. Bảng collaboration_state_transitions
      CREATE TABLE IF NOT EXISTS collaboration_state_transitions (
        id TEXT PRIMARY KEY,
        session_id TEXT NOT NULL REFERENCES collaboration_sessions(id) ON DELETE CASCADE,
        from_status TEXT NOT NULL,
        to_status TEXT NOT NULL,
        actor TEXT NOT NULL,
        actor_agent_id TEXT REFERENCES agents(id) ON DELETE SET NULL,
        reason TEXT NOT NULL DEFAULT '',
        transitioned_at TEXT NOT NULL
      );

      CREATE INDEX IF NOT EXISTS idx_collab_trans_sess ON collaboration_state_transitions(session_id, transitioned_at DESC);
    `,
  },
];