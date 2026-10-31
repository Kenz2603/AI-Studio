import { execSync } from 'node:child_process';
import path from 'node:path';
import fs from 'node:fs';
import type { IDatabaseLayer } from '../../database/DatabaseClient';
import type {
  ProviderAvailabilityStatus,
  ProviderCapabilityDetail,
  RuntimeProviderStatusRecord,
} from '../../shared/types';

export class RuntimeCapabilityRegistry {
  private readonly db: IDatabaseLayer;
  private readonly cache = new Map<string, RuntimeProviderStatusRecord>();

  constructor(dependencies: { db: IDatabaseLayer }) {
    this.db = dependencies.db;
  }

  public async refreshCapabilities(): Promise<readonly RuntimeProviderStatusRecord[]> {
    const providers = [
      await this.inspectAntigravity(),
      await this.inspectOpenAICodex(),
      await this.inspectAnthropicClaude(),
    ];

    const nowIso = new Date().toISOString();
    for (const p of providers) {
      this.cache.set(p.providerId, p);

      const recordId = `rcap-${p.providerId}`;
      this.db.prepare(`
        INSERT INTO runtime_provider_capabilities (
          id, provider_id, runtime_type, cli_path, cli_version,
          availability_status, capabilities_json, notes, checked_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          cli_path = excluded.cli_path,
          cli_version = excluded.cli_version,
          availability_status = excluded.availability_status,
          capabilities_json = excluded.capabilities_json,
          notes = excluded.notes,
          checked_at = excluded.checked_at
      `).run(
        recordId,
        p.providerId,
        p.providerId === 'antigravity' ? 'ide-extension' : 'local-cli',
        p.cliPath,
        p.cliVersion,
        p.availabilityStatus,
        JSON.stringify(p.capabilities),
        p.notes,
        nowIso
      );
    }

    return providers;
  }

  public getProviderStatus(providerId: string): RuntimeProviderStatusRecord | null {
    if (this.cache.has(providerId)) {
      return this.cache.get(providerId)!;
    }

    const row = this.db.prepare(`
      SELECT * FROM runtime_provider_capabilities WHERE provider_id = ?
    `).get(providerId) as Record<string, unknown> | undefined;

    if (!row) {
      return null;
    }

    let capabilities: ProviderCapabilityDetail;
    try {
      capabilities = JSON.parse(String(row.capabilities_json ?? '{}'));
    } catch {
      capabilities = this.createDefaultCapabilities('unsupported');
    }

    const record: RuntimeProviderStatusRecord = {
      providerId: String(row.provider_id),
      displayName: this.getDisplayName(String(row.provider_id)),
      availabilityStatus: row.availability_status as ProviderAvailabilityStatus,
      cliPath: (row.cli_path as string | null) ?? null,
      cliVersion: (row.cli_version as string | null) ?? null,
      capabilities,
      notes: String(row.notes ?? ''),
      checkedAt: String(row.checked_at),
    };

    this.cache.set(providerId, record);
    return record;
  }

  public listProviderStatuses(): readonly RuntimeProviderStatusRecord[] {
    const list: RuntimeProviderStatusRecord[] = [];
    for (const pId of ['antigravity', 'openai-codex', 'anthropic-claude']) {
      const status = this.getProviderStatus(pId);
      if (status) {
        list.push(status);
      }
    }
    return list;
  }

  private async inspectAntigravity(): Promise<RuntimeProviderStatusRecord> {
    // Thẩm định thực tế: Antigravity là VS Code Extension chính, không có CLI external mở socket
    const nowIso = new Date().toISOString();
    return {
      providerId: 'antigravity',
      displayName: 'Google Antigravity',
      availabilityStatus: 'manual_only',
      cliPath: null,
      cliVersion: null,
      capabilities: {
        authStatus: 'manual_only',
        executionStatus: 'manual_only',
        modelSelectionStatus: 'supported',
        reasoningStatus: 'supported',
        streamingStatus: 'manual_only',
        toolEventsStatus: 'unsupported',
        usageStatus: 'unsupported',
        quotaStatus: 'unsupported',
        cancellationStatus: 'manual_only',
        sessionStatus: 'partially_supported',
        workspaceStatus: 'supported',
      },
      notes: 'Antigravity hoạt động trực tiếp trong VS Code Editor. Chưa có headless CLI bên ngoài được xác minh. Mọi tác vụ cần thực hiện qua giao diện VS Code của Owner.',
      checkedAt: nowIso,
    };
  }

