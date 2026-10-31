import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  FolderGit2,
  Gamepad2,
  FolderOpen,
  ExternalLink,
  RefreshCw,
  Plus,
  Search,
  Edit3,
  Trash2,
  Archive,
  ShieldCheck,
  AlertTriangle,
  AlertOctagon,
  CheckCircle2,
  XCircle,
  Code2,
  Layers,
  Film,
  Music,
  Image,
  FileCode,
  HardDrive,
  Sparkles,
  Box,
  X,
  Info,
  Clock,
  Check,
  FolderSearch,
} from 'lucide-react';
import type {
  CreateProjectInput,
  ProjectRecord,
  ProjectType,
  UnityMetaIntegrityScanRecord,
  UnityMetaPolicy,
  UnityProjectInspectionReport,
} from '../../shared/types';

export interface ProjectsPageProps {
  readonly isDark?: boolean;
}

export const ProjectsPage: React.FC<ProjectsPageProps> = ({ isDark = true }) => {
  const [projects, setProjects] = useState<readonly ProjectRecord[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [scanResult, setScanResult] = useState<{
    unityInspection: UnityProjectInspectionReport | null;
    integrityScan: UnityMetaIntegrityScanRecord | null;
  } | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [isScanning, setIsScanning] = useState<boolean>(false);
  const [isOpenFolderLoading, setIsOpenFolderLoading] = useState<boolean>(false);

  // Status Banner Feedback
  const [statusBanner, setStatusBanner] = useState<{
    type: 'success' | 'error' | 'info';
    text: string;
  } | null>(null);

  // Filter & Search
  const [search, setSearch] = useState<string>('');
  const [filterType, setFilterType] = useState<string>('all');
  const [filterStatus, setFilterStatus] = useState<string>('all');

  // Create Project Modal State
  const [showCreateModal, setShowCreateModal] = useState<boolean>(false);
  const [newName, setNewName] = useState<string>('');
  const [newDesc, setNewDesc] = useState<string>('');
  const [newType, setNewType] = useState<ProjectType>('unity_2d');
  const [newPath, setNewPath] = useState<string>('C:\\AI-Studio\\projects\\my-unity2d-game');
  const [newMetaPolicy, setNewMetaPolicy] = useState<UnityMetaPolicy>('strict_meta_protection');
  const [createDirIfMissing, setCreateDirIfMissing] = useState<boolean>(true);
  const [createWorkspaceAutomatically, setCreateWorkspaceAutomatically] = useState<boolean>(true);

  // Edit Project Modal State
  const [showEditModal, setShowEditModal] = useState<boolean>(false);
  const [editName, setEditName] = useState<string>('');
  const [editDesc, setEditDesc] = useState<string>('');
  const [editType, setEditType] = useState<ProjectType>('unity_2d');
  const [editMetaPolicy, setEditMetaPolicy] = useState<UnityMetaPolicy>('strict_meta_protection');

  // Delete Confirm Modal State
  const [projectToDelete, setProjectToDelete] = useState<ProjectRecord | null>(null);

  const loadProjects = useCallback(async () => {
    setLoading(true);
    const res = await window.studioApi.getProjects();
    if (res.ok && res.data) {
      setProjects(res.data);
      if (!selectedProjectId && res.data.length > 0) {
        setSelectedProjectId(res.data[0].id);
      }
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'Không thể tải danh sách Project.',
      });
    }
    setLoading(false);
  }, [selectedProjectId]);

  useEffect(() => {
    void loadProjects();
  }, [loadProjects]);

  const selectedProject = useMemo(() => {
    return projects.find((p) => p.id === selectedProjectId) ?? null;
  }, [projects, selectedProjectId]);

  useEffect(() => {
    if (selectedProject) {
      setEditName(selectedProject.name);
      setEditDesc(selectedProject.description || '');
      setEditType(selectedProject.projectType);
      setEditMetaPolicy(selectedProject.unityMetaPolicy);
      setScanResult(null);
    }
  }, [selectedProject?.id]);

  // Handle Create Project
  const handleCreateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    const payload: CreateProjectInput = {
      name: newName.trim(),
      description: newDesc.trim() || undefined,
      projectType: newType,
      projectPath: newPath.trim(),
      unityMetaPolicy: newMetaPolicy,
      createWorkspaceAutomatically,
      createDirectoryIfMissing: createDirIfMissing,
    };
    const res = await window.studioApi.createProject(payload);
    if (res.ok && res.data) {
      setStatusBanner({
        type: 'success',
        text: `Đã đăng ký thành công Project "${res.data.name}" (${res.data.projectType}) và khởi tạo Workspace liên kết.`,
      });
      setShowCreateModal(false);
      setNewName('');
      setNewDesc('');
      await loadProjects();
      setSelectedProjectId(res.data.id);
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'Đăng ký Project thất bại.',
      });
    }
  };

  // Handle Update Project
  const handleUpdateProject = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedProject) return;
    const res = await window.studioApi.updateProject({
      id: selectedProject.id,
      name: editName.trim(),
      description: editDesc.trim(),
      projectType: editType,
      unityMetaPolicy: editMetaPolicy,
      workspaceId: selectedProject.workspaceId,
    });
    if (res.ok && res.data) {
      setStatusBanner({
        type: 'success',
        text: `Đã cập nhật cấu hình Project "${res.data.name}".`,
      });
      setShowEditModal(false);
      await loadProjects();
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'Cập nhật Project thất bại.',
      });
    }
  };

  // Handle Scan Project Structure & Meta
  const handleScanProject = async (projectId: string) => {
    setIsScanning(true);
    setStatusBanner(null);
    try {
      const res = await window.studioApi.scanProject(projectId);
      if (res.ok && res.data) {
        setScanResult({
          unityInspection: res.data.unityInspection,
          integrityScan: res.data.integrityScan,
        });
        const metaStatus = res.data.integrityScan?.overallStatus ?? 'healthy';
        setStatusBanner({
          type: metaStatus === 'healthy' ? 'success' : 'info',
          text: `Đã quét cấu trúc Project "${res.data.project.name}" thành công | Trạng thái: ${res.data.project.projectStatus.toUpperCase()} | Chiều: ${res.data.project.detectedDimension.toUpperCase()} | .meta Guard: ${metaStatus.toUpperCase()}.`,
        });
        await loadProjects();
      } else {
        setStatusBanner({
          type: 'error',
          text: res.error?.message ?? 'Quét cấu trúc Project thất bại.',
        });
      }
    } finally {
      setIsScanning(false);
    }
  };

  // Handle Open Folder in Windows Explorer
  const handleOpenFolder = async (projectId: string) => {
    setIsOpenFolderLoading(true);
    try {
      const res = await window.studioApi.openProjectFolder(projectId);
      if (res.ok && res.data) {
        setStatusBanner({
          type: 'info',
          text: `Đã mở thư mục Project trong Windows Explorer: "${res.data.openedPath}"`,
        });
      } else {
        setStatusBanner({
          type: 'error',
          text: res.error?.message ?? 'Không thể mở thư mục Project.',
        });
      }
    } finally {
      setIsOpenFolderLoading(false);
    }
  };

  // Handle Archive Project
  const handleArchiveProject = async (projectId: string) => {
    const res = await window.studioApi.archiveProject(projectId);
    if (res.ok) {
      setStatusBanner({
        type: 'info',
        text: 'Đã chuyển Project sang trạng thái Lưu trữ (Archived).',
      });
      await loadProjects();
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'Không thể lưu trữ Project.',
      });
    }
  };

  // Handle Remove Registration from Studio (Preserving Disk Files)
  const handleConfirmRemove = async () => {
    if (!projectToDelete) return;
    const res = await window.studioApi.removeProjectRegistration(projectToDelete.id);
    if (res.ok && res.data) {
      setStatusBanner({
        type: 'success',
        text: `Đã gỡ bỏ Project "${projectToDelete.name}" khỏi Studio Registry. Cam kết an toàn: Toàn bộ file và thư mục trên ổ đĩa được giữ nguyên 100%.`,
      });
      setProjectToDelete(null);
      setSelectedProjectId(null);
      await loadProjects();
    } else {
      setStatusBanner({
        type: 'error',
        text: res.error?.message ?? 'Không thể gỡ bỏ Project.',
      });
    }
  };

  // Extract parsed inspection report
  let parsedMetadataInspection: UnityProjectInspectionReport | null =
    scanResult?.unityInspection ?? null;
  if (!parsedMetadataInspection && selectedProject?.metadataJson) {
    try {
      const parsed = JSON.parse(selectedProject.metadataJson) as {
        unityInspection?: UnityProjectInspectionReport;
      };
      if (parsed.unityInspection) {
        parsedMetadataInspection = parsed.unityInspection;
      }
    } catch {
      // ignore
    }
  }

  // Filter projects
  const filteredProjects = useMemo(() => {
    return projects.filter((p) => {
      const matchesSearch =
        search.trim() === '' ||
        p.name.toLowerCase().includes(search.toLowerCase()) ||
        p.id.toLowerCase().includes(search.toLowerCase()) ||
        p.projectPath.toLowerCase().includes(search.toLowerCase());

      const matchesType = filterType === 'all' || p.projectType === filterType;
      const matchesStatus = filterStatus === 'all' || p.projectStatus === filterStatus;

      return matchesSearch && matchesType && matchesStatus;
    });
  }, [projects, search, filterType, filterStatus]);

  // Project type badge style helper
  const renderTypeIcon = (type: ProjectType) => {
    switch (type) {
      case 'unity_2d':
        return <Gamepad2 className="w-4 h-4 text-purple-400" />;
      case 'unity_3d':
        return <Box className="w-4 h-4 text-indigo-400" />;
      case 'godot_2d':
      case 'godot_3d':
        return <Layers className="w-4 h-4 text-sky-400" />;
      case 'generic':
      default:
        return <Code2 className="w-4 h-4 text-emerald-400" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'valid':
        return isDark
          ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30'
          : 'bg-emerald-50 text-emerald-700 border-emerald-200';
      case 'archived':
        return isDark
          ? 'bg-amber-500/15 text-amber-400 border-amber-500/30'
          : 'bg-amber-50 text-amber-700 border-amber-200';
      case 'invalid_structure':
      case 'missing_directory':
        return isDark
          ? 'bg-rose-500/15 text-rose-400 border-rose-500/30'
          : 'bg-rose-50 text-rose-700 border-rose-200';
      case 'unscanned':
      default:
        return isDark
          ? 'bg-slate-500/15 text-slate-400 border-slate-500/30'
          : 'bg-slate-100 text-slate-700 border-slate-200';
    }
  };

  return (
    <div className="space-y-6" data-testid="projects-page">
      {/* ================================================================= */}
      {/* HEADER SECTION                                                    */}
      {/* ================================================================= */}
      <div
        className={`p-6 rounded-3xl border transition-all ${
          isDark
            ? 'bg-gradient-to-r from-slate-900/90 via-slate-900/60 to-purple-950/20 border-slate-800/80 shadow-2xl backdrop-blur-md'
            : 'bg-gradient-to-r from-white via-slate-50 to-purple-50/50 border-slate-200 shadow-sm'
        }`}
      >
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="space-y-1.5">
            <div className="flex items-center gap-2.5">
              <div className="p-2.5 rounded-2xl bg-purple-600/20 border border-purple-500/30 text-purple-400">
                <FolderGit2 className="w-5 h-5 text-purple-500" />
              </div>
              <h1 className="text-xl font-bold tracking-tight">
                Quản lý Dự án &amp; Unity 2D Inspector
              </h1>
              <span className="px-2.5 py-0.5 rounded-full text-[11px] font-mono border bg-purple-500/10 text-purple-500 border-purple-500/30">
                G2.5 Verified
              </span>
            </div>
            <p className={`text-xs max-w-2xl ${isDark ? 'text-slate-400' : 'text-slate-600'}`}>
              Quản lý danh bạ các dự án độc lập, kiểm định cấu trúc Unity 2D (Assets, Packages, ProjectSettings)
              và thực thi chính sách bảo vệ tuyệt đối file <code>.cs</code> &harr; <code>.meta</code> GUID.
            </p>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => void loadProjects()}
              disabled={loading}
              className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-all ${
                isDark
                  ? 'border-slate-700 bg-slate-800/90 hover:bg-slate-700 text-slate-200'
                  : 'border-slate-300 bg-white hover:bg-slate-100 text-slate-800 shadow-2xs'
              }`}
            >
              <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
              <span>Làm mới</span>
            </button>

            <button
              type="button"
              data-testid="btn-open-create-project"
              onClick={() => setShowCreateModal(true)}
              className="inline-flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md shadow-indigo-600/25 transition-all"
            >
              <Plus className="w-4 h-4" />
              <span>Đăng ký Project mới</span>
            </button>
          </div>
        </div>

        {/* STATS STRIP */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-5 pt-4 border-t border-slate-200/80 dark:border-slate-800/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-500 font-bold text-xs">
              {projects.length}
            </div>
            <div>
              <div className="text-[11px] text-slate-400">Tổng số Dự án</div>
              <div className="text-xs font-semibold">{projects.length} Project</div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-500 font-bold text-xs">
              {projects.filter((p) => p.projectType === 'unity_2d').length}
            </div>
            <div>
              <div className="text-[11px] text-purple-400">Unity 2D Game</div>
              <div className="text-xs font-semibold">
                {projects.filter((p) => p.projectType === 'unity_2d').length} Dự án 2D
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-500 font-bold text-xs">
              {projects.filter((p) => p.projectStatus === 'valid').length}
            </div>
            <div>
              <div className="text-[11px] text-emerald-400">Cấu trúc Hợp lệ</div>
              <div className="text-xs font-semibold">
                {projects.filter((p) => p.projectStatus === 'valid').length} Valid
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-sky-500/10 border border-sky-500/20 flex items-center justify-center text-sky-500 font-bold text-xs">
              <ShieldCheck className="w-4 h-4" />
            </div>
            <div>
              <div className="text-[11px] text-sky-400">Bảo vệ .meta GUID</div>
              <div className="text-xs font-semibold">Strict Protection</div>
            </div>
          </div>
        </div>
      </div>

      {/* ================================================================= */}
      {/* STATUS BANNER FEEDBACK                                            */}
      {/* ================================================================= */}
      {statusBanner && (
        <div
          className={`p-3.5 rounded-2xl border text-xs flex items-center justify-between gap-3 transition-all ${
            statusBanner.type === 'error'
              ? 'bg-rose-500/10 border-rose-500/30 text-rose-400'
              : statusBanner.type === 'success'
              ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
              : 'bg-sky-500/10 border-sky-500/30 text-sky-400'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {statusBanner.type === 'error' ? (
              <AlertTriangle className="w-4 h-4 text-rose-400 shrink-0" />
            ) : statusBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-sky-400 shrink-0" />
            )}
            <span>{statusBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="p-1 hover:bg-slate-500/20 rounded-lg transition-colors"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* ================================================================= */}
      {/* MAIN TWO-COLUMN LAYOUT                                            */}
      {/* ================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT COLUMN: PROJECT REGISTRY LIST (col-span-5) */}
        <div className="lg:col-span-5 space-y-4">
          <div
            className={`p-4 rounded-3xl border ${
              isDark ? 'bg-slate-900/80 border-slate-800/90' : 'bg-white border-slate-200 shadow-xs'
            }`}
          >
            {/* SEARCH & FILTERS */}
            <div className="space-y-3 mb-4">
              <div className="relative">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  placeholder="Tìm theo tên, ID, đường dẫn..."
                  className={`w-full pl-9 pr-3 py-2 rounded-xl border text-xs outline-none transition-colors ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-100 placeholder-slate-500 focus:border-indigo-500'
                      : 'bg-slate-50 border-slate-200 text-slate-900 placeholder-slate-400 focus:border-indigo-500'
                  }`}
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <select
                  value={filterType}
                  onChange={(e) => setFilterType(e.target.value)}
                  className={`px-3 py-1.5 rounded-xl border text-xs outline-none ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-200'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <option value="all">Mọi loại Project</option>
                  <option value="unity_2d">Unity 2D Game</option>
                  <option value="unity_3d">Unity 3D</option>
                  <option value="godot_2d">Godot 2D</option>
                  <option value="godot_3d">Godot 3D</option>
                  <option value="generic">Generic Software</option>
                  <option value="other">Other</option>
                </select>

                <select
                  value={filterStatus}
                  onChange={(e) => setFilterStatus(e.target.value)}
                  className={`px-3 py-1.5 rounded-xl border text-xs outline-none ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-200'
                      : 'bg-slate-50 border-slate-200 text-slate-800'
                  }`}
                >
                  <option value="all">Mọi trạng thái</option>
                  <option value="valid">Hợp lệ (Valid)</option>
                  <option value="archived">Lưu trữ (Archived)</option>
                  <option value="unscanned">Chưa quét</option>
                  <option value="invalid_structure">Cấu trúc lỗi</option>
                  <option value="missing_directory">Thiếu thư mục</option>
                </select>
              </div>
            </div>

            {/* PROJECTS LIST */}
            <div className="space-y-2.5 max-h-[620px] overflow-y-auto pr-1">
              {filteredProjects.length === 0 ? (
                <div className="py-12 text-center space-y-2">
                  <FolderSearch className="w-8 h-8 text-slate-500 mx-auto opacity-70" />
                  <p className="text-xs text-slate-400">Không tìm thấy Project nào phù hợp bộ lọc.</p>
                </div>
              ) : (
                filteredProjects.map((proj) => {
                  const isSelected = proj.id === selectedProject?.id;
                  return (
                    <div
                      key={proj.id}
                      onClick={() => setSelectedProjectId(proj.id)}
                      className={`p-3.5 rounded-2xl border transition-all cursor-pointer relative ${
                        isSelected
                          ? isDark
                            ? 'bg-indigo-950/30 border-indigo-500/50 shadow-md ring-1 ring-indigo-500/40'
                            : 'bg-indigo-50/80 border-indigo-300 shadow-xs ring-1 ring-indigo-400'
                          : isDark
                          ? 'bg-slate-950/40 border-slate-800 hover:bg-slate-950/70 hover:border-slate-700'
                          : 'bg-slate-50/60 border-slate-200 hover:bg-slate-100 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex items-center gap-2 min-w-0">
                          <div className="p-1.5 rounded-lg bg-slate-500/10 shrink-0">
                            {renderTypeIcon(proj.projectType)}
                          </div>
                          <div className="min-w-0">
                            <h3 className="font-bold text-xs truncate">{proj.name}</h3>
                            <div className="text-[10px] font-mono text-indigo-500 truncate">{proj.id}</div>
                          </div>
                        </div>

                        <span
                          className={`text-[9px] font-mono px-2 py-0.5 rounded-full border uppercase shrink-0 font-bold ${getStatusColor(
                            proj.projectStatus
                          )}`}
                        >
                          {proj.projectStatus}
                        </span>
                      </div>

                      <div
                        className={`mt-2.5 text-[11px] font-mono flex items-center gap-1.5 truncate ${
                          isDark ? 'text-slate-400' : 'text-slate-500'
                        }`}
                      >
                        <HardDrive className="w-3.5 h-3.5 shrink-0" />
                        <span className="truncate">{proj.projectPath}</span>
                      </div>

                      <div className="mt-2.5 pt-2 border-t border-slate-200/60 dark:border-slate-800/60 flex items-center justify-between text-[10px]">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded bg-slate-500/10 font-mono text-purple-400 border border-slate-500/20">
                            {proj.projectType}
                          </span>
                          <span className="px-2 py-0.5 rounded bg-slate-500/10 font-mono text-indigo-400 border border-slate-500/20 uppercase">
                            {proj.detectedDimension}
                          </span>
                        </div>

                        {proj.engineVersion && (
                          <span className="font-mono text-slate-400 truncate">
                            Unity {proj.engineVersion}
                          </span>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN: PROJECT DETAILS, SCANNER & INSPECTOR (col-span-7) */}
        <div className="lg:col-span-7 space-y-5">
          {!selectedProject ? (
            <div
              className={`p-12 text-center rounded-3xl border ${
                isDark ? 'bg-slate-900/60 border-slate-800' : 'bg-white border-slate-200'
              }`}
            >
              <FolderGit2 className="w-10 h-10 text-slate-500 mx-auto mb-2 opacity-60" />
              <h3 className="font-bold text-sm">Chưa có Project nào được chọn</h3>
              <p className="text-xs text-slate-400 mt-1">
                Chọn một Project từ danh sách bên trái hoặc nhấn "+ Đăng ký Project mới" để bắt đầu.
              </p>
            </div>
          ) : (
            <div className="space-y-5">
              {/* PROJECT HEADER CARD WITH PRIMARY ACTION BUTTONS */}
              <div
                className={`p-5 rounded-3xl border transition-all ${
                  isDark ? 'bg-slate-900/80 border-slate-800/90' : 'bg-white border-slate-200 shadow-xs'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200 dark:border-slate-800/80">
                  <div className="space-y-1">
                    <div className="flex items-center gap-2">
                      <div className="p-1.5 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
                        {renderTypeIcon(selectedProject.projectType)}
                      </div>
                      <h2 className="text-base font-bold tracking-tight">{selectedProject.name}</h2>
                      <span
                        className={`text-[10px] font-mono px-2 py-0.5 rounded-full border uppercase font-bold ${getStatusColor(
                          selectedProject.projectStatus
                        )}`}
                      >
                        {selectedProject.projectStatus}
                      </span>
                    </div>
                    <div className="text-[11px] font-mono text-indigo-500 flex items-center gap-2">
                      <span>ID: {selectedProject.id}</span>
                      <span>•</span>
                      <span className={isDark ? 'text-slate-400' : 'text-slate-500'}>
                        {selectedProject.projectPath}
                      </span>
                    </div>
                    <p className={`text-xs mt-1 ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
                      {selectedProject.description || 'Chưa có thông tin mô tả chi tiết cho Project này.'}
                    </p>
                  </div>

                  {/* ACTION BUTTONS: SCAN, OPEN FOLDER, EDIT, ARCHIVE, REMOVE */}
                  <div className="flex items-center gap-2 flex-wrap sm:shrink-0">
                    <button
                      type="button"
                      onClick={() => void handleScanProject(selectedProject.id)}
                      disabled={isScanning}
                      className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-purple-600 hover:bg-purple-500 text-white text-xs font-semibold shadow-xs transition-colors"
                      title="Quét cấu trúc dự án và kiểm tra toàn vẹn Unity .meta GUID"
                    >
                      <Sparkles className={`w-3.5 h-3.5 ${isScanning ? 'animate-spin' : ''}`} />
                      <span>{isScanning ? 'Đang quét...' : 'Quét cấu trúc & .meta'}</span>
                    </button>

                    <button
                      type="button"
                      onClick={() => void handleOpenFolder(selectedProject.id)}
                      disabled={isOpenFolderLoading}
                      className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        isDark
                          ? 'border-sky-500/40 bg-sky-500/10 hover:bg-sky-500/20 text-sky-300'
                          : 'border-sky-300 bg-sky-50 hover:bg-sky-100 text-sky-800'
                      }`}
                      title="Mở thư mục trong Windows Explorer"
                    >
                      <FolderOpen className="w-3.5 h-3.5" />
                      <span>Mở thư mục</span>
                      <ExternalLink className="w-3 h-3 opacity-70" />
                    </button>

                    <button
                      type="button"
                      onClick={() => setShowEditModal(true)}
                      className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                        isDark
                          ? 'border-slate-700 bg-slate-800 hover:bg-slate-700 text-slate-200'
                          : 'border-slate-300 bg-slate-100 hover:bg-slate-200 text-slate-700'
                      }`}
                      title="Chỉnh sửa tên, loại và chính sách .meta"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Sửa</span>
                    </button>

                    {selectedProject.projectStatus !== 'archived' && (
                      <button
                        type="button"
                        onClick={() => void handleArchiveProject(selectedProject.id)}
                        className={`p-2 rounded-xl border transition-colors ${
                          isDark
                            ? 'border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400'
                            : 'border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-700'
                        }`}
                        title="Chuyển sang trạng thái Lưu trữ (Archive)"
                      >
                        <Archive className="w-4 h-4" />
                      </button>
                    )}

                    {selectedProject.id !== 'proj-ai-studio-core' && (
                      <button
                        type="button"
                        onClick={() => setProjectToDelete(selectedProject)}
                        className={`p-2 rounded-xl border transition-colors ${
                          isDark
                            ? 'border-rose-500/40 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400'
                            : 'border-rose-300 bg-rose-50 hover:bg-rose-100 text-rose-700'
                        }`}
                        title="Gỡ đăng ký khỏi Studio (Giữ nguyên file trên đĩa)"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* METRICS GRID */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mt-4">
                  <div
                    className={`p-3 rounded-2xl border ${
                      isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-mono text-slate-400">Loại Project</div>
                    <div className="text-xs font-bold mt-0.5 text-purple-400">{selectedProject.projectType}</div>
                    <div className="text-[10px] text-slate-400 truncate mt-1">
                      Engine: {selectedProject.engineName ?? 'N/A'} {selectedProject.engineVersion ?? ''}
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-2xl border ${
                      isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-mono text-slate-400">Detected Dimension</div>
                    <div className="text-xs font-bold mt-0.5 text-indigo-400 uppercase">
                      {selectedProject.detectedDimension}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-1">Xác minh từ ProjectSettings</div>
                  </div>

                  <div
                    className={`p-3 rounded-2xl border ${
                      isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-mono text-slate-400">Unity .meta Policy</div>
                    <div className="text-xs font-bold mt-0.5 text-emerald-400 truncate">
                      {selectedProject.unityMetaPolicy}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-1">
                      Workspace: {selectedProject.workspaceName ?? 'Root'}
                    </div>
                  </div>

                  <div
                    className={`p-3 rounded-2xl border ${
                      isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                    }`}
                  >
                    <div className="text-[10px] uppercase font-mono text-slate-400">Lần quét gần nhất</div>
                    <div className="text-xs font-bold mt-0.5">
                      {selectedProject.lastScannedAt
                        ? new Date(selectedProject.lastScannedAt).toLocaleTimeString()
                        : 'Chưa quét'}
                    </div>
                    <div className="text-[10px] text-slate-400 truncate mt-1">
                      {selectedProject.lastScannedAt
                        ? new Date(selectedProject.lastScannedAt).toLocaleDateString()
                        : 'Nhấn nút Quét'}
                    </div>
                  </div>
                </div>
              </div>

              {/* INTEGRITY SCAN RESULTS BANNER */}
              {scanResult?.integrityScan && (
                <div
                  className={`p-5 rounded-3xl border space-y-3 transition-all ${
                    scanResult.integrityScan.overallStatus === 'healthy'
                      ? 'bg-emerald-500/10 border-emerald-500/30'
                      : scanResult.integrityScan.overallStatus === 'warnings_detected'
                      ? 'bg-amber-500/10 border-amber-500/30'
                      : 'bg-rose-500/10 border-rose-500/30'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2.5">
                      <ShieldCheck
                        className={`w-5 h-5 ${
                          scanResult.integrityScan.overallStatus === 'healthy'
                            ? 'text-emerald-400'
                            : scanResult.integrityScan.overallStatus === 'warnings_detected'
                            ? 'text-amber-400'
                            : 'text-rose-400'
                        }`}
                      />
                      <div>
                        <h4 className="font-bold text-xs uppercase tracking-wide">
                          Kết quả Kiểm tra Toàn vẹn .meta GUID (Unity Meta Integrity Guard)
                        </h4>
                        <div className="text-[11px] font-mono mt-0.5">
                          Trạng thái tổng thể:{' '}
                          <span className="font-bold uppercase">
                            {scanResult.integrityScan.overallStatus}
                          </span>
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-mono px-2.5 py-1 rounded-full uppercase font-bold border ${
                        scanResult.integrityScan.overallStatus === 'healthy'
                          ? 'bg-emerald-500/20 text-emerald-400 border-emerald-500/40'
                          : 'bg-rose-500/20 text-rose-400 border-rose-500/40'
                      }`}
                    >
                      {scanResult.integrityScan.overallStatus}
                    </span>
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-6 gap-2 text-center text-xs">
                    <div className="p-2 rounded-xl bg-slate-900/30 border border-slate-700/40">
                      <div className="text-[10px] text-slate-400">Assets đã kiểm</div>
                      <div className="font-bold font-mono">{scanResult.integrityScan.totalAssetsChecked}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-900/30 border border-slate-700/40">
                      <div className="text-[10px] text-slate-400">Tệp .meta</div>
                      <div className="font-bold font-mono">{scanResult.integrityScan.totalMetaChecked}</div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-900/30 border border-slate-700/40">
                      <div className="text-[10px] text-slate-400">Missing .meta</div>
                      <div className={`font-bold font-mono ${scanResult.integrityScan.missingMetaCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {scanResult.integrityScan.missingMetaCount}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-900/30 border border-slate-700/40">
                      <div className="text-[10px] text-slate-400">Orphan .meta</div>
                      <div className={`font-bold font-mono ${scanResult.integrityScan.orphanMetaCount > 0 ? 'text-amber-400' : 'text-emerald-400'}`}>
                        {scanResult.integrityScan.orphanMetaCount}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-900/30 border border-slate-700/40">
                      <div className="text-[10px] text-slate-400">Invalid GUID</div>
                      <div className={`font-bold font-mono ${scanResult.integrityScan.invalidGuidCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {scanResult.integrityScan.invalidGuidCount}
                      </div>
                    </div>
                    <div className="p-2 rounded-xl bg-slate-900/30 border border-slate-700/40">
                      <div className="text-[10px] text-slate-400">Duplicate GUID</div>
                      <div className={`font-bold font-mono ${scanResult.integrityScan.duplicateGuidCount > 0 ? 'text-rose-400' : 'text-emerald-400'}`}>
                        {scanResult.integrityScan.duplicateGuidCount}
                      </div>
                    </div>
                  </div>
                </div>
              )}

              {/* UNITY 2D INSPECTION BREAKDOWN */}
              {parsedMetadataInspection && (
                <div
                  className={`p-5 rounded-3xl border space-y-4 ${
                    isDark ? 'bg-slate-900/80 border-slate-800/90' : 'bg-white border-slate-200 shadow-xs'
                  }`}
                >
                  <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
                    <div className="flex items-center gap-2.5">
                      <Gamepad2 className="w-5 h-5 text-purple-400" />
                      <h4 className="font-bold text-xs uppercase tracking-wide">
                        Chi tiết Cấu trúc Unity 2D (Assets, Packages &amp; ProjectSettings)
                      </h4>
                    </div>

                    {parsedMetadataInspection.unityEditorVersion && (
                      <span className="text-[11px] font-mono px-2.5 py-0.5 rounded-full border bg-purple-500/10 text-purple-400 border-purple-500/30">
                        Editor: {parsedMetadataInspection.unityEditorVersion}
                      </span>
                    )}
                  </div>

                  {/* ESSENTIAL DIRECTORIES CHECK */}
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div
                      className={`p-3 rounded-2xl border flex items-center justify-between ${
                        parsedMetadataInspection.hasAssetsDir
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {parsedMetadataInspection.hasAssetsDir ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        <span className="font-mono text-xs font-bold">Assets/</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold">
                        {parsedMetadataInspection.hasAssetsDir ? 'Đầy đủ' : 'Thiếu'}
                      </span>
                    </div>

                    <div
                      className={`p-3 rounded-2xl border flex items-center justify-between ${
                        parsedMetadataInspection.hasPackagesDir
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {parsedMetadataInspection.hasPackagesDir ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        <span className="font-mono text-xs font-bold">Packages/</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold">
                        {parsedMetadataInspection.hasPackagesDir ? 'Đầy đủ' : 'Thiếu'}
                      </span>
                    </div>

                    <div
                      className={`p-3 rounded-2xl border flex items-center justify-between ${
                        parsedMetadataInspection.hasProjectSettingsDir
                          ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400'
                          : 'bg-rose-500/10 border-rose-500/30 text-rose-400'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        {parsedMetadataInspection.hasProjectSettingsDir ? (
                          <CheckCircle2 className="w-4 h-4" />
                        ) : (
                          <XCircle className="w-4 h-4" />
                        )}
                        <span className="font-mono text-xs font-bold">ProjectSettings/</span>
                      </div>
                      <span className="text-[10px] uppercase font-bold">
                        {parsedMetadataInspection.hasProjectSettingsDir ? 'Đầy đủ' : 'Thiếu'}
                      </span>
                    </div>
                  </div>

                  {/* 2D/3D DIMENSION EVIDENCE */}
                  {parsedMetadataInspection.dimensionEvidence &&
                    parsedMetadataInspection.dimensionEvidence.length > 0 && (
                      <div
                        className={`p-3.5 rounded-2xl border space-y-1.5 ${
                          isDark ? 'bg-slate-950/60 border-slate-800' : 'bg-slate-50 border-slate-200'
                        }`}
                      >
                        <div className="text-[11px] font-bold text-purple-400 flex items-center gap-1.5">
                          <Check className="w-3.5 h-3.5" />
                          <span>Bằng chứng xác thực chiều Dự án (Dimension Evidence):</span>
                        </div>
                        <ul className="text-xs space-y-1 pl-5 list-disc text-slate-300 dark:text-slate-300">
                          {parsedMetadataInspection.dimensionEvidence.map((ev, idx) => (
                            <li key={idx} className="font-mono text-[11px]">
                              {ev}
                            </li>
                          ))}
                        </ul>
                      </div>
                    )}

                  {/* ASSET COUNTS GRID (8 TILES) */}
                  {parsedMetadataInspection.assetCounts && (
                    <div>
                      <div className="text-[11px] uppercase font-bold tracking-wide text-slate-400 mb-2">
                        Phân bổ Thống kê Tài nguyên Asset (Unity Asset Breakdown):
                      </div>
                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div
                          className={`p-3 rounded-2xl border text-center ${
                            isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1.5 text-[10px] text-purple-400">
                            <Gamepad2 className="w-3.5 h-3.5" />
                            <span>Scenes (.unity)</span>
                          </div>
                          <div className="text-base font-bold font-mono mt-1">
                            {parsedMetadataInspection.assetCounts.scenes}
                          </div>
                        </div>

                        <div
                          className={`p-3 rounded-2xl border text-center ${
                            isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1.5 text-[10px] text-indigo-400">
                            <FileCode className="w-3.5 h-3.5" />
                            <span>C# Scripts (.cs)</span>
                          </div>
                          <div className="text-base font-bold font-mono mt-1">
                            {parsedMetadataInspection.assetCounts.scripts}
                          </div>
                        </div>

                        <div
                          className={`p-3 rounded-2xl border text-center ${
                            isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1.5 text-[10px] text-sky-400">
                            <Box className="w-3.5 h-3.5" />
                            <span>Prefabs</span>
                          </div>
                          <div className="text-base font-bold font-mono mt-1">
                            {parsedMetadataInspection.assetCounts.prefabs}
                          </div>
                        </div>

                        <div
                          className={`p-3 rounded-2xl border text-center ${
                            isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1.5 text-[10px] text-emerald-400">
                            <Image className="w-3.5 h-3.5" />
                            <span>2D Sprites</span>
                          </div>
                          <div className="text-base font-bold font-mono mt-1">
                            {parsedMetadataInspection.assetCounts.sprites}
                          </div>
                        </div>

                        <div
                          className={`p-3 rounded-2xl border text-center ${
                            isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1.5 text-[10px] text-amber-400">
                            <Layers className="w-3.5 h-3.5" />
                            <span>Tilemaps</span>
                          </div>
                          <div className="text-base font-bold font-mono mt-1">
                            {parsedMetadataInspection.assetCounts.tilemaps}
                          </div>
                        </div>

                        <div
                          className={`p-3 rounded-2xl border text-center ${
                            isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1.5 text-[10px] text-rose-400">
                            <Film className="w-3.5 h-3.5" />
                            <span>Animations</span>
                          </div>
                          <div className="text-base font-bold font-mono mt-1">
                            {parsedMetadataInspection.assetCounts.animations}
                          </div>
                        </div>

                        <div
                          className={`p-3 rounded-2xl border text-center ${
                            isDark ? 'bg-slate-950/40 border-slate-800' : 'bg-slate-50 border-slate-200'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1.5 text-[10px] text-teal-400">
                            <Music className="w-3.5 h-3.5" />
                            <span>Audio</span>
                          </div>
                          <div className="text-base font-bold font-mono mt-1">
                            {parsedMetadataInspection.assetCounts.audio}
                          </div>
                        </div>

                        <div
                          className={`p-3 rounded-2xl border text-center ${
                            isDark ? 'bg-purple-950/20 border-purple-500/30' : 'bg-purple-50 border-purple-200'
                          }`}
                        >
                          <div className="flex items-center justify-center gap-1.5 text-[10px] text-purple-400 font-bold">
                            <ShieldCheck className="w-3.5 h-3.5" />
                            <span>Tệp .meta GUID</span>
                          </div>
                          <div className="text-base font-bold font-mono text-purple-400 mt-1">
                            {parsedMetadataInspection.assetCounts.totalMetaFiles}
                          </div>
                        </div>
                      </div>
                    </div>
                  )}

                  {/* INSTALLED PACKAGES BREAKDOWN */}
                  {parsedMetadataInspection.installedPackages &&
                    parsedMetadataInspection.installedPackages.length > 0 && (
                      <div>
                        <div className="text-[11px] uppercase font-bold tracking-wide text-slate-400 mb-2">
                          Gói Unity Packages 2D phát hiện ({parsedMetadataInspection.installedPackages.length}):
                        </div>
                        <div className="flex flex-wrap gap-2">
                          {parsedMetadataInspection.installedPackages.map((pkg, idx) => (
                            <span
                              key={idx}
                              className={`text-[11px] font-mono px-2.5 py-1 rounded-xl border flex items-center gap-1.5 ${
                                pkg.is2dPackage
                                  ? 'bg-purple-500/10 text-purple-400 border-purple-500/30 font-semibold'
                                  : 'bg-slate-500/10 text-slate-400 border-slate-500/30'
                              }`}
                            >
                              <span>{pkg.name}</span>
                              <span className="opacity-70 text-[10px]">{pkg.version}</span>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* ================================================================= */}
      {/* MODAL 1: ĐĂNG KÝ PROJECT MỚI (MODERN POPUP DIALOG)                */}
      {/* ================================================================= */}
      {showCreateModal && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div
            className={`w-full max-w-xl max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl my-auto overflow-hidden transition-all ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className={`shrink-0 p-5 sm:p-6 pb-3 sm:pb-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-purple-500/15 border border-purple-500/30 text-purple-400">
                  <Plus className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Đăng ký Project Mới vào Studio</h3>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Liên kết dự án Unity 2D hoặc phần mềm độc lập vào Personal AI Studio.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowCreateModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-500/20 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleCreateProject(e)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 overscroll-contain">
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label className="text-xs font-semibold block">Tên Project *</label>
                  <input
                    type="text"
                    required
                    value={newName}
                    onChange={(e) => setNewName(e.target.value)}
                    placeholder="Ví dụ: Pixel Knight 2D"
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-indigo-500'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                    }`}
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold block">Loại Project *</label>
                  <select
                    value={newType}
                    onChange={(e) => setNewType(e.target.value as ProjectType)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-slate-100'
                        : 'bg-white border-slate-300 text-slate-900'
                    }`}
                  >
                    <option value="unity_2d">🎮 Unity 2D Project (Khuyên dùng)</option>
                    <option value="unity_3d">📦 Unity 3D Project</option>
                    <option value="godot_2d">👾 Godot 2D Project</option>
                    <option value="godot_3d">🌐 Godot 3D Project</option>
                    <option value="generic">💻 Generic Software Project</option>
                    <option value="other">📁 Other</option>
                  </select>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold block">
                  Đường dẫn thư mục Project trên Windows *
                </label>
                <input
                  type="text"
                  required
                  value={newPath}
                  onChange={(e) => setNewPath(e.target.value)}
                  placeholder="C:\AI-Studio\projects\my-unity2d-game"
                  className={`w-full px-3 py-2 rounded-xl border font-mono text-xs outline-none ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-indigo-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                  }`}
                />
                <div className="flex items-center gap-2 pt-1 text-[11px] text-slate-400">
                  <span>Mẫu đường dẫn nhanh:</span>
                  <button
                    type="button"
                    onClick={() => setNewPath('C:\\AI-Studio\\projects\\unity2d-game')}
                    className="text-indigo-400 hover:underline"
                  >
                    projects\unity2d-game
                  </button>
                  <span>•</span>
                  <button
                    type="button"
                    onClick={() => setNewPath('C:\\AI-Studio')}
                    className="text-indigo-400 hover:underline"
                  >
                    Root C:\AI-Studio
                  </button>
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold block">
                  Chính sách bảo vệ Unity .meta (UnityMetaPolicy) *
                </label>
                <select
                  value={newMetaPolicy}
                  onChange={(e) => setNewMetaPolicy(e.target.value as UnityMetaPolicy)}
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-100'
                      : 'bg-white border-slate-300 text-slate-900'
                  }`}
                >
                  <option value="strict_meta_protection">
                    🛡️ strict_meta_protection (Cấm tuyệt đối AI tự sửa/xóa .meta - An toàn GUID)
                  </option>
                  <option value="require_approval_for_meta_changes">
                    ✍️ require_approval_for_meta_changes (Mọi thay đổi .meta bắt buộc Owner duyệt)
                  </option>
                  <option value="allow_asset_changes">
                    ⚡ allow_asset_changes (Cho phép sửa Asset, chỉ duyệt khi xóa .meta)
                  </option>
                  <option value="inspect_only">
                    🔍 inspect_only (Chế độ chỉ đọc &amp; kiểm tra)
                  </option>
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs font-semibold block">Mô tả Project</label>
                <textarea
                  rows={2}
                  value={newDesc}
                  onChange={(e) => setNewDesc(e.target.value)}
                  placeholder="Mô tả mục tiêu dự án, phiên bản Unity, phân vai nhân sự..."
                  className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                    isDark
                      ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-indigo-500'
                      : 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                  }`}
                />
              </div>

              <div className="space-y-2 pt-1">
                <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createWorkspaceAutomatically}
                    onChange={(e) => setCreateWorkspaceAutomatically(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Tự động khởi tạo Không gian làm việc (Workspace) liên kết cho dự án này</span>
                </label>

                <label className="flex items-center gap-2.5 text-xs cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={createDirIfMissing}
                    onChange={(e) => setCreateDirIfMissing(e.target.checked)}
                    className="rounded text-indigo-600 focus:ring-indigo-500"
                  />
                  <span>Tự động tạo thư mục trên ổ đĩa nếu đường dẫn chưa tồn tại (Owner xác nhận)</span>
                </label>
              </div>

              </div>

              <div className={`shrink-0 p-4 sm:p-5 border-t flex items-center justify-end gap-2.5 ${isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/90'} backdrop-blur-xs`}>
                <button
                  type="button"
                  onClick={() => setShowCreateModal(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    isDark
                      ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-colors"
                >
                  Lưu &amp; Quét Project ngay
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 2: CẬP NHẬT CẤU HÌNH PROJECT (EDIT MODAL)                  */}
      {/* ================================================================= */}
      {showEditModal && selectedProject && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-3 sm:p-4 overflow-y-auto">
          <div
            className={`w-full max-w-lg max-h-[90vh] flex flex-col rounded-3xl border shadow-2xl my-auto overflow-hidden transition-all ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className={`shrink-0 p-5 sm:p-6 pb-3 sm:pb-4 border-b flex items-center justify-between ${isDark ? 'border-slate-800' : 'border-slate-200'}`}>
              <div className="flex items-center gap-2.5">
                <div className="p-2 rounded-xl bg-indigo-500/15 border border-indigo-500/30 text-indigo-400">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Cập nhật cấu hình Project</h3>
                  <p className={`text-xs ${isDark ? 'text-slate-400' : 'text-slate-500'}`}>
                    Thay đổi thông số và chính sách bảo vệ cho {selectedProject.name}.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowEditModal(false)}
                className="p-1.5 rounded-xl hover:bg-slate-500/20 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={(e) => void handleUpdateProject(e)} className="flex flex-col flex-1 min-h-0 overflow-hidden">
              <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-4 overscroll-contain">
                <div className="space-y-1">
                  <label className="text-xs font-semibold block">Tên Project *</label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-indigo-500'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                    }`}
                  />
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold block">Loại Project *</label>
                    <select
                      value={editType}
                      onChange={(e) => setEditType(e.target.value as ProjectType)}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                        isDark
                          ? 'bg-slate-950 border-slate-800 text-slate-100'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      <option value="unity_2d">🎮 Unity 2D</option>
                      <option value="unity_3d">📦 Unity 3D</option>
                      <option value="godot_2d">👾 Godot 2D</option>
                      <option value="godot_3d">🌐 Godot 3D</option>
                      <option value="generic">💻 Generic</option>
                      <option value="other">📁 Other</option>
                    </select>
                  </div>

                  <div className="space-y-1">
                    <label className="text-xs font-semibold block">Unity .meta Policy *</label>
                    <select
                      value={editMetaPolicy}
                      onChange={(e) => setEditMetaPolicy(e.target.value as UnityMetaPolicy)}
                      className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                        isDark
                          ? 'bg-slate-950 border-slate-800 text-slate-100'
                          : 'bg-white border-slate-300 text-slate-900'
                      }`}
                    >
                      <option value="strict_meta_protection">strict_meta_protection</option>
                      <option value="require_approval_for_meta_changes">require_approval_for_meta_changes</option>
                      <option value="allow_asset_changes">allow_asset_changes</option>
                      <option value="inspect_only">inspect_only</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold block">Mô tả Project</label>
                  <textarea
                    rows={3}
                    value={editDesc}
                    onChange={(e) => setEditDesc(e.target.value)}
                    className={`w-full px-3 py-2 rounded-xl border text-xs outline-none ${
                      isDark
                        ? 'bg-slate-950 border-slate-800 text-slate-100 focus:border-indigo-500'
                        : 'bg-white border-slate-300 text-slate-900 focus:border-indigo-500'
                    }`}
                  />
                </div>
              </div>

              <div className={`shrink-0 p-4 sm:p-5 border-t flex items-center justify-end gap-2.5 ${isDark ? 'border-slate-800 bg-slate-900/90' : 'border-slate-200 bg-white/90'} backdrop-blur-xs`}>
                <button
                  type="button"
                  onClick={() => setShowEditModal(false)}
                  className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                    isDark
                      ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                      : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  Hủy
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl text-xs font-semibold bg-indigo-600 hover:bg-indigo-500 text-white shadow-md transition-colors"
                >
                  Lưu thay đổi
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ================================================================= */}
      {/* MODAL 3: XÁC NHẬN GỠ ĐĂNG KÝ PROJECT (SAFETY GUARANTEED)          */}
      {/* ================================================================= */}
      {projectToDelete && (
        <div className="fixed inset-0 z-50 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4">
          <div
            className={`w-full max-w-md rounded-3xl border p-6 shadow-2xl transition-all ${
              isDark ? 'bg-slate-900 border-slate-800 text-slate-100' : 'bg-white border-slate-200 text-slate-900'
            }`}
          >
            <div className="flex items-center gap-3 text-rose-500 mb-3">
              <div className="p-2 rounded-xl bg-rose-500/15 border border-rose-500/30">
                <AlertTriangle className="w-5 h-5 text-rose-500" />
              </div>
              <h3 className="font-bold text-sm">Xác nhận gỡ đăng ký Project?</h3>
            </div>

            <p className={`text-xs ${isDark ? 'text-slate-300' : 'text-slate-600'}`}>
              Bạn đang chuẩn bị gỡ bỏ <strong>{projectToDelete.name}</strong> ({projectToDelete.id}) khỏi danh sách Studio Registry.
            </p>

            <div className="my-4 p-3 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs flex items-start gap-2">
              <ShieldCheck className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              <div>
                <strong>CAM KẾT AN TOÀN DỮ LIỆU:</strong> Toàn bộ file mã nguồn, asset và thư mục tại{' '}
                <code>{projectToDelete.projectPath}</code> trên ổ đĩa sẽ <strong>ĐƯỢC GIỮ NGUYÊN 100%</strong>, không hề bị xóa hay sửa đổi.
              </div>
            </div>

            <div className="flex items-center justify-end gap-2.5 pt-2">
              <button
                type="button"
                onClick={() => setProjectToDelete(null)}
                className={`px-4 py-2 rounded-xl text-xs font-semibold border transition-colors ${
                  isDark
                    ? 'border-slate-700 bg-slate-800 text-slate-200 hover:bg-slate-700'
                    : 'border-slate-300 bg-slate-100 text-slate-700 hover:bg-slate-200'
                }`}
              >
                Hủy bỏ
              </button>
              <button
                type="button"
                onClick={() => void handleConfirmRemove()}
                className="px-4 py-2 rounded-xl text-xs font-semibold bg-rose-600 hover:bg-rose-500 text-white shadow-md transition-colors"
              >
                Xác nhận gỡ đăng ký
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
