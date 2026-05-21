import fs from 'fs';
import path from 'path';

export interface TaskPage {
  pageIndex: number;
  fileName: string;
  filePath: string;
  recognitionStatus: 'pending' | 'completed' | 'failed';
}

export interface TaskReport {
  score: number;
  level: string;
  reportFile: string;
}

export interface Student {
  studentName: string;
  status: 'pending' | 'processing' | 'completed' | 'failed';
  pages: TaskPage[];
  recognizedEssayText?: string;
  recognitionStatus: 'pending' | 'completed' | 'failed';
  aiStatus: 'pending' | 'processing' | 'completed' | 'failed';
  report?: TaskReport;
  errors: string[];
}

export interface Task {
  taskId: string;
  correctionRequirement: string;
  createdAt: string;
  status: 'created' | 'processing' | 'completed' | 'failed';
  students: Student[];
  errors: string[];
}

const TASKS_DIR = path.join(process.cwd(), 'tasks');

function ensureDir(dirPath: string) {
  if (!fs.existsSync(dirPath)) {
    fs.mkdirSync(dirPath, { recursive: true });
  }
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
  const taskPath = path.join(TASKS_DIR, task.taskId, 'task.json');
  atomicWriteJson(taskPath, task);
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
  const task = getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  task.status = status;
  if (updateFn) updateFn(task);
  saveTask(task);
  return task;
}

export function addStudentsToTask(taskId: string, students: Student[]): Task {
  const task = getTask(taskId);
  if (!task) throw new Error(`Task ${taskId} not found`);
  for (const s of students) {
    const existing = task.students.find((x) => x.studentName === s.studentName);
    if (existing) {
      existing.pages = [...existing.pages, ...s.pages];
      existing.pages.sort((a, b) => a.pageIndex - b.pageIndex);
    } else {
      task.students.push(s);
    }
  }
  saveTask(task);
  return task;
}