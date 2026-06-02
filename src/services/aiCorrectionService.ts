import { Student } from '@/services/taskService';
import type { ReportData } from '@/services/reportService';
import {
  DEFAULT_TEXT_MODEL,
  getCorrectionMaxTokens,
  getCorrectionMaxRetries,
  getCorrectionRetryDelayMs,
  getCorrectionTemperature,
  getCorrectionTimeoutMs,
  getMinimaxApiHost,
  getMinimaxApiKey,
} from './minimaxConfig';

export interface CorrectionResult {
  success: boolean;
  report?: ReportData;
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

const MAX_RESPONSE_PREVIEW_LENGTH = 300;

function stripThinkingText(text: string): string {
  return text
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/<think>[\s\S]*$/gi, '')
    .trim();
}

function fixJsonString(jsonStr: string): string {
  jsonStr = stripThinkingText(jsonStr.trim());

  const jsonMatch = jsonStr.match(/{[\s\S]*}/);
  if (jsonMatch) {
    return jsonMatch[0];
  }

  jsonStr = jsonStr.replace(/^```json\s*/i, '').replace(/\s*```$/i, '');
  jsonStr = jsonStr.replace(/^```\s*/i, '').replace(/\s*```$/i, '');

  return jsonStr.trim();
}

function toPlainObject(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  return value as Record<string, unknown>;
}

function asString(value: unknown, fallback = ''): string {
  if (value === undefined || value === null) return fallback;
  return String(value).trim();
}

function asNumber(value: unknown, fallback = 0): number {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

function parseRequiredNumber(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string') {
    const parsed = Number(value.replace(/[^\d.-]/g, ''));
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function asNullableNumber(value: unknown): number | null {
  if (value === undefined || value === null || value === '') return null;
  const parsed = asNumber(value, Number.NaN);
  return Number.isFinite(parsed) ? parsed : null;
}

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => asString(item)).filter(Boolean);
  }
  const text = asString(value);
  return text ? [text] : [];
}

function normalizeReportData(value: unknown, studentName: string): ReportData | null {
  const raw = toPlainObject(value);
  if (!raw) return null;

  const dimensionScores = Array.isArray(raw.dimensionScores)
    ? raw.dimensionScores.map((item) => {
        const dimension = toPlainObject(item) || {};
        return {
          name: asString(dimension.name, '综合评分'),
          score: asNumber(dimension.score),
          maxScore: asNullableNumber(dimension.maxScore),
          comment: asString(dimension.comment),
        };
      })
    : [];

  const specificSuggestions = Array.isArray(raw.specificSuggestions)
    ? raw.specificSuggestions.map((item) => {
        const suggestion = toPlainObject(item) || {};
        return {
          problem: asString(suggestion.problem),
          suggestion: asString(suggestion.suggestion || suggestion.advice),
        };
      }).filter((item) => item.problem || item.suggestion)
    : [];

  const goodSentences = Array.isArray(raw.goodSentences)
    ? raw.goodSentences.map((item) => {
        const sentence = toPlainObject(item) || {};
        return {
          sentence: asString(sentence.sentence),
          reason: asString(sentence.reason),
        };
      }).filter((item) => item.sentence || item.reason)
    : [];

  const weakSentences = Array.isArray(raw.weakSentences)
    ? raw.weakSentences.map((item) => {
        const sentence = toPlainObject(item) || {};
        return {
          sentence: asString(sentence.sentence),
          problem: asString(sentence.problem),
          rewrite: asString(sentence.rewrite),
        };
      }).filter((item) => item.sentence || item.problem || item.rewrite)
    : [];

  const score = parseRequiredNumber(raw.score);
  if (score === null) {
    return null;
  }

  const report: ReportData = {
    studentName: asString(raw.studentName, studentName) || studentName,
    detectedEssayTopic: asString(raw.detectedEssayTopic),
    detectedFullScore: asString(raw.detectedFullScore),
    score,
    level: asString(raw.level, '待复核'),
    summary: asString(raw.summary || raw.comment || raw.evaluation),
    dimensionScores,
    strengths: asStringArray(raw.strengths),
    problems: asStringArray(raw.problems),
    specificSuggestions,
    goodSentences,
    weakSentences,
    improvedEssay: asString(raw.improvedEssay),
    nextTrainingAdvice: asString(raw.nextTrainingAdvice),
  };

  if (!report.summary && report.strengths.length === 0 && report.problems.length === 0) {
    return null;
  }

  return report;
}

function parseReportJson(jsonStr: string, studentName: string): ReportData | null {
  try {
    return normalizeReportData(JSON.parse(fixJsonString(jsonStr)), studentName);
  } catch {
    const fixed = fixJsonString(jsonStr);
    try {
      return normalizeReportData(JSON.parse(fixed), studentName);
    } catch {
      return null;
    }
  }
}