  private async inspectOpenAICodex(): Promise<RuntimeProviderStatusRecord> {
    const nowIso = new Date().toISOString();
    let cliPath: string | null = null;
    let cliVersion: string | null = null;

    try {
      const whereOut = execSync('where.exe codex', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      const lines = whereOut.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      cliPath = lines.find((l) => l.endsWith('.cmd') || l.endsWith('.exe')) ?? lines[0] ?? null;

      if (cliPath) {
        const verOut = execSync(`"${cliPath}" --version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
        cliVersion = verOut;
      }
    } catch {
      cliPath = null;
      cliVersion = null;
    }

    const isInstalled = Boolean(cliPath);

    return {
      providerId: 'openai-codex',
      displayName: 'OpenAI Codex',
      availabilityStatus: isInstalled ? 'installed' : 'not_installed',
      cliPath,
      cliVersion,
      capabilities: {
        authStatus: isInstalled ? 'partially_supported' : 'unsupported',
        executionStatus: isInstalled ? 'supported' : 'unsupported',
        modelSelectionStatus: isInstalled ? 'supported' : 'unsupported',
        reasoningStatus: isInstalled ? 'supported' : 'unsupported',
        streamingStatus: isInstalled ? 'partially_supported' : 'unsupported',
        toolEventsStatus: isInstalled ? 'partially_supported' : 'unsupported',
        usageStatus: isInstalled ? 'partially_supported' : 'unsupported',
        quotaStatus: 'partially_supported',
        cancellationStatus: isInstalled ? 'supported' : 'unsupported',
        sessionStatus: isInstalled ? 'partially_supported' : 'unsupported',
        workspaceStatus: isInstalled ? 'partially_supported' : 'unsupported',
      },
      notes: isInstalled
        ? `Đã phát hiện '${cliVersion ?? 'codex-cli'}'. Hoạt động ở chế độ restricted/staging có Owner Approval.`
        : 'Chưa cài đặt CLI codex trên máy.',
      checkedAt: nowIso,
    };
  }

  private async inspectAnthropicClaude(): Promise<RuntimeProviderStatusRecord> {
    const nowIso = new Date().toISOString();
    let cliPath: string | null = null;
    let cliVersion: string | null = null;

    try {
      const whereOut = execSync('where.exe claude', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      const lines = whereOut.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      cliPath = lines[0] ?? null;
      if (cliPath) {
        cliVersion = execSync(`"${cliPath}" --version`, { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).trim();
      }
    } catch {
      cliPath = null;
      cliVersion = null;
    }

    const isInstalled = Boolean(cliPath);

    return {
      providerId: 'anthropic-claude',
      displayName: 'Anthropic Claude',
      availabilityStatus: isInstalled ? 'installed' : 'not_installed',
      cliPath,
      cliVersion,
      capabilities: this.createDefaultCapabilities(isInstalled ? 'partially_supported' : 'unsupported'),
      notes: isInstalled
        ? `Đã phát hiện claude CLI: ${cliVersion}`
        : 'CLI claude chưa được cài đặt (chỉ có Claude Desktop GUI). Đánh dấu not_installed / runtime_unavailable.',
      checkedAt: nowIso,
    };
  }

  private createDefaultCapabilities(level: 'supported' | 'partially_supported' | 'unsupported'): ProviderCapabilityDetail {
    return {
      authStatus: level,
      executionStatus: level,
      modelSelectionStatus: level,
      reasoningStatus: level,
      streamingStatus: level,
      toolEventsStatus: level,
      usageStatus: level,
      quotaStatus: level,
      cancellationStatus: level,
      sessionStatus: level,
      workspaceStatus: level,
    };
  }

  private getDisplayName(providerId: string): string {
    switch (providerId) {
      case 'antigravity':
        return 'Google Antigravity';
      case 'openai-codex':
        return 'OpenAI Codex';
      case 'anthropic-claude':
        return 'Anthropic Claude';
      default:
        return providerId;
    }
  }
}

