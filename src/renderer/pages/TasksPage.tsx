import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ListTodo,
  Plus,
  Search,
  Play,
  Pause,
  RotateCcw,
  XCircle,
  Trash2,
  Edit3,
  Users,
  GitBranch,
  ShieldCheck,
  Activity,
  FileOutput,
  CheckCircle2,
  AlertTriangle,
  Clock,
  ArrowRight,
  RefreshCw,
  Cpu,
  Lock,
} from 'lucide-react';
import type {
  AgentRecord,
  AssignmentRole,
  CreateTaskInput,
  OrchestrationRunRecord,
  PermissionCategory,
  PermissionKey,
  ProjectRecord,
  TaskDetailBundle,
  TaskFilterInput,
  TaskLifecycleActionInput,
  TaskPriority,
  TaskRecord,
  TaskStatus,
  TaskType,
  WorkspaceRecord,
} from '../../shared/types';

interface TasksPageProps {
  readonly isDark: boolean;
  readonly onDataChanged: () => void;
}

type TaskDetailTabId =
  | 'overview'
  | 'assignments'
  | 'execution-plan'
  | 'activity'
  | 'output';

type TaskLifecycleAction = TaskLifecycleActionInput['action'];
type DependencyType = 'mandatory' | 'optional';

const PRIORITY_LABELS: Record<TaskPriority, string> = {
  critical: 'Critical',
  high: 'High',
  normal: 'Normal',
  low: 'Low',
};

const STATUS_LABELS: Record<TaskStatus, string> = {
  draft: 'Draft',
  queued: 'Queued',
  assigned: 'Assigned',
  ready: 'Ready (Preflight Passed)',
  running: 'Running',
  waiting_approval: 'Waiting Approval',
  paused: 'Paused',
  completed: 'Completed',
  failed: 'Failed',
  cancelled: 'Cancelled',
};

const TASK_TYPE_OPTIONS: readonly TaskType[] = [
  'general',
  'architecture',
  'code_implementation',
  'unity_2d',
  'review_audit',
  'multi_agent_workflow',
];

const PERMISSION_KEY_OPTIONS: ReadonlyArray<{
  key: PermissionKey;
  category: PermissionCategory;
}> = [
  { key: 'fs.read_file', category: 'filesystem' },
  { key: 'fs.create_file', category: 'filesystem' },
  { key: 'fs.modify_file', category: 'filesystem' },
  { key: 'fs.delete_file', category: 'filesystem' },
  { key: 'fs.access_outside_workspace', category: 'filesystem' },
  { key: 'shell.run_command', category: 'shell' },
  { key: 'shell.powershell', category: 'shell' },
  { key: 'shell.package_manager', category: 'shell' },
  { key: 'shell.unity_cli', category: 'shell' },
  { key: 'git.read_status_diff', category: 'git' },
  { key: 'git.create_branch', category: 'git' },
  { key: 'git.commit', category: 'git' },
  { key: 'git.push', category: 'git' },
  { key: 'git.merge', category: 'git' },
  { key: 'net.localhost_access', category: 'network' },
  { key: 'net.internet_access', category: 'network' },
  { key: 'app.launch', category: 'application' },
  { key: 'app.control_ui', category: 'application' },
  { key: 'cc.screen_capture', category: 'computer_control' },
  { key: 'cc.full_desktop_control', category: 'computer_control' },
];

export const TasksPage: React.FC<TasksPageProps> = ({ isDark, onDataChanged }) => {
  const [tasks, setTasks] = useState<readonly TaskRecord[]>([]);
  const [agents, setAgents] = useState<readonly AgentRecord[]>([]);
  const [projects, setProjects] = useState<readonly ProjectRecord[]>([]);
  const [workspaces, setWorkspaces] = useState<readonly WorkspaceRecord[]>([]);
  const [selectedTaskId, setSelectedTaskId] = useState<string | null>(null);
  const [taskDetail, setTaskDetail] = useState<TaskDetailBundle | null>(null);
  const [activeTab, setActiveTab] = useState<TaskDetailTabId>('overview');

  // Filter & Sort state
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [statusFilter, setStatusFilter] = useState<TaskStatus | 'all'>('all');
  const [priorityFilter, setPriorityFilter] = useState<TaskPriority | 'all'>('all');
  const [agentFilter, setAgentFilter] = useState<string>('all');
  const [sortBy, setSortBy] = useState<'updated_at' | 'created_at' | 'priority'>('updated_at');
  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('desc');

  // Feedback banner
  const [bannerMessage, setBannerMessage] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(false);

  // Create Task Modal state
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newTitle, setNewTitle] = useState<string>('');
  const [newDescription, setNewDescription] = useState<string>('');
  const [newTaskType, setNewTaskType] = useState<TaskType>('general');
  const [newPriority, setNewPriority] = useState<TaskPriority>('normal');
  const [newProjectId, setNewProjectId] = useState<string>('');
  const [newWorkspaceId, setNewWorkspaceId] = useState<string>('ws-studio-root');
  const [newWorkspacePath, setNewWorkspacePath] = useState<string>('C:\\AI-Studio');
  const [newAllowMultiAgent, setNewAllowMultiAgent] = useState<boolean>(true);

  // Edit Task state
  const [isEditingTask, setIsEditingTask] = useState<boolean>(false);
  const [editTitle, setEditTitle] = useState<string>('');
  const [editDescription, setEditDescription] = useState<string>('');
  const [editTaskType, setEditTaskType] = useState<TaskType>('general');
  const [editPriority, setEditPriority] = useState<TaskPriority>('normal');
  const [editWorkspacePath, setEditWorkspacePath] = useState<string>('');
  const [editAllowMultiAgent, setEditAllowMultiAgent] = useState<boolean>(true);
  const [confirmDeleteTaskId, setConfirmDeleteTaskId] = useState<string | null>(null);

  // Assignment form state
  const [assignAgentId, setAssignAgentId] = useState<string>('');
  const [assignRole, setAssignRole] = useState<AssignmentRole>('primary');
  const [assignOrder, setAssignOrder] = useState<number>(1);
  const [assignReason, setAssignReason] = useState<string>('');
  const [reassignTargetMap, setReassignTargetMap] = useState<Record<string, string>>({});

  // Dependency form state
  const [dependsOnTaskId, setDependsOnTaskId] = useState<string>('');
  const [dependencyType, setDependencyType] = useState<DependencyType>('mandatory');

  // Execution Step form state
  const [stepOrder, setStepOrder] = useState<number>(1);
  const [stepTitle, setStepTitle] = useState<string>('');
  const [stepDescription, setStepDescription] = useState<string>('');
  const [stepAssignmentId, setStepAssignmentId] = useState<string>('');
  const [stepPermissionKey, setStepPermissionKey] = useState<PermissionKey>(
    'fs.read_file'
  );
  const [stepTargetResource, setStepTargetResource] = useState<string>(
    'C:\\AI-Studio\\projects'
  );

  // Latest orchestration run feedback
  const [lastOrchestrationResult, setLastOrchestrationResult] =
    useState<OrchestrationRunRecord | null>(null);

  const loadTasksAndAgents = useCallback(async () => {
    setLoading(true);
    try {
      const filter: TaskFilterInput = {
        search: searchQuery.trim() || undefined,
        status: statusFilter,
        priority: priorityFilter,
        agentId: agentFilter !== 'all' ? agentFilter : undefined,
        sortBy,
        sortOrder,
      };
      const [tasksRes, agentsRes, projRes, wsRes] = await Promise.all([
        window.studioApi.getTasks(filter),
        window.studioApi.getAgents(),
        window.studioApi.getProjects(),
        window.studioApi.getWorkspaces(),
      ]);

      if (projRes.ok && projRes.data) {
        setProjects(projRes.data);
      }
      if (wsRes.ok && wsRes.data) {
        setWorkspaces(wsRes.data);
      }

      if (tasksRes.ok && tasksRes.data) {
        setTasks(tasksRes.data);
        if (!selectedTaskId && tasksRes.data.length > 0) {
          setSelectedTaskId(tasksRes.data[0].id);
        }
      }
      if (agentsRes.ok && agentsRes.data) {
        setAgents(agentsRes.data);
        if (!assignAgentId && agentsRes.data.length > 0) {
          setAssignAgentId(agentsRes.data[0].id);
        }
      }
    } finally {
      setLoading(false);
    }
  }, [
    searchQuery,
    statusFilter,
    priorityFilter,
    agentFilter,
    sortBy,
    sortOrder,
    selectedTaskId,
    assignAgentId,
  ]);

  const applyDetailBundle = useCallback((bundle: TaskDetailBundle) => {
    setTaskDetail(bundle);
    setLastOrchestrationResult(bundle.orchestrationRuns[0] ?? null);
    setEditTitle(bundle.task.title);
    setEditDescription(bundle.task.description);
    setEditTaskType(bundle.task.taskType);
    setEditPriority(bundle.task.priority);
    setEditWorkspacePath(bundle.task.workspacePath);
    setEditAllowMultiAgent(bundle.task.allowMultiAgent);
    setStepOrder((bundle.executionSteps.length || 0) + 1);
  }, []);

  const loadSelectedTaskDetail = useCallback(
    async (taskId: string | null) => {
      if (!taskId) {
        setTaskDetail(null);
        return;
      }
      const res = await window.studioApi.getTaskDetail(taskId);
      if (res.ok && res.data) {
        applyDetailBundle(res.data);
      } else {
        setTaskDetail(null);
      }
    },
    [applyDetailBundle]
  );

  useEffect(() => {
    void loadTasksAndAgents();
  }, [loadTasksAndAgents]);

  useEffect(() => {
    void loadSelectedTaskDetail(selectedTaskId);
  }, [selectedTaskId, loadSelectedTaskDetail]);

  const refreshAll = async (keepTaskId?: string | null) => {
    await loadTasksAndAgents();
    const targetId = keepTaskId !== undefined ? keepTaskId : selectedTaskId;
    await loadSelectedTaskDetail(targetId ?? null);
    onDataChanged();
  };

  // Handlers
  const handleCreateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: CreateTaskInput = {
      title: newTitle,
      description: newDescription,
      taskType: newTaskType,
      priority: newPriority,
      projectId: newProjectId || null,
      workspaceId: newWorkspaceId || null,
      workspacePath: newWorkspacePath,
      allowMultiAgent: newAllowMultiAgent,
    };
    const res = await window.studioApi.createTask(input);
    if (res.ok && res.data) {
      setBannerMessage({
        type: 'success',
        text: `Đã tạo Task '${res.data.title}' (${res.data.id}) ở trạng thái Draft.`,
      });
      setShowCreateModal(false);
      setNewTitle('');
      setNewDescription('');
      setSelectedTaskId(res.data.id);
      await refreshAll(res.data.id);
    } else {
      setBannerMessage({
        type: 'error',
        text: res.error?.message ?? 'Không thể tạo Task.',
      });
    }
  };

  const handleUpdateTask = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskDetail) return;
    const res = await window.studioApi.updateTask({
      id: taskDetail.task.id,
      title: editTitle,
      description: editDescription,
      taskType: editTaskType,
      priority: editPriority,
      workspacePath: editWorkspacePath,
      allowMultiAgent: editAllowMultiAgent,
    });
    if (res.ok && res.data) {
      setBannerMessage({
        type: 'success',
        text: `Đã cập nhật thông tin Task '${res.data.title}'.`,
      });
      setIsEditingTask(false);
      await refreshAll(res.data.id);
    } else {
      setBannerMessage({
        type: 'error',
        text: res.error?.message ?? 'Lỗi cập nhật Task.',
      });
    }
  };

  const handleDeleteTask = async (taskId: string) => {
    const res = await window.studioApi.deleteTask(taskId);
    if (res.ok) {
      setBannerMessage({
        type: 'info',
        text: `Đã xóa Task '${taskId}'.`,
      });
      setConfirmDeleteTaskId(null);
      setSelectedTaskId(null);
      await refreshAll(null);
    } else {
      setBannerMessage({
        type: 'error',
        text: res.error?.message ?? 'Không thể xóa Task.',
      });
    }
  };

  const handleLifecycleAction = async (
    action: TaskLifecycleAction,
    reason?: string
  ) => {
    if (!taskDetail) return;
    const res = await window.studioApi.performTaskLifecycleAction({
      taskId: taskDetail.task.id,
      action,
      reason,
    });
    if (res.ok && res.data) {
      applyDetailBundle(res.data);
      setBannerMessage({
        type: 'success',
        text: `Đã chuyển trạng thái Task '${res.data.task.title}' -> ${res.data.task.status.toUpperCase()}.`,
      });
      await refreshAll(res.data.task.id);
    } else {
      setBannerMessage({
        type: 'error',
        text: res.error?.message ?? 'Chuyển trạng thái không hợp lệ.',
      });
    }
  };

  const handleRunOrchestration = async (taskId: string) => {
    const res = await window.studioApi.runTaskOrchestration({ taskId });
    if (res.ok && res.data) {
      if (res.data.detail) {
        applyDetailBundle(res.data.detail);
      }
      const statusText = res.data.detail?.task.status ?? 'evaluated';
      setBannerMessage({
        type: res.data.readyCount > 0 ? 'success' : 'info',
        text: `Đã chạy 10-Step Orchestration Pipeline cho Task '${taskId}' -> Trạng thái: ${statusText.toUpperCase()} (Ready: ${res.data.readyCount}, Blocked: ${res.data.blockedCount}, Waiting Approval: ${res.data.waitingApprovalCount}).`,
      });
      setSelectedTaskId(taskId);
      await refreshAll(taskId);
    } else {
      setBannerMessage({
        type: 'error',
        text: res.error?.message ?? 'Lỗi chạy Orchestration Pipeline.',
      });
    }
  };

  const handleAssignAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskDetail || !assignAgentId) return;
    const res = await window.studioApi.assignAgentToTask({
      taskId: taskDetail.task.id,
      agentId: assignAgentId,
      role: assignRole,
      executionOrder: assignOrder,
      reason: assignReason,
    });
    if (res.ok && res.data) {
      applyDetailBundle(res.data);
      setBannerMessage({
        type: 'success',
        text: `Đã phân công Agent vào Task '${res.data.task.title}' với vai trò ${assignRole.toUpperCase()}.`,
      });
      setAssignReason('');
      await refreshAll(taskDetail.task.id);
    } else {
      setBannerMessage({
        type: 'error',
        text: res.error?.message ?? 'Không thể phân công Agent.',
      });
    }
  };

  const handleRevokeAssignment = async (assignmentId: string) => {
    if (!taskDetail) return;
    const res = await window.studioApi.revokeTaskAssignment({
      assignmentId,
      reason: 'Owner thu hồi phân công trên Task Hub',
    });
    if (res.ok && res.data) {
      applyDetailBundle(res.data);
      setBannerMessage({
        type: 'info',
        text: `Đã thu hồi phân công '${assignmentId}' (lịch sử vẫn được bảo toàn).`,
      });
      await refreshAll(taskDetail.task.id);
    } else {
      setBannerMessage({
        type: 'error',
        text: res.error?.message ?? 'Không thể thu hồi phân công.',
      });
    }
  };

  const handleReassignAgent = async (assignmentId: string) => {
    if (!taskDetail) return;
    const newAgentId = reassignTargetMap[assignmentId];
    if (!newAgentId) return;
    const res = await window.studioApi.reassignTaskAgent({
      assignmentId,
      newAgentId,
      reason: 'Owner thay đổi Agent phụ trách trên Task Hub',
    });
    if (res.ok && res.data) {
      applyDetailBundle(res.data);
      setBannerMessage({
        type: 'success',
        text: `Đã chuyển phân công sang Agent mới thành công.`,
      });
      await refreshAll(taskDetail.task.id);
    } else {
      setBannerMessage({
        type: 'error',
        text: res.error?.message ?? 'Không thể chuyển Agent.',
      });
    }
  };

  const handleAddDependency = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskDetail || !dependsOnTaskId) return;
    const res = await window.studioApi.addTaskDependency({
      taskId: taskDetail.task.id,
      dependsOnTaskId,
      dependencyType,
    });
    if (res.ok && res.data) {
      applyDetailBundle(res.data);
      setBannerMessage({
        type: 'success',
        text: `Đã thêm Dependency DAG thành công.`,
      });
      setDependsOnTaskId('');
      await refreshAll(taskDetail.task.id);
    } else {
      setBannerMessage({
        type: 'error',
        text:
          res.error?.message ??
          'Không thể thêm Dependency (kiểm tra chu trình DAG).',
      });
    }
  };

  const handleRemoveDependency = async (dependencyId: string) => {
    if (!taskDetail) return;
    const res = await window.studioApi.removeTaskDependency(dependencyId);
    if (res.ok && res.data) {
      applyDetailBundle(res.data);
      setBannerMessage({
        type: 'info',
        text: 'Đã gỡ Dependency khỏi Task.',
      });
      await refreshAll(taskDetail.task.id);
    } else {
      setBannerMessage({
        type: 'error',
        text: res.error?.message ?? 'Không thể gỡ Dependency.',
      });
    }
  };

  const handleAddExecutionStep = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!taskDetail) return;
    const permOption =
      PERMISSION_KEY_OPTIONS.find((p) => p.key === stepPermissionKey) ??
      PERMISSION_KEY_OPTIONS[0];

    const res = await window.studioApi.addTaskExecutionStep({
      taskId: taskDetail.task.id,
      assignmentId: stepAssignmentId || null,
      stepOrder,
      stepKey: `step-${stepOrder}`,
      title: stepTitle,
      description: stepDescription,
      requiredPermissionCategory: permOption.category,
      requiredPermissionKey: permOption.key,
      targetResource: stepTargetResource,
    });
    if (res.ok && res.data) {
      applyDetailBundle(res.data);
      setBannerMessage({
        type: 'success',
        text: `Đã thêm bước thực thi #${stepOrder}: '${stepTitle}'.`,
      });
      setStepTitle('');
      setStepDescription('');
      await refreshAll(taskDetail.task.id);
    } else {
      setBannerMessage({
        type: 'error',
        text: res.error?.message ?? 'Không thể thêm bước thực thi.',
      });
    }
  };

  const handleDeleteExecutionStep = async (stepId: string) => {
    if (!taskDetail) return;
    const res = await window.studioApi.deleteTaskExecutionStep(stepId);
    if (res.ok && res.data) {
      applyDetailBundle(res.data);
      setBannerMessage({
        type: 'info',
        text: 'Đã xóa bước thực thi.',
      });
      await refreshAll(taskDetail.task.id);
    } else {
      setBannerMessage({
        type: 'error',
        text: res.error?.message ?? 'Không thể xóa bước thực thi.',
      });
    }
  };

  const availableDependencyTargets = useMemo(() => {
    if (!taskDetail) return [];
    const existingIds = new Set(
      taskDetail.dependencies.map((d) => d.dependsOnTaskId)
    );
    return tasks.filter(
      (t) => t.id !== taskDetail.task.id && !existingIds.has(t.id)
    );
  }, [tasks, taskDetail]);

  const getPriorityBadgeClass = (priority: TaskPriority) => {
    switch (priority) {
      case 'critical':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      case 'high':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'normal':
        return 'bg-indigo-500/20 text-indigo-300 border-indigo-500/40';
      case 'low':
        return 'bg-slate-700/60 text-slate-300 border-slate-600';
    }
  };

  const getStatusBadgeClass = (status: TaskStatus) => {
    switch (status) {
      case 'ready':
      case 'completed':
        return 'bg-emerald-500/20 text-emerald-300 border-emerald-500/40';
      case 'queued':
      case 'assigned':
      case 'running':
        return 'bg-sky-500/20 text-sky-300 border-sky-500/40';
      case 'waiting_approval':
      case 'paused':
        return 'bg-amber-500/20 text-amber-300 border-amber-500/40';
      case 'failed':
      case 'cancelled':
        return 'bg-rose-500/20 text-rose-300 border-rose-500/40';
      default:
        return isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6" data-testid="tasks-page">
      {/* Header & Runtime Notice */}
      <div
        className={`rounded-2xl border p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4 ${
          isDark
            ? 'bg-slate-900/80 border-slate-800/90'
            : 'bg-white border-slate-200 shadow-xs'
        }`}
      >
        <div>
          <div className="flex items-center gap-2.5">
            <ListTodo className="w-5 h-5 text-indigo-400" />
            <h1 className="text-lg font-bold tracking-tight">
              Task Hub, Multi-Agent Assignment & Orchestration (G2.4)
            </h1>
            <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30">
              Runtime: Standby (G2.6 Pending)
            </span>
          </div>
          <p
            className={`mt-1 text-xs ${
              isDark ? 'text-slate-400' : 'text-slate-600'
            }`}
          >
            Quản lý vòng đời Task, phân công đa Agent (Primary / Worker / Reviewer),
            kiểm tra đồ thị phụ thuộc DAG và thực thi 10 bước Preflight cùng Permission Engine.
            Không giả lập tiến trình đang chạy hoặc hoàn thành giả khi chưa kết nối Runtime G2.6.
          </p>
        </div>

        <div className="flex items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => void refreshAll()}
            className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl border text-xs font-medium transition-colors ${
              isDark
                ? 'bg-slate-800/80 border-slate-700 text-slate-200 hover:bg-slate-800'
                : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
            }`}
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Làm mới</span>
          </button>

          <button
            type="button"
            data-testid="btn-open-create-task"
            onClick={() => setShowCreateModal(true)}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-sm transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Tạo Task mới</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {bannerMessage && (
        <div
          className={`p-3.5 rounded-xl border text-xs flex items-center justify-between ${
            bannerMessage.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-300'
              : bannerMessage.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-300'
              : 'bg-indigo-500/10 border-indigo-500/30 text-indigo-300'
          }`}
        >
          <span>{bannerMessage.text}</span>
          <button
            type="button"
            onClick={() => setBannerMessage(null)}
            className="text-[11px] underline ml-4 opacity-80 hover:opacity-100"
          >
            Đóng
          </button>
        </div>
      )}

      {/* Search, Filter & Sort Controls */}
      <div
        className={`rounded-2xl border p-4 grid grid-cols-1 md:grid-cols-6 gap-3 ${
          isDark
            ? 'bg-slate-900/70 border-slate-800/80'
            : 'bg-white border-slate-200'
        }`}
      >
        <div className="md:col-span-2 relative">
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Tìm kiếm Task theo tiêu đề hoặc mô tả..."
            className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-100'
                : 'bg-slate-50 border-slate-300 text-slate-900'
            }`}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value as TaskStatus | 'all')}
          aria-label="Lọc theo trạng thái"
          className={`px-3 py-2 rounded-xl border text-xs ${
            isDark
              ? 'bg-slate-950 border-slate-800 text-slate-200'
              : 'bg-slate-50 border-slate-300 text-slate-800'
          }`}
        >
          <option value="all">Tất cả trạng thái</option>
          {Object.entries(STATUS_LABELS).map(([k, v]) => (
            <option key={k} value={k}>
              {v}
            </option>
          ))}
        </select>

        <select
          value={priorityFilter}
          onChange={(e) =>
            setPriorityFilter(e.target.value as TaskPriority | 'all')
          }
          aria-label="Lọc theo mức độ ưu tiên"
          className={`px-3 py-2 rounded-xl border text-xs ${
            isDark
              ? 'bg-slate-950 border-slate-800 text-slate-200'
              : 'bg-slate-50 border-slate-300 text-slate-800'
          }`}
        >
          <option value="all">Tất cả mức ưu tiên</option>
          <option value="critical">Critical</option>
          <option value="high">High</option>
          <option value="normal">Normal</option>
          <option value="low">Low</option>
        </select>

        <select
          value={agentFilter}
          onChange={(e) => setAgentFilter(e.target.value)}
          aria-label="Lọc theo Agent"
          className={`px-3 py-2 rounded-xl border text-xs ${
            isDark
              ? 'bg-slate-950 border-slate-800 text-slate-200'
              : 'bg-slate-50 border-slate-300 text-slate-800'
          }`}
        >
          <option value="all">Tất cả Agent</option>
          {agents.map((ag) => (
            <option key={ag.id} value={ag.id}>
              {ag.name}
            </option>
          ))}
        </select>

        <div className="flex items-center gap-1.5">
          <select
            value={sortBy}
            onChange={(e) =>
              setSortBy(
                e.target.value as 'updated_at' | 'created_at' | 'priority'
              )
            }
            aria-label="Sắp xếp theo"
            className={`flex-1 px-2.5 py-2 rounded-xl border text-xs ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-200'
                : 'bg-slate-50 border-slate-300 text-slate-800'
            }`}
          >
            <option value="updated_at">Cập nhật</option>
            <option value="created_at">Ngày tạo</option>
            <option value="priority">Ưu tiên</option>
          </select>
          <button
            type="button"
            onClick={() =>
              setSortOrder((prev) => (prev === 'desc' ? 'asc' : 'desc'))
            }
            className={`px-2.5 py-2 rounded-xl border text-xs font-mono ${
              isDark
                ? 'bg-slate-950 border-slate-800 text-slate-300'
                : 'bg-slate-50 border-slate-300 text-slate-700'
            }`}
          >
            {sortOrder.toUpperCase()}
          </button>
        </div>
      </div>

      {/* Main Split Grid: Task List (Left 5 cols) + Task Detail 5 Tabs (Right 7 cols) */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Task List */}
        <div
          className={`lg:col-span-5 rounded-2xl border flex flex-col ${
            isDark
              ? 'bg-slate-900/80 border-slate-800/90'
              : 'bg-white border-slate-200'
          }`}
        >
          <div
            className={`px-4 py-3.5 border-b flex items-center justify-between ${
              isDark ? 'border-slate-800' : 'border-slate-200'
            }`}
          >
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-400">
              Danh sách Task ({tasks.length})
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              SQLite State Machine
            </span>
          </div>

          <div className="p-3 space-y-2.5 max-h-[680px] overflow-y-auto">
            {tasks.length === 0 ? (
              <div className="p-8 text-center text-xs text-slate-400">
                Chưa có Task nào khớp với bộ lọc hiện tại. Nhấn{' '}
                <strong>Tạo Task mới</strong> để bắt đầu điều phối.
              </div>
            ) : (
              tasks.map((task) => {
                const isSelected = task.id === selectedTaskId;
                return (
                  <div
                    key={task.id}
                    data-testid={`task-item-${task.id}`}
                    onClick={() => setSelectedTaskId(task.id)}
                    className={`p-3.5 rounded-xl border cursor-pointer transition-all ${
                      isSelected
                        ? isDark
                          ? 'bg-indigo-950/30 border-indigo-500/50'
                          : 'bg-indigo-50 border-indigo-300'
                        : isDark
                        ? 'bg-slate-950/60 border-slate-800/80 hover:border-slate-700'
                        : 'bg-slate-50 border-slate-200 hover:border-slate-300'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <div className="font-semibold text-sm truncate">
                          {task.title}
                        </div>
                        <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                          {task.id} • {task.taskType}
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border shrink-0 ${getPriorityBadgeClass(
                          task.priority
                        )}`}
                      >
                        {PRIORITY_LABELS[task.priority]}
                      </span>
                    </div>

                    {task.description && (
                      <p className="mt-1.5 text-xs text-slate-400 line-clamp-2">
                        {task.description}
                      </p>
                    )}

                    <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-1.5">
                        <span
                          className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${getStatusBadgeClass(
                            task.status
                          )}`}
                        >
                          {task.status}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          isDark ? 'bg-slate-800/90 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          Agents: {task.activeAssignmentCount ?? 0}
                        </span>
                        <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                          isDark ? 'bg-slate-800/90 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          Deps: {task.dependencyCount ?? 0}
                        </span>
                      </div>

                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          void handleRunOrchestration(task.id);
                        }}
                        className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-indigo-600/20 hover:bg-indigo-600/30 text-indigo-300 border border-indigo-500/30 text-[11px] font-medium"
                      >
                        <Play className="w-3 h-3" />
                        <span>Preflight</span>
                      </button>
                    </div>

                    {task.blockedReason && (
                      <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[11px] text-amber-300 flex items-start gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                        <span className="line-clamp-2">{task.blockedReason}</span>
                      </div>
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Task Detail 5 Tabs */}
        <div
          className={`lg:col-span-7 rounded-2xl border flex flex-col ${
            isDark
              ? 'bg-slate-900/80 border-slate-800/90'
              : 'bg-white border-slate-200'
          }`}
        >
          {!taskDetail ? (
            <div className="p-12 text-center text-xs text-slate-400">
              Chọn một Task ở danh sách bên trái để xem chi tiết Overview,
              Assignments, Execution Plan (DAG & 10-step Pipeline), Activity và
              Output.
            </div>
          ) : (
            <>
              {/* Task Detail Header */}
              <div
                className={`p-4 border-b flex flex-wrap items-center justify-between gap-3 ${
                  isDark ? 'border-slate-800' : 'border-slate-200'
                }`}
              >
                <div>
                  <div className="flex items-center gap-2">
                    <h2 className="text-base font-bold">{taskDetail.task.title}</h2>
                    <span
                      className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded border ${getStatusBadgeClass(
                        taskDetail.task.status
                      )}`}
                    >
                      {taskDetail.task.status}
                    </span>
                  </div>
                  <div className="text-[11px] font-mono text-slate-400 mt-0.5">
                    ID: {taskDetail.task.id} • Workspace:{' '}
                    {taskDetail.task.workspacePath}
                  </div>
                </div>

                <button
                  type="button"
                  data-testid="btn-run-orchestration"
                  onClick={() => void handleRunOrchestration(taskDetail.task.id)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-xs"
                >
                  <Play className="w-3.5 h-3.5" />
                  <span>Chạy 10-Step Orchestration</span>
                </button>
              </div>

              {/* 5 Navigation Tabs */}
              <div
                className={`px-4 pt-2 border-b flex items-center gap-1 overflow-x-auto ${
                  isDark ? 'border-slate-800' : 'border-slate-200'
                }`}
              >
                {[
                  { id: 'overview', label: 'Tổng quan', icon: ListTodo },
                  {
                    id: 'assignments',
                    label: `Phân công Agent (${taskDetail.assignments.filter((a) => a.isActive).length})`,
                    icon: Users,
                  },
                  {
                    id: 'execution-plan',
                    label: `Kế hoạch DAG (${taskDetail.dependencies.length} Phụ thuộc / ${taskDetail.executionSteps.length} Bước)`,
                    icon: GitBranch,
                  },
                  {
                    id: 'activity',
                    label: `Nhật ký (${taskDetail.activityLogs.length})`,
                    icon: Activity,
                  },
                  {
                    id: 'output',
                    label: `Đầu ra (${taskDetail.artifacts.length})`,
                    icon: FileOutput,
                  },
                ].map((tab) => {
                  const Icon = tab.icon;
                  const active = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      type="button"
                      data-testid={`task-tab-${tab.id}`}
                      onClick={() => setActiveTab(tab.id as TaskDetailTabId)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2.5 border-b-2 text-xs font-medium whitespace-nowrap transition-colors ${
                        active
                          ? 'border-indigo-500 text-indigo-400'
                          : 'border-transparent text-slate-400 hover:text-slate-200'
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5" />
                      <span>{tab.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Tab Content Body */}
              <div className="p-5 flex-1 overflow-y-auto space-y-5 max-h-[600px]">
                {/* TAB 1: OVERVIEW */}
                {activeTab === 'overview' && (
                  <div className="space-y-4">
                    {/* Honest Runtime Availability Notice */}
                    <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 text-xs text-amber-200 flex items-start gap-2.5">
                      <Lock className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      <div>
                        <div className="font-semibold">
                          Trạng thái Runtime: {taskDetail.task.runtimeReadiness} (G2.4 Standby)
                        </div>
                        <p className="mt-0.5 text-[11px] opacity-90">
                          Ở giai đoạn G2.4, hệ thống thực thi đầy đủ kiểm tra DAG, tương thích Agent,
                          Permission Preflight và dừng tại trạng thái <code>ready</code>. Trạng thái{' '}
                          <code>running</code> và <code>completed</code> bị khóa cho tới khi G2.6
                          cung cấp sự kiện Runtime thực tế.
                        </p>
                      </div>
                    </div>

                    {/* Lifecycle Actions */}
                    <div
                      className={`p-4 rounded-xl border ${
                        isDark
                          ? 'bg-slate-950/60 border-slate-800'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="text-xs font-semibold mb-2.5">
                        Điều khiển Vòng đời Task (State Machine Enforced)
                      </div>
                      <div className="flex flex-wrap items-center gap-2">
                        {taskDetail.task.status === 'draft' && (
                          <button
                            type="button"
                            onClick={() => void handleLifecycleAction('queue')}
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-sky-600 hover:bg-sky-500 text-white text-xs font-medium"
                          >
                            <ArrowRight className="w-3.5 h-3.5" />
                            <span>Đưa vào hàng đợi (Queue)</span>
                          </button>
                        )}

                        {['queued', 'assigned', 'ready', 'waiting_approval'].includes(
                          taskDetail.task.status
                        ) && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleLifecycleAction(
                                'pause',
                                'Owner tạm dừng Task'
                              )
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-medium"
                          >
                            <Pause className="w-3.5 h-3.5" />
                            <span>Tạm dừng (Pause)</span>
                          </button>
                        )}

                        {taskDetail.task.status === 'paused' && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleLifecycleAction(
                                'resume',
                                'Owner tiếp tục Task'
                              )
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-medium"
                          >
                            <Play className="w-3.5 h-3.5" />
                            <span>Tiếp tục (Resume)</span>
                          </button>
                        )}

                        {!['completed', 'cancelled'].includes(
                          taskDetail.task.status
                        ) && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleLifecycleAction(
                                'cancel',
                                'Owner hủy Task'
                              )
                            }
                            className="inline-flex items-center gap-1 px-3 py-1.5 rounded-lg bg-rose-600/20 hover:bg-rose-600/30 text-rose-300 border border-rose-500/30 text-xs font-medium"
                          >
                            <XCircle className="w-3.5 h-3.5" />
                            <span>Hủy Task (Cancel)</span>
                          </button>
                        )}

                        {['cancelled', 'failed', 'paused'].includes(
                          taskDetail.task.status
                        ) && (
                          <button
                            type="button"
                            onClick={() =>
                              void handleLifecycleAction(
                                'reopen_draft',
                                'Owner mở lại về Draft'
                              )
                            }
                            className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium ${
                              isDark ? 'bg-slate-800 hover:bg-slate-700 text-slate-200' : 'bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-200'
                            }`}
                          >
                            <RotateCcw className="w-3.5 h-3.5" />
                            <span>Đặt lại về Draft</span>
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => setIsEditingTask((prev) => !prev)}
                          className={`inline-flex items-center gap-1 px-3 py-1.5 rounded-lg text-xs font-medium ml-auto border ${
                            isDark ? 'border-slate-700 text-slate-300 hover:bg-slate-800' : 'border-slate-200 text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>{isEditingTask ? 'Đóng sửa' : 'Sửa Task'}</span>
                        </button>

                        {confirmDeleteTaskId === taskDetail.task.id ? (
                          <div className="inline-flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() =>
                                void handleDeleteTask(taskDetail.task.id)
                              }
                              className="px-2.5 py-1.5 rounded-lg bg-rose-600 text-white text-xs font-semibold"
                            >
                              Xác nhận xóa
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTaskId(null)}
                              className={`px-2 py-1.5 rounded-lg text-xs border ${
                                isDark ? 'bg-slate-800 text-slate-300 border-slate-700' : 'bg-slate-100 text-slate-700 border-slate-200'
                              }`}
                            >
                              Hủy
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDeleteTaskId(taskDetail.task.id)
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-rose-500/30 text-rose-400 hover:bg-rose-500/10 text-xs"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                            <span>Xóa</span>
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Edit Form if active */}
                    {isEditingTask ? (
                      <form
                        onSubmit={(e) => void handleUpdateTask(e)}
                        className={`p-4 rounded-xl border space-y-3 ${
                          isDark
                            ? 'bg-slate-950 border-slate-800'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="text-xs font-semibold">
                          Chỉnh sửa thông tin Task
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">
                              Tiêu đề Task
                            </label>
                            <input
                              type="text"
                              required
                              value={editTitle}
                              onChange={(e) => setEditTitle(e.target.value)}
                              className="w-full px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs"
                            />
                          </div>
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">
                              Mức ưu tiên
                            </label>
                            <select
                              value={editPriority}
                              onChange={(e) =>
                                setEditPriority(e.target.value as TaskPriority)
                              }
                              className="w-full px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs"
                            >
                              <option value="critical">Critical</option>
                              <option value="high">High</option>
                              <option value="normal">Normal</option>
                              <option value="low">Low</option>
                            </select>
                          </div>
                        </div>
                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            Mô tả chi tiết
                          </label>
                          <textarea
                            rows={3}
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs"
                          />
                        </div>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-[11px] text-slate-400 mb-1">
                              Workspace Path
                            </label>
                            <input
                              type="text"
                              required
                              value={editWorkspacePath}
                              onChange={(e) =>
                                setEditWorkspacePath(e.target.value)
                              }
                              className="w-full px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs font-mono"
                            />
                          </div>
                          <div className="flex items-center gap-2 pt-5">
                            <input
                              type="checkbox"
                              id="edit-multi-agent"
                              checked={editAllowMultiAgent}
                              onChange={(e) =>
                                setEditAllowMultiAgent(e.target.checked)
                              }
                            />
                            <label
                              htmlFor="edit-multi-agent"
                              className="text-xs"
                            >
                              Cho phép phân công nhiều Agent (Multi-Agent)
                            </label>
                          </div>
                        </div>
                        <div className="flex justify-end gap-2">
                          <button
                            type="submit"
                            className="px-4 py-1.5 rounded-lg bg-indigo-600 text-white text-xs font-semibold"
                          >
                            Lưu thay đổi
                          </button>
                        </div>
                      </form>
                    ) : (
                      <div
                        className={`p-4 rounded-xl border space-y-3 text-xs ${
                          isDark
                            ? 'bg-slate-950/60 border-slate-800'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div>
                          <span className="text-slate-400 block mb-1">
                            Mô tả nhiệm vụ:
                          </span>
                          <p className="leading-relaxed">
                            {taskDetail.task.description ||
                              'Chưa có mô tả chi tiết.'}
                          </p>
                        </div>

                        <div className="grid grid-cols-2 md:grid-cols-3 gap-3 pt-2 border-t border-slate-800/80 font-mono text-[11px]">
                          <div>
                            <span className="text-slate-400 block">Loại Task:</span>
                            <span>{taskDetail.task.taskType}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">
                              Chế độ Multi-Agent:
                            </span>
                            <span>
                              {taskDetail.task.allowMultiAgent
                                ? 'Bật (Multi-Agent)'
                                : 'Đơn Agent (Single)'}
                            </span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Người tạo:</span>
                            <span>{taskDetail.task.createdBy}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Ngày tạo:</span>
                            <span>{taskDetail.task.createdAt}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">Cập nhật:</span>
                            <span>{taskDetail.task.updatedAt}</span>
                          </div>
                          <div>
                            <span className="text-slate-400 block">
                              Hoàn thành thực tế:
                            </span>
                            <span>
                              {taskDetail.task.completedAt ?? 'Chưa thực thi Runtime'}
                            </span>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 2: ASSIGNMENTS */}
                {activeTab === 'assignments' && (
                  <div className="space-y-5">
                    {/* Form Assign Agent */}
                    <form
                      onSubmit={(e) => void handleAssignAgent(e)}
                      className={`p-4 rounded-xl border space-y-3 ${
                        isDark
                          ? 'bg-slate-950/70 border-slate-800'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="text-xs font-semibold flex items-center justify-between">
                        <span>Phân công Agent vào Task</span>
                        <span className="text-[11px] font-mono text-slate-400">
                          Kiểm tra tương thích Provider / Account / Model / Permission
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="md:col-span-2">
                          <label className="block text-[11px] text-slate-400 mb-1">
                            Chọn Agent
                          </label>
                          <select
                            value={assignAgentId}
                            onChange={(e) => setAssignAgentId(e.target.value)}
                            className="w-full px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs"
                          >
                            <option value="">-- Chọn Agent --</option>
                            {agents.map((ag) => (
                              <option key={ag.id} value={ag.id}>
                                {ag.name} ({ag.providerName ?? ag.providerId} •{' '}
                                {ag.status})
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            Vai trò (Role)
                          </label>
                          <select
                            value={assignRole}
                            onChange={(e) =>
                              setAssignRole(e.target.value as AssignmentRole)
                            }
                            className="w-full px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs"
                          >
                            <option value="primary">Primary Agent</option>
                            <option value="worker">Worker Agent</option>
                            <option value="reviewer">Reviewer Agent</option>
                          </select>
                        </div>

                        <div>
                          <label className="block text-[11px] text-slate-400 mb-1">
                            Thứ tự thực thi
                          </label>
                          <input
                            type="number"
                            min={1}
                            max={100}
                            value={assignOrder}
                            onChange={(e) =>
                              setAssignOrder(Number(e.target.value) || 1)
                            }
                            className="w-full px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="flex items-center gap-3">
                        <input
                          type="text"
                          value={assignReason}
                          onChange={(e) => setAssignReason(e.target.value)}
                          placeholder="Ghi chú lý do phân công cho Agent này..."
                          className="flex-1 px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs"
                        />
                        <button
                          type="submit"
                          data-testid="btn-assign-agent"
                          disabled={!assignAgentId}
                          className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold shrink-0"
                        >
                          Phân công Agent
                        </button>
                      </div>
                    </form>

                    {/* Active & Historical Assignments */}
                    <div className="space-y-2.5">
                      <div className="text-xs font-semibold">
                        Danh sách Phân công hiện tại (
                        {taskDetail.assignments.filter((a) => a.isActive).length}{' '}
                        đang hiệu lực)
                      </div>

                      {taskDetail.assignments.length === 0 ? (
                        <div className="p-6 rounded-xl border border-dashed border-slate-800 text-center text-xs text-slate-400">
                          Chưa có Agent nào được phân công cho Task này.
                        </div>
                      ) : (
                        taskDetail.assignments.map((asg) => (
                          <div
                            key={asg.id}
                            className={`p-3.5 rounded-xl border text-xs space-y-2 ${
                              asg.isActive
                                ? isDark
                                  ? 'bg-slate-950/70 border-slate-800'
                                  : 'bg-slate-50 border-slate-200'
                                : 'opacity-60 bg-slate-950/30 border-slate-800/50'
                            }`}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-2">
                                <span className="font-mono text-[11px] px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 uppercase">
                                  #{asg.executionOrder} • {asg.role}
                                </span>
                                <span className="font-semibold text-sm">
                                  {asg.agentName ?? asg.agentId}
                                </span>
                                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                                  isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}>
                                  {asg.assignmentStatus}
                                </span>
                              </div>

                              <span
                                className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                                  asg.compatibilityStatus.startsWith('compatible')
                                    ? 'bg-emerald-500/20 text-emerald-300'
                                    : 'bg-rose-500/20 text-rose-300'
                                }`}
                              >
                                {asg.compatibilityStatus}: {asg.compatibilityNotes}
                              </span>
                            </div>

                            <div className="text-[11px] text-slate-400 font-mono">
                              Provider: {asg.providerName ?? asg.providerId} •
                              Account: {asg.accountName ?? 'N/A'} • Model:{' '}
                              {asg.modelName ?? 'Default'} • Profile:{' '}
                              {asg.permissionProfileId ?? 'Default'}
                            </div>

                            {asg.isActive && (
                              <div className="pt-2 border-t border-slate-800/80 flex flex-wrap items-center justify-between gap-2">
                                <div className="flex items-center gap-2">
                                  <select
                                    value={reassignTargetMap[asg.id] ?? ''}
                                    onChange={(e) =>
                                      setReassignTargetMap((prev) => ({
                                        ...prev,
                                        [asg.id]: e.target.value,
                                      }))
                                    }
                                    className="px-2.5 py-1 rounded-lg border bg-slate-900 border-slate-700 text-[11px]"
                                  >
                                    <option value="">
                                      -- Chọn Agent thay thế --
                                    </option>
                                    {agents
                                      .filter((ag) => ag.id !== asg.agentId)
                                      .map((ag) => (
                                        <option key={ag.id} value={ag.id}>
                                          {ag.name}
                                        </option>
                                      ))}
                                  </select>
                                  <button
                                    type="button"
                                    disabled={!reassignTargetMap[asg.id]}
                                    onClick={() =>
                                      void handleReassignAgent(asg.id)
                                    }
                                    className="px-2.5 py-1 rounded-lg bg-sky-600/20 text-sky-300 border border-sky-500/30 text-[11px] disabled:opacity-40"
                                  >
                                    Chuyển Agent
                                  </button>
                                </div>

                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleRevokeAssignment(asg.id)
                                  }
                                  className="px-2.5 py-1 rounded-lg bg-rose-600/20 text-rose-300 border border-rose-500/30 text-[11px]"
                                >
                                  Thu hồi phân công
                                </button>
                              </div>
                            )}
                          </div>
                        ))
                      )}
                    </div>

                    {/* Immutable Assignment Audit History */}
                    <div className="space-y-2">
                      <div className="text-xs font-semibold text-slate-300">
                        Lịch sử Phân công Bất biến (task_assignment_events:{' '}
                        {taskDetail.assignmentHistory.length})
                      </div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {taskDetail.assignmentHistory.map((ev) => (
                          <div
                            key={ev.id}
                            className="p-2.5 rounded-lg border border-slate-800 bg-slate-950/50 text-[11px] font-mono flex items-center justify-between gap-2"
                          >
                            <div>
                              <span className="text-indigo-400 uppercase font-semibold">
                                [{ev.eventType}]
                              </span>{' '}
                              Role: {ev.role} • Agent:{' '}
                              {ev.agentName ?? ev.agentId} (
                              {ev.previousStatus ?? 'none'} → {ev.newStatus}) —{' '}
                              <span className="text-slate-400">{ev.reason}</span>
                            </div>
                            <span className="text-slate-500 shrink-0">
                              {new Date(ev.createdAt).toLocaleTimeString('vi-VN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 3: EXECUTION PLAN (DAG DEPENDENCIES + STEPS + 10-STEP PIPELINE) */}
                {activeTab === 'execution-plan' && (
                  <div className="space-y-6">
                    {/* Section A: DAG Dependencies */}
                    <div
                      className={`p-4 rounded-xl border space-y-3 ${
                        isDark
                          ? 'bg-slate-950/70 border-slate-800'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold flex items-center gap-1.5">
                          <GitBranch className="w-4 h-4 text-indigo-400" />
                          <span>Đồ thị Phụ thuộc DAG (Task Dependencies)</span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          Chống tự phụ thuộc & chống vòng lặp A→B→C→A
                        </span>
                      </div>

                      <form
                        onSubmit={(e) => void handleAddDependency(e)}
                        className="grid grid-cols-1 md:grid-cols-4 gap-2.5"
                      >
                        <select
                          value={dependsOnTaskId}
                          onChange={(e) => setDependsOnTaskId(e.target.value)}
                          className="md:col-span-2 px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs"
                        >
                          <option value="">
                            -- Chọn Task tiền đề (Upstream Task) --
                          </option>
                          {availableDependencyTargets.map((t) => (
                            <option key={t.id} value={t.id}>
                              {t.title} ({t.status})
                            </option>
                          ))}
                        </select>

                        <select
                          value={dependencyType}
                          onChange={(e) =>
                            setDependencyType(e.target.value as DependencyType)
                          }
                          className="px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs"
                        >
                          <option value="mandatory">Mandatory (Bắt buộc)</option>
                          <option value="optional">Optional (Tùy chọn)</option>
                        </select>

                        <button
                          type="submit"
                          disabled={!dependsOnTaskId}
                          className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white text-xs font-semibold"
                        >
                          Thêm Dependency
                        </button>
                      </form>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-3 pt-2">
                        {/* Upstream */}
                        <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 space-y-2">
                          <div className="text-[11px] font-semibold text-slate-300">
                            Task này phụ thuộc vào ({taskDetail.dependencies.length})
                          </div>
                          {taskDetail.dependencies.length === 0 ? (
                            <p className="text-[11px] text-slate-500">
                              Không có phụ thuộc đầu vào.
                            </p>
                          ) : (
                            taskDetail.dependencies.map((dep) => (
                              <div
                                key={dep.id}
                                className="p-2 rounded border border-slate-800 bg-slate-950 flex items-center justify-between gap-2 text-[11px]"
                              >
                                <div className="min-w-0">
                                  <div className="font-medium truncate">
                                    {dep.dependsOnTitle ?? dep.dependsOnTaskId}
                                  </div>
                                  <div className="font-mono text-[10px] text-slate-400">
                                    [{dep.dependencyType}] • Status:{' '}
                                    {dep.dependsOnStatus}
                                  </div>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleRemoveDependency(dep.id)
                                  }
                                  className="text-rose-400 hover:underline text-[10px] shrink-0"
                                >
                                  Gỡ
                                </button>
                              </div>
                            ))
                          )}
                        </div>

                        {/* Downstream */}
                        <div className="p-3 rounded-lg border border-slate-800 bg-slate-900/50 space-y-2">
                          <div className="text-[11px] font-semibold text-slate-300">
                            Task này đang chặn ({taskDetail.blockingTasks.length})
                          </div>
                          {taskDetail.blockingTasks.length === 0 ? (
                            <p className="text-[11px] text-slate-500">
                              Không chặn Task nào khác.
                            </p>
                          ) : (
                            taskDetail.blockingTasks.map((blk) => (
                              <div
                                key={blk.id}
                                className="p-2 rounded border border-slate-800 bg-slate-950 text-[11px]"
                              >
                                <div className="font-medium truncate">
                                  {blk.taskTitle ?? blk.taskId}
                                </div>
                                <div className="font-mono text-[10px] text-slate-400">
                                  [{blk.dependencyType}] • Status: {blk.taskStatus}
                                </div>
                              </div>
                            ))
                          )}
                        </div>
                      </div>
                    </div>

                    {/* Section B: Execution Steps & Permission Preflight */}
                    <div
                      className={`p-4 rounded-xl border space-y-3 ${
                        isDark
                          ? 'bg-slate-950/70 border-slate-800'
                          : 'bg-slate-50 border-slate-200'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="text-xs font-semibold flex items-center gap-1.5">
                          <ShieldCheck className="w-4 h-4 text-emerald-400" />
                          <span>
                            Các Bước Thực thi & Quyền hạn Yêu cầu (Execution Steps)
                          </span>
                        </div>
                        <span className="text-[11px] font-mono text-slate-400">
                          Preflight Mode (Không tiêu thụ Approval trước khi chạy)
                        </span>
                      </div>

                      <form
                        onSubmit={(e) => void handleAddExecutionStep(e)}
                        className="space-y-2.5"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-4 gap-2.5">
                          <input
                            type="number"
                            min={1}
                            value={stepOrder}
                            onChange={(e) =>
                              setStepOrder(Number(e.target.value) || 1)
                            }
                            placeholder="Thứ tự"
                            className="px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs font-mono"
                          />
                          <input
                            type="text"
                            required
                            value={stepTitle}
                            onChange={(e) => setStepTitle(e.target.value)}
                            placeholder="Tên bước (VD: Kiểm tra cấu trúc C# Unity)"
                            className="md:col-span-2 px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs"
                          />
                          <select
                            value={stepAssignmentId}
                            onChange={(e) => setStepAssignmentId(e.target.value)}
                            className="px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs"
                          >
                            <option value="">-- Agent mặc định (Primary) --</option>
                            {taskDetail.assignments
                              .filter((a) => a.isActive)
                              .map((asg) => (
                                <option key={asg.id} value={asg.id}>
                                  {asg.agentName ?? asg.agentId} ({asg.role})
                                </option>
                              ))}
                          </select>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-3 gap-2.5">
                          <select
                            value={stepPermissionKey}
                            onChange={(e) =>
                              setStepPermissionKey(
                                e.target.value as PermissionKey
                              )
                            }
                            className="px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs font-mono"
                          >
                            {PERMISSION_KEY_OPTIONS.map((pk) => (
                              <option key={pk.key} value={pk.key}>
                                {pk.key} ({pk.category})
                              </option>
                            ))}
                          </select>

                          <input
                            type="text"
                            required
                            value={stepTargetResource}
                            onChange={(e) =>
                              setStepTargetResource(e.target.value)
                            }
                            placeholder="Target Resource (path / command / domain)"
                            className="px-3 py-1.5 rounded-lg border bg-slate-900 border-slate-700 text-xs font-mono"
                          />

                          <button
                            type="submit"
                            className="px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                          >
                            Thêm Bước Thực thi
                          </button>
                        </div>
                      </form>

                      <div className="space-y-2 pt-2">
                        {taskDetail.executionSteps.length === 0 ? (
                          <p className="text-[11px] text-slate-400">
                            Chưa khai báo bước thực thi riêng (Orchestrator sẽ tự động
                            tạo bước Preflight mặc định kiểm tra quyền trên Workspace của
                            Task).
                          </p>
                        ) : (
                          taskDetail.executionSteps.map((st) => (
                            <div
                              key={st.id}
                              className="p-2.5 rounded-lg border border-slate-800 bg-slate-900/60 flex items-center justify-between gap-3 text-xs"
                            >
                              <div className="min-w-0">
                                <div className="font-semibold">
                                  #{st.stepOrder} • {st.title}
                                </div>
                                <div className="font-mono text-[11px] text-slate-400 truncate">
                                  Permission: {st.requiredPermissionKey} |
                                  Resource: {st.targetResource}
                                </div>
                                {st.approvalRequestId && (
                                  <div className="text-[11px] text-amber-300 mt-0.5 font-mono">
                                    Approval ID: {st.approvalRequestId}
                                  </div>
                                )}
                              </div>
                              <div className="flex items-center gap-2 shrink-0">
                                <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded ${
                                  isDark ? 'bg-slate-800 text-slate-200' : 'bg-slate-100 text-slate-700 border border-slate-200'
                                }`}>
                                  {st.preflightStatus}
                                </span>
                                <button
                                  type="button"
                                  onClick={() =>
                                    void handleDeleteExecutionStep(st.id)
                                  }
                                  className="text-rose-400 hover:underline text-[11px]"
                                >
                                  Xóa
                                </button>
                              </div>
                            </div>
                          ))
                        )}
                      </div>
                    </div>

                    {/* Section C: 10-Step Orchestration Pipeline Report */}
                    {lastOrchestrationResult && (
                      <div
                        className={`p-4 rounded-xl border space-y-3 ${
                          isDark
                            ? 'bg-slate-950/80 border-slate-800'
                            : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <div className="text-xs font-semibold flex items-center gap-1.5">
                            <Cpu className="w-4 h-4 text-indigo-400" />
                            <span>
                              Kết quả 10-Step Execution Pipeline (Run ID:{' '}
                              {lastOrchestrationResult.id})
                            </span>
                          </div>
                          <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-indigo-500/20 text-indigo-300">
                            Overall: {lastOrchestrationResult.overallStatus}
                          </span>
                        </div>

                        <div className="space-y-1.5">
                          {lastOrchestrationResult.stepsReport.map((step) => (
                            <div
                              key={step.stepNumber}
                              className="p-2 rounded-lg border border-slate-800/90 bg-slate-900/50 flex items-start justify-between gap-3 text-xs"
                            >
                              <div className="flex items-start gap-2">
                                {step.status === 'passed' ? (
                                  <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                                ) : step.status === 'standby_no_runtime' ? (
                                  <Clock className="w-4 h-4 text-sky-400 shrink-0 mt-0.5" />
                                ) : (
                                  <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                                )}
                                <div>
                                  <span className="font-semibold">
                                    {step.stepName}
                                  </span>
                                  <p className="text-[11px] text-slate-400 mt-0.5">
                                    {step.detail}
                                  </p>
                                </div>
                              </div>
                              <span className={`text-[10px] font-mono uppercase px-2 py-0.5 rounded shrink-0 ${
                                isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}>
                                {step.status}
                              </span>
                            </div>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* TAB 4: ACTIVITY */}
                {activeTab === 'activity' && (
                  <div className="space-y-4">
                    <div>
                      <div className="text-xs font-semibold mb-2">
                        Lịch sử Chuyển trạng thái (task_state_transitions:{' '}
                        {taskDetail.stateTransitions.length})
                      </div>
                      <div className="space-y-1.5 max-h-48 overflow-y-auto">
                        {taskDetail.stateTransitions.map((tr) => (
                          <div
                            key={tr.id}
                            className="p-2.5 rounded-lg border border-slate-800 bg-slate-950/60 text-xs flex items-center justify-between gap-2 font-mono"
                          >
                            <div>
                              <span className="text-indigo-400">
                                {tr.fromStatus} → {tr.toStatus}
                              </span>{' '}
                              • [{tr.triggerSource}] —{' '}
                              <span className="text-slate-400">{tr.reason}</span>
                            </div>
                            <span className="text-[11px] text-slate-500 shrink-0">
                              {new Date(tr.createdAt).toLocaleTimeString('vi-VN')}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>

                    <div>
                      <div className="text-xs font-semibold mb-2">
                        Nhật ký Hoạt động của Task ({taskDetail.activityLogs.length})
                      </div>
                      <div className="space-y-2 max-h-64 overflow-y-auto">
                        {taskDetail.activityLogs.map((log) => (
                          <div
                            key={log.id}
                            className="p-3 rounded-xl border border-slate-800 bg-slate-950/60 text-xs"
                          >
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-semibold">{log.title}</span>
                              <span className={`text-[10px] font-mono px-2 py-0.5 rounded ${
                                isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                              }`}>
                                {log.eventType ?? log.category}
                              </span>
                            </div>
                            <p className="text-slate-400 mt-1">{log.detail}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}

                {/* TAB 5: OUTPUT */}
                {activeTab === 'output' && (
                  <div className="space-y-3">
                    {taskDetail.artifacts.length === 0 ? (
                      <div className="p-8 rounded-xl border border-dashed border-slate-800 text-center space-y-2">
                        <FileOutput className="w-8 h-8 text-slate-500 mx-auto" />
                        <div className="text-sm font-semibold">
                          Chưa có Output / Artifact thực tế
                        </div>
                        <p className="text-xs text-slate-400 max-w-md mx-auto leading-relaxed">
                          Hệ thống tuân thủ nguyên tắc trung thực kỹ thuật G2.4:
                          không tạo kết quả giả lập khi chưa có Runtime thực thi.
                          Các kết quả từ Antigravity, OpenAI Codex hoặc Claude sẽ
                          được lưu vào bảng <code>task_artifacts</code> trong G2.6.
                        </p>
                      </div>
                    ) : (
                      taskDetail.artifacts.map((art) => (
                        <div
                          key={art.id}
                          className="p-4 rounded-xl border border-slate-800 bg-slate-950/70 space-y-2 text-xs"
                        >
                          <div className="flex items-center justify-between">
                            <span className="font-semibold">{art.title}</span>
                            <span className={`font-mono text-[10px] px-2 py-0.5 rounded ${
                              isDark ? 'bg-slate-800 text-slate-300' : 'bg-slate-100 text-slate-700 border border-slate-200'
                            }`}>
                              {art.artifactType}
                            </span>
                          </div>
                          {art.contentText && (
                            <pre className="p-3 rounded-lg bg-slate-900 text-[11px] font-mono overflow-x-auto">
                              {art.contentText}
                            </pre>
                          )}
                        </div>
                      ))
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Modal Tạo Task Mới */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4">
          <div
            className={`w-full max-w-lg rounded-2xl border p-6 space-y-4 ${
              isDark
                ? 'bg-slate-900 border-slate-800 text-slate-100'
                : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold">Tạo Task mới trong SQLite</h3>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="text-xs text-slate-400 hover:text-slate-200"
              >
                Đóng
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateTask(e)} className="space-y-3">
              <div>
                <label className="block text-xs font-medium mb-1">
                  Tiêu đề Task *
                </label>
                <input
                  type="text"
                  required
                  data-testid="input-task-title"
                  value={newTitle}
                  onChange={(e) => setNewTitle(e.target.value)}
                  placeholder="VD: Thiết kế hệ thống Tilemap Collision cho Unity 2D"
                  className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-xs"
                />
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Mô tả chi tiết
                </label>
                <textarea
                  rows={3}
                  value={newDescription}
                  onChange={(e) => setNewDescription(e.target.value)}
                  placeholder="Mô tả mục tiêu, đầu vào và tiêu chí nghiệm thu của Task..."
                  className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Loại Task (Task Type)
                  </label>
                  <select
                    value={newTaskType}
                    onChange={(e) =>
                      setNewTaskType(e.target.value as TaskType)
                    }
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-xs"
                  >
                    {TASK_TYPE_OPTIONS.map((tt) => (
                      <option key={tt} value={tt}>
                        {tt}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">
                    Mức độ ưu tiên
                  </label>
                  <select
                    value={newPriority}
                    onChange={(e) =>
                      setNewPriority(e.target.value as TaskPriority)
                    }
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-xs"
                  >
                    <option value="critical">Critical</option>
                    <option value="high">High</option>
                    <option value="normal">Normal</option>
                    <option value="low">Low</option>
                  </select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-medium mb-1">
                    Project liên kết (G2.5)
                  </label>
                  <select
                    value={newProjectId}
                    onChange={(e) => {
                      const pid = e.target.value;
                      setNewProjectId(pid);
                      const proj = projects.find((p) => p.id === pid);
                      if (proj?.workspaceId) {
                        setNewWorkspaceId(proj.workspaceId);
                        setNewWorkspacePath(proj.projectPath);
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-xs"
                  >
                    <option value="">-- Tự chọn theo Workspace --</option>
                    {projects.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.name} ({p.projectType})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-medium mb-1">
                    Workspace thực thi (G2.5)
                  </label>
                  <select
                    value={newWorkspaceId}
                    onChange={(e) => {
                      const wid = e.target.value;
                      setNewWorkspaceId(wid);
                      const ws = workspaces.find((w) => w.id === wid);
                      if (ws) {
                        setNewWorkspacePath(ws.workspacePath);
                        if (ws.projectId) {
                          setNewProjectId(ws.projectId);
                        }
                      }
                    }}
                    className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-xs"
                  >
                    <option value="">-- Nhập đường dẫn thủ công --</option>
                    {workspaces.map((w) => (
                      <option key={w.id} value={w.id}>
                        {w.name} ({w.status})
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium mb-1">
                  Thư mục Workspace (Kiểm tra bởi WindowsPathGuard) *
                </label>
                <input
                  type="text"
                  required
                  value={newWorkspacePath}
                  onChange={(e) => setNewWorkspacePath(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border bg-slate-950 border-slate-800 text-xs font-mono"
                />
              </div>

              <div className="flex items-center gap-2 pt-1">
                <input
                  type="checkbox"
                  id="new-allow-multi-agent"
                  checked={newAllowMultiAgent}
                  onChange={(e) => setNewAllowMultiAgent(e.target.checked)}
                />
                <label htmlFor="new-allow-multi-agent" className="text-xs">
                  Cho phép phân công nhiều Agent (Primary, Worker, Reviewer)
                </label>
              </div>

              <div className="flex justify-end gap-2 pt-3 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className="px-4 py-2 rounded-xl border border-slate-700 text-xs"
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  data-testid="btn-submit-create-task"
                  className="px-4 py-2 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold"
                >
                  Tạo Task
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
