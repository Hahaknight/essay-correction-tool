import { Student } from './taskService';
import { spawn, ChildProcess } from 'child_process';

export interface RecognitionResult {
  success: boolean;
  recognizedText?: string;
  error?: string;
}

const IMAGE_PROMPT = '识别图片中的文字，原文输出，不要修改。如果有段落请保留段落结构。';

const MCP_INIT_TIMEOUT_MS = 120000; // MCP初始化超时（2分钟）
const MCP_CALL_TIMEOUT_MS = 300000; // MCP调用超时（5分钟，图片识别+评分可能较慢）
const MAX_RETRIES = 5;
const RETRY_DELAY_MS = 30000; // 重试间隔30秒（给API恢复时间）

let mcpProcess: ChildProcess | null = null;
let mcpReady = false;
let pendingResolver: ((value: string) => void) | null = null;
let pendingRejecter: ((reason: Error) => void) | null = null;

function resetMCP(): void {
  mcpReady = false;
  pendingResolver = null;
  pendingRejecter = null;
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
      MINIMAX_API_KEY: apiKey,
      MINIMAX_API_HOST: apiHost || 'https://api.minimaxi.com',
    };

    mcpProcess = spawn('uvx', ['minimax-coding-plan-mcp', '-y'], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let initTimeout: NodeJS.Timeout;
    let initDone = false;

    mcpProcess.stdout.on('data', (data) => {
      const text = data.toString();
      const lines = text.split('\n').filter((l) => l.trim());

      for (const line of lines) {
        try {
          const response = JSON.parse(line);

          if (response.id === 1 && response.result) {
            initDone = true;
            mcpReady = true;
            clearTimeout(initTimeout);
            resolve();
          }

          if (response.id === 2 && response.result) {
            const content = response.result.content;
            if (content && content[0] && content[0].text) {
              const textResult = content[0].text;
              if (textResult.startsWith('Error')) {
                if (pendingRejecter) pendingRejecter(new Error(textResult));
              } else {
                if (pendingResolver) pendingResolver(textResult);
              }
              pendingResolver = null;
              pendingRejecter = null;
            }
          }
        } catch {}
      }
    });

    mcpProcess.stderr.on('data', () => {});

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

    // 发送初始化请求
    setTimeout(() => {
      if (mcpProcess && !initDone) {
        mcpProcess.stdin.write(
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

    // 发送初始化完成通知
    setTimeout(() => {
      if (mcpProcess && !initDone) {
        mcpProcess.stdin.write(
          JSON.stringify({
            jsonrpc: '2.0',
            method: 'initialized',
            params: {},
          }) + '\n'
        );
      }
    }, 2000);

    // 初始化超时
    initTimeout = setTimeout(() => {
      if (!initDone) {
        resetMCP();
        reject(new Error('MCP init timeout (60s)'));
      }
    }, MCP_INIT_TIMEOUT_MS);
  });
}

function callMCPUnderstandImage(
  apiKey: string,
  apiHost: string,
  prompt: string,
  imagePath: string
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    let callTimeout: NodeJS.Timeout;

    try {
      await initMCPProcess(apiKey, apiHost);

      pendingResolver = resolve;
      pendingRejecter = reject;

      if (mcpProcess) {
        mcpProcess.stdin.write(
          JSON.stringify({
            jsonrpc: '2.0',
            id: 2,
            method: 'tools/call',
            params: {
              name: 'understand_image',
              arguments: { prompt, image_source: imagePath },
            },
          }) + '\n'
        );
      }

      // 调用超时
      callTimeout = setTimeout(() => {
        pendingResolver = null;
        pendingRejecter = null;
        resetMCP(); // 重置MCP，下次会重新初始化
        reject(new Error(`MCP call timeout (${MCP_CALL_TIMEOUT_MS / 1000}s)`));
      }, MCP_CALL_TIMEOUT_MS);

    } catch (err) {
      clearTimeout(callTimeout);
      pendingResolver = null;
      pendingRejecter = null;
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

      if (attempt < maxRetries) {
        console.log(`[${errorContext}] Retrying in ${retryDelay / 1000}s...`);
        await new Promise((r) => setTimeout(r, retryDelay));
      }
    }
  }

  throw lastError;
}

export async function recognizeImages(
  taskId: string,
  student: Student
): Promise<RecognitionResult> {
  if (!student.pages || student.pages.length === 0) {
    return { success: false, error: '没有上传的图片' };
  }

  const apiKey = process.env.MINIMAX_API_KEY;
  if (!apiKey) {
    return { success: false, error: 'MINIMAX_API_KEY is not configured' };
  }

  const apiHost = process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com';
  const sortedPages = [...student.pages].sort((a, b) => a.pageIndex - b.pageIndex);
  const fullTextParts: string[] = [];

  try {
    for (let i = 0; i < sortedPages.length; i++) {
      const page = sortedPages[i];
      const imagePath = page.filePath;

      const recognizedText = await callWithRetry(
        () =>
          callMCPUnderstandImage(
            apiKey,
            apiHost,
            IMAGE_PROMPT,
            imagePath
          ),
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
    // 重置MCP状态
    resetMCP();

    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
