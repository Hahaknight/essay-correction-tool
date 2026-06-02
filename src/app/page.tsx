'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { useDropzone } from 'react-dropzone';
import Link from 'next/link';

interface StudentPreview {
  studentName: string;
  pages: number;
}

interface ProcessingStatus {
  studentName: string;
  pageCount: number;
  studentStatus: string;
  recognitionStatus: string;
  aiStatus: string;
  reportStatus: string;
  errors: string[];
}

interface ApiStudent {
  studentName: string;
  pages?: unknown[];
  status: string;
  recognitionStatus?: string;
  aiStatus?: string;
  report?: unknown;
  errors?: string[];
}

interface ApiTask {
  status: string;
  students: ApiStudent[];
}

interface TaskSummary {
  taskId: string;
  createdAt: string;
  correctionRequirement: string;
  total: number;
  completed: number;
  failed: number;
  status: string;
}

function getTaskStatusLabel(status: string): string {
  switch (status) {
    case 'completed':
      return '已完成';
    case 'processing':
      return '处理中';
    case 'partial':
      return '部分完成';
    case 'failed':
      return '失败';
    default:
      return '已创建';
  }
}

function getTaskStatusClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
    case 'processing':
      return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200';
    case 'partial':
      return 'bg-amber-50 text-amber-700 ring-1 ring-amber-200';
    case 'failed':
      return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';
    default:
      return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
  }
}

function getStageLabel(status: string, processingLabel: string): string {
  switch (status) {
    case 'completed':
      return '完成';
    case 'failed':
      return '失败';
    case 'processing':
      return processingLabel;
    default:
      return '等待';
  }
}

function getStageClass(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200';
    case 'failed':
      return 'bg-rose-50 text-rose-700 ring-1 ring-rose-200';
    case 'processing':
      return 'bg-blue-50 text-blue-700 ring-1 ring-blue-200';
    default:
      return 'bg-slate-100 text-slate-600 ring-1 ring-slate-200';
  }
}

