import fs from 'fs';
import path from 'path';

export interface SummaryStudent {
  studentName: string;
  pageCount: number;
  score?: number;
  level?: string;
  reportFile?: string;
  status: string;
}

function escapeCsvField(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (['=', '+', '-', '@', '\t', '\r'].includes(str.charAt(0))) {
    return `"'${str.replace(/"/g, '""')}"`;
  }
  return `"${str.replace(/"/g, '""').replace(/\r\n/g, '\\n').replace(/\n/g, '\\n').replace(/\r/g, '')}"`;
}

export function generateSummaryCsv(
  taskId: string,
  students: SummaryStudent[]
): string {
  const rows = students.map((s) => {
    return [
      escapeCsvField(s.studentName),
      escapeCsvField(s.pageCount),
      escapeCsvField(s.score),
      escapeCsvField(s.level),
      escapeCsvField(s.reportFile),
      escapeCsvField(s.status),
    ].join(',');
  });

  const csv = ['学生姓名,页数,分数,等级,报告文件名,状态', ...rows].join('\n');
  const csvDir = path.join(process.cwd(), 'tasks', taskId);
  const csvPath = path.join(csvDir, '批改汇总表.csv');
  fs.writeFileSync(csvPath, '﻿' + csv, 'utf-8');
  return csvPath;
}