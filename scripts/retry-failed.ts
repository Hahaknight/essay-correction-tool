import { Student } from '@/services/taskService';
import { correctEssay } from '@/services/aiCorrectionService';
import { generateHtmlReport, saveReport, type ReportData } from '@/services/reportService';
import { generateSummaryCsv } from '@/services/summaryService';
import fs from 'fs';
import path from 'path';

if (!process.env.MINIMAX_API_KEY) {
  throw new Error('MINIMAX_API_KEY is not configured');
}

const TASKS_DIR = path.join(process.cwd(), 'tasks');

async function retryFailedStudents() {
  const today = '2026-05-29';
  const failedList: { taskId: string; student: Student }[] = [];

  // 收集今天所有失败的学生
  for (const dir of fs.readdirSync(TASKS_DIR)) {
    if (!dir.startsWith(`task-${today.replace(/-/g, '')}`)) continue;
    const taskPath = path.join(TASKS_DIR, dir, 'task.json');
    if (!fs.existsSync(taskPath)) continue;

    const task = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
    for (const student of task.students) {
      if (student.status === 'failed') {
        failedList.push({ taskId: dir, student });
      }
    }
  }

  console.log(`找到 ${failedList.length} 个失败的学生`);

  for (const { taskId, student } of failedList) {
    const taskPath = path.join(TASKS_DIR, taskId, 'task.json');
    const task = JSON.parse(fs.readFileSync(taskPath, 'utf-8'));
    const studentInTask = task.students.find((s: Student) => s.studentName === student.studentName);

    console.log(`\n重试: ${student.studentName} (${taskId})`);

    if (!studentInTask || !studentInTask.recognizedEssayText) {
      console.log(`  跳过: 没有识别文本`);
      continue;
    }

    studentInTask.status = 'processing';
    studentInTask.errors = [];
    studentInTask.aiStatus = 'pending';
    fs.writeFileSync(taskPath, JSON.stringify(task, null, 2), 'utf-8');

    const correctionResult = await correctEssay(
      taskId,
      studentInTask,
      task.correctionRequirement,
      studentInTask.recognizedEssayText
    );

    if (correctionResult.success && correctionResult.report) {
      const reportData = correctionResult.report as ReportData;
      const reportHtml = generateHtmlReport(taskId, studentInTask.studentName, reportData);
      const reportFileName = saveReport(taskId, studentInTask.studentName, reportHtml);

      studentInTask.status = 'completed';
      studentInTask.aiStatus = 'completed';
      studentInTask.report = {
        score: reportData.score,
        level: reportData.level,
        reportFile: reportFileName,
      };
      console.log(`  成功: score=${reportData.score}, level=${reportData.level}`);
    } else {
      studentInTask.status = 'failed';
      studentInTask.aiStatus = 'failed';
      studentInTask.errors.push(`AI批改失败: ${correctionResult.error}`);
      console.log(`  失败: ${correctionResult.error}`);
    }

    fs.writeFileSync(taskPath, JSON.stringify(task, null, 2), 'utf-8');

    // 更新汇总 CSV
    generateSummaryCsv(
      taskId,
      task.students.map((s: Student) => ({
        studentName: s.studentName,
        pageCount: s.pages.length,
        score: s.report?.score,
        level: s.report?.level,
        reportFile: s.report?.reportFile,
        status: s.status,
      }))
    );

    // 避免请求过快
    await new Promise((r) => setTimeout(r, 2000));
  }

  console.log('\n完成!');
}

retryFailedStudents().catch(console.error);