export default function Home() {
  const [correctionRequirement, setCorrectionRequirement] = useState('');
  const correctionRequirementRef = useRef<HTMLTextAreaElement | null>(null);
  const [taskId, setTaskId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [studentPreviews, setStudentPreviews] = useState<StudentPreview[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingResults, setProcessingResults] = useState<ProcessingStatus[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, ProcessingStatus>>({});
  const statusMapRef = useRef<Record<string, ProcessingStatus>>({});
  const correctionPollRef = useRef<number | null>(null);
  const correctionPollTimeoutRef = useRef<number | null>(null);
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [retryingStudents, setRetryingStudents] = useState<string[]>([]);
  const [isRetryingAll, setIsRetryingAll] = useState(false);

  const [tasks, setTasks] = useState<TaskSummary[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const canUpload = !!taskId && !isProcessing && !isComplete;

  const fetchTasks = useCallback(async () => {
    try {
      const res = await fetch('/api/tasks');
      const data = await res.json();
      setTasks(data.tasks || []);
    } catch (err) {
      console.error('获取任务列表失败', err);
    }
  }, []);

  useEffect(() => {
    if (showHistory) {
      const timeout = window.setTimeout(() => {
        void fetchTasks();
      }, 0);
      return () => window.clearTimeout(timeout);
    }
  }, [fetchTasks, showHistory]);

  const stopCorrectionPolling = useCallback(() => {
    if (correctionPollRef.current !== null) {
      window.clearInterval(correctionPollRef.current);
      correctionPollRef.current = null;
    }
    if (correctionPollTimeoutRef.current !== null) {
      window.clearTimeout(correctionPollTimeoutRef.current);
      correctionPollTimeoutRef.current = null;
    }
  }, []);

  useEffect(() => {
    return () => stopCorrectionPolling();
  }, [stopCorrectionPolling]);

  const resetCurrentTaskState = useCallback(() => {
    stopCorrectionPolling();
    setTaskId(null);
    setCorrectionRequirement('');
    setStudentPreviews([]);
    setUploadedFiles([]);
    setIsProcessing(false);
    setIsComplete(false);
    setProcessingResults([]);
    setStatusMap({});
    statusMapRef.current = {};
    setRetryingStudents([]);
    setIsRetryingAll(false);
    setError(null);
  }, [stopCorrectionPolling]);

  const applyTaskStatus = useCallback((task: ApiTask) => {
    const newResults: ProcessingStatus[] = [];
    const updatedMap: Record<string, ProcessingStatus> = {};

    for (const s of task.students) {
      const existing = statusMapRef.current[s.studentName] || {
        studentName: s.studentName,
        pageCount: s.pages?.length || 0,
        studentStatus: s.status,
        recognitionStatus: 'pending',
        aiStatus: 'pending',
        reportStatus: 'pending',
        errors: [],
      };
      const result = {
        studentName: s.studentName,
        pageCount: s.pages?.length || existing.pageCount,
        studentStatus: s.status,
        recognitionStatus: s.recognitionStatus || 'pending',
        aiStatus: s.aiStatus || 'pending',
        reportStatus: s.status === 'failed' ? 'failed' : (s.report ? 'completed' : 'pending'),
        errors: s.errors || [],
      };
      newResults.push(result);
      updatedMap[s.studentName] = result;
    }

    setProcessingResults(newResults);
    statusMapRef.current = updatedMap;
    setStatusMap(updatedMap);

    if (task.status === 'completed' || task.status === 'partial' || task.status === 'failed') {
      setIsComplete(true);
      setIsProcessing(false);
      void fetchTasks();
    }
  }, [fetchTasks]);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!taskId) {
      setError('请先创建任务');
      return;
    }
    if (!canUpload) {
      setError('当前任务已进入处理阶段，不能继续上传图片');
      return;
    }

    const formData = new FormData();
    for (const file of acceptedFiles) {
      formData.append('files', file);
    }

    try {
      const res = await fetch(`/api/tasks/${taskId}/upload`, {
        method: 'POST',
        body: formData,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error || data.failed?.[0]?.reason || '上传失败');
      }

      const data = await res.json();
      setUploadedFiles((prev) => [...prev, ...acceptedFiles.map((f) => f.name)]);

      const newPreviews: StudentPreview[] = [];
      for (const [name, count] of Object.entries(data.groupPreview as Record<string, number>)) {
        newPreviews.push({ studentName: name, pages: count });
      }
      setStudentPreviews((prev) => {
        const merged = [...prev];
        for (const np of newPreviews) {
          const existing = merged.find((p) => p.studentName === np.studentName);
          if (existing) {
            existing.pages = np.pages;
          } else {
            merged.push(np);
          }
        }
        return merged;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : '上传失败');
    }
  }, [canUpload, taskId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    disabled: !canUpload,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
  });

  const createTask = async () => {
    const requirement = (correctionRequirementRef.current?.value ?? correctionRequirement).trim();
    if (!requirement) {
      setError('请输入批改要求');
      return;
    }

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correctionRequirement: requirement }),
      });

      if (!res.ok) throw new Error('创建任务失败');

      const data = await res.json();
      setTaskId(data.taskId);
      setCorrectionRequirement(requirement);
      setError(null);
      setStudentPreviews([]);
      setUploadedFiles([]);
      setIsComplete(false);
      setProcessingResults([]);
      setStatusMap({});
      statusMapRef.current = {};
    } catch (err) {
      setError(err instanceof Error ? err.message : '创建任务失败');
    }
  };

  const startCorrection = async () => {
    if (!taskId) return;
    if (studentPreviews.length === 0) {
      setError('请先上传作文图片');
      return;
    }

    setIsProcessing(true);
    setError(null);
    setIsComplete(false);
    setProcessingResults(studentPreviews.map((s) => ({
      studentName: s.studentName,
      pageCount: s.pages,
      studentStatus: 'pending',
      recognitionStatus: 'pending',
      aiStatus: 'pending',
      reportStatus: 'pending',
      errors: [],
    })));

    const initialStatus: Record<string, ProcessingStatus> = {};
    for (const s of studentPreviews) {
      initialStatus[s.studentName] = {
        studentName: s.studentName,
        pageCount: s.pages,
        studentStatus: 'pending',
        recognitionStatus: 'pending',
        aiStatus: 'pending',
        reportStatus: 'pending',
        errors: [],
      };
    }
    setStatusMap(initialStatus);
    statusMapRef.current = initialStatus;

    try {
      const res = await fetch(`/api/tasks/${taskId}/start`, { method: 'POST' });
      if (!res.ok) throw new Error('启动批改失败');

      stopCorrectionPolling();
      const activeTaskId = taskId;
      correctionPollRef.current = window.setInterval(async () => {
        try {
          const statusRes = await fetch(`/api/tasks/${activeTaskId}`);
          if (!statusRes.ok) return;
          const statusData = await statusRes.json();
          const task = statusData.task;

          applyTaskStatus(task);

          if (task.status === 'completed' || task.status === 'partial' || task.status === 'failed') {
            stopCorrectionPolling();
          }
        } catch {}
      }, 2000);

      correctionPollTimeoutRef.current = window.setTimeout(stopCorrectionPolling, 30 * 60 * 1000);
    } catch (err) {
      setError(err instanceof Error ? err.message : '批改失败');
      setIsProcessing(false);
    }
  };

  const downloadReports = async (downloadTaskId?: string) => {
    const tid = downloadTaskId || taskId;
    if (!tid) return;
    try {
      const res = await fetch(`/api/tasks/${tid}/download`);
      if (!res.ok) throw new Error('下载失败');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `作文批改报告-${tid}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败');
    }
  };

  const refreshTask = useCallback(async () => {
    if (!taskId) return;
    const statusRes = await fetch(`/api/tasks/${taskId}`);
    if (!statusRes.ok) return;
    const statusData = await statusRes.json();
    applyTaskStatus(statusData.task);
  }, [applyTaskStatus, taskId]);

  const retryStudent = useCallback(async (studentName: string, suppressError = false) => {
    if (!taskId) return;

    let pollInterval: number | null = null;
    setRetryingStudents((prev) => [...new Set([...prev, studentName])]);
    setError(null);
    setStatusMap((prev) => {
      const current = prev[studentName];
      if (!current) return prev;
      const nextStudent = {
        ...current,
        studentStatus: 'processing',
        aiStatus: current.recognitionStatus === 'completed' ? 'processing' : 'pending',
        reportStatus: 'pending',
        errors: [],
      };
      const next = {
        ...prev,
        [studentName]: nextStudent,
      };
      statusMapRef.current = next;
      setProcessingResults((results) =>
        results.map((item) => item.studentName === studentName ? nextStudent : item)
      );
      return next;
    });

    try {
      pollInterval = window.setInterval(() => {
        void refreshTask();
      }, 2000);

      const res = await fetch(`/api/tasks/${taskId}/retry`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ studentName }),
      });
      const data = await res.json().catch(() => ({}));
      await refreshTask();
      if (!res.ok || data.success === false) {
        throw new Error(data.error || '重试失败');
      }
    } catch (err) {
      if (!suppressError) {
        setError(err instanceof Error ? err.message : '重试失败');
      }
      await refreshTask();
    } finally {
      if (pollInterval) {
        window.clearInterval(pollInterval);
      }
      setRetryingStudents((prev) => prev.filter((name) => name !== studentName));
    }
  }, [refreshTask, taskId]);

  const retryAllFailed = useCallback(async () => {
    if (!taskId) return;
    const failedStudents = Object.values(statusMapRef.current)
      .filter((s) => s.reportStatus === 'failed')
      .map((s) => s.studentName);

    if (failedStudents.length === 0) return;

    setIsRetryingAll(true);
    setError(null);
    try {
      for (const studentName of failedStudents) {
        await retryStudent(studentName, true);
      }
    } finally {
      setIsRetryingAll(false);
      await refreshTask();
    }
  }, [refreshTask, retryStudent, taskId]);

  const resultRows = Object.values(statusMap);
  const completedCount = processingResults.filter((r) => r.reportStatus === 'completed').length;
  const failedCount = processingResults.filter((r) => r.reportStatus === 'failed').length;
  const totalPages = studentPreviews.reduce((sum, student) => sum + student.pages, 0);
  const canStart = !!taskId && studentPreviews.length > 0 && !isProcessing && !isComplete;
  const currentStep = !taskId ? 1 : studentPreviews.length === 0 ? 2 : isComplete ? 4 : 3;

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-900">
      <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
        <header className="mb-6 flex flex-col gap-4 border-b border-slate-200 pb-5 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <p className="text-sm font-medium text-blue-700">作文批改工作台</p>
            <h1 className="mt-1 text-3xl font-semibold tracking-tight text-slate-950">作文 AI 批改工具</h1>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() => setShowHistory(false)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                !showHistory ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              新建批改
            </button>
            <button
              onClick={() => setShowHistory(true)}
              className={`rounded-md px-4 py-2 text-sm font-medium transition ${
                showHistory ? 'bg-slate-950 text-white' : 'bg-white text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50'
              }`}
            >
              任务历史
            </button>
          </div>
        </header>

        {error && (
          <div className="mb-5 flex items-start justify-between gap-4 rounded-md border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            <span>{error}</span>
            <button className="font-medium underline" onClick={() => setError(null)}>
              关闭
            </button>
          </div>
        )}

        {showHistory ? (
          <section className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
            <div className="mb-4 flex items-center justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-950">任务历史</h2>
                <p className="mt-1 text-sm text-slate-500">查看过往批次、下载成功报告、进入任务详情处理失败项。</p>
              </div>
              <button
                onClick={fetchTasks}
                className="rounded-md bg-white px-3 py-2 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
              >
                刷新
              </button>
            </div>
            {tasks.length === 0 ? (
              <div className="rounded-md border border-dashed border-slate-300 py-12 text-center text-sm text-slate-500">
                暂无任务记录
              </div>
            ) : (
              <div className="divide-y divide-slate-100">
                {tasks.map((task) => (
                  <div key={task.taskId} className="flex flex-col gap-4 py-4 lg:flex-row lg:items-center lg:justify-between">
                    <div className="min-w-0 flex-1">
                      <div className="mb-2 flex flex-wrap items-center gap-2">
                        <Link href={`/tasks/${task.taskId}`} className="font-mono text-sm font-medium text-blue-700 hover:underline">
                          {task.taskId}
                        </Link>
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getTaskStatusClass(task.status)}`}>
                          {getTaskStatusLabel(task.status)}
                        </span>
                      </div>
                      <p className="text-sm text-slate-500">{new Date(task.createdAt).toLocaleString('zh-CN')}</p>
                      <p className="mt-2 line-clamp-1 text-sm text-slate-600">{task.correctionRequirement.substring(0, 120)}...</p>
                    </div>
                    <div className="flex flex-wrap items-center gap-3 text-sm">
                      <span className="text-slate-500">总计 {task.total}</span>
                      <span className="text-emerald-700">成功 {task.completed}</span>
                      <span className={task.failed > 0 ? 'text-rose-700' : 'text-slate-400'}>失败 {task.failed}</span>
                      {task.completed > 0 && (
                        <button
                          onClick={() => downloadReports(task.taskId)}
                          className="rounded-md bg-emerald-600 px-3 py-2 text-sm font-medium text-white hover:bg-emerald-700"
                        >
                          下载报告
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </section>
        ) : (
          <>
            <section className="mb-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              {[
                ['1', '批改规则', currentStep > 1 ? '已创建' : '待创建'],
                ['2', '上传分组', studentPreviews.length > 0 ? `${studentPreviews.length} 人` : '待上传'],
                ['3', '开始批改', isProcessing ? '处理中' : isComplete ? '已结束' : '待启动'],
                ['4', '结果处理', failedCount > 0 ? `${failedCount} 个异常` : completedCount > 0 ? '可下载' : '待生成'],
              ].map(([step, title, desc]) => (
                <div
                  key={step}
                  className={`rounded-lg px-4 py-3 ring-1 ${
                    Number(step) === currentStep ? 'bg-slate-950 text-white ring-slate-950' : 'bg-white text-slate-700 ring-slate-200'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <span className={`flex h-8 w-8 items-center justify-center rounded-full text-sm font-semibold ${
                      Number(step) === currentStep ? 'bg-white text-slate-950' : 'bg-slate-100 text-slate-700'
                    }`}>
                      {step}
                    </span>
                    <div>
                      <p className="text-sm font-semibold">{title}</p>
                      <p className={`text-xs ${Number(step) === currentStep ? 'text-slate-200' : 'text-slate-500'}`}>{desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </section>

            <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_360px]">
              <div className="space-y-5">
                <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <div className="mb-4 flex items-center justify-between gap-4">
                    <div>
                      <h2 className="text-lg font-semibold text-slate-950">本次批改要求</h2>
                      <p className="mt-1 text-sm text-slate-500">创建任务后，规则会随任务保存，失败重试会继续沿用同一套要求。</p>
                    </div>
                    {taskId && (
                      <span className="rounded-full bg-emerald-50 px-3 py-1 text-xs font-medium text-emerald-700 ring-1 ring-emerald-200">
                        已创建
                      </span>
                    )}
                  </div>
                  <textarea
                    ref={correctionRequirementRef}
                    className="h-56 w-full resize-none rounded-md border border-slate-300 bg-white p-3 text-sm leading-6 text-slate-800 outline-none transition placeholder:text-slate-400 focus:border-blue-500 focus:ring-2 focus:ring-blue-100 disabled:bg-slate-50 disabled:text-slate-500"
                    placeholder={`老师可以在这里输入或粘贴：
- 作文题目
- 年级
- 满分
- 评分标准
- 特殊批改要求
- 教学重点

示例：
作文题目：《那一刻，我长大了》
年级：初三
满分：50分
评分标准：
一类文：45-50分……
二类文：38-44分……
三类文：30-37分……
本次重点关注细节描写和结尾升华。`}
                    value={correctionRequirement}
                    onChange={(e) => setCorrectionRequirement(e.target.value)}
                    onInput={(e) => setCorrectionRequirement(e.currentTarget.value)}
                    disabled={!!taskId}
                  />
                  {!taskId && (
                    <button
                      className={`mt-4 rounded-md px-5 py-2.5 text-sm font-medium text-white ${
                        correctionRequirement.trim() ? 'bg-blue-600 hover:bg-blue-700' : 'bg-slate-400 hover:bg-slate-500'
                      }`}
                      onClick={createTask}
                      aria-disabled={!correctionRequirement.trim()}
                    >
                      创建任务
                    </button>
                  )}
                </div>

                <div className={`rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200 ${!taskId ? 'opacity-70' : ''}`}>
                  <div className="mb-4">
                    <h2 className="text-lg font-semibold text-slate-950">上传作文图片</h2>
                    <p className="mt-1 text-sm text-slate-500">文件名按“学生姓名-页码”命名，系统会自动按学生分组。</p>
                  </div>
                  <div
                    {...getRootProps()}
                    className={`rounded-lg border-2 border-dashed p-8 text-center transition ${
                      canUpload ? 'cursor-pointer' : 'cursor-not-allowed'
                    } ${isDragActive ? 'border-blue-500 bg-blue-50' : 'border-slate-300 bg-slate-50 hover:border-blue-400 hover:bg-blue-50/40'}`}
                  >
                    <input {...getInputProps()} disabled={!canUpload} />
                    <p className="text-sm font-medium text-slate-800">
                      {isDragActive ? '放开以上传文件' : canUpload ? '拖拽图片到这里，或点击选择文件' : taskId ? '当前任务已进入处理阶段' : '创建任务后可上传图片'}
                    </p>
                    <p className="mt-2 text-xs text-slate-500">支持 jpg、jpeg、png、webp；单文件最大 10MB。</p>
                  </div>

                  <div className="mt-4 grid gap-3 sm:grid-cols-2">
                    <div className="rounded-md bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                      <p className="text-xs text-slate-500">已上传文件</p>
                      <p className="mt-1 text-2xl font-semibold text-slate-950">{uploadedFiles.length}</p>
                    </div>
                    <div className="rounded-md bg-slate-50 px-4 py-3 ring-1 ring-slate-200">
                      <p className="text-xs text-slate-500">识别学生</p>
                      <p className="mt-1 text-2xl font-semibold text-slate-950">{studentPreviews.length}</p>
                    </div>
                  </div>

                  {studentPreviews.length > 0 && (
                    <div className="mt-4">
                      <h3 className="mb-2 text-sm font-medium text-slate-700">分组预览</h3>
                      <div className="flex flex-wrap gap-2">
                        {studentPreviews.map((s) => (
                          <span key={s.studentName} className="rounded-full bg-blue-50 px-3 py-1 text-sm text-blue-700 ring-1 ring-blue-200">
                            {s.studentName} · {s.pages} 页
                          </span>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>

              <aside className="space-y-5">
                <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <h2 className="text-lg font-semibold text-slate-950">批次概览</h2>
                  <div className="mt-4 space-y-3 text-sm">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">任务编号</span>
                      <span className="max-w-[210px] truncate font-mono text-xs text-slate-700">{taskId || '未创建'}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">学生数</span>
                      <span className="font-medium text-slate-900">{studentPreviews.length}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">页数</span>
                      <span className="font-medium text-slate-900">{totalPages}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">成功报告</span>
                      <span className="font-medium text-emerald-700">{completedCount}</span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-500">异常作文</span>
                      <span className="font-medium text-rose-700">{failedCount}</span>
                    </div>
                  </div>
                </div>

                <div className="rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
                  <h2 className="text-lg font-semibold text-slate-950">主操作</h2>
                  <div className="mt-4 flex flex-col gap-3">
                    <button
                      className="rounded-md bg-emerald-600 px-4 py-2.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:bg-slate-300"
                      onClick={startCorrection}
                      disabled={!canStart}
                    >
                      {isProcessing ? '批改处理中...' : '开始批改'}
                    </button>
                    {failedCount > 0 && (
                      <button
                        className="rounded-md bg-amber-500 px-4 py-2.5 text-sm font-medium text-white hover:bg-amber-600 disabled:bg-slate-300"
                        onClick={retryAllFailed}
                        disabled={isRetryingAll || retryingStudents.length > 0}
                      >
                        {isRetryingAll ? '重试中...' : '重试全部失败'}
                      </button>
                    )}
                    {completedCount > 0 && (
                      <button
                        className="rounded-md bg-slate-950 px-4 py-2.5 text-sm font-medium text-white hover:bg-slate-800"
                        onClick={() => downloadReports()}
                      >
                        下载全部报告 ZIP
                      </button>
                    )}
                    <button
                      className="rounded-md bg-white px-4 py-2.5 text-sm font-medium text-slate-700 ring-1 ring-slate-200 hover:bg-slate-50"
                      onClick={resetCurrentTaskState}
                    >
                      开始新一批
                    </button>
                  </div>
                </div>
              </aside>
            </section>

            {(isProcessing || isComplete || resultRows.length > 0) && (
              <section className="mt-5 rounded-lg bg-white p-5 shadow-sm ring-1 ring-slate-200">
                <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <h2 className="text-lg font-semibold text-slate-950">处理结果</h2>
                    <p className="mt-1 text-sm text-slate-500">失败项会保留原始图片和批改规则，可直接单篇或批量重试。</p>
                  </div>
                  <div className="flex gap-3 text-sm">
                    <span className="text-slate-500">共 {processingResults.length} 篇</span>
                    <span className="text-emerald-700">成功 {completedCount}</span>
                    <span className="text-rose-700">异常 {failedCount}</span>
                  </div>
                </div>

                <div className="overflow-x-auto">
                  <table className="w-full min-w-[760px] text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                        <th className="py-3 pr-3">学生</th>
                        <th className="px-3 py-3 text-center">页数</th>
                        <th className="px-3 py-3 text-center">图片识别</th>
                        <th className="px-3 py-3 text-center">AI批改</th>
                        <th className="px-3 py-3 text-center">报告</th>
                        <th className="py-3 pl-3 text-center">操作</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {resultRows.map((s) => (
                        <tr key={s.studentName} className="hover:bg-slate-50">
                          <td className="py-3 pr-3 font-medium text-slate-950">{s.studentName}</td>
                          <td className="px-3 py-3 text-center text-slate-600">{s.pageCount}</td>
                          <td className="px-3 py-3 text-center">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStageClass(s.recognitionStatus)}`}>
                              {getStageLabel(s.recognitionStatus, '识别中')}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStageClass(s.aiStatus)}`}>
                              {getStageLabel(s.aiStatus, '批改中')}
                            </span>
                          </td>
                          <td className="px-3 py-3 text-center">
                            <span className={`rounded-full px-2.5 py-1 text-xs font-medium ${getStageClass(s.reportStatus)}`}>
                              {s.reportStatus === 'completed' ? '可下载' : s.reportStatus === 'failed' ? '异常' : '等待'}
                            </span>
                            {s.reportStatus === 'failed' && s.errors.length > 0 && (
                              <div className="mx-auto mt-1 max-w-[260px] truncate text-xs text-rose-600">{s.errors[0]}</div>
                            )}
                          </td>
                          <td className="py-3 pl-3 text-center">
                            {s.reportStatus === 'failed' || retryingStudents.includes(s.studentName) ? (
                              <button
                                className="rounded-md bg-amber-500 px-3 py-1.5 text-xs font-medium text-white hover:bg-amber-600 disabled:bg-slate-300"
                                onClick={() => retryStudent(s.studentName)}
                                disabled={retryingStudents.includes(s.studentName) || isRetryingAll}
                              >
                                {retryingStudents.includes(s.studentName) ? '重试中...' : '重试'}
                              </button>
                            ) : (
                              <span className="text-slate-400">-</span>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </section>
            )}
          </>
        )}
      </div>
    </main>
  );
}
