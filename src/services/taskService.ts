import fs from 'fs';
import path from 'path';

export interface TaskPage {
  pageIndex: number;
  fileName: string;
  filePath: string;
  recognitionStatus: ProcessingStageStatus;
}

export interface TaskReport {
  score: number;
  level: string;
  reportFile: string;
}

export interface Student {
  studentName: string;
  status: StudentStatus;
  pages: TaskPage[];
  recognizedEssayText?: string;
  recognitionStatus: ProcessingStageStatus;
  aiStatus: ProcessingStageStatus;
  report?: TaskReport;
  errors: string[];
}

export interface Task {
  taskId: string;
  correctionRequirement: string;
  createdAt: string;
  status: 'created' | 'processing' | 'completed' | 'failed' | 'partial';
  students: Student[];
  errors: string[];
}

const TASKS_DIR = path.join(process.cwd(), 'tasks');
const LOCK_SUFFIX = '.lock';
const STALE_LOCK_MS = 30000;

export type ProcessingStageStatus = 'pending' | 'processing' | 'completed' | 'failed';
export type StudentStatus = 'pending' | 'processing' | 'completed' | 'failed';

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
}

function acquireLock(taskId: string, timeoutMs = 5000): () => void {
  const lockPath = path.join(TASKS_DIR, taskId, LOCK_SUFFIX);
  const start = Date.now();
  const token = `${process.pid}-${Date.now()}-${Math.random()}`;

  while (true) {
    try {
      const fd = fs.openSync(lockPath, 'wx');
      fs.writeFileSync(fd, token, 'utf-8');
      fs.closeSync(fd);
      break;
    } catch (error) {
      const code = error instanceof Error && 'code' in error ? String(error.code) : '';
      if (code !== 'EEXIST') throw error;

      try {
        const stat = fs.statSync(lockPath);
        if (Date.now() - stat.mtimeMs > STALE_LOCK_MS) {
          fs.unlinkSync(lockPath);
          continue;
        }
      } catch {
        continue;
      }

      if (Date.now() - start > timeoutMs) {
        throw new Error(`Lock acquisition timeout for task ${taskId}`);
      }
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }

  return () => {
    try {
      if (fs.existsSync(lockPath) && fs.readFileSync(lockPath, 'utf-8') === token) {
        fs.unlinkSync(lockPath);
      }
    } catch {}
  };
}

function atomicWriteJson(filePath: string, data: object) {
  const tempPath = filePath + '.tmp';
  try {
    fs.writeFileSync(tempPath, JSON.stringify(data, null, 2), 'utf-8');
    fs.renameSync(tempPath, filePath);
  } catch (err) {
    if (fs.existsSync(tempPath)) {
      fs.unlinkSync(tempPath);
    }
    throw err;
  }
}

export function generateTaskId(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, '');
  const timeStr = now.toTimeString().slice(0, 8).replace(/:/g, '');
  return `task-${dateStr}-${timeStr}`;
}

export function createTask(correctionRequirement: string): Task {
  const taskId = generateTaskId();
  const task: Task = {
    taskId,
    correctionRequirement,
    createdAt: new Date().toISOString(),
    status: 'created',
    students: [],
    errors: [],
  };

  const taskDir = path.join(TASKS_DIR, taskId);
  ensureDir(taskDir);
  ensureDir(path.join(taskDir, 'original'));
  ensureDir(path.join(taskDir, 'recognized'));
  ensureDir(path.join(taskDir, 'reports'));

  atomicWriteJson(path.join(taskDir, 'task.json'), task);
  return task;
}

export function getTask(taskId: string): Task | null {
  return getTaskUnlocked(taskId);
}

function getTaskUnlocked(taskId: string): Task | null {
  const taskPath = path.join(TASKS_DIR, taskId, 'task.json');
  if (!fs.existsSync(taskPath)) return null;
  try {
    const content = fs.readFileSync(taskPath, 'utf-8');
    return JSON.parse(content);
  } catch (e) {
    console.error(`Failed to parse task JSON for ${taskId}:`, e);
    return null;
  }
}

export function saveTask(task: Task): void {
  const release = acquireLock(task.taskId);
  try {
    saveTaskUnlocked(task);
  } finally {
    release();
  }
}

function saveTaskUnlocked(task: Task): void {
  const taskPath = path.join(TASKS_DIR, task.taskId, 'task.json');
  atomicWriteJson(taskPath, task);
}

export function updateTaskLocked<T>(
  taskId: string,
  updateFn: (task: Task) => T
): T {
  const release = acquireLock(taskId);
  try {
    const task = getTaskUnlocked(taskId);
    if (!task) throw new Error(`Task ${taskId} not found`);
    const result = updateFn(task);
    saveTaskUnlocked(task);
    return result;
  } finally {
    release();
  }
}

export function getTaskDir(taskId: string): string {
  return path.join(TASKS_DIR, taskId);
}

export function getOriginalDir(taskId: string): string {
  return path.join(TASKS_DIR, taskId, 'original');
}

export function getRecognizedDir(taskId: string): string {
  return path.join(TASKS_DIR, taskId, 'recognized');
}

export function getReportsDir(taskId: string): string {
  return path.join(TASKS_DIR, taskId, 'reports');
}

export function updateTaskStatus(
  taskId: string,
  status: Task['status'],
  updateFn?: (task: Task) => void
): Task {
  return updateTaskLocked(taskId, (task) => {
    task.status = status;
    if (updateFn) updateFn(task);
    return task;
  });
}

export function addStudentsToTask(taskId: string, students: Student[]): Task {
  return updateTaskLocked(taskId, (task) => {
    for (const s of students) {
      const existing = task.students.find((x) => x.studentName === s.studentName);
      if (existing) {
        existing.pages = [...existing.pages, ...s.pages];
        existing.pages.sort((a, b) => a.pageIndex - b.pageIndex);
      } else {
        task.students.push(s);
      }
    }
    return task;
  });
}
