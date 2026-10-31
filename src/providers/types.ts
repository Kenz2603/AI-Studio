import type {
  ProviderAdapterStatus,
  ProviderCapabilities,
  SecretReference,
} from '../shared/types';

/**
 * HỢP ĐỒNG MỞ RỘNG CHO PROVIDER ADAPTER (G2.2)
 *
 * Quy tắc G2.2:
 * - Chỉ đăng ký metadata và adapter contract trong G2.2.
 * - Chưa tự động giả lập đăng nhập hoặc runtime khi chưa có adapter thực tế.
 * - Không giả định mọi Provider có cùng cơ chế xác thực, chọn model hay quản lý phiên.
 */
export interface ProviderSessionContext {
  readonly agentId: string;
  readonly isolatedNamespace: string;
  readonly workspacePath: string;
  readonly secretRef?: SecretReference;
  readonly customOptions?: Readonly<Record<string, unknown>>;
}

export interface ProviderAdapterContractMetadata {
  readonly providerId: string;
  readonly displayName: string;
  readonly vendor: string;
  readonly adapterVersion: string;
  readonly adapterStatus: ProviderAdapterStatus;
  readonly capabilities: ProviderCapabilities;
}

export interface IProviderAdapter {
  readonly metadata: ProviderAdapterContractMetadata;

  /**
   * Kiểm tra cấu hình cấp độ hợp đồng (contract validation) mà không khởi chạy tiến trình ngoài.
   */
  validateContractConfig(config: Readonly<Record<string, unknown>>): {
    readonly valid: boolean;
    readonly errors: readonly string[];
  };
}
