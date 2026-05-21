import path from 'path';
import fs from 'fs';

export interface ReportData {
  studentName: string;
  detectedEssayTopic: string;
  detectedFullScore: string;
  score: number;
  level: string;
  summary: string;
  dimensionScores: Array<{
    name: string;
    score: number;
    maxScore: number | null;
    comment: string;
  }>;
  strengths: string[];
  problems: string[];
  specificSuggestions: Array<{
    problem: string;
    suggestion: string;
  }>;
  goodSentences: Array<{
    sentence: string;
    reason: string;
  }>;
  weakSentences: Array<{
    sentence: string;
    problem: string;
    rewrite: string;
  }>;
  improvedEssay: string;
  nextTrainingAdvice: string;
}

function escapeHtml(str: string): string {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

function escapeCsvField(value: string | number | undefined | null): string {
  if (value === undefined || value === null) return '';
  const str = String(value);
  if (['=', '+', '-', '@', '\t', '\r'].includes(str.charAt(0))) {
    return `"'${str.replace(/"/g, '""')}"`;
  }
  return `"${str.replace(/"/g, '""')}"`;
}

export function generateHtmlReport(
  taskId: string,
  studentName: string,
  reportData: ReportData
): string {
  const safeStudentName = escapeHtml(studentName);
  const safeTopic = escapeHtml(reportData.detectedEssayTopic || '未识别到题目');
  const safeFullScore = escapeHtml(reportData.detectedFullScore || '未识别到满分');

  const html = `<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${safeStudentName}-作文批改报告</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: "Microsoft YaHei", "SimHei", Arial, sans-serif; background: #f5f5f5; padding: 20px; }
    .container { max-width: 800px; margin: 0 auto; background: #fff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1); padding: 30px; }
    h1 { text-align: center; color: #333; font-size: 22px; margin-bottom: 20px; border-bottom: 2px solid #4a90d9; padding-bottom: 15px; }
    .info-grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 15px; margin-bottom: 25px; background: #f9f9f9; padding: 15px; border-radius: 6px; }
    .info-item { display: flex; gap: 8px; }
    .info-label { font-weight: bold; color: #555; min-width: 80px; }
    .info-value { color: #333; }
    .score-box { text-align: center; padding: 20px; background: linear-gradient(135deg, #4a90d9, #67a8e4); color: white; border-radius: 8px; margin-bottom: 25px; }
    .score-number { font-size: 48px; font-weight: bold; }
    .score-detail { font-size: 14px; margin-top: 5px; opacity: 0.9; }
    .section { margin-bottom: 20px; }
    .section-title { font-size: 16px; color: #4a90d9; border-left: 4px solid #4a90d9; padding-left: 10px; margin-bottom: 12px; }
    .section-content { padding: 12px; background: #fafafa; border-radius: 6px; line-height: 1.8; color: #444; font-size: 14px; }
    .dimension-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
    .dimension-item { background: #f0f7ff; padding: 10px; border-radius: 6px; text-align: center; }
    .dimension-name { font-size: 12px; color: #666; margin-bottom: 5px; }
    .dimension-score { font-size: 20px; font-weight: bold; color: #4a90d9; }
    .dimension-max { font-size: 12px; color: #999; }
    .list-item { margin-bottom: 8px; padding-left: 20px; position: relative; }
    .list-item::before { content: "•"; position: absolute; left: 5px; color: #4a90d9; }
    .good-sentence { background: #f6ffed; border-left: 3px solid #52c41a; padding: 10px; margin-bottom: 10px; border-radius: 4px; }
    .good-sentence-text { color: #333; margin-bottom: 5px; }
    .good-sentence-reason { font-size: 12px; color: #888; }
    .weak-sentence { background: #fff7e6; border-left: 3px solid #fa8c16; padding: 10px; margin-bottom: 10px; border-radius: 4px; }
    .weak-sentence-text { color: #333; text-decoration: line-through; opacity: 0.7; margin-bottom: 5px; }
    .weak-sentence-problem { font-size: 12px; color: #fa8c16; margin-bottom: 3px; }
    .weak-sentence-rewrite { font-size: 12px; color: #52c41a; }
    .improved-essay { background: #f6ffed; padding: 15px; border-radius: 6px; line-height: 1.8; white-space: pre-wrap; color: #333; }
    .footer { margin-top: 30px; padding-top: 15px; border-top: 1px solid #eee; text-align: center; font-size: 12px; color: #999; }
  </style>
</head>
<body>
  <div class="container">
    <h1>${safeStudentName} 作文批改报告</h1>

    <div class="info-grid">
      <div class="info-item"><span class="info-label">作文题目：</span><span class="info-value">${safeTopic}</span></div>
      <div class="info-item"><span class="info-label">满分：</span><span class="info-value">${safeFullScore}</span></div>
    </div>

    <div class="score-box">
      <div class="score-number">${escapeHtml(String(reportData.score))}</div>
      <div class="score-detail">评分等级：${escapeHtml(reportData.level)}</div>
    </div>

    <div class="section">
      <div class="section-title">综合评价</div>
      <div class="section-content">${escapeHtml(reportData.summary)}</div>
    </div>

    <div class="section">
      <div class="section-title">分项评分</div>
      <div class="dimension-grid">
        ${reportData.dimensionScores.map(d => `
          <div class="dimension-item">
            <div class="dimension-name">${escapeHtml(d.name)}</div>
            <div class="dimension-score">${escapeHtml(String(d.score))}<span class="dimension-max">${d.maxScore ? '/' + escapeHtml(String(d.maxScore)) : ''}</span></div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">写得好的地方</div>
      <div class="section-content">
        ${reportData.strengths.map(s => `<div class="list-item">${escapeHtml(s)}</div>`).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">主要问题</div>
      <div class="section-content">
        ${reportData.problems.map(p => `<div class="list-item">${escapeHtml(p)}</div>`).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">具体修改建议</div>
      <div class="section-content">
        ${reportData.specificSuggestions.map((s, i) => `<div class="list-item">${i + 1}. ${escapeHtml(s.problem)} → ${escapeHtml(s.suggestion)}</div>`).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">好句点评</div>
      <div class="section-content">
        ${reportData.goodSentences.map(g => `
          <div class="good-sentence">
            <div class="good-sentence-text">"${escapeHtml(g.sentence)}"</div>
            <div class="good-sentence-reason">理由：${escapeHtml(g.reason)}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">病句修改</div>
      <div class="section-content">
        ${reportData.weakSentences.map(w => `
          <div class="weak-sentence">
            <div class="weak-sentence-text">"${escapeHtml(w.sentence)}"</div>
            <div class="weak-sentence-problem">问题：${escapeHtml(w.problem)}</div>
            <div class="weak-sentence-rewrite">修改建议：${escapeHtml(w.rewrite)}</div>
          </div>
        `).join('')}
      </div>
    </div>

    <div class="section">
      <div class="section-title">改良版作文</div>
      <div class="improved-essay">${escapeHtml(reportData.improvedEssay)}</div>
    </div>

    <div class="section">
      <div class="section-title">下次训练建议</div>
      <div class="section-content">${escapeHtml(reportData.nextTrainingAdvice)}</div>
    </div>

    <div class="footer">
      本文由 AI 根据图片识别内容生成，建议老师结合原卷复核关键分数。
    </div>
  </div>
</body>
</html>`;

  return html;
}

export function saveReport(
  taskId: string,
  studentName: string,
  reportHtml: string
): string {
  const reportsDir = path.join(process.cwd(), 'tasks', taskId, 'reports');
  if (!fs.existsSync(reportsDir)) {
    fs.mkdirSync(reportsDir, { recursive: true });
  }
  const safeFileName = studentName.replace(/[^a-zA-Z0-9一-龥.-]/g, '_');
  const fileName = `${safeFileName}-作文批改报告.html`;
  const filePath = path.join(reportsDir, fileName);
  fs.writeFileSync(filePath, reportHtml, 'utf-8');
  return fileName;
}

export function saveRecognizedText(
  taskId: string,
  studentName: string,
  text: string
): string {
  const recognizedDir = path.join(process.cwd(), 'tasks', taskId, 'recognized');
  if (!fs.existsSync(recognizedDir)) {
    fs.mkdirSync(recognizedDir, { recursive: true });
  }
  const safeFileName = studentName.replace(/[^a-zA-Z0-9一-龥.-]/g, '_');
  const fileName = `${safeFileName}-作文识别文本.txt`;
  const filePath = path.join(recognizedDir, fileName);
  fs.writeFileSync(filePath, text, 'utf-8');
  return fileName;
}