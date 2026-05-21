import { Student, getTask, saveTask } from '@/services/taskService';

export interface CorrectionResult {
  success: boolean;
  report?: object;
  error?: string;
}

const CORRECTION_PROMPT = `你是一名有多年作文批改经验的语文老师。

请严格根据"本次批改要求"对学生作文进行批改。

本次批改要求可能包含：
- 作文题目
- 年级
- 满分
- 评分标准
- 特殊批改要求
- 教学重点

批改要求：
1. 如果批改要求中包含明确评分标准，必须优先按照该评分标准评分。
2. 如果批改要求中包含满分，最终分数不得超过满分。
3. 如果批改要求中包含年级，请按照该年级学生的作文水平进行评价。
4. 不要给空泛评价，必须结合学生作文内容具体分析。
5. 必须指出写得好的地方。
6. 必须指出主要问题。
7. 必须给出可执行的修改建议。
8. 必须生成一篇改良版作文。
9. 改良版作文必须保留原作文的核心事件、人物和主题，不能完全另写。
10. 改良版作文的水平应适合该年级学生学习和模仿。
11. 输出必须是 JSON，不要输出 Markdown。

学生姓名：
{{studentName}}

本次批改要求：
{{correctionRequirement}}

学生作文识别内容：
{{recognizedEssayText}}

请按以下 JSON 格式输出：
{
  "studentName": "{{studentName}}",
  "detectedEssayTopic": "从批改要求中识别出的作文题目，如无法识别则为空",
  "detectedFullScore": "从批改要求中识别出的满分，如无法识别则为空",
  "score": 数字,
  "level": "优秀/良好/合格/待提升",
  "summary": "综合评价",
  "dimensionScores": [
    {
      "name": "评分维度",
      "score": 数字,
      "maxScore": 数字或空,
      "comment": "评分理由"
    }
  ],
  "strengths": [
    "写得好的地方1",
    "写得好的地方2",
    "写得好的地方3"
  ],
  "problems": [
    "主要问题1",
    "主要问题2",
    "主要问题3"
  ],
  "specificSuggestions": [
    {
      "problem": "具体问题",
      "suggestion": "修改建议"
    }
  ],
  "goodSentences": [
    {
      "sentence": "原文中的好句",
      "reason": "为什么写得好"
    }
  ],
  "weakSentences": [
    {
      "sentence": "原文中需要修改的句子",
      "problem": "问题",
      "rewrite": "建议改法"
    }
  ],
  "improvedEssay": "改良版作文",
  "nextTrainingAdvice": "下次训练建议"
}`;

const MINIMAX_API_HOST = 'https://api.minimaxi.com';
const DEFAULT_MODEL = 'MiniMax-M2.7';
const API_TIMEOUT_MS = 120000; // 2分钟超时

function fixJsonString(jsonStr: string): string {
  jsonStr = jsonStr.trim();

  const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
  jsonStr = jsonStr.replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  return jsonStr.trim();
}

function parseReportJson(jsonStr: string): object | null {
  try {
    return JSON.parse(jsonStr);
  } catch {
    const fixed = fixJsonString(jsonStr);
    try {
      return JSON.parse(fixed);
    } catch {
      return null;
    }
  }
}

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs: number
): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

  try {
    const response = await fetch(url, {
      ...options,
      signal: controller.signal,
    });
    return response;
  } finally {
    clearTimeout(timeout);
  }
}

async function callMinimaxChatWithRetry(
  apiKey: string,
  messages: { role: string; content: string }[],
  maxRetries: number = 3,
  retryDelay: number = 5000
): Promise<string> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const requestBody: Record<string, unknown> = {
        model: DEFAULT_MODEL,
        messages,
        temperature: 0.7,
        stream: false,
      };

      const response = await fetchWithTimeout(
        `${MINIMAX_API_HOST}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        },
        API_TIMEOUT_MS
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg =
          errorData?.error?.message ||
          errorData?.base_resp?.status_msg ||
          response.statusText;
        throw new Error(`API error ${response.status}: ${errorMsg}`);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('No content in API response');
      }

      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      console.error(`[AI Correction] Attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      if (attempt < maxRetries) {
        console.log(`[AI Correction] Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise((r) => setTimeout(r, retryDelay));
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

export async function correctEssay(
  taskId: string,
  student: Student,
  correctionRequirement: string,
  recognizedText: string
): Promise<CorrectionResult> {
  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'MINIMAX_API_KEY is not configured' };
  }

  const task = getTask(taskId);
  if (!task) {
    return { success: false, error: `Task ${taskId} not found` };
  }

  const studentIndex = task.students.findIndex(
    (s) => s.studentName === student.studentName
  );
  if (studentIndex !== -1) {
    task.students[studentIndex].aiStatus = 'processing';
    saveTask(task);
  }

  try {
    const prompt = CORRECTION_PROMPT
      .replace('{{studentName}}', student.studentName)
      .replace('{{correctionRequirement}}', correctionRequirement)
      .replace('{{recognizedEssayText}}', recognizedText);

    const response = await callMinimaxChatWithRetry(
      apiKey,
      [{ role: 'user', content: prompt }],
      5, // 最多重试5次
      5000 // 5秒后重试
    );

    if (!response || response.trim().length === 0) {
      return { success: false, error: 'AI 批改返回为空' };
    }

    const report = parseReportJson(response);

    if (!report) {
      return {
        success: false,
        error: `AI 返回格式错误: ${response.substring(0, 100)}...`,
      };
    }

    if (studentIndex !== -1) {
      task.students[studentIndex].aiStatus = 'completed';
      saveTask(task);
    }

    return {
      success: true,
      report,
    };
  } catch (error) {
    console.error(`[AI Correction] Failed for student ${student.studentName}:`, error);

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