function buildJsonRepairPrompt(
  studentName: string,
  correctionRequirement: string,
  recognizedText: string,
  previousResponse: string
): string {
  return `请把下面的作文批改内容整理为严格合法 JSON。只输出 JSON，不要输出 Markdown、解释或 <think>。

学生姓名：${studentName}

批改要求：
${correctionRequirement}

学生作文识别文本：
${recognizedText}

上一次模型输出：
${previousResponse}

必须输出如下字段：
{
  "studentName": "${studentName}",
  "detectedEssayTopic": "",
  "detectedFullScore": "",
  "score": 0,
  "level": "优秀/良好/合格/待提升",
  "summary": "",
  "dimensionScores": [{"name":"","score":0,"maxScore":null,"comment":""}],
  "strengths": [],
  "problems": [],
  "specificSuggestions": [{"problem":"","suggestion":""}],
  "goodSentences": [{"sentence":"","reason":""}],
  "weakSentences": [{"sentence":"","problem":"","rewrite":""}],
  "improvedEssay": "",
  "nextTrainingAdvice": ""
}`;
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

function isResponseFormatUnsupported(status: number, message: string): boolean {
  const normalized = message.toLowerCase();
  return (
    (status === 400 || status === 422) &&
    (
      normalized.includes('response_format') ||
      normalized.includes('response format') ||
      normalized.includes('json_object') ||
      normalized.includes('unsupported parameter') ||
      normalized.includes('unknown parameter')
    )
  );
}

function isNonRetryableApiError(error: Error): boolean {
  return /401|403|invalid api key|unauthorized|forbidden/i.test(error.message);
}

async function callMinimaxChatWithRetry(
  apiKey: string,
  messages: { role: string; content: string }[],
  maxRetries: number = 3,
  retryDelay: number = 5000
): Promise<string> {
  let lastError: Error | null = null;
  let useJsonResponseFormat = true;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      const requestBody: Record<string, unknown> = {
        model: DEFAULT_TEXT_MODEL,
        messages,
        temperature: getCorrectionTemperature(),
        max_tokens: getCorrectionMaxTokens(),
        stream: false,
      };

      if (useJsonResponseFormat) {
        requestBody.response_format = { type: 'json_object' };
      }

      const response = await fetchWithTimeout(
        `${getMinimaxApiHost()}/v1/chat/completions`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
        },
        getCorrectionTimeoutMs()
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        const errorMsg =
          errorData?.error?.message ||
          errorData?.base_resp?.status_msg ||
          response.statusText;
        const message = `AI接口失败 ${response.status}: ${errorMsg}`;
        if (useJsonResponseFormat && isResponseFormatUnsupported(response.status, String(errorMsg))) {
          useJsonResponseFormat = false;
          throw new Error(`${message}，已切换为普通 JSON 提示重试`);
        }
        throw new Error(message);
      }

      const data = await response.json();
      const content = data.choices?.[0]?.message?.content;

      if (!content) {
        throw new Error('AI接口返回内容为空');
      }

      return content;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      console.error(`[AI Correction] Attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      if (isNonRetryableApiError(lastError)) {
        break;
      }

      if (attempt < maxRetries) {
        console.log(`[AI Correction] Retrying in ${retryDelay / 1000} seconds...`);
        await new Promise((r) => setTimeout(r, retryDelay));
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

export async function correctEssay(
  _taskId: string,
  student: Student,
  correctionRequirement: string,
  recognizedText: string
): Promise<CorrectionResult> {
  const apiKey = getMinimaxApiKey();
  if (!apiKey) {
    return { success: false, error: 'MINIMAX_API_KEY is not configured' };
  }

  try {
    const prompt = CORRECTION_PROMPT
      .replace('{{studentName}}', student.studentName)
      .replace('{{correctionRequirement}}', correctionRequirement)
      .replace('{{recognizedEssayText}}', recognizedText);

    const response = await callMinimaxChatWithRetry(
      apiKey,
      [
        {
          role: 'system',
          content: '你是语文作文批改老师。只输出合法 JSON，不输出思考过程、解释、Markdown 或 <think> 标签。',
        },
        { role: 'user', content: prompt },
      ],
      getCorrectionMaxRetries(),
      getCorrectionRetryDelayMs()
    );

    if (!response || response.trim().length === 0) {
      return { success: false, error: 'AI 批改返回为空' };
    }

    let report = parseReportJson(response, student.studentName);

    if (!report) {
      const repairResponse = await callMinimaxChatWithRetry(
        apiKey,
        [
          {
            role: 'system',
            content: '你是 JSON 格式修复器。只输出严格合法 JSON，不输出思考过程、解释、Markdown 或 <think> 标签。',
          },
          {
            role: 'user',
            content: buildJsonRepairPrompt(
              student.studentName,
              correctionRequirement,
              recognizedText,
              response
            ),
          },
        ],
        1,
        getCorrectionRetryDelayMs()
      );
      report = parseReportJson(repairResponse, student.studentName);
    }

    if (!report) {
      return {
        success: false,
        error: `AI返回格式错误，无法解析为批改报告: ${response.substring(0, MAX_RESPONSE_PREVIEW_LENGTH)}...`,
      };
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
