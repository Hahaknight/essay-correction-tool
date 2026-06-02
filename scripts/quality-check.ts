import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { parseFileName, groupByStudent, type ParsedFile } from '../src/services/fileNameParser';
import { generateHtmlReport, type ReportData } from '../src/services/reportService';
import { generateSummaryCsv } from '../src/services/summaryService';

function testFileNameParser() {
  const parsed = parseFileName('张三-2.jpg');
  assert.deepEqual(parsed, {
    studentName: '张三',
    pageIndex: 2,
    fileName: '张三-2.jpg',
    originalName: '张三-2.jpg',
  });
  assert.equal(parseFileName('张三.jpg'), null);
  assert.equal(parseFileName('张三-0.png'), null);

  const files: ParsedFile[] = [
    { studentName: '李四', pageIndex: 2, fileName: '李四-2.jpg', originalName: '李四-2.jpg' },
    { studentName: '李四', pageIndex: 1, fileName: '李四-1.jpg', originalName: '李四-1.jpg' },
  ];
  const grouped = groupByStudent(files);
  assert.deepEqual(grouped.get('李四')?.map((file) => file.pageIndex), [1, 2]);
}

function testReportHtmlEscaping() {
  const report: ReportData = {
    studentName: '张三',
    detectedEssayTopic: '<script>alert(1)</script>',
    detectedFullScore: '50',
    score: 42,
    level: '良好',
    summary: '整体不错',
    dimensionScores: [{ name: '内容', score: 18, maxScore: 20, comment: '具体' }],
    strengths: ['细节充分'],
    problems: ['结尾略急'],
    specificSuggestions: [{ problem: '结尾', suggestion: '补充感受' }],
    goodSentences: [{ sentence: '阳光落下', reason: '有画面' }],
    weakSentences: [{ sentence: '我很开心', problem: '笼统', rewrite: '写出动作和心理' }],
    improvedEssay: '改良版',
    nextTrainingAdvice: '练习细节描写',
  };

  const html = generateHtmlReport('quality-test', '张三', report);
  assert.match(html, /&lt;script&gt;alert\(1\)&lt;\/script&gt;/);
  assert.doesNotMatch(html, /<script>alert\(1\)<\/script>/);
}

function testSummaryCsvInjectionGuard() {
  const taskId = `quality-${Date.now()}`;
  const tasksDir = path.join(process.cwd(), 'tasks', taskId);
  fs.mkdirSync(tasksDir, { recursive: true });

  try {
    const csvPath = generateSummaryCsv(taskId, [
      {
        studentName: '=HYPERLINK("http://example.com")',
        pageCount: 1,
        score: 40,
        level: '良好',
        reportFile: 'report.html',
        status: 'completed',
      },
    ]);
    const csv = fs.readFileSync(csvPath, 'utf-8');
    assert.match(csv, /"'=HYPERLINK/);
  } finally {
    fs.rmSync(tasksDir, { recursive: true, force: true });
  }
}

function main() {
  testFileNameParser();
  testReportHtmlEscaping();
  testSummaryCsvInjectionGuard();
  console.log('quality-check: all checks passed');
}

main();
