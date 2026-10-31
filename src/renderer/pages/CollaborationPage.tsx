import React, { useCallback, useEffect, useState } from 'react';
import {
  Users,
  CheckCircle,
  AlertTriangle,
  Clock,
  Play,
  Pause,
  XCircle,
  FileText,
  GitBranch,
  RefreshCw,
  Plus,
  ShieldCheck,
  ShieldAlert,
  HelpCircle,
  Eye,
  Check,
  Layers,
  ArrowRight,
} from 'lucide-react';
import type {
  CollaborationArtifactRecord,
  CollaborationConflictRecord,
  CollaborationMemberRecord,
  CollaborationReviewRecord,
  CollaborationReviewVerdict,
  CollaborationSessionDetailBundle,
  CollaborationSessionRecord,
  CollaborationSessionStatus,
  CollaborationStateTransitionRecord,
  CreateArtifactInput,
  CreateCollaborationSessionInput,
  DecomposeTaskInput,
  ResolveConflictInput,
  SubmitReviewInput,
} from '../../shared/types';

interface CollaborationPageProps {
  readonly isDark?: boolean;
}

export const CollaborationPage: React.FC<CollaborationPageProps> = ({
  isDark = false,
}) => {
  const [sessions, setSessions] = useState<readonly CollaborationSessionRecord[]>([]);
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<CollaborationSessionDetailBundle | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [detailLoading, setDetailLoading] = useState<boolean>(false);
  const [activeTab, setActiveTab] = useState<'overview' | 'agents' | 'artifacts' | 'reviews' | 'decompose'>('overview');
  const [statusBanner, setStatusBanner] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  // Modal States
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [showArtifactModal, setShowArtifactModal] = useState<boolean>(false);
  const [showReviewModal, setShowReviewModal] = useState<boolean>(false);
  const [showResolveModal, setShowResolveModal] = useState<boolean>(false);
  const [selectedConflict, setSelectedConflict] = useState<CollaborationConflictRecord | null>(null);

  // Create Session Form
  const [newParentTaskId, setNewParentTaskId] = useState<string>('');
  const [newTitle, setNewTitle] = useState<string>('');
  const [newObjective, setNewObjective] = useState<string>('');
  const [newPrimaryAgentId, setNewPrimaryAgentId] = useState<string>('');
  const [newReviewerAgentId, setNewReviewerAgentId] = useState<string>('');

  // Create Artifact Form
  const [newRelPath, setNewRelPath] = useState<string>('');
  const [newArtType, setNewArtType] = useState<CreateArtifactInput['artifactType']>('source_code');
  const [newArtProducer, setNewArtProducer] = useState<string>('');
  const [newArtContent, setNewArtContent] = useState<string>('');

  // Submit Review Form
  const [revArtifactId, setRevArtifactId] = useState<string>('');
  const [revVersion, setRevVersion] = useState<number>(1);
  const [revReviewerId, setRevReviewerId] = useState<string>('');
  const [revVerdict, setRevVerdict] = useState<CollaborationReviewVerdict>('approved');
  const [revFindings, setRevFindings] = useState<string>('');
  const [revEvidence, setRevEvidence] = useState<string>('');

  // Resolve Conflict Form
  const [resVersion, setResVersion] = useState<number>(1);
  const [resAction, setResAction] = useState<string>('');

  // Agents & Tasks from system
  const [agents, setAgents] = useState<readonly { id: string; name: string }[]>([]);
  const [tasks, setTasks] = useState<readonly { id: string; title: string }[]>([]);

  const loadSessions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await window.studioApi.getCollaborationSessions();
      if (res.ok && res.data) {
        setSessions(res.data);
        if (!selectedSessionId && res.data.length > 0) {
          setSelectedSessionId(res.data[0].id);
        }
      } else {
        setStatusBanner({ type: 'error', text: res.error?.message ?? 'Lỗi khi tải phiên cộng tác.' });
      }
    } catch (err) {
      setStatusBanner({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi kết nối IPC.' });
    } finally {
      setLoading(false);
    }
  }, [selectedSessionId]);

  const loadDetail = useCallback(async (sessionId: string) => {
    setDetailLoading(true);
    try {
      const res = await window.studioApi.getCollaborationSessionDetail(sessionId);
      if (res.ok && res.data) {
        setDetail(res.data);
      } else {
        setStatusBanner({ type: 'error', text: res.error?.message ?? 'Lỗi khi tải chi tiết phiên.' });
      }
    } catch (err) {
      setStatusBanner({ type: 'error', text: err instanceof Error ? err.message : 'Lỗi kết nối IPC.' });
    } finally {
      setDetailLoading(false);
    }
  }, []);

  const loadInitialData = useCallback(async () => {
    const agRes = await window.studioApi.getAgents();
    if (agRes.ok && agRes.data) {
      setAgents(agRes.data.map((a) => ({ id: a.id, name: a.name })));
    }
    const tkRes = await window.studioApi.getTasks();
    if (tkRes.ok && tkRes.data) {
      setTasks(tkRes.data.map((t) => ({ id: t.id, title: t.title })));
    }
  }, []);

  useEffect(() => {
    void loadSessions();
    void loadInitialData();
  }, [loadSessions, loadInitialData]);

  useEffect(() => {
    if (selectedSessionId) {
      void loadDetail(selectedSessionId);
    }
  }, [selectedSessionId, loadDetail]);

  const handleCreateSession = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newParentTaskId || !newTitle || !newPrimaryAgentId) {
      setStatusBanner({ type: 'error', text: 'Vui lòng điền đầy đủ Parent Task, Title và Primary Agent.' });
      return;
    }
    const input: CreateCollaborationSessionInput = {
      parentTaskId: newParentTaskId,
      title: newTitle,
      objective: newObjective,
      primaryAgentId: newPrimaryAgentId,
      reviewerAgentId: newReviewerAgentId || null,
    };
    const res = await window.studioApi.createCollaborationSession(input);
    if (res.ok && res.data) {
      setStatusBanner({ type: 'success', text: `Đã tạo phiên cộng tác: "${res.data.title}"` });
      setShowCreateModal(false);
      setNewTitle('');
      setNewObjective('');
      await loadSessions();
      setSelectedSessionId(res.data.id);
    } else {
      setStatusBanner({ type: 'error', text: res.error?.message ?? 'Lỗi khi tạo phiên cộng tác.' });
    }
  };

  const handleStateTransition = async (targetStatus: CollaborationSessionStatus, reason?: string) => {
    if (!selectedSessionId) return;
    const res = await window.studioApi.transitionSessionState({
      sessionId: selectedSessionId,
      targetStatus,
      actor: 'owner',
      reason: reason ?? `Owner chuyển trạng thái sang ${targetStatus}`,
    });
    if (res.ok) {
      setStatusBanner({ type: 'success', text: `Đã chuyển phiên sang trạng thái: ${targetStatus}` });
      await loadDetail(selectedSessionId);
      await loadSessions();
    } else {
      setStatusBanner({ type: 'error', text: res.error?.message ?? 'Lỗi khi chuyển trạng thái.' });
    }
  };

  const handlePause = async () => {
    if (!selectedSessionId) return;
    const res = await window.studioApi.pauseCollaborationSession({ sessionId: selectedSessionId });
    if (res.ok) {
      setStatusBanner({ type: 'info', text: 'Phiên cộng tác đã tạm dừng.' });
      await loadDetail(selectedSessionId);
      await loadSessions();
    } else {
      setStatusBanner({ type: 'error', text: res.error?.message ?? 'Lỗi khi tạm dừng phiên.' });
    }
  };

  const handleResume = async () => {
    if (!selectedSessionId) return;
    const res = await window.studioApi.resumeCollaborationSession({ sessionId: selectedSessionId });
    if (res.ok) {
      setStatusBanner({ type: 'success', text: 'Phiên cộng tác đã được tiếp tục.' });
      await loadDetail(selectedSessionId);
      await loadSessions();
    } else {
      setStatusBanner({ type: 'error', text: res.error?.message ?? 'Lỗi khi tiếp tục phiên.' });
    }
  };

  const handleCancel = async () => {
    if (!selectedSessionId) return;
    const res = await window.studioApi.cancelCollaborationSession({ sessionId: selectedSessionId, reason: 'Owner hủy' });
    if (res.ok) {
      setStatusBanner({ type: 'info', text: 'Phiên cộng tác đã bị hủy.' });
      await loadDetail(selectedSessionId);
      await loadSessions();
    } else {
      setStatusBanner({ type: 'error', text: res.error?.message ?? 'Lỗi khi hủy phiên.' });
    }
  };

  const handleCreateArtifact = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionId || !newRelPath || !newArtProducer) return;
    const res = await window.studioApi.createCollaborationArtifact({
      sessionId: selectedSessionId,
      relativePath: newRelPath,
      artifactType: newArtType,
      producerAgentId: newArtProducer,
      content: newArtContent,
    });
    if (res.ok && res.data) {
      setStatusBanner({ type: 'success', text: `Đã tạo Artifact: ${res.data.relativePath} (SHA-256: ${res.data.currentSha256.slice(0, 8)}...)` });
      setShowArtifactModal(false);
      setNewRelPath('');
      setNewArtContent('');
      await loadDetail(selectedSessionId);
    } else {
      setStatusBanner({ type: 'error', text: res.error?.message ?? 'Lỗi khi tạo Artifact.' });
    }
  };

  const handleSubmitReview = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedSessionId || !revArtifactId || !revReviewerId) return;
    const res = await window.studioApi.submitCollaborationReview({
      sessionId: selectedSessionId,
      artifactId: revArtifactId,
      artifactVersion: revVersion,
      reviewerAgentId: revReviewerId,
      verdict: revVerdict,
      findings: revFindings,
      evidence: revEvidence,
    });
    if (res.ok) {
      setStatusBanner({ type: 'success', text: `Đã gửi đánh giá review: ${revVerdict}` });
      setShowReviewModal(false);
      setRevFindings('');
      setRevEvidence('');
      await loadDetail(selectedSessionId);
    } else {
      setStatusBanner({ type: 'error', text: res.error?.message ?? 'Lỗi khi gửi review.' });
    }
  };

  const handleResolveConflict = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedConflict) return;
    const res = await window.studioApi.resolveCollaborationConflict({
      conflictId: selectedConflict.id,
      chosenVersion: resVersion,
      resolutionAction: resAction,
      resolvedBy: 'owner',
    });
    if (res.ok) {
      setStatusBanner({ type: 'success', text: `Đã giải quyết xung đột cho Artifact.` });
      setShowResolveModal(false);
      setSelectedConflict(null);
      setResAction('');
      if (selectedSessionId) await loadDetail(selectedSessionId);
    } else {
      setStatusBanner({ type: 'error', text: res.error?.message ?? 'Lỗi khi giải quyết xung đột.' });
    }
  };

  const getStatusBadge = (status: CollaborationSessionStatus) => {
    const map: Record<CollaborationSessionStatus, { bg: string; text: string; icon: React.ReactNode }> = {
      draft: { bg: 'bg-slate-700/40 text-slate-300 border-slate-600', text: 'Nháp (Draft)', icon: <Clock className="w-3.5 h-3.5 mr-1" /> },
      planning: { bg: 'bg-sky-500/20 text-sky-300 border-sky-500/40', text: 'Đang lập kế hoạch', icon: <Layers className="w-3.5 h-3.5 mr-1" /> },
      awaiting_approval: { bg: 'bg-amber-500/20 text-amber-300 border-amber-500/40', text: 'Chờ duyệt', icon: <ShieldAlert className="w-3.5 h-3.5 mr-1" /> },
      ready: { bg: 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40', text: 'Sẵn sàng', icon: <Check className="w-3.5 h-3.5 mr-1" /> },
      running: { bg: 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40', text: 'Đang chạy', icon: <Play className="w-3.5 h-3.5 mr-1" /> },
      waiting_for_workers: { bg: 'bg-blue-500/20 text-blue-300 border-blue-500/40', text: 'Đang đợi Worker', icon: <Clock className="w-3.5 h-3.5 mr-1" /> },
      reviewing: { bg: 'bg-purple-500/20 text-purple-300 border-purple-500/40', text: 'Đang kiểm duyệt', icon: <Eye className="w-3.5 h-3.5 mr-1" /> },
      revision_requested: { bg: 'bg-orange-500/20 text-orange-300 border-orange-500/40', text: 'Yêu cầu sửa đổi', icon: <AlertTriangle className="w-3.5 h-3.5 mr-1" /> },
      aggregating: { bg: 'bg-teal-500/20 text-teal-300 border-teal-500/40', text: 'Đang tổng hợp', icon: <Layers className="w-3.5 h-3.5 mr-1" /> },
      completed: { bg: 'bg-emerald-600/30 text-emerald-200 border-emerald-500/50', text: 'Hoàn thành', icon: <CheckCircle className="w-3.5 h-3.5 mr-1" /> },
      failed: { bg: 'bg-rose-500/20 text-rose-300 border-rose-500/40', text: 'Thất bại', icon: <XCircle className="w-3.5 h-3.5 mr-1" /> },
      paused: { bg: 'bg-yellow-500/20 text-yellow-300 border-yellow-500/40', text: 'Tạm dừng', icon: <Pause className="w-3.5 h-3.5 mr-1" /> },
      cancelled: { bg: 'bg-slate-600/30 text-slate-400 border-slate-600/40', text: 'Đã hủy', icon: <XCircle className="w-3.5 h-3.5 mr-1" /> },
    };
    const c = map[status] ?? {
      bg: isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200',
      text: status,
      icon: <HelpCircle className="w-3.5 h-3.5 mr-1" />
    };
    return (
      <span className={`inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium border ${c.bg}`}>
        {c.icon}
        {c.text}
      </span>
    );
  };

  const selectedSession = detail?.session ?? sessions.find((s) => s.id === selectedSessionId) ?? null;

  return (
    <div className="space-y-6">
      {/* Top Banner / Alerts */}
      {statusBanner && (
        <div
          className={`p-4 rounded-xl border flex items-center justify-between text-xs ${
            statusBanner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : statusBanner.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-sky-500/10 border-sky-500/30 text-sky-300'
          }`}
        >
          <span>{statusBanner.text}</span>
          <button onClick={() => setStatusBanner(null)} className="text-slate-400 hover:text-white font-bold ml-4">
            ×
          </button>
        </div>
      )}

      {/* Header bar */}
      <div className={`flex flex-col md:flex-row md:items-center justify-between gap-4 pb-4 border-b ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Users className="w-6 h-6 text-indigo-400" />
            Multi-Agent Collaboration & Cross-Agent Workflow
          </h1>
          <p className={`text-xs mt-1 ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
            Điều phối đa tác nhân (Primary, Worker, Reviewer, Observer), trao đổi Artifact bất biến & State Machine 13 trạng thái
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => void loadSessions()}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-medium transition ${
              isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
            }`}
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Làm mới
          </button>
          <button
            onClick={() => setShowCreateModal(true)}
            className="flex items-center gap-1.5 px-3.5 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium transition shadow-lg shadow-indigo-600/20"
          >
            <Plus className="w-4 h-4" />
            Tạo Phiên Cộng Tác Mới
          </button>
        </div>
      </div>

      {/* Main Grid: Left session list, Right detail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Sessions List */}
        <div className="lg:col-span-4 space-y-3">
          <div className="text-xs font-semibold text-slate-400 uppercase tracking-wider px-1">
            Danh sách phiên ({sessions.length})
          </div>

          {loading ? (
            <div className="p-8 text-center text-slate-500 text-xs">Đang tải danh sách phiên...</div>
          ) : sessions.length === 0 ? (
            <div className="p-8 text-center text-slate-500 border border-slate-800/80 rounded-xl bg-slate-900/40 text-xs">
              Chưa có phiên cộng tác nào. Hãy nhấn "Tạo Phiên Cộng Tác Mới".
            </div>
          ) : (
            <div className="space-y-2 max-h-[750px] overflow-y-auto pr-1">
              {sessions.map((s) => {
                const isSelected = s.id === selectedSessionId;
                return (
                  <div
                    key={s.id}
                    onClick={() => setSelectedSessionId(s.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition text-left ${
                      isSelected
                        ? 'border-indigo-500 bg-indigo-950/20 shadow-md shadow-indigo-950/30'
                        : 'border-slate-800 bg-slate-900/60 hover:border-slate-700 hover:bg-slate-900'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-medium text-xs text-slate-100 line-clamp-1">{s.title}</div>
                      {getStatusBadge(s.status)}
                    </div>
                    <div className="mt-2 text-[11px] text-slate-400 line-clamp-1">
                      Task: <span className="text-slate-300">{s.parentTaskTitle ?? s.parentTaskId}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-[10px] text-slate-500">
                      <span>Primary: {s.primaryAgentName ?? s.primaryAgentId}</span>
                      <span>{new Date(s.createdAt).toLocaleDateString('vi-VN')}</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Column: Detail & Controls */}
        <div className="lg:col-span-8">
          {!selectedSession ? (
            <div className="p-12 text-center text-slate-500 border border-slate-800 rounded-xl bg-slate-900/40 text-xs">
              Chọn một phiên cộng tác ở danh sách bên trái để xem chi tiết.
            </div>
          ) : detailLoading && !detail ? (
            <div className="p-12 text-center text-slate-500 text-xs">Đang tải chi tiết phiên...</div>
          ) : (
            <div className="space-y-4">
              {/* Session Overview Card */}
              <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/60 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-lg font-bold text-slate-100">{selectedSession.title}</h2>
                      {getStatusBadge(selectedSession.status)}
                    </div>
                    <p className="text-xs text-slate-400 mt-1">{selectedSession.objective || 'Chưa có mô tả mục tiêu'}</p>
                  </div>
                  {/* Action Controls */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {selectedSession.status === 'running' && (
                      <button
                        onClick={() => void handlePause()}
                        className="px-2.5 py-1 rounded bg-yellow-500/20 hover:bg-yellow-500/30 text-yellow-300 border border-yellow-500/40 text-xs font-medium flex items-center gap-1"
                      >
                        <Pause className="w-3 h-3" /> Tạm dừng
                      </button>
                    )}
                    {selectedSession.status === 'paused' && (
                      <button
                        onClick={() => void handleResume()}
                        className="px-2.5 py-1 rounded bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 text-xs font-medium flex items-center gap-1"
                      >
                        <Play className="w-3 h-3" /> Tiếp tục
                      </button>
                    )}
                    {selectedSession.status !== 'completed' && selectedSession.status !== 'cancelled' && (
                      <button
                        onClick={() => void handleCancel()}
                        className={`px-2.5 py-1 rounded text-xs font-medium flex items-center gap-1 border ${
                          isDark ? 'bg-slate-800 hover:bg-slate-700 text-rose-300 border-slate-700' : 'bg-rose-50 hover:bg-rose-100 text-rose-700 border-rose-200'
                        }`}
                      >
                        <XCircle className="w-3 h-3" /> Hủy
                      </button>
                    )}
                    {selectedSession.status === 'draft' && (
                      <button
                        onClick={() => void handleStateTransition('planning')}
                        className="px-2.5 py-1 rounded bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium flex items-center gap-1"
                      >
                        Bắt đầu lập kế hoạch <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                    {selectedSession.status === 'planning' && (
                      <button
                        onClick={() => void handleStateTransition('ready')}
                        className="px-2.5 py-1 rounded bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-medium flex items-center gap-1"
                      >
                        Sẵn sàng thực thi <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                    {selectedSession.status === 'ready' && (
                      <button
                        onClick={() => void handleStateTransition('running')}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1"
                      >
                        Khởi chạy <Play className="w-3 h-3" />
                      </button>
                    )}
                    {selectedSession.status === 'running' && (
                      <button
                        onClick={() => void handleStateTransition('reviewing')}
                        className="px-2.5 py-1 rounded bg-purple-600 hover:bg-purple-500 text-white text-xs font-medium flex items-center gap-1"
                      >
                        Chuyển sang Review <Eye className="w-3 h-3" />
                      </button>
                    )}
                    {selectedSession.status === 'reviewing' && (
                      <button
                        onClick={() => void handleStateTransition('aggregating')}
                        className="px-2.5 py-1 rounded bg-teal-600 hover:bg-teal-500 text-white text-xs font-medium flex items-center gap-1"
                      >
                        Tổng hợp kết quả <Layers className="w-3 h-3" />
                      </button>
                    )}
                    {selectedSession.status === 'aggregating' && (
                      <button
                        onClick={() => void handleStateTransition('completed')}
                        className="px-2.5 py-1 rounded bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium flex items-center gap-1"
                      >
                        Hoàn thành phiên <CheckCircle className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 pt-2 border-t border-slate-800/80 text-[11px]">
                  <div>
                    <span className="text-slate-500">Parent Task:</span>
                    <div className="font-medium text-slate-300">{selectedSession.parentTaskTitle ?? selectedSession.parentTaskId}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Primary Agent:</span>
                    <div className="font-medium text-indigo-300">{selectedSession.primaryAgentName ?? selectedSession.primaryAgentId}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Reviewer Agent:</span>
                    <div className="font-medium text-purple-300">{selectedSession.reviewerAgentName ?? selectedSession.reviewerAgentId ?? 'Chưa chỉ định'}</div>
                  </div>
                  <div>
                    <span className="text-slate-500">Workspace:</span>
                    <div className="font-medium text-slate-300 truncate" title={selectedSession.workspacePath}>
                      {selectedSession.workspacePath}
                    </div>
                  </div>
                </div>
              </div>

              {/* Navigation Tabs */}
              <div className="flex items-center gap-1 border-b border-slate-800 text-xs">
                <button
                  onClick={() => setActiveTab('overview')}
                  className={`px-3 py-2 font-medium border-b-2 transition ${
                    activeTab === 'overview'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Timeline & Quy trình
                </button>
                <button
                  onClick={() => setActiveTab('agents')}
                  className={`px-3 py-2 font-medium border-b-2 transition ${
                    activeTab === 'agents'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Bảng phân công ({detail?.members.length ?? 0})
                </button>
                <button
                  onClick={() => setActiveTab('artifacts')}
                  className={`px-3 py-2 font-medium border-b-2 transition ${
                    activeTab === 'artifacts'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Lưu trữ Artifact ({detail?.artifacts.length ?? 0})
                </button>
                <button
                  onClick={() => setActiveTab('reviews')}
                  className={`px-3 py-2 font-medium border-b-2 transition ${
                    activeTab === 'reviews'
                      ? 'border-indigo-500 text-indigo-400'
                      : 'border-transparent text-slate-400 hover:text-slate-200'
                  }`}
                >
                  Thẩm định & Xung đột ({detail?.reviews.length ?? 0} / {detail?.conflicts.length ?? 0})
                </button>
              </div>

              {/* Tab Content */}
              {activeTab === 'overview' && (
                <div className="space-y-4">
                  <div className="p-4 rounded-xl border border-slate-800 bg-slate-900/40 space-y-3">
                    <h3 className="text-xs font-semibold text-slate-300 uppercase tracking-wider">
                      Lịch sử chuyển đổi trạng thái (State Machine Audit)
                    </h3>
                    {detail?.transitions && detail.transitions.length > 0 ? (
                      <div className="space-y-2">
                        {detail.transitions.map((tr) => (
                          <div
                            key={tr.id}
                            className="p-2.5 rounded-lg border border-slate-800/80 bg-slate-950/40 flex items-center justify-between text-xs"
                          >
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-slate-400">{tr.fromStatus}</span>
                              <ArrowRight className="w-3 h-3 text-slate-600" />
                              <span className="font-mono font-medium text-indigo-300">{tr.toStatus}</span>
                              <span className="text-slate-500">| Bởi: {tr.actor}</span>
                              {tr.reason && <span className="text-slate-400 italic">({tr.reason})</span>}
                            </div>
                            <span className="text-[10px] text-slate-500">{new Date(tr.transitionedAt).toLocaleTimeString('vi-VN')}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-slate-500 text-xs">Chưa có lịch sử chuyển đổi.</div>
                    )}
                  </div>
                </div>
              )}

              {activeTab === 'agents' && (
                <div className="space-y-3">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {detail?.members.map((m) => (
                      <div key={m.id} className="p-3.5 rounded-xl border border-slate-800 bg-slate-900/50 space-y-2 text-xs">
                        <div className="flex items-center justify-between">
                          <span className="font-bold text-slate-200">{m.agentName ?? m.agentId}</span>
                          <span
                            className={`px-2 py-0.5 rounded text-[10px] font-semibold uppercase ${
                              m.role === 'primary'
                                ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-500/30'
                                : m.role === 'reviewer'
                                ? 'bg-purple-500/20 text-purple-300 border border-purple-500/30'
                                : m.role === 'worker'
                                ? 'bg-blue-500/20 text-blue-300 border border-blue-500/30'
                                : 'bg-slate-700/30 text-slate-400 border border-slate-600/30'
                            }`}
                          >
                            {m.role}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-400 space-y-0.5">
                          <div>Provider: <span className="text-slate-300">{m.providerName ?? m.providerId ?? '—'}</span></div>
                          <div>Tài khoản: <span className="text-slate-300">{m.accountName ?? m.accountId ?? '—'}</span></div>
                          <div>Model: <span className="text-slate-300">{m.modelName ?? m.modelId ?? '—'}</span></div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {activeTab === 'artifacts' && (
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <span className="text-xs font-semibold text-slate-400">Danh sách Artifacts trao đổi</span>
                    <button
                      onClick={() => setShowArtifactModal(true)}
                      className="px-3 py-1 bg-indigo-600 hover:bg-indigo-500 text-white rounded text-xs font-medium flex items-center gap-1"
                    >
                      <Plus className="w-3.5 h-3.5" /> Tạo Artifact Mới
                    </button>
                  </div>

                  {detail?.artifacts && detail.artifacts.length > 0 ? (
                    <div className="space-y-2">
                      {detail.artifacts.map((art) => (
                        <div key={art.id} className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <FileText className="w-4 h-4 text-indigo-400" />
                              <span className="font-mono font-medium text-slate-200">{art.relativePath}</span>
                              <span className={`text-[10px] px-1.5 py-0.5 rounded border ${
                                isDark ? 'bg-slate-800 text-slate-400 border-slate-700' : 'bg-slate-100 text-slate-600 border-slate-200'
                              }`}>
                                v{art.currentVersion}
                              </span>
                            </div>
                            <div className="flex items-center gap-2">
                              {art.conflictStatus === 'conflict_detected' && (
                                <span className="px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40 text-[10px]">
                                  Xung đột phát hiện
                                </span>
                              )}
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-medium border ${
                                  art.validationStatus === 'valid'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                    : 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                }`}
                              >
                                {art.validationStatus}
                              </span>
                            </div>
                          </div>
                          <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-[11px] text-slate-400 pt-1 border-t border-slate-800/80">
                            <div>Producer: <span className="text-slate-300">{art.producerAgentName ?? art.producerAgentId}</span></div>
                            <div>SHA-256: <span className="font-mono text-slate-300">{art.currentSha256.slice(0, 10)}...</span></div>
                            <div>Loại: <span className="text-slate-300">{art.artifactType}</span></div>
                            <div>Dung lượng: <span className="text-slate-300">{art.sizeBytes} B</span></div>
                          </div>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="p-8 text-center text-slate-500 border border-slate-800 rounded-xl bg-slate-900/40 text-xs">
                      Chưa có artifact nào được lưu trong phiên này.
                    </div>
                  )}
                </div>
              )}

              {activeTab === 'reviews' && (
                <div className="space-y-4">
                  {/* Conflicts Section */}
                  {detail?.conflicts && detail.conflicts.length > 0 && (
                    <div className="p-4 rounded-xl border border-amber-500/30 bg-amber-500/5 space-y-3">
                      <div className="flex items-center gap-2 text-amber-300 font-bold text-xs uppercase tracking-wider">
                        <AlertTriangle className="w-4 h-4" />
                        Xung đột thay đổi (Cần Owner phân giải)
                      </div>
                      {detail.conflicts.map((conf) => (
                        <div key={conf.id} className="p-3 rounded-lg border border-amber-500/20 bg-slate-900/80 text-xs space-y-2">
                          <div className="flex items-center justify-between">
                            <span className="font-mono text-slate-200">{conf.artifactRelativePath ?? conf.artifactId}</span>
                            <span className="text-[10px] px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                              {conf.resolutionStatus}
                            </span>
                          </div>
                          <p className="text-[11px] text-slate-400">{conf.conflictReason}</p>
                          <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-800">
                            <div className="text-slate-400">
                              Agent A: {conf.competingAgentAName ?? conf.competingAgentA} (v{conf.versionA}) vs Agent B:{' '}
                              {conf.competingAgentBName ?? conf.competingAgentB} (v{conf.versionB})
                            </div>
                            {conf.resolutionStatus === 'unresolved' && (
                              <button
                                onClick={() => {
                                  setSelectedConflict(conf);
                                  setResVersion(conf.versionA);
                                  setShowResolveModal(true);
                                }}
                                className="px-2.5 py-1 bg-amber-600 hover:bg-amber-500 text-white rounded text-xs font-medium"
                              >
                                Phân giải xung đột
                              </button>
                            )}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Reviews List */}
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <span className="text-xs font-semibold text-slate-400">Đánh giá kiểm định (Review Verdicts)</span>
                      <button
                        onClick={() => setShowReviewModal(true)}
                        className="px-3 py-1 bg-purple-600 hover:bg-purple-500 text-white rounded text-xs font-medium flex items-center gap-1"
                      >
                        <ShieldCheck className="w-3.5 h-3.5" /> Gửi Review Đánh Giá
                      </button>
                    </div>

                    {detail?.reviews && detail.reviews.length > 0 ? (
                      <div className="space-y-2">
                        {detail.reviews.map((rev) => (
                          <div key={rev.id} className="p-3 rounded-xl border border-slate-800 bg-slate-900/60 text-xs space-y-2">
                            <div className="flex items-center justify-between">
                              <div className="font-medium text-slate-200">
                                Reviewer: <span className="text-purple-300">{rev.reviewerAgentName ?? rev.reviewerAgentId}</span>
                              </div>
                              <span
                                className={`px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${
                                  rev.verdict === 'approved'
                                    ? 'bg-emerald-500/20 text-emerald-300 border-emerald-500/30'
                                    : rev.verdict === 'rejected'
                                    ? 'bg-rose-500/20 text-rose-300 border-rose-500/30'
                                    : 'bg-amber-500/20 text-amber-300 border-amber-500/30'
                                }`}
                              >
                                {rev.verdict}
                              </span>
                            </div>
                            <div className="text-[11px] text-slate-300">
                              <span className="text-slate-500">Kết luận:</span> {rev.findings}
                            </div>
                            {rev.evidence && (
                              <div className="text-[10px] text-slate-400 font-mono bg-slate-950 p-2 rounded border border-slate-800">
                                {rev.evidence}
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="p-8 text-center text-slate-500 border border-slate-800 rounded-xl bg-slate-900/40 text-xs">
                        Chưa có đánh giá review nào được ghi nhận.
                      </div>
                    )}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* Modal: Create Session */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100">Tạo Phiên Cộng Tác Mới</h3>
            <form onSubmit={handleCreateSession} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Parent Task *</label>
                <select
                  value={newParentTaskId}
                  onChange={(e) => setNewParentTaskId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  required
                >
                  <option value="">-- Chọn Task cha --</option>
                  {tasks.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.title} ({t.id})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Tiêu đề phiên *</label>
                <input
                  type="text"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="Ví dụ: Tối ưu hoá Physics và Player Animation"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Mục tiêu (Objective)</label>
                <textarea
                  value={newObjective}
                  onChange={(e) => setNewObjective(e.target.value)}
                  rows={2}
                  placeholder="Mô tả mục tiêu của phiên cộng tác..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Primary Agent (Điều phối chính) *</label>
                <select
                  value={newPrimaryAgentId}
                  onChange={(e) => setNewPrimaryAgentId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  required
                >
                  <option value="">-- Chọn Primary Agent --</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.id})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Reviewer Agent (Tùy chọn)</label>
                <select
                  value={newReviewerAgentId}
                  onChange={(e) => setNewReviewerAgentId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                >
                  <option value="">-- Không chỉ định hoặc chọn sau --</option>
                  {agents.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.name} ({a.id})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className={`px-4 py-2 border rounded-lg font-medium ${
                    isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium"
                >
                  Tạo Phiên
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create Artifact */}
      {showArtifactModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100">Tạo Artifact Trao Đổi Mới</h3>
            <form onSubmit={handleCreateArtifact} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Đường dẫn tương đối (Relative Path) *</label>
                <input
                  type="text"
                  value={newRelPath}
                  onChange={(e) => setNewRelPath(e.target.value)}
                  placeholder="Ví dụ: Assets/Scripts/PlayerController.cs"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                  required
                />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Loại Artifact *</label>
                  <select
                    value={newArtType}
                    onChange={(e) => setNewArtType(e.target.value as CreateArtifactInput['artifactType'])}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  >
                    <option value="source_code">Source Code</option>
                    <option value="document">Document</option>
                    <option value="test_result">Test Result</option>
                    <option value="patch_diff">Patch Diff</option>
                    <option value="structured_data">Structured Data</option>
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Producer Agent *</label>
                  <select
                    value={newArtProducer}
                    onChange={(e) => setNewArtProducer(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                    required
                  >
                    <option value="">-- Chọn Agent tạo --</option>
                    {detail?.members.map((m) => (
                      <option key={m.agentId} value={m.agentId}>
                        {m.agentName ?? m.agentId} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Nội dung (Content)</label>
                <textarea
                  value={newArtContent}
                  onChange={(e) => setNewArtContent(e.target.value)}
                  rows={5}
                  placeholder="Nhập nội dung mã nguồn hoặc văn bản..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono text-[11px]"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowArtifactModal(false)}
                  className={`px-4 py-2 border rounded-lg font-medium ${
                    isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium"
                >
                  Lưu Artifact
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Submit Review */}
      {showReviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100">Gửi Đánh Giá Review</h3>
            <form onSubmit={handleSubmitReview} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Artifact cần Review *</label>
                <select
                  value={revArtifactId}
                  onChange={(e) => setRevArtifactId(e.target.value)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                  required
                >
                  <option value="">-- Chọn Artifact --</option>
                  {detail?.artifacts.map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.relativePath} (v{a.currentVersion}) - Tạo bởi {a.producerAgentName ?? a.producerAgentId}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-slate-400 mb-1">Reviewer Agent *</label>
                  <select
                    value={revReviewerId}
                    onChange={(e) => setRevReviewerId(e.target.value)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                    required
                  >
                    <option value="">-- Chọn Reviewer --</option>
                    {detail?.members.map((m) => (
                      <option key={m.agentId} value={m.agentId}>
                        {m.agentName ?? m.agentId} ({m.role})
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-slate-400 mb-1">Phán quyết (Verdict) *</label>
                  <select
                    value={revVerdict}
                    onChange={(e) => setRevVerdict(e.target.value as CollaborationReviewVerdict)}
                    className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  >
                    <option value="approved">Approved (Chấp thuận)</option>
                    <option value="revision_requested">Revision Requested (Yêu cầu sửa đổi)</option>
                    <option value="rejected">Rejected (Từ chối)</option>
                    <option value="blocked">Blocked (Bị chặn)</option>
                    <option value="unable_to_verify">Unable to Verify (Không thể xác minh)</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Nhận xét & Phát hiện (Findings) *</label>
                <textarea
                  value={revFindings}
                  onChange={(e) => setRevFindings(e.target.value)}
                  rows={3}
                  placeholder="Mô tả kết quả kiểm thử, tính hợp lệ hoặc lỗi phát hiện..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  required
                />
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Bằng chứng (Evidence)</label>
                <input
                  type="text"
                  value={revEvidence}
                  onChange={(e) => setRevEvidence(e.target.value)}
                  placeholder="Logs, test output hoặc diff..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200 font-mono"
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowReviewModal(false)}
                  className={`px-4 py-2 border rounded-lg font-medium ${
                    isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-purple-600 hover:bg-purple-500 text-white rounded-lg font-medium"
                >
                  Gửi Review
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Resolve Conflict */}
      {showResolveModal && selectedConflict && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="bg-slate-900 border border-slate-800 rounded-2xl w-full max-w-lg p-6 space-y-4 shadow-2xl">
            <h3 className="text-lg font-bold text-slate-100">Owner Phân Giải Xung Đột</h3>
            <p className="text-xs text-slate-400">
              Artifact: <span className="font-mono text-slate-200">{selectedConflict.artifactRelativePath ?? selectedConflict.artifactId}</span>
            </p>
            <form onSubmit={handleResolveConflict} className="space-y-3 text-xs">
              <div>
                <label className="block text-slate-400 mb-1">Chọn phiên bản giữ lại *</label>
                <div className="space-y-2">
                  <label className="flex items-center gap-2 p-2 rounded border border-slate-800 bg-slate-950 cursor-pointer">
                    <input
                      type="radio"
                      name="chosenVersion"
                      checked={resVersion === selectedConflict.versionA}
                      onChange={() => setResVersion(selectedConflict.versionA)}
                    />
                    <span>
                      Phiên bản v{selectedConflict.versionA} (bởi {selectedConflict.competingAgentAName ?? selectedConflict.competingAgentA}) - SHA: {selectedConflict.sha256A.slice(0, 8)}...
                    </span>
                  </label>
                  <label className="flex items-center gap-2 p-2 rounded border border-slate-800 bg-slate-950 cursor-pointer">
                    <input
                      type="radio"
                      name="chosenVersion"
                      checked={resVersion === selectedConflict.versionB}
                      onChange={() => setResVersion(selectedConflict.versionB)}
                    />
                    <span>
                      Phiên bản v{selectedConflict.versionB} (bởi {selectedConflict.competingAgentBName ?? selectedConflict.competingAgentB}) - SHA: {selectedConflict.sha256B.slice(0, 8)}...
                    </span>
                  </label>
                </div>
              </div>
              <div>
                <label className="block text-slate-400 mb-1">Hành động & Ghi chú phân giải *</label>
                <input
                  type="text"
                  value={resAction}
                  onChange={(e) => setResAction(e.target.value)}
                  placeholder="Ví dụ: Owner chấp nhận thay đổi của Agent B vì đã kiểm thử thành công"
                  className="w-full bg-slate-950 border border-slate-800 rounded-lg p-2 text-slate-200"
                  required
                />
              </div>
              <div className="flex items-center justify-end gap-2 pt-3">
                <button
                  type="button"
                  onClick={() => setShowResolveModal(false)}
                  className={`px-4 py-2 border rounded-lg font-medium ${
                    isDark ? 'border-slate-700 hover:bg-slate-800 text-slate-300' : 'border-slate-200 hover:bg-slate-100 text-slate-700'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white rounded-lg font-medium"
                >
                  Xác Nhận Phân Giải
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

