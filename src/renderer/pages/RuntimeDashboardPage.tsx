import React, { useCallback, useEffect, useRef, useState } from 'react';
import type {
  AgentLiveCard,
  RuntimeDashboardOverview,
  RuntimeEventRecord,
  RuntimeExecutionLockRecord,
  RuntimeIsolationMode,
  RuntimeProviderStatusRecord,
  RuntimeSessionRecord,
  TaskRecord,
  TelemetryFilter,
  TelemetryPushBatch,
  TelemetryRuntimeStats,
  UsageTelemetryRow,
} from '../../shared/types';

type RuntimeTab =
  | 'live_agents'
  | 'sessions'
  | 'console'
  | 'activity_timeline'
  | 'usage_telemetry'
  | 'providers'
  | 'locks'
  | 'events';

export interface RuntimeDashboardPageProps {
  readonly isDark?: boolean;
}

export const RuntimeDashboardPage: React.FC<RuntimeDashboardPageProps> = ({
  isDark = true,
}) => {
  const [overview, setOverview] = useState<RuntimeDashboardOverview | null>(null);
  const [tasks, setTasks] = useState<readonly TaskRecord[]>([]);
  const [activeTab, setActiveTab] = useState<RuntimeTab>('live_agents');
  const [loading, setLoading] = useState<boolean>(true);
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // G2.7: Live Agents
  const [liveCards, setLiveCards] = useState<readonly AgentLiveCard[]>([]);

  // G2.7: Usage & Quota Telemetry
  const [usageRows, setUsageRows] = useState<readonly UsageTelemetryRow[]>([]);

  // G2.7: Telemetry Stats
  const [telemetryStats, setTelemetryStats] = useState<TelemetryRuntimeStats | null>(null);

  // G2.7: Live Console Stream
  const [consoleEvents, setConsoleEvents] = useState<RuntimeEventRecord[]>([]);
  const [consolePaused, setConsolePaused] = useState<boolean>(false);
  const [consoleSearch, setConsoleSearch] = useState<string>('');
  const [consoleStreamFilter, setConsoleStreamFilter] = useState<'all' | 'stdout' | 'stderr' | 'events'>('all');
  const consoleBottomRef = useRef<HTMLDivElement | null>(null);
  const activeSubscriptionRef = useRef<string | null>(null);

  // G2.7: Activity Timeline
  const [timelineEvents, setTimelineEvents] = useState<readonly RuntimeEventRecord[]>([]);
  const [timelineProvenanceFilter, setTimelineProvenanceFilter] = useState<string>('all');
  const [timelineSearch, setTimelineSearch] = useState<string>('');

  // Selected session for event inspection
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [sessionEvents, setSessionEvents] = useState<readonly RuntimeEventRecord[]>([]);

  // Dispatch Task Modal
  const [showDispatchModal, setShowDispatchModal] = useState<boolean>(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>('');
  const [isolationMode, setIsolationMode] = useState<RuntimeIsolationMode>('restricted');
  const [isDispatching, setIsDispatching] = useState<boolean>(false);

  const loadData = useCallback(async () => {
    try {
      setLoading(true);
      const [ovRes, tRes, cardsRes, usageRes, statsRes, histRes] = await Promise.all([
        window.studioApi.getRuntimeDashboardOverview(),
        window.studioApi.getTasks(),
        window.studioApi.getAgentLiveCards(),
        window.studioApi.getUsageTelemetry(),
        window.studioApi.getTelemetryStats(),
        window.studioApi.queryTelemetryHistory({ limit: 100 }),
      ]);

      if (ovRes.ok && ovRes.data) {
        setOverview(ovRes.data);
      } else if (ovRes.error) {
        setStatusBanner({ type: 'error', text: ovRes.error.message });
      }

      if (tRes.ok && tRes.data) {
        setTasks(tRes.data);
        if (tRes.data.length > 0 && !selectedTaskId) {
          setSelectedTaskId(tRes.data[0].id);
        }
      }

      if (cardsRes.ok && cardsRes.data) {
        setLiveCards(cardsRes.data);
      }

      if (usageRes.ok && usageRes.data) {
        setUsageRows(usageRes.data);
      }

      if (statsRes.ok && statsRes.data) {
        setTelemetryStats(statsRes.data);
      }

      if (histRes.ok && histRes.data) {
        setTimelineEvents(histRes.data.events);
      }
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: `Lỗi tải dữ liệu Telemetry / Runtime: ${(err as Error).message}`,
      });
    } finally {
      setLoading(false);
    }
  }, [selectedTaskId]);

  useEffect(() => {
    void loadData();
    const interval = setInterval(() => {
      void loadData();
    }, 8_000);
    return () => clearInterval(interval);
  }, [loadData]);

  // Telemetry real-time subscription for Live Console
  useEffect(() => {
    let cancelled = false;

    async function initSubscription() {
      try {
        const subRes = await window.studioApi.subscribeTelemetry(
          {},
          (batch: TelemetryPushBatch) => {
            if (cancelled) return;
            if (batch.kind === 'events' && batch.events.length > 0) {
              setConsoleEvents((prev) => {
                if (consolePaused) return prev;
                const next = [...prev, ...batch.events];
                return next.slice(-800); // Giữ tối đa 800 events trong bộ đệm giao diện
              });
            }
          }
        );

        if (subRes.ok && subRes.data) {
          if (cancelled) {
            void window.studioApi.unsubscribeTelemetry(subRes.data.subscriptionId);
          } else {
            activeSubscriptionRef.current = subRes.data.subscriptionId;
          }
        }
      } catch (err) {
        console.warn('Lỗi đăng ký telemetry subscription:', err);
      }
    }

    void initSubscription();

    return () => {
      cancelled = true;
      if (activeSubscriptionRef.current) {
        const id = activeSubscriptionRef.current;
        activeSubscriptionRef.current = null;
        void window.studioApi.unsubscribeTelemetry(id);
      }
    };
  }, [consolePaused]);

  // Auto-scroll console to bottom when new events arrive
  useEffect(() => {
    if (!consolePaused && consoleBottomRef.current) {
      consoleBottomRef.current.scrollIntoView({ behavior: 'smooth' });
    }
  }, [consoleEvents, consolePaused]);

  const handleSelectSession = async (sessionId: string) => {
    setSelectedSessionId(sessionId);
    try {
      const res = await window.studioApi.listRuntimeEvents(sessionId);
      if (res.ok && res.data) {
        setSessionEvents(res.data);
      }
    } catch (err) {
      console.error('Lỗi tải events của session:', err);
    }
  };

  const handleDispatchTask = async () => {
    if (!selectedTaskId) {
      setStatusBanner({ type: 'error', text: 'Vui lòng chọn Task để dispatch.' });
      return;
    }

    try {
      setIsDispatching(true);
      const res = await window.studioApi.dispatchRuntimeTask({
        taskId: selectedTaskId,
        isolationMode,
      });

      if (res.ok && res.data) {
        if (res.data.success) {
          setStatusBanner({
            type: 'success',
            text: `Dispatch thành công Session '${res.data.sessionId}' (Trạng thái: ${res.data.status})`,
          });
          setShowDispatchModal(false);
          await loadData();
        } else {
          setStatusBanner({
            type: 'error',
            text: `Dispatch bị từ chối: ${res.data.reason}`,
          });
        }
      } else {
        setStatusBanner({
          type: 'error',
          text: res.error?.message ?? 'Lỗi khi dispatch task.',
        });
      }
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: `Lỗi kết nối Runtime: ${(err as Error).message}`,
      });
    } finally {
      setIsDispatching(false);
    }
  };

  const handleCancelSession = async (sessionId: string) => {
    if (!confirm(`Bạn có chắc muốn hủy phiên Runtime '${sessionId}'?`)) return;

    try {
      const res = await window.studioApi.cancelRuntimeTask({
        sessionId,
        reason: 'Owner hủy từ Runtime Dashboard',
      });

      if (res.ok && res.data) {
        setStatusBanner({ type: 'info', text: res.data.reason });
        await loadData();
      }
    } catch (err) {
      setStatusBanner({
        type: 'error',
        text: `Lỗi hủy phiên: ${(err as Error).message}`,
      });
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'running':
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold animate-pulse border ${
            isDark
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'bg-emerald-50 text-emerald-800 border-emerald-300'
          }`}>
            RUNNING
          </span>
        );
      case 'completed':
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium border ${
            isDark
              ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
              : 'bg-zinc-100 text-zinc-800 border-zinc-300'
          }`}>
            COMPLETED
          </span>
        );
      case 'failed':
      case 'crashed':
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-mono font-bold border ${
            isDark
              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
              : 'bg-rose-50 text-rose-800 border-rose-300'
          }`}>
            FAILED
          </span>
        );
      case 'cancelled':
      case 'waiting_approval':
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium border ${
            isDark
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              : 'bg-amber-50 text-amber-800 border-amber-300'
          }`}>
            {status.toUpperCase()}
          </span>
        );
      case 'initializing':
      case 'starting':
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium border ${
            isDark
              ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
              : 'bg-zinc-100 text-zinc-700 border-zinc-300'
          }`}>
            INITIALIZING
          </span>
        );
      case 'unknown_after_restart':
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium border ${
            isDark
              ? 'bg-purple-500/15 text-purple-300 border-purple-500/30'
              : 'bg-purple-50 text-purple-800 border-purple-300'
          }`}>
            UNKNOWN RESTART
          </span>
        );
      case 'idle_no_session':
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-mono font-medium border ${
            isDark
              ? 'bg-zinc-800/80 text-zinc-400 border-zinc-700/80'
              : 'bg-zinc-100 text-zinc-600 border-zinc-300'
          }`}>
            IDLE
          </span>
        );
      default:
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-mono border ${
            isDark
              ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
              : 'bg-zinc-100 text-zinc-700 border-zinc-300'
          }`}>
            {status.toUpperCase()}
          </span>
        );
    }
  };

  const getAvailabilityBadge = (status: string) => {
    switch (status) {
      case 'installed':
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-mono border ${
            isDark
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'bg-emerald-50 text-emerald-800 border-emerald-300'
          }`}>
            INSTALLED
          </span>
        );
      case 'manual_only':
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-mono border ${
            isDark
              ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
              : 'bg-zinc-100 text-zinc-800 border-zinc-300'
          }`}>
            MANUAL ONLY (IDE)
          </span>
        );
      case 'not_installed':
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-mono border ${
            isDark
              ? 'bg-zinc-800/80 text-zinc-400 border-zinc-700/60'
              : 'bg-zinc-100 text-zinc-500 border-zinc-300'
          }`}>
            NOT INSTALLED
          </span>
        );
      case 'authentication_required':
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-mono border ${
            isDark
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              : 'bg-amber-50 text-amber-800 border-amber-300'
          }`}>
            AUTH REQUIRED
          </span>
        );
      default:
        return (
          <span className={`px-2 py-0.5 rounded text-xs font-mono border ${
            isDark
              ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
              : 'bg-zinc-100 text-zinc-600 border-zinc-300'
          }`}>
            {status}
          </span>
        );
    }
  };

  const getProvenanceBadge = (prov: string) => {
    switch (prov) {
      case 'runtime_observed':
        return (
          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${
            isDark
              ? 'bg-zinc-800 text-zinc-200 border-zinc-700'
              : 'bg-zinc-100 text-zinc-800 border-zinc-300'
          }`}>
            runtime_observed
          </span>
        );
      case 'studio_recorded':
        return (
          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${
            isDark
              ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
              : 'bg-zinc-100 text-zinc-700 border-zinc-300'
          }`}>
            studio_recorded
          </span>
        );
      case 'provider_reported':
        return (
          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${
            isDark
              ? 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30'
              : 'bg-emerald-50 text-emerald-800 border-emerald-300'
          }`}>
            provider_reported
          </span>
        );
      case 'filesystem_observed':
        return (
          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${
            isDark
              ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
              : 'bg-amber-50 text-amber-800 border-amber-300'
          }`}>
            filesystem_observed
          </span>
        );
      case 'external_unattributed':
        return (
          <span className={`px-1.5 py-0.5 rounded text-[10px] font-bold border ${
            isDark
              ? 'bg-rose-500/15 text-rose-300 border-rose-500/30'
              : 'bg-rose-50 text-rose-800 border-rose-300'
          }`}>
            external_unattributed
          </span>
        );
      default:
        return (
          <span className={`px-1.5 py-0.5 rounded text-[10px] border ${
            isDark
              ? 'bg-zinc-800 text-zinc-400 border-zinc-700'
              : 'bg-zinc-100 text-zinc-600 border-zinc-300'
          }`}>
            {prov}
          </span>
        );
    }
  };

  const getConfidenceBadge = (conf: string) => {
    switch (conf) {
      case 'high':
        return <span className={`text-[10px] font-semibold ${isDark ? 'text-zinc-200' : 'text-zinc-900'}`}>High</span>;
      case 'medium':
        return <span className={`text-[10px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>Medium</span>;
      case 'low':
        return <span className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>Low</span>;
      case 'unverified':
      default:
        return <span className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`}>Unverified</span>;
    }
  };

  const getSignatureBadge = (sigStatus: string) => {
    switch (sigStatus) {
      case 'internal_hmac_valid':
        return <span className={`text-[10px] ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`} title="Studio HMAC hợp lệ">[HMAC OK]</span>;
      case 'internal_unsigned':
        return <span className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-400'}`} title="Chưa ký">[Unsigned]</span>;
      case 'test_mock_bypassed':
        return <span className={`text-[10px] ${isDark ? 'text-amber-400' : 'text-amber-700'}`} title="Test mock bypass">[TestMock]</span>;
      case 'signature_invalid':
        return <span className={`text-[10px] font-bold ${isDark ? 'text-rose-400' : 'text-rose-700'}`} title="Chữ ký không khớp">[SIG INVALID]</span>;
      default:
        return <span className={`text-[10px] ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>[{sigStatus}]</span>;
    }
  };

  // Filter console events
  const filteredConsoleEvents = consoleEvents.filter((e) => {
    if (consoleStreamFilter === 'stdout') {
      if (e.eventType !== 'runtime_output' || e.payload?.stream !== 'stdout') return false;
    } else if (consoleStreamFilter === 'stderr') {
      if (e.eventType !== 'runtime_output' || e.payload?.stream !== 'stderr') return false;
    } else if (consoleStreamFilter === 'events') {
      if (e.eventType === 'runtime_output') return false;
    }
    if (consoleSearch.trim()) {
      const q = consoleSearch.toLowerCase();
      const text = (e.payload?.text as string) || '';
      const payloadStr = JSON.stringify(e.payload).toLowerCase();
      return e.eventType.toLowerCase().includes(q) || text.toLowerCase().includes(q) || payloadStr.includes(q);
    }
    return true;
  });

  // Filter timeline events
  const filteredTimelineEvents = timelineEvents.filter((e) => {
    if (timelineProvenanceFilter !== 'all' && e.provenance !== timelineProvenanceFilter) return false;
    if (timelineSearch.trim()) {
      const q = timelineSearch.toLowerCase();
      return (
        e.eventType.toLowerCase().includes(q) ||
        (e.sessionId && e.sessionId.toLowerCase().includes(q)) ||
        JSON.stringify(e.payload).toLowerCase().includes(q)
      );
    }
    return true;
  });

  return (
    <div className="p-8 max-w-7xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex justify-between items-start">
        <div>
          <div className="flex items-center gap-3">
            <h1 className={`text-2xl font-bold tracking-wide ${isDark ? 'text-white' : 'text-zinc-950'}`}>
              Runtime Core & Telemetry Stream
            </h1>
            <span className={`px-2.5 py-0.5 rounded-full text-xs font-mono border ${
              isDark
                ? 'bg-zinc-800 text-zinc-300 border-zinc-700'
                : 'bg-zinc-200 text-zinc-800 border-zinc-300'
            }`}>
              G2.7 Active
            </span>
          </div>
          <p className={`text-sm mt-1 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
            Giám sát thời gian thực luồng sự kiện đa Agent, đo đạc tiến trình thực tế, Activity Timeline và mức tiêu thụ tài nguyên AI.
          </p>
        </div>
        <div className="flex gap-3">
          <button
            onClick={() => void loadData()}
            className={`px-3 py-1.5 text-xs rounded border transition ${
              isDark
                ? 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                : 'bg-white border-zinc-300 text-zinc-800 hover:bg-zinc-100 shadow-xs'
            }`}
          >
            Làm mới
          </button>
          <button
            onClick={() => setShowDispatchModal(true)}
            className={`px-3.5 py-1.5 text-xs rounded font-medium shadow-sm transition ${
              isDark
                ? 'bg-white text-black hover:bg-zinc-200'
                : 'bg-indigo-600 text-white hover:bg-indigo-500'
            }`}
          >
            + Dispatch Task
          </button>
        </div>
      </div>

      {statusBanner && (
        <div
          className={`p-4 rounded-lg text-sm border flex justify-between items-center ${
            statusBanner.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : statusBanner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : 'bg-cyan-500/10 border-cyan-500/30 text-cyan-300'
          }`}
        >
          <span>{statusBanner.text}</span>
          <button
            onClick={() => setStatusBanner(null)}
            className="text-xs hover:underline ml-4"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Top Telemetry KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className={`p-4 rounded-xl border backdrop-blur-md transition ${
          isDark
            ? 'bg-zinc-950/40 border-zinc-800/80 text-white'
            : 'bg-white/60 border-zinc-200/80 text-zinc-950 shadow-xs'
        }`}>
          <span className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>Agent Đang Theo Dõi</span>
          <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-white' : 'text-zinc-950'}`}>{liveCards.length}</p>
          <span className={`text-xs mt-1 block ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
            {liveCards.filter((c) => c.sessionStatus === 'running').length} đang thực thi
          </span>
        </div>
        <div className={`p-4 rounded-xl border backdrop-blur-md transition ${
          isDark
            ? 'bg-zinc-950/40 border-zinc-800/80 text-white'
            : 'bg-white/60 border-zinc-200/80 text-zinc-950 shadow-xs'
        }`}>
          <span className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>Stream Sequence ID</span>
          <p className={`text-2xl font-bold mt-1 font-mono ${isDark ? 'text-white' : 'text-zinc-950'}`}>
            #{telemetryStats?.currentStreamSeq ?? 0}
          </p>
          <span className={`text-xs mt-1 block ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
            Đã lưu: {telemetryStats?.global.eventsPersisted ?? 0} sự kiện
          </span>
        </div>
        <div className={`p-4 rounded-xl border backdrop-blur-md transition ${
          isDark
            ? 'bg-zinc-950/40 border-zinc-800/80 text-white'
            : 'bg-white/60 border-zinc-200/80 text-zinc-950 shadow-xs'
        }`}>
          <span className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>Độ Tin Cậy Luồng Sự Kiện</span>
          <p className={`text-2xl font-bold mt-1 ${isDark ? 'text-emerald-400' : 'text-emerald-700'}`}>
            {telemetryStats?.global.sequenceGaps === 0 ? '100%' : 'Có Khoảng Trống'}
          </p>
          <span className={`text-xs mt-1 block ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
            Gaps: {telemetryStats?.global.sequenceGaps ?? 0} | Bỏ rơi: {telemetryStats?.global.eventsDropped ?? 0}
          </span>
        </div>
        <div className={`p-4 rounded-xl border backdrop-blur-md transition ${
          isDark
            ? 'bg-zinc-950/40 border-zinc-800/80 text-white'
            : 'bg-white/60 border-zinc-200/80 text-zinc-950 shadow-xs'
        }`}>
          <span className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>Khóa Tài Nguyên (Active Locks)</span>
          <p className={`text-2xl font-bold mt-1 font-mono ${isDark ? 'text-white' : 'text-zinc-950'}`}>
            {overview?.activeLocks.length ?? 0}
          </p>
          <span className={`text-xs mt-1 block ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>Bảo vệ Workspace không xung đột</span>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className={`border-b ${isDark ? 'border-zinc-800' : 'border-zinc-200'} flex gap-6 text-sm overflow-x-auto pb-1`}>
        <button
          onClick={() => setActiveTab('live_agents')}
          className={`pb-3 font-medium transition whitespace-nowrap ${
            activeTab === 'live_agents'
              ? isDark
                ? 'text-white border-b-2 border-white font-semibold'
                : 'text-black border-b-2 border-black font-semibold'
              : isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-500 hover:text-black'
          }`}
        >
          Thẻ Agent trực tiếp ({liveCards.length})
        </button>
        <button
          onClick={() => setActiveTab('console')}
          className={`pb-3 font-medium transition whitespace-nowrap ${
            activeTab === 'console'
              ? isDark
                ? 'text-white border-b-2 border-white font-semibold'
                : 'text-black border-b-2 border-black font-semibold'
              : isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-500 hover:text-black'
          }`}
        >
          Luồng Console trực tiếp ({consoleEvents.length})
        </button>
        <button
          onClick={() => setActiveTab('activity_timeline')}
          className={`pb-3 font-medium transition whitespace-nowrap ${
            activeTab === 'activity_timeline'
              ? isDark
                ? 'text-white border-b-2 border-white font-semibold'
                : 'text-black border-b-2 border-black font-semibold'
              : isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-500 hover:text-black'
          }`}
        >
          Dòng thời gian hoạt động ({timelineEvents.length})
        </button>
        <button
          onClick={() => setActiveTab('usage_telemetry')}
          className={`pb-3 font-medium transition whitespace-nowrap ${
            activeTab === 'usage_telemetry'
              ? isDark
                ? 'text-white border-b-2 border-white font-semibold'
                : 'text-black border-b-2 border-black font-semibold'
              : isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-500 hover:text-black'
          }`}
        >
          Đo lường Token & Hạn ngạch
        </button>
        <button
          onClick={() => setActiveTab('sessions')}
          className={`pb-3 font-medium transition whitespace-nowrap ${
            activeTab === 'sessions'
              ? isDark
                ? 'text-white border-b-2 border-white font-semibold'
                : 'text-black border-b-2 border-black font-semibold'
              : isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-500 hover:text-black'
          }`}
        >
          Phiên Runtime ({overview?.sessions.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('providers')}
          className={`pb-3 font-medium transition whitespace-nowrap ${
            activeTab === 'providers'
              ? isDark
                ? 'text-white border-b-2 border-white font-semibold'
                : 'text-black border-b-2 border-black font-semibold'
              : isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-500 hover:text-black'
          }`}
        >
          Ma trận năng lực Provider ({overview?.providerStatuses.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('locks')}
          className={`pb-3 font-medium transition whitespace-nowrap ${
            activeTab === 'locks'
              ? isDark
                ? 'text-white border-b-2 border-white font-semibold'
                : 'text-black border-b-2 border-black font-semibold'
              : isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-500 hover:text-black'
          }`}
        >
          Khóa tài nguyên ({overview?.activeLocks.length ?? 0})
        </button>
        <button
          onClick={() => setActiveTab('events')}
          className={`pb-3 font-medium transition whitespace-nowrap ${
            activeTab === 'events'
              ? isDark
                ? 'text-white border-b-2 border-white font-semibold'
                : 'text-black border-b-2 border-black font-semibold'
              : isDark
                ? 'text-zinc-400 hover:text-white'
                : 'text-zinc-500 hover:text-black'
          }`}
        >
          Nhật ký sự kiện
        </button>
      </div>

      {/* =========================================================================
          TAB 1: LIVE AGENTS CARDS (G2.7)
         ========================================================================= */}
      {activeTab === 'live_agents' && (
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {liveCards.map((agent) => (
              <div
                key={agent.agentId}
                className={`rounded-xl p-5 flex flex-col justify-between space-y-4 transition backdrop-blur-md border ${
                  isDark
                    ? 'bg-zinc-950/40 border-zinc-800/80 hover:border-zinc-700 text-white'
                    : 'bg-white/60 border-zinc-200/80 hover:border-zinc-300 text-zinc-950 shadow-xs'
                }`}
              >
                <div>
                  <div className="flex justify-between items-start">
                    <div>
                      <h3 className={`font-bold text-base ${isDark ? 'text-white' : 'text-zinc-950'}`}>{agent.agentName}</h3>
                      <span className={`text-xs font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-500'}`}>{agent.agentId}</span>
                    </div>
                    <div>{getStatusBadge(agent.effectiveStatus)}</div>
                  </div>

                  <div className={`mt-3 text-xs space-y-1.5 border-t pt-3 ${isDark ? 'border-zinc-800/80' : 'border-zinc-200'}`}>
                    <div className="flex justify-between">
                      <span className={isDark ? 'text-zinc-400' : 'text-zinc-600'}>Provider:</span>
                      <span className={`font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-900'}`}>{agent.providerName}</span>
                    </div>
                    {agent.modelName && (
                      <div className="flex justify-between">
                        <span className={isDark ? 'text-zinc-400' : 'text-zinc-600'}>Model:</span>
                        <span className={`font-mono ${isDark ? 'text-zinc-200' : 'text-zinc-900'}`}>{agent.modelName}</span>
                      </div>
                    )}
                    {agent.accountName && (
                      <div className="flex justify-between">
                        <span className={isDark ? 'text-zinc-400' : 'text-zinc-600'}>Tài khoản:</span>
                        <span className={isDark ? 'text-zinc-200' : 'text-zinc-900'}>{agent.accountName}</span>
                      </div>
                    )}
                    {agent.reasoningLevel && (
                      <div className="flex justify-between">
                        <span className={isDark ? 'text-zinc-400' : 'text-zinc-600'}>Reasoning:</span>
                        <span className={`font-mono font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-900'}`}>{agent.reasoningLevel}</span>
                      </div>
                    )}
                  </div>

                  {/* Task / Session info */}
                  {agent.sessionId ? (
                    <div className={`mt-3 p-2.5 rounded-lg border text-xs space-y-1.5 ${
                      isDark
                        ? 'bg-zinc-900/60 border-zinc-800'
                        : 'bg-zinc-100/70 border-zinc-200'
                    }`}>
                      <div className="flex justify-between">
                        <span className={isDark ? 'text-zinc-400' : 'text-zinc-600'}>Task:</span>
                        <span className={`truncate font-medium max-w-[180px] ${isDark ? 'text-white' : 'text-zinc-950'}`}>
                          {agent.taskTitle ?? agent.taskId}
                        </span>
                      </div>
                      <div className="flex justify-between">
                        <span className={isDark ? 'text-zinc-400' : 'text-zinc-600'}>PID OS:</span>
                        <span className={`font-mono ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>
                          {agent.pid ? `${agent.pid}` : 'Chưa gắn PID'}
                        </span>
                      </div>
                      {agent.runningDurationMs !== null && (
                        <div className="flex justify-between">
                          <span className={isDark ? 'text-zinc-400' : 'text-zinc-600'}>Thời gian chạy:</span>
                          <span className={`font-mono ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>
                            {Math.round(agent.runningDurationMs / 1000)}s
                          </span>
                        </div>
                      )}
                      {agent.progress && (
                        <div className="space-y-1 pt-1">
                          <div className="flex justify-between text-[11px]">
                            <span className={isDark ? 'text-zinc-400' : 'text-zinc-600'}>Tiến độ:</span>
                            <span className={`font-mono font-medium ${isDark ? 'text-white' : 'text-zinc-900'}`}>
                              {agent.progress.percent !== null
                                ? `${agent.progress.percent}%`
                                : agent.progress.mode}
                            </span>
                          </div>
                          {agent.progress.percent !== null && (
                            <div className={`w-full rounded-full h-1.5 overflow-hidden ${isDark ? 'bg-zinc-800' : 'bg-zinc-200'}`}>
                              <div
                                className={`h-1.5 rounded-full transition-all duration-300 ${isDark ? 'bg-white' : 'bg-zinc-900'}`}
                                style={{ width: `${agent.progress.percent}%` }}
                              />
                            </div>
                          )}
                          <span className={`text-[10px] block truncate ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`} title={agent.progress.note}>
                            {agent.progress.note}
                          </span>
                        </div>
                      )}
                      {agent.recoveryStatus && (
                        <div className="pt-1 text-[11px] text-amber-500 font-mono">
                          Khởi động lại: {agent.recoveryStatus}
                        </div>
                      )}
                    </div>
                  ) : (
                    <div className={`mt-3 p-3 rounded-lg border text-xs text-center ${
                      isDark
                        ? 'bg-zinc-900/40 border-zinc-800/60 text-zinc-400'
                        : 'bg-zinc-100/70 border-zinc-200/80 text-zinc-600'
                    }`}>
                      Agent chưa có phiên thực thi nào gần đây.
                    </div>
                  )}
                </div>

                <div className={`flex justify-end gap-2 pt-2 border-t ${isDark ? 'border-zinc-800/80' : 'border-zinc-200'}`}>
                  {agent.sessionId && agent.sessionStatus === 'running' && (
                    <button
                      onClick={() => void handleCancelSession(agent.sessionId!)}
                      className="px-2.5 py-1 text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded transition"
                    >
                      Hủy phiên
                    </button>
                  )}
                  {agent.sessionId && (
                    <button
                      onClick={() => {
                        setSelectedSessionId(agent.sessionId);
                        setActiveTab('sessions');
                        void handleSelectSession(agent.sessionId!);
                      }}
                      className={`px-2.5 py-1 text-xs rounded border transition ${
                        isDark
                          ? 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                          : 'bg-white border-zinc-300 text-zinc-800 hover:bg-zinc-100 shadow-xs'
                      }`}
                    >
                      Xem chi tiết
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {liveCards.length === 0 && (
            <div className={`text-center py-12 ${isDark ? 'text-zinc-500' : 'text-zinc-500'}`}>
              Chưa có Agent nào được đăng ký trong hệ thống.
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 2: LIVE CONSOLE STREAM (G2.7)
         ========================================================================= */}
      {activeTab === 'console' && (
        <div className="space-y-3">
          <div className={`flex justify-between items-center rounded-xl p-3 border backdrop-blur-md ${
            isDark ? 'bg-zinc-950/40 border-zinc-800/80' : 'bg-white/60 border-zinc-200/80 shadow-xs'
          }`}>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Tìm kiếm log / output..."
                value={consoleSearch}
                onChange={(e) => setConsoleSearch(e.target.value)}
                className={`border rounded px-2.5 py-1 text-xs w-64 ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500'
                    : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
                }`}
              />
              <select
                value={consoleStreamFilter}
                onChange={(e) => setConsoleStreamFilter(e.target.value as any)}
                className={`border rounded px-2.5 py-1 text-xs ${
                  isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-800'
                }`}
              >
                <option value="all">Toàn bộ luồng (stdout + stderr + events)</option>
                <option value="stdout">Chỉ stdout</option>
                <option value="stderr">Chỉ stderr</option>
                <option value="events">Chỉ Runtime Events</option>
              </select>
            </div>
            <div className="flex items-center gap-2">
              <span className={`text-[11px] px-2 py-1 rounded border ${
                isDark ? 'text-zinc-400 bg-zinc-900 border-zinc-800' : 'text-zinc-600 bg-zinc-100 border-zinc-300'
              }`}>
                Bộ đệm: {filteredConsoleEvents.length} dòng
              </span>
              <button
                onClick={() => setConsolePaused(!consolePaused)}
                className={`px-3 py-1 text-xs rounded border transition ${
                  consolePaused
                    ? 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                    : isDark
                    ? 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                    : 'bg-white border-zinc-300 text-zinc-800 hover:bg-zinc-100 shadow-xs'
                }`}
              >
                {consolePaused ? '▶ Tiếp tục stream' : '⏸ Tạm dừng'}
              </button>
              <button
                onClick={() => setConsoleEvents([])}
                className={`px-3 py-1 text-xs rounded border transition ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-700 text-zinc-300 hover:bg-zinc-800'
                    : 'bg-white border-zinc-300 text-zinc-800 hover:bg-zinc-100 shadow-xs'
                }`}
              >
                Xóa màn hình
              </button>
            </div>
          </div>

          <div className={`rounded-xl p-4 font-mono text-xs h-[520px] overflow-y-auto space-y-1 border backdrop-blur-md ${
            isDark ? 'bg-zinc-950/70 border-zinc-800 text-zinc-300' : 'bg-zinc-950/90 border-zinc-800 text-zinc-200'
          }`}>
            <div className="text-[11px] text-zinc-500 pb-2 border-b border-zinc-800 flex justify-between">
              <span>LIVE CONSOLE STREAM (Bảo mật: Chuỗi nhạy cảm & mã ANSI được lọc tự động; không render HTML)</span>
              <span>Sub: {activeSubscriptionRef.current ?? 'connecting...'}</span>
            </div>

            {filteredConsoleEvents.map((evt) => {
              if (evt.eventType === 'runtime_output') {
                const stream = evt.payload?.stream === 'stderr' ? 'stderr' : 'stdout';
                const text = String(evt.payload?.text ?? '');
                return (
                  <div
                    key={evt.id}
                    className={`leading-relaxed whitespace-pre-wrap break-all ${
                      stream === 'stderr' ? 'text-rose-400' : 'text-zinc-300'
                    }`}
                  >
                    <span className="text-zinc-500 select-none mr-2">
                      [{new Date(evt.createdAt).toLocaleTimeString()}]
                    </span>
                    <span className="text-zinc-400 select-none mr-2">
                      [{stream.toUpperCase()} - {evt.sessionId?.slice(0, 12)}...]
                    </span>
                    <span>{text}</span>
                  </div>
                );
              }

              return (
                <div key={evt.id} className="text-zinc-300 py-0.5 flex items-start gap-2">
                  <span className="text-zinc-500 select-none">
                    [{new Date(evt.createdAt).toLocaleTimeString()}]
                  </span>
                  <span className="text-white font-semibold">{evt.eventType}</span>
                  <span className="text-zinc-400">({evt.sourceType})</span>
                  <span className="text-zinc-400 truncate">{JSON.stringify(evt.payload)}</span>
                  {evt.signature && (
                    <span className="text-emerald-400 text-[10px] ml-auto">[HMAC OK]</span>
                  )}
                </div>
              );
            })}

            {filteredConsoleEvents.length === 0 && (
              <div className="text-zinc-500 text-center py-20">
                Chưa có output nào từ tiến trình Runtime. Khởi chạy một Task để theo dõi trực tiếp.
              </div>
            )}
            <div ref={consoleBottomRef} />
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 3: ACTIVITY TIMELINE (G2.7)
         ========================================================================= */}
      {activeTab === 'activity_timeline' && (
        <div className="space-y-4">
          <div className={`flex justify-between items-center rounded-xl p-3 border backdrop-blur-md ${
            isDark ? 'bg-zinc-950/40 border-zinc-800/80' : 'bg-white/60 border-zinc-200/80 shadow-xs'
          }`}>
            <div className="flex items-center gap-3">
              <input
                type="text"
                placeholder="Lọc sự kiện, Session ID..."
                value={timelineSearch}
                onChange={(e) => setTimelineSearch(e.target.value)}
                className={`border rounded px-2.5 py-1 text-xs w-64 ${
                  isDark
                    ? 'bg-zinc-900 border-zinc-700 text-white placeholder-zinc-500'
                    : 'bg-white border-zinc-300 text-zinc-900 placeholder-zinc-400'
                }`}
              />
              <select
                value={timelineProvenanceFilter}
                onChange={(e) => setTimelineProvenanceFilter(e.target.value)}
                className={`border rounded px-2.5 py-1 text-xs ${
                  isDark ? 'bg-zinc-900 border-zinc-700 text-zinc-300' : 'bg-white border-zinc-300 text-zinc-800'
                }`}
              >
                <option value="all">Toàn bộ Provenance (Nguồn gốc)</option>
                <option value="runtime_observed">runtime_observed</option>
                <option value="studio_recorded">studio_recorded</option>
                <option value="provider_reported">provider_reported</option>
                <option value="filesystem_observed">filesystem_observed</option>
                <option value="external_unattributed">external_unattributed (Xung đột)</option>
              </select>
            </div>
            <span className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Hiển thị {filteredTimelineEvents.length} sự kiện gần nhất
            </span>
          </div>

          <div className={`rounded-xl border overflow-hidden backdrop-blur-md ${
            isDark ? 'bg-zinc-950/40 border-zinc-800/80' : 'bg-white/60 border-zinc-200/80 shadow-xs'
          }`}>
            <table className="w-full text-left text-xs font-mono">
              <thead className={`border-b ${isDark ? 'bg-zinc-900/80 text-zinc-400 border-zinc-800' : 'bg-zinc-100 text-zinc-700 border-zinc-200'}`}>
                <tr>
                  <th className="p-3">SEQ / TIME</th>
                  <th className="p-3">EVENT TYPE</th>
                  <th className="p-3">PROVENANCE</th>
                  <th className="p-3">CONFIDENCE</th>
                  <th className="p-3">SESSION / SOURCE</th>
                  <th className="p-3">SIGNATURE</th>
                  <th className="p-3">PAYLOAD SUMMARY</th>
                </tr>
              </thead>
              <tbody className={`divide-y font-sans ${isDark ? 'divide-zinc-800/60' : 'divide-zinc-200'}`}>
                {filteredTimelineEvents.map((evt) => (
                  <tr key={evt.id} className={isDark ? 'hover:bg-zinc-900/40 transition' : 'hover:bg-zinc-100/50 transition'}>
                    <td className={`p-3 font-mono ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      <div>#{evt.streamSeq}</div>
                      <div className="text-[10px] text-zinc-500">
                        {new Date(evt.createdAt).toLocaleTimeString()}
                      </div>
                    </td>
                    <td className={`p-3 font-mono font-semibold ${isDark ? 'text-white' : 'text-zinc-950'}`}>
                      {evt.eventType}
                    </td>
                    <td className="p-3">{getProvenanceBadge(evt.provenance)}</td>
                    <td className="p-3">{getConfidenceBadge(evt.confidence)}</td>
                    <td className={`p-3 font-mono ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>
                      <div>{evt.sessionId ? evt.sessionId.slice(0, 16) + '...' : '-'}</div>
                      <div className="text-[10px] text-zinc-500">{evt.sourceType}</div>
                    </td>
                    <td className="p-3 font-mono">{getSignatureBadge(evt.signatureStatus)}</td>
                    <td className={`p-3 font-mono text-xs max-w-xs truncate ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`} title={JSON.stringify(evt.payload, null, 2)}>
                      {JSON.stringify(evt.payload)}
                    </td>
                  </tr>
                ))}
                {filteredTimelineEvents.length === 0 && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-zinc-500 font-sans">
                      Không có sự kiện nào khớp với bộ lọc hiện tại.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 4: USAGE & QUOTA TELEMETRY (G2.7)
         ========================================================================= */}
      {activeTab === 'usage_telemetry' && (
        <div className="space-y-4">
          <div className={`p-4 rounded-xl border backdrop-blur-md text-xs space-y-1 ${
            isDark ? 'bg-zinc-950/40 border-zinc-800/80 text-zinc-400' : 'bg-white/60 border-zinc-200/80 text-zinc-600 shadow-xs'
          }`}>
            <p className={`font-semibold ${isDark ? 'text-white' : 'text-zinc-950'}`}>Chính sách đo lường tài nguyên AI minh bạch (Technical Honesty):</p>
            <p>
              - Số token đầu vào/đầu ra chỉ được ghi nhận khi <span className={isDark ? 'text-emerald-400' : 'text-emerald-700'}>Provider báo cáo có cấu trúc</span> qua Runtime Adapter. Không bao giờ ước tính từ độ dài ký tự văn bản.
            </p>
            <p>
              - Quota và Rate Limit hiển thị độc lập cho từng Provider và từng Account; không gộp chung giữa các tài khoản khác nhau.
            </p>
            <p>
              - Chi phí ước tính (estimated_cost_usd) được tính theo bảng giá nội bộ; Provider chưa hỗ trợ chi phí thực tế sẽ gắn nhãn <span className={isDark ? 'text-amber-400' : 'text-amber-700'}>not_reported</span>.
            </p>
          </div>

          <div className="space-y-6">
            {usageRows.map((row) => (
              <div
                key={`${row.providerId}:${row.accountId ?? 'default'}`}
                className={`rounded-xl border overflow-hidden backdrop-blur-md ${
                  isDark ? 'bg-zinc-950/40 border-zinc-800/80' : 'bg-white/60 border-zinc-200/80 shadow-xs'
                }`}
              >
                <div className={`p-4 border-b flex justify-between items-center ${
                  isDark ? 'bg-zinc-950/60 border-zinc-800' : 'bg-white/80 border-zinc-200'
                }`}>
                  <div>
                    <h3 className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-zinc-950'}`}>{row.providerName}</h3>
                    <span className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      Tài khoản: {row.accountName ?? 'Chưa đăng ký Account'}
                    </span>
                  </div>
                  <span className="text-xs font-mono text-zinc-500">ID: {row.providerId}</span>
                </div>

                <div className="p-4 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3">
                  {row.metrics.map((m) => (
                    <div
                      key={m.name}
                      className={`rounded-lg border p-3 text-xs flex flex-col justify-between space-y-2 ${
                        isDark ? 'bg-zinc-900/60 border-zinc-800/80' : 'bg-white/90 border-zinc-200'
                      }`}
                    >
                      <div className="flex justify-between items-start">
                        <span className={`font-mono text-[11px] ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>{m.name}</span>
                        <span
                          className={`text-[10px] px-1.5 py-0.5 rounded font-mono border ${
                            m.status === 'reported'
                              ? isDark ? 'bg-emerald-500/10 text-emerald-400 border-emerald-500/30' : 'bg-emerald-50 text-emerald-800 border-emerald-300'
                              : m.status === 'unsupported'
                              ? isDark ? 'bg-zinc-800 text-zinc-500 border-zinc-700' : 'bg-zinc-100 text-zinc-500 border-zinc-300'
                              : isDark ? 'bg-amber-500/10 text-amber-400 border-amber-500/30' : 'bg-amber-50 text-amber-800 border-amber-300'
                          }`}
                        >
                          {m.status}
                        </span>
                      </div>

                      <div>
                        <span className={`text-lg font-bold font-mono ${isDark ? 'text-white' : 'text-zinc-950'}`}>
                          {m.value !== null ? m.value.toLocaleString() : '—'}
                        </span>
                        {m.isEstimated && (
                          <span className="text-[10px] text-amber-500 ml-1.5">(Ước tính)</span>
                        )}
                      </div>

                      <div className={`text-[10px] border-t pt-1.5 truncate ${isDark ? 'text-zinc-500 border-zinc-800/60' : 'text-zinc-500 border-zinc-200'}`} title={m.note}>
                        {m.note}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ))}

            {usageRows.length === 0 && (
              <div className="text-center py-12 text-zinc-500">
                Chưa có dữ liệu Usage & Quota được ghi nhận.
              </div>
            )}
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 5: SESSIONS (G2.6)
         ========================================================================= */}
      {activeTab === 'sessions' && (
        <div className="space-y-4">
          <div className={`rounded-xl border overflow-hidden backdrop-blur-md ${
            isDark ? 'bg-zinc-950/40 border-zinc-800/80' : 'bg-white/60 border-zinc-200/80 shadow-xs'
          }`}>
            <table className="w-full text-left text-xs">
              <thead className={`border-b font-mono ${isDark ? 'bg-zinc-900/80 text-zinc-400 border-zinc-800' : 'bg-zinc-100 text-zinc-700 border-zinc-200'}`}>
                <tr>
                  <th className="p-3">SESSION ID / STATUS</th>
                  <th className="p-3">TASK</th>
                  <th className="p-3">AGENT & PROVIDER</th>
                  <th className="p-3">ISOLATION MODE</th>
                  <th className="p-3">PID / EXIT</th>
                  <th className="p-3">STARTED</th>
                  <th className="p-3 text-right">HÀNH ĐỘNG</th>
                </tr>
              </thead>
              <tbody className={`divide-y font-sans ${isDark ? 'divide-zinc-800/60' : 'divide-zinc-200'}`}>
                {overview?.sessions.map((sess) => (
                  <tr
                    key={sess.id}
                    onClick={() => handleSelectSession(sess.id)}
                    className={`cursor-pointer transition ${
                      selectedSessionId === sess.id
                        ? isDark ? 'bg-white/10' : 'bg-zinc-200/50'
                        : isDark ? 'hover:bg-zinc-900/40' : 'hover:bg-zinc-100/50'
                    }`}
                  >
                    <td className="p-3">
                      <div className={`font-mono text-xs ${isDark ? 'text-white' : 'text-zinc-950 font-bold'}`}>{sess.id}</div>
                      <div className="mt-1">{getStatusBadge(sess.status)}</div>
                    </td>
                    <td className="p-3">
                      <span className={`font-mono font-medium ${isDark ? 'text-zinc-200' : 'text-zinc-900'}`}>{sess.taskId}</span>
                    </td>
                    <td className="p-3">
                      <div className={isDark ? 'text-zinc-200' : 'text-zinc-900'}>{sess.agentId}</div>
                      <div className="text-zinc-500 text-[11px] font-mono">{sess.providerId}</div>
                    </td>
                    <td className="p-3">
                      <span className={`px-2 py-0.5 rounded font-mono text-[11px] border ${
                        isDark ? 'bg-zinc-800 text-zinc-300 border-zinc-700' : 'bg-zinc-100 text-zinc-800 border-zinc-300'
                      }`}>
                        {sess.isolationMode}
                      </span>
                    </td>
                    <td className="p-3 font-mono">
                      <div className={isDark ? 'text-zinc-300' : 'text-zinc-800'}>PID: {sess.pid ?? '—'}</div>
                      <div className="text-zinc-500 text-[11px]">
                        Exit: {sess.exitCode !== null ? sess.exitCode : '—'}
                      </div>
                    </td>
                    <td className={`p-3 ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
                      {sess.startedAt ? new Date(sess.startedAt).toLocaleTimeString() : '—'}
                    </td>
                    <td className="p-3 text-right">
                      {['running', 'starting', 'waiting_approval'].includes(sess.status) && (
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            void handleCancelSession(sess.id);
                          }}
                          className="px-2.5 py-1 text-xs bg-rose-500/20 hover:bg-rose-500/30 text-rose-300 rounded transition"
                        >
                          Hủy
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
                {(!overview?.sessions || overview.sessions.length === 0) && (
                  <tr>
                    <td colSpan={7} className="p-8 text-center text-zinc-500">
                      Chưa có Runtime Session nào. Hãy bấm <b>+ Dispatch Task</b> để bắt đầu.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Session Detail Drawer */}
          {selectedSessionId && (
            <div className={`rounded-xl p-5 space-y-3 border backdrop-blur-md ${
              isDark ? 'bg-zinc-950/40 border-zinc-800/80' : 'bg-white/60 border-zinc-200/80 shadow-xs'
            }`}>
              <div className="flex justify-between items-center">
                <h3 className={`font-semibold text-sm ${isDark ? 'text-white' : 'text-zinc-950'}`}>
                  Chi tiết sự kiện của Session: <span className="font-mono">{selectedSessionId}</span>
                </h3>
                <button
                  onClick={() => setSelectedSessionId(null)}
                  className={`text-xs ${isDark ? 'text-zinc-400 hover:text-white' : 'text-zinc-500 hover:text-black'}`}
                >
                  Đóng
                </button>
              </div>

              <div className="space-y-2 max-h-72 overflow-y-auto text-xs font-mono">
                {sessionEvents.map((evt) => (
                  <div key={evt.id} className={`p-2.5 rounded border flex items-start gap-3 ${
                    isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-100/70 border-zinc-200'
                  }`}>
                    <span className="text-zinc-500">{new Date(evt.createdAt).toLocaleTimeString()}</span>
                    <span className={`font-semibold ${isDark ? 'text-white' : 'text-black'}`}>{evt.eventType}</span>
                    <span className="text-zinc-400">({evt.sourceType})</span>
                    <span className={`flex-1 truncate ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>{JSON.stringify(evt.payload)}</span>
                    {evt.signature && (
                      <span className="text-emerald-500 text-[10px]" title={evt.signature}>
                        [HMAC OK]
                      </span>
                    )}
                  </div>
                ))}
                {sessionEvents.length === 0 && (
                  <p className="text-zinc-500 text-center py-4">Session này chưa có event nào.</p>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* =========================================================================
          TAB 6: CAPABILITY MATRIX (G2.6)
         ========================================================================= */}
      {activeTab === 'providers' && (
        <div className="space-y-4">
          <div className={`rounded-xl border overflow-hidden backdrop-blur-md ${
            isDark ? 'bg-zinc-950/40 border-zinc-800/80' : 'bg-white/60 border-zinc-200/80 shadow-xs'
          }`}>
            <table className="w-full text-left text-xs">
              <thead className={`border-b font-mono ${isDark ? 'bg-zinc-900/80 text-zinc-400 border-zinc-800' : 'bg-zinc-100 text-zinc-700 border-zinc-200'}`}>
                <tr>
                  <th className="p-3">PROVIDER</th>
                  <th className="p-3">AVAILABILITY</th>
                  <th className="p-3">CLI PATH / VERSION</th>
                  <th className="p-3">CAPABILITIES MATRIX</th>
                  <th className="p-3">CHECKED AT</th>
                </tr>
              </thead>
              <tbody className={`divide-y font-sans ${isDark ? 'divide-zinc-800/60' : 'divide-zinc-200'}`}>
                {overview?.providerStatuses.map((prov) => (
                  <tr key={prov.providerId} className={isDark ? 'hover:bg-zinc-900/40' : 'hover:bg-zinc-100/50'}>
                    <td className="p-3">
                      <div className={`font-semibold ${isDark ? 'text-white' : 'text-zinc-950'}`}>{prov.displayName}</div>
                      <div className="font-mono text-zinc-500 text-[11px]">{prov.providerId}</div>
                    </td>
                    <td className="p-3">{getAvailabilityBadge(prov.availabilityStatus)}</td>
                    <td className="p-3 font-mono text-[11px]">
                      <div className={`truncate max-w-xs ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>{prov.cliPath ?? 'Không có CLI'}</div>
                      <div className="text-zinc-500">{prov.cliVersion ?? 'N/A'}</div>
                    </td>
                    <td className="p-3">
                      <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono">
                        <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-800'}`}>
                          Auth: {prov.capabilities.authStatus}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-800'}`}>
                          Exec: {prov.capabilities.executionStatus}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-800'}`}>
                          Stream: {prov.capabilities.streamingStatus}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-800'}`}>
                          Cancel: {prov.capabilities.cancellationStatus}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-800'}`}>
                          Usage: {prov.capabilities.usageStatus}
                        </span>
                        <span className={`px-1.5 py-0.5 rounded border ${isDark ? 'bg-zinc-900 border-zinc-800 text-zinc-300' : 'bg-zinc-100 border-zinc-200 text-zinc-800'}`}>
                          Quota: {prov.capabilities.quotaStatus}
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-zinc-500 font-mono text-[11px]">
                      {new Date(prov.checkedAt).toLocaleTimeString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* =========================================================================
          TAB 7: LOCKS (G2.6)
         ========================================================================= */}
      {activeTab === 'locks' && (
        <div className={`rounded-xl border overflow-hidden backdrop-blur-md ${
          isDark ? 'bg-zinc-950/40 border-zinc-800/80' : 'bg-white/60 border-zinc-200/80 shadow-xs'
        }`}>
          <table className="w-full text-left text-xs font-mono">
            <thead className={`border-b ${isDark ? 'bg-zinc-900/80 text-zinc-400 border-zinc-800' : 'bg-zinc-100 text-zinc-700 border-zinc-200'}`}>
              <tr>
                <th className="p-3">LOCK ID</th>
                <th className="p-3">SESSION</th>
                <th className="p-3">WORKSPACE</th>
                <th className="p-3">AGENT</th>
                <th className="p-3">LOCK TYPE</th>
                <th className="p-3">RESOURCE PATH</th>
                <th className="p-3">ACQUIRED AT</th>
              </tr>
            </thead>
            <tbody className={`divide-y font-mono ${isDark ? 'divide-zinc-800/60' : 'divide-zinc-200'}`}>
              {overview?.activeLocks.map((lock) => (
                <tr key={lock.id} className={isDark ? 'hover:bg-zinc-900/40' : 'hover:bg-zinc-100/50'}>
                  <td className={`p-3 font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-900'}`}>{lock.id}</td>
                  <td className={`p-3 ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>{lock.sessionId}</td>
                  <td className="p-3 text-zinc-500">{lock.workspaceId}</td>
                  <td className={`p-3 ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>{lock.agentId}</td>
                  <td className="p-3">
                    <span className={`px-2 py-0.5 rounded border ${
                      isDark ? 'bg-amber-500/15 text-amber-300 border-amber-500/30' : 'bg-amber-50 text-amber-800 border-amber-300'
                    }`}>
                      {lock.lockType}
                    </span>
                  </td>
                  <td className={`p-3 ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>{lock.resourcePath}</td>
                  <td className="p-3 text-zinc-500">{new Date(lock.acquiredAt).toLocaleTimeString()}</td>
                </tr>
              ))}
              {(!overview?.activeLocks || overview.activeLocks.length === 0) && (
                <tr>
                  <td colSpan={7} className="p-8 text-center text-zinc-500">
                    Không có khóa tài nguyên nào đang hoạt động. Toàn bộ Workspace đang rảnh rỗi.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* =========================================================================
          TAB 8: LEGACY EVENTS
         ========================================================================= */}
      {activeTab === 'events' && (
        <div className={`rounded-xl p-4 font-mono text-xs space-y-2 max-h-[500px] overflow-y-auto border backdrop-blur-md ${
          isDark ? 'bg-zinc-950/40 border-zinc-800/80' : 'bg-white/60 border-zinc-200/80 shadow-xs'
        }`}>
          {overview?.recentEvents.map((evt) => (
            <div key={evt.id} className={`p-2.5 rounded border flex items-start gap-4 ${
              isDark ? 'bg-zinc-900/60 border-zinc-800' : 'bg-zinc-100/70 border-zinc-200'
            }`}>
              <span className="text-zinc-500">{new Date(evt.createdAt).toLocaleTimeString()}</span>
              <span className={`font-bold ${isDark ? 'text-zinc-200' : 'text-zinc-900'}`}>{evt.sessionId}</span>
              <span className={`font-semibold ${isDark ? 'text-white' : 'text-black'}`}>{evt.eventType}</span>
              <span className="text-zinc-400">[{evt.sourceType}]</span>
              <span className={`flex-1 truncate ${isDark ? 'text-zinc-300' : 'text-zinc-800'}`}>{JSON.stringify(evt.payload)}</span>
              {evt.signature && (
                <span className="text-emerald-500 text-[10px]" title={evt.signature}>
                  [HMAC OK]
                </span>
              )}
            </div>
          ))}
          {(!overview?.recentEvents || overview.recentEvents.length === 0) && (
            <p className="text-zinc-500 text-center py-8">Chưa có sự kiện nào được ghi nhận.</p>
          )}
        </div>
      )}

      {/* =========================================================================
          MODAL DISPATCH TASK
         ========================================================================= */}
      {showDispatchModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className={`rounded-2xl p-6 max-w-md w-full space-y-4 border ${
            isDark ? 'bg-zinc-900 border-zinc-800 text-white' : 'bg-white border-zinc-200 text-zinc-950 shadow-2xl'
          }`}>
            <h3 className={`text-base font-bold ${isDark ? 'text-white' : 'text-zinc-950'}`}>
              Dispatch Task qua Runtime Execution Core
            </h3>
            <p className={`text-xs ${isDark ? 'text-zinc-400' : 'text-zinc-600'}`}>
              Khởi chạy Task với cơ chế kiểm soát quyền và cô lập Workspace thực tế.
            </p>

            <div className="space-y-3 text-xs">
              <div>
                <label className={`block mb-1 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>Chọn Task:</label>
                <select
                  value={selectedTaskId}
                  onChange={(e) => setSelectedTaskId(e.target.value)}
                  className={`w-full rounded-lg p-2 border text-xs ${
                    isDark ? 'bg-zinc-950 border-zinc-700 text-white' : 'bg-zinc-50 border-zinc-300 text-zinc-950'
                  }`}
                >
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.status} - {t.priority})
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className={`block mb-1 ${isDark ? 'text-zinc-300' : 'text-zinc-700'}`}>Chế độ cô lập (Isolation Mode):</label>
                <select
                  value={isolationMode}
                  onChange={(e) => setIsolationMode(e.target.value as RuntimeIsolationMode)}
                  className={`w-full rounded-lg p-2 border text-xs ${
                    isDark ? 'bg-zinc-950 border-zinc-700 text-white' : 'bg-zinc-50 border-zinc-300 text-zinc-950'
                  }`}
                >
                  <option value="restricted">Restricted (Preflight + Enforce Approval + Snapshot)</option>
                  <option value="staging_workspace">Staging Workspace (Thư mục tạm biệt lập)</option>
                  <option value="full_workspace">Full Workspace Bound (Theo WorkspacePathGuard)</option>
                </select>
              </div>
            </div>

            <div className={`flex justify-end gap-3 pt-3 border-t ${isDark ? 'border-zinc-800' : 'border-zinc-200'}`}>
              <button
                onClick={() => setShowDispatchModal(false)}
                className={`px-3 py-1.5 text-xs rounded border transition ${
                  isDark
                    ? 'bg-zinc-800 border-zinc-700 text-zinc-300 hover:bg-zinc-700'
                    : 'bg-zinc-100 border-zinc-300 text-zinc-800 hover:bg-zinc-200'
                }`}
              >
                Hủy
              </button>
              <button
                disabled={isDispatching}
                onClick={() => void handleDispatchTask()}
                className={`px-4 py-1.5 text-xs rounded font-medium disabled:opacity-50 transition ${
                  isDark
                    ? 'bg-white text-black hover:bg-zinc-200'
                    : 'bg-indigo-600 text-white hover:bg-indigo-500'
                }`}
              >
                {isDispatching ? 'Đang khởi chạy...' : 'Xác nhận Dispatch'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
