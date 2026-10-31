import type {
  TelemetryEventType,
  TelemetryPriority,
  TelemetryProvenance,
  TelemetryConfidence,
  RuntimeEventSource,
} from '../../shared/types';

/**
 * DANH MỤC EVENT TELEMETRY (G2.7) — nguồn sự thật duy nhất cho việc kiểm tra loại event & độ ưu tiên.
 * (runtime_events không còn CHECK theo event_type; việc kiểm tra bắt buộc được thực hiện ở đây.)
 */
const CRITICAL_TYPES: readonly TelemetryEventType[] = [
  'runtime_initialized',
  'runtime_started',
  'runtime_approval_required',
  'runtime_usage_reported',
  'runtime_completed',
  'runtime_failed',
  'runtime_cancelled',
  'runtime_crashed',
  'runtime_status_changed',
  'runtime_process_spawned',
  'runtime_process_exited',
  'runtime_recovery_unverified',
  'workspace_external_change_conflict',
  'workspace_snapshot_created',
  'workspace_integrity_scan_completed',
  'workspace_integrity_violation',
  'workspace_restore_requested',
  'workspace_restore_completed',
  'telemetry_events_dropped',
  'telemetry_sequence_gap',
  'telemetry_duplicate_rejected',
  'telemetry_signature_invalid',
];

const NORMAL_TYPES: readonly TelemetryEventType[] = [
  'runtime_tool_started',
  'runtime_tool_completed',
  'runtime_file_read',
  'runtime_file_created',
  'runtime_file_modified',
  'runtime_file_deleted',
  'runtime_step_started',
  'runtime_step_completed',
  'runtime_process_sample',
  'runtime_provider_event',
  'workspace_file_observed',
];

const BULK_TYPES: readonly TelemetryEventType[] = ['runtime_output'];

export const ALL_TELEMETRY_EVENT_TYPES: ReadonlySet<string> = new Set<string>([
  ...CRITICAL_TYPES,
  ...NORMAL_TYPES,
  ...BULK_TYPES,
]);

export const TELEMETRY_PROVENANCES: ReadonlySet<string> = new Set<string>([
  'provider_reported',
  'runtime_observed',
  'studio_recorded',
  'filesystem_observed',
  'external_unattributed',
  'test_mock',
]);

export function isValidTelemetryEventType(value: unknown): value is TelemetryEventType {
  return typeof value === 'string' && ALL_TELEMETRY_EVENT_TYPES.has(value);
}

export function derivePriority(eventType: TelemetryEventType): TelemetryPriority {
  if (BULK_TYPES.includes(eventType)) return 'bulk';
  if (NORMAL_TYPES.includes(eventType)) return 'normal';
  return 'critical';
}

export function deriveProvenanceFromSource(source: RuntimeEventSource): TelemetryProvenance {
  switch (source) {
    case 'process_runner':
    case 'runtime_adapter':
      return 'runtime_observed';
    case 'file_monitor':
      return 'filesystem_observed';
    case 'studio_service':
    case 'telemetry_service':
      return 'studio_recorded';
    case 'test_mock':
      return 'test_mock';
    default:
      return 'external_unattributed';
  }
}

export function deriveConfidence(provenance: TelemetryProvenance): TelemetryConfidence {
  switch (provenance) {
    case 'runtime_observed':
    case 'studio_recorded':
      return 'high';
    case 'provider_reported':
    case 'filesystem_observed':
      return 'medium';
    case 'external_unattributed':
      return 'low';
    case 'test_mock':
      return 'test_only';
    default:
      return 'unverified';
  }
}

