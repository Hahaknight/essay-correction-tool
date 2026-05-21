'use client';

import { useState, useCallback } from 'react';
import { useDropzone } from 'react-dropzone';

interface StudentPreview {
  studentName: string;
  pages: number;
}

interface ProcessingStatus {
  studentName: string;
  pageCount: number;
  recognitionStatus: string;
  aiStatus: string;
  reportStatus: string;
}

export default function Home() {
  const [correctionRequirement, setCorrectionRequirement] = useState('');
  const [taskId, setTaskId] = useState<string | null>(null);
  const [uploadedFiles, setUploadedFiles] = useState<string[]>([]);
  const [studentPreviews, setStudentPreviews] = useState<StudentPreview[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [processingResults, setProcessingResults] = useState<ProcessingStatus[]>([]);
  const [statusMap, setStatusMap] = useState<Record<string, ProcessingStatus>>({});
  const [isComplete, setIsComplete] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const onDrop = useCallback(async (acceptedFiles: File[]) => {
    if (!taskId) {
      setError('请先创建任务');
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
  }, [taskId]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: {
      'image/jpeg': ['.jpg', '.jpeg'],
      'image/png': ['.png'],
      'image/webp': ['.webp'],
    },
  });

  const createTask = async () => {
    if (!correctionRequirement.trim()) {
      setError('请输入批改要求');
      return;
    }

    try {
      const res = await fetch('/api/tasks', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correctionRequirement }),
      });

      if (!res.ok) throw new Error('创建任务失败');

      const data = await res.json();
      setTaskId(data.taskId);
      setError(null);
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
      recognitionStatus: 'pending',
      aiStatus: 'pending',
      reportStatus: 'pending',
    })));

    const initialStatus: Record<string, ProcessingStatus> = {};
    for (const s of studentPreviews) {
      initialStatus[s.studentName] = {
        studentName: s.studentName,
        pageCount: s.pages,
        recognitionStatus: 'pending',
        aiStatus: 'pending',
        reportStatus: 'pending',
      };
    }
    setStatusMap(initialStatus);

    try {
      const res = await fetch(`/api/tasks/${taskId}/start`, { method: 'POST' });
      if (!res.ok) throw new Error('启动批改失败');

      const data = await res.json();

      setProcessingResults(studentPreviews.map((s) => ({
        studentName: s.studentName,
        pageCount: s.pages,
        recognitionStatus: 'completed',
        aiStatus: 'completed',
        reportStatus: 'completed',
      })));

      setIsComplete(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : '批改失败');
    } finally {
      setIsProcessing(false);
    }
  };

  const downloadReports = async () => {
    if (!taskId) return;
    try {
      const res = await fetch(`/api/tasks/${taskId}/download`);
      if (!res.ok) throw new Error('下载失败');

      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `作文批改报告-${taskId}.zip`;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (err) {
      setError(err instanceof Error ? err.message : '下载失败');
    }
  };

  return (
    <div className="min-h-screen bg-gray-100 py-8 px-4">
      <div className="max-w-3xl mx-auto">
        <h1 className="text-2xl font-bold text-center text-gray-800 mb-8">
          作文 AI 批改工具
        </h1>

        {error && (
          <div className="mb-4 p-4 bg-red-100 border border-red-400 text-red-700 rounded">
            {error}
            <button
              className="ml-4 text-sm underline"
              onClick={() => setError(null)}
            >
              关闭
            </button>
          </div>
        )}

        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <h2 className="text-lg font-semibold text-gray-700 mb-4">本次批改要求</h2>
          <textarea
            className="w-full h-48 p-3 border border-gray-300 rounded-lg resize-none text-sm"
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
            disabled={!!taskId}
          />

          {!taskId && (
            <button
              className="mt-4 px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-400"
              onClick={createTask}
              disabled={!correctionRequirement.trim()}
            >
              创建任务
            </button>
          )}

          {taskId && (
            <div className="mt-4 p-3 bg-green-50 border border-green-200 rounded text-sm text-green-700">
              任务已创建：{taskId}
            </div>
          )}
        </div>

        {taskId && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">上传作文图片</h2>

            <div
              {...getRootProps()}
              className={`border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors ${
                isDragActive ? 'border-blue-500 bg-blue-50' : 'border-gray-300 hover:border-blue-400'
              }`}
            >
              <input {...getInputProps()} />
              {isDragActive ? (
                <p className="text-blue-600">放开以上传文件</p>
              ) : (
                <p className="text-gray-600">拖拽图片到这里，或点击选择文件</p>
              )}
            </div>

            <p className="mt-3 text-sm text-gray-500">
              文件命名规则：请按&quot;学生姓名-页码&quot;命名，例如：张三-1.jpg、张三-2.jpg、李四-1.jpg
            </p>

            {uploadedFiles.length > 0 && (
              <div className="mt-4">
                <h3 className="text-sm font-medium text-gray-600 mb-2">
                  已上传 {uploadedFiles.length} 个文件
                </h3>
              </div>
            )}

            {studentPreviews.length > 0 && (
              <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                <h3 className="text-sm font-medium text-gray-600 mb-2">分组预览</h3>
                <div className="flex flex-wrap gap-2">
                  {studentPreviews.map((s) => (
                    <span
                      key={s.studentName}
                      className="px-3 py-1 bg-blue-100 text-blue-700 rounded-full text-sm"
                    >
                      {s.studentName}：{s.pages}页
                    </span>
                  ))}
                </div>
              </div>
            )}

            <button
              className="mt-4 px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:bg-gray-400"
              onClick={startCorrection}
              disabled={isProcessing || studentPreviews.length === 0}
            >
              {isProcessing ? '处理中...' : '开始批改'}
            </button>
          </div>
        )}

        {(isProcessing || isComplete) && (
          <div className="bg-white rounded-lg shadow-md p-6">
            <h2 className="text-lg font-semibold text-gray-700 mb-4">处理结果</h2>

            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b">
                    <th className="text-left py-2 px-2">学生</th>
                    <th className="text-center py-2 px-2">页数</th>
                    <th className="text-center py-2 px-2">图片识别</th>
                    <th className="text-center py-2 px-2">AI批改</th>
                    <th className="text-center py-2 px-2">报告状态</th>
                  </tr>
                </thead>
                <tbody>
                  {(isComplete ? processingResults : Object.values(statusMap)).map((s) => (
                    <tr key={s.studentName} className="border-b">
                      <td className="py-2 px-2">{s.studentName}</td>
                      <td className="text-center py-2 px-2">{s.pageCount}</td>
                      <td className="text-center py-2 px-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          s.recognitionStatus === 'completed' ? 'bg-green-100 text-green-700' :
                          s.recognitionStatus === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {s.recognitionStatus === 'completed' ? '已完成' :
                           s.recognitionStatus === 'failed' ? '失败' : '等待'}
                        </span>
                      </td>
                      <td className="text-center py-2 px-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          s.aiStatus === 'completed' ? 'bg-green-100 text-green-700' :
                          s.aiStatus === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {s.aiStatus === 'completed' ? '已完成' :
                           s.aiStatus === 'failed' ? '失败' : '等待'}
                        </span>
                      </td>
                      <td className="text-center py-2 px-2">
                        <span className={`px-2 py-1 rounded text-xs ${
                          s.reportStatus === 'completed' ? 'bg-green-100 text-green-700' :
                          s.reportStatus === 'failed' ? 'bg-red-100 text-red-700' :
                          'bg-gray-100 text-gray-600'
                        }`}>
                          {s.reportStatus === 'completed' ? '可下载' :
                           s.reportStatus === 'failed' ? '异常' : '等待'}
                        </span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {isComplete && (
              <div className="mt-6 p-4 bg-green-50 border border-green-200 rounded-lg">
                <p className="text-green-700 mb-4">
                  本次共识别：{processingResults.length} 篇作文，成功生成：{
                    processingResults.filter((r) => r.reportStatus === 'completed').length
                  } 份报告，异常：{
                    processingResults.filter((r) => r.reportStatus === 'failed').length
                  } 篇
                </p>
                <button
                  className="px-6 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700"
                  onClick={downloadReports}
                >
                  下载全部报告 ZIP
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}