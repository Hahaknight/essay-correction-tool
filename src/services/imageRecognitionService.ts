import { Student } from './taskService';
import { spawn } from 'child_process';
import path from 'path';

export interface RecognitionResult {
  success: boolean;
  recognizedText?: string;
  error?: string;
}

const IMAGE_PROMPT = '识别图片中的文字，原文输出，不要修改。如果有段落请保留段落结构。';

let mcpProcess: ReturnType<typeof spawn> | null = null;
let mcpReady = false;
let mcpResponseResolver: ((value: string) => void) | null = null;
let mcpResponseRejecter: ((reason: Error) => void) | null = null;

function initMCPProcess(apiKey: string, apiHost: string): Promise<void> {
  return new Promise((resolve, reject) => {
    if (mcpProcess && mcpReady) {
      resolve();
      return;
    }

    if (mcpProcess) {
      mcpProcess.kill();
      mcpProcess = null;
    }

    const env = {
      MINIMAX_API_KEY: apiKey,
      MINIMAX_API_HOST: apiHost || 'https://api.minimaxi.com',
    };

    mcpProcess = spawn('uvx', ['minimax-coding-plan-mcp', '-y'], {
      env,
      stdio: ['pipe', 'pipe', 'pipe'],
    });

    let initResolve: () => void;
    const initPromise = new Promise<void>((r) => {
      initResolve = r;
    });

    mcpProcess.stdout.on('data', (data) => {
      const text = data.toString();
      const lines = text.split('\n').filter((l) => l.trim());

      for (const line of lines) {
        try {
          const response = JSON.parse(line);

          if (response.id === 1 && response.result) {
            mcpReady = true;
            initResolve();
          }

          if (response.id === 2 && response.result) {
            const content = response.result.content;
            if (content && content[0] && content[0].text) {
              const textResult = content[0].text;
              if (textResult.startsWith('Error')) {
                if (mcpResponseRejecter) mcpResponseRejecter(new Error(textResult));
              } else {
                if (mcpResponseResolver) mcpResponseResolver(textResult);
              }
              mcpResponseResolver = null;
              mcpResponseRejecter = null;
            }
          }
        } catch {}
      }
    });

    mcpProcess.stderr.on('data', () => {});

    mcpProcess.on('error', (err) => {
      mcpReady = false;
      mcpProcess = null;
      reject(err);
    });

    setTimeout(() => {
      const initRequest = {
        jsonrpc: '2.0',
        id: 1,
        method: 'initialize',
        params: {
          protocolVersion: '2024-11-05',
          capabilities: {},
          clientInfo: { name: 'essay-correction-tool', version: '1.0.0' },
        },
      };
      mcpProcess?.stdin.write(JSON.stringify(initRequest) + '\n');
    }, 1000);

    setTimeout(() => {
      const notif = { jsonrpc: '2.0', method: 'initialized', params: {} };
      mcpProcess?.stdin.write(JSON.stringify(notif) + '\n');
    }, 2000);

    initPromise
      .then(() => resolve())
      .catch((err) => reject(err));

    setTimeout(() => {
      if (!mcpReady) {
        reject(new Error('MCP init timeout'));
      }
    }, 30000);
  });
}

function callMCPUnderstandImage(
  apiKey: string,
  apiHost: string,
  prompt: string,
  imagePath: string
): Promise<string> {
  return new Promise(async (resolve, reject) => {
    await initMCPProcess(apiKey, apiHost);

    mcpResponseResolver = resolve;
    mcpResponseRejecter = reject;

    const mcpRequest = {
      jsonrpc: '2.0',
      id: 2,
      method: 'tools/call',
      params: {
        name: 'understand_image',
        arguments: { prompt, image_source: imagePath },
      },
    };

    mcpProcess?.stdin.write(JSON.stringify(mcpRequest) + '\n');

    setTimeout(() => {
      if (mcpResponseRejecter) {
        mcpResponseRejecter(new Error('MCP call timeout'));
        mcpResponseResolver = null;
        mcpResponseRejecter = null;
      }
    }, 120000);
  });
}

export async function recognizeImages(
  taskId: string,
  student: Student
): Promise<RecognitionResult> {
  try {
    if (!student.pages || student.pages.length === 0) {
      return { success: false, error: '没有上传的图片' };
    }

    const apiKey = process.env.MINIMAX_API_KEY;
    if (!apiKey) {
      return { success: false, error: 'MINIMAX_API_KEY is not configured' };
    }

    const sortedPages = [...student.pages].sort((a, b) => a.pageIndex - b.pageIndex);
    const fullTextParts: string[] = [];

    for (let i = 0; i < sortedPages.length; i++) {
      const page = sortedPages[i];
      const imagePath = page.filePath;

      const recognizedText = await callMCPUnderstandImage(
        apiKey,
        process.env.MINIMAX_API_HOST || 'https://api.minimaxi.com',
        IMAGE_PROMPT,
        imagePath
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
    mcpReady = false;
    if (mcpProcess) {
      mcpProcess.kill();
      mcpProcess = null;
    }
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}
