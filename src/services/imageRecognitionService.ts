import fs from 'fs';
import { spawn, ChildProcess } from 'child_process';
import { Student } from './taskService';
import { DEFAULT_TEXT_MODEL, getMinimaxApiHost, getMinimaxApiKey } from './minimaxConfig';

export interface RecognitionResult {
  success: boolean;
  recognizedText?: string;
  error?: string;
}

const IMAGE_PROMPT =
  '识别图片中的作文文字，按原文输出，不要改写。保留标题、段落、标点和换行；如果有看不清的字，用 [?] 标记。不要输出思考过程、解释或 Markdown。';

const MCP_INIT_TIMEOUT_MS = 120000;
const MCP_CALL_TIMEOUT_MS = 300000;
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 30000;

let mcpProcess: ChildProcess | null = null;
let mcpReady = false;
let mcpRequestId = 0;
const pendingCalls = new Map<
  number,
  { resolve: (value: string) => void; reject: (reason: Error) => void; timeout: NodeJS.Timeout }
>();

function isFailureText(text: string): boolean {
  return (
    /^(error|failed)\b/i.test(text.trim()) ||
    /API Error|invalid api key|unauthorized|forbidden/i.test(text)
  );
}

function stripThinkingTags(text: string): string {
  return text.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
}

function isNonRetryableError(error: Error): boolean {
  return /401|invalid api key|unauthorized|forbidden/i.test(error.message);
}

function getImageMimeType(filePath: string): string {
  const lower = filePath.toLowerCase();
  if (lower.endsWith('.png')) return 'image/png';
  if (lower.endsWith('.webp')) return 'image/webp';
  return 'image/jpeg';
}

async function callMiniMaxVisionAPI(
  apiKey: string,
  apiHost: string,
  prompt: string,
  imagePath: string
): Promise<string> {
  const imageBase64 = fs.readFileSync(imagePath).toString('base64');
  const response = await fetch(`${apiHost}/v1/chat/completions`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: DEFAULT_TEXT_MODEL,
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            {
              type: 'image_url',
              image_url: {
                url: `data:${getImageMimeType(imagePath)};base64,${imageBase64}`,
              },
            },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 8192,
    }),
  });

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg =
      errorData?.error?.message ||
      errorData?.base_resp?.status_msg ||
      response.statusText;
    throw new Error(`MiniMax Vision API error ${response.status}: ${errorMsg}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('MiniMax Vision API returned empty content');
  }
  const cleanedContent = stripThinkingTags(content);
  if (!cleanedContent) {
    throw new Error('MiniMax Vision API returned empty content after removing thinking text');
  }
  if (isFailureText(cleanedContent)) {
    throw new Error(cleanedContent);
  }

  return cleanedContent;
}

function resetMCP(): void {
  mcpReady = false;
  for (const [, call] of pendingCalls) {
    clearTimeout(call.timeout);
    call.reject(new Error('MCP reset'));
  }
  pendingCalls.clear();
  if (mcpProcess) {
    try {
      mcpProcess.kill();
    } catch {}
    mcpProcess = null;
  }
}

function initMCPProcess(apiKey: string, apiHost: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (mcpProcess && mcpReady) {
      resolve();
      return;
    }

    resetMCP();

    const env = {
      ...process.env,
      MINIMAX_API_KEY: apiKey,
      MINIMAX_API_HOST: apiHost || getMinimaxApiHost(),
    };

    mcpProcess = spawn('uvx', ['minimax-coding-plan-mcp', '-y'], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let initDone = false;
    const initTimeout = setTimeout(() => {
      if (!initDone) {
        resetMCP();
        reject(new Error(`MCP init timeout (${MCP_INIT_TIMEOUT_MS / 1000}s)`));
      }
    }, MCP_INIT_TIMEOUT_MS);

    mcpProcess.stdout?.on('data', (data) => {
      const text = data.toString();
      const lines = text.split('\n').filter((line: string) => line.trim());

      for (const line of lines) {
        try {
          const response = JSON.parse(line);

          if (response.id === 1 && response.result) {
            initDone = true;
            mcpReady = true;
            clearTimeout(initTimeout);
            resolve();
          }

          if (response.id >= 100 && response.error) {
            const pending = pendingCalls.get(response.id);
            if (pending) {
              clearTimeout(pending.timeout);
              pendingCalls.delete(response.id);
              const message =
                response.error.message ||
                response.error.data ||
                'MCP returned an error response';
              pending.reject(new Error(String(message)));
            }
          }

          if (response.id >= 100 && response.result) {
            const pending = pendingCalls.get(response.id);
            if (pending) {
              clearTimeout(pending.timeout);
              pendingCalls.delete(response.id);
              const content = response.result.content;
              if (content && content[0] && content[0].text) {
                const textResult = stripThinkingTags(content[0].text);
                if (!textResult) {
                  pending.reject(new Error('MCP response was empty after removing thinking text'));
                } else if (isFailureText(textResult)) {
                  pending.reject(new Error(textResult));
                } else {
                  pending.resolve(textResult);
                }
              } else {
                pending.reject(new Error('MCP response did not include text content'));
              }
            }
          }
        } catch {}
      }
    });

    mcpProcess.stderr?.on('data', () => {});

    mcpProcess.on('error', (err) => {
      clearTimeout(initTimeout);
      resetMCP();
      reject(err);
    });

    mcpProcess.on('close', (code) => {
      if (!initDone) {
        clearTimeout(initTimeout);
        resetMCP();
        reject(new Error(`MCP process closed unexpectedly with code ${code}`));
      }
    });

    setTimeout(() => {
      if (mcpProcess && !initDone) {
        mcpProcess.stdin?.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 1,
            method: 'initialize',
            params: {
              protocolVersion: '2024-11-05',
              capabilities: {},
              clientInfo: { name: 'essay-correction-tool', version: '1.0.0' },
            },
          }) + '\n'
        );
      }
    }, 1000);

    setTimeout(() => {
      if (mcpProcess && !initDone) {
        mcpProcess.stdin?.write(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'initialized',
            params: {},
          }) + '\n'
        );
      }
    }, 2000);
  });
}

function callMCPUnderstandImage(
  apiKey: string,
  apiHost: string,
  prompt: string,
  imagePath: string
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    let callTimeout: NodeJS.Timeout | undefined;

    try {
      await initMCPProcess(apiKey, apiHost);

      const requestId = ++mcpRequestId;
      const callId = requestId + 100;

      callTimeout = setTimeout(() => {
        pendingCalls.delete(callId);
        resetMCP();
        reject(new Error(`MCP call timeout (${MCP_CALL_TIMEOUT_MS / 1000}s)`));
      }, MCP_CALL_TIMEOUT_MS);

      pendingCalls.set(callId, { resolve, reject, timeout: callTimeout });

      if (mcpProcess) {
        mcpProcess.stdin?.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: callId,
            method: 'tools/call',
            params: {
              name: 'understand_image',
              arguments: { prompt, image_source: imagePath },
            },
          }) + '\n'
        );
      }
    } catch (err) {
      clearTimeout(callTimeout);
      reject(err);
    }
  });
}

async function callWithRetry<T>(
  fn: () => Promise<T>,
  maxRetries: number,
  retryDelay: number,
  errorContext: string
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      console.error(`[${errorContext}] Attempt ${attempt}/${maxRetries} failed:`, lastError.message);

      if (isNonRetryableError(lastError)) {
        break;
      }

      if (attempt < maxRetries) {
        console.log(`[${errorContext}] Retrying in ${retryDelay / 1000}s...`);
        await new Promise((r) => setTimeout(r, retryDelay));
      }
    }
  }

  throw lastError || new Error('All retry attempts failed');
}

export async function recognizeImages(
  taskId: string,
  student: Student
): Promise<RecognitionResult> {
  if (!student.pages || student.pages.length === 0) {
    return { success: false, error: '没有上传的图片' };
  }

  const apiKey = getMinimaxApiKey();
  if (!apiKey) {
    return { success: false, error: 'MINIMAX_API_KEY is not configured' };
  }

  const apiHost = getMinimaxApiHost();
  const sortedPages = [...student.pages].sort((a, b) => a.pageIndex - b.pageIndex);
  const fullTextParts: string[] = [];

  try {
    for (let i = 0; i < sortedPages.length; i++) {
      const page = sortedPages[i];
      const imagePath = page.filePath;

      const recognizedText = await callWithRetry(
        async () => {
          try {
            return await callMiniMaxVisionAPI(apiKey, apiHost, IMAGE_PROMPT, imagePath);
          } catch (error) {
            const primaryError = error instanceof Error ? error : new Error(String(error));
            if (
              isNonRetryableError(primaryError) ||
              primaryError.message.includes('after removing thinking text')
            ) {
              throw primaryError;
            }
            console.error(
              '[ImageRecognition] MiniMax vision API failed, falling back to MCP:',
              primaryError.message
            );
            return callMCPUnderstandImage(apiKey, apiHost, IMAGE_PROMPT, imagePath);
          }
        },
        MAX_RETRIES,
        RETRY_DELAY_MS,
        `ImageRecognition[${student.studentName}-Page${i + 1}]`
      );

      if (recognizedText) {
        fullTextParts.push(`【第${i + 1}页】\n${recognizedText}`);
      }
    }

    if (fullTextParts.length === 0) {
      return { success: false, error: '未能从图片中识别出文字' };
    }

    return {
      success: true,
      recognizedText: fullTextParts.join('\n\n'),
    };
  } catch (error) {
    resetMCP();

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
