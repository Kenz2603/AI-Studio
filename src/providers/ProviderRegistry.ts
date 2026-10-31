import type { IProviderAdapter, ProviderAdapterContractMetadata } from './types';

/**
 * PROVIDER ADAPTER REGISTRY (G2.2)
 *
 * Quản lý hợp đồng Adapter của các Provider đã khai báo (Antigravity, OpenAI Codex,
 * Anthropic Claude và các Custom Provider trong tương lai).
 */
export class ProviderRegistry {
  private readonly adapters = new Map<string, IProviderAdapter>();

  public registerAdapter(adapter: IProviderAdapter): void {
    const id = adapter.metadata.providerId.trim();
    if (!id) {
      throw new Error('Provider ID không được để trống.');
    }
    this.adapters.set(id, adapter);
  }

  public hasAdapter(providerId: string): boolean {
    return this.adapters.has(providerId);
  }

  public getAdapter(providerId: string): IProviderAdapter | undefined {
    return this.adapters.get(providerId);
  }

  public listAdapterMetadata(): readonly ProviderAdapterContractMetadata[] {
    return Array.from(this.adapters.values()).map((a) => a.metadata);
  }

  public count(): number {
    return this.adapters.size;
  }
}
