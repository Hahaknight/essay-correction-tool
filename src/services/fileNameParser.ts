export interface ParsedFile {
  studentName: string;
  pageIndex: number;
  fileName: string;
  originalName: string;
  filePath?: string;
}

export interface ParseResult {
  success: ParsedFile[];
  failed: { fileName: string; reason: string }[];
}

const FILENAME_PATTERN = /^([a-zA-Z0-9一-龥_.-]+)-(\d+)\.(jpg|jpeg|png|webp)$/i;

export function sanitizeFileName(fileName: string): string {
  return fileName.replace(/[^a-zA-Z0-9一-龥.-]/g, '_');
}

export function parseFileName(fileName: string): ParsedFile | null {
  const match = fileName.match(FILENAME_PATTERN);
  if (!match) return null;

  const [, studentName, pageIndexStr, ext] = match;
  const pageIndex = parseInt(pageIndexStr, 10);

  if (!studentName || isNaN(pageIndex) || pageIndex <= 0) {
    return null;
  }

  return {
    studentName: studentName.trim(),
    pageIndex,
    fileName: fileName,
    originalName: fileName,
  };
}

export function parseMultipleFiles(
  fileNames: string[]
): ParseResult {
  const success: ParsedFile[] = [];
  const failed: { fileName: string; reason: string }[] = [];

  for (const fileName of fileNames) {
    const parsed = parseFileName(fileName);
    if (parsed) {
      success.push(parsed);
    } else {
      failed.push({
        fileName,
        reason: '文件名不符合规则，请使用"学生姓名-页码"格式，如：张三-1.jpg',
      });
    }
  }

  return { success, failed };
}

export function groupByStudent(files: ParsedFile[]): Map<string, ParsedFile[]> {
  const grouped = new Map<string, ParsedFile[]>();

  for (const file of files) {
    const existing = grouped.get(file.studentName) || [];
    existing.push(file);
    grouped.set(file.studentName, existing);
  }

  for (const [_, files_of_student] of grouped) {
    files_of_student.sort((a, b) => a.pageIndex - b.pageIndex);
  }

  return grouped;
}