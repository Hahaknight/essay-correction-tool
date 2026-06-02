export const DEFAULT_MINIMAX_API_HOST =
  process.env.MINIMAX_API_HOST ||
  process.env.MINIMAX_BASE_URL ||
  'https://api.minimaxi.com';

export const DEFAULT_TEXT_MODEL =
  process.env.MINIMAX_TEXT_MODEL ||
  process.env.MINIMAX_MODEL ||
  'MiniMax-M3';
export const DEFAULT_VISION_MODEL = process.env.MINIMAX_VISION_MODEL || DEFAULT_TEXT_MODEL;

export function getMinimaxApiHost(): string {
  return DEFAULT_MINIMAX_API_HOST.trim().replace(/\/+$/, '');
}

export function getMinimaxApiKey(): string | undefined {
  return process.env.MINIMAX_API_KEY?.trim();
}

export function getCorrectionTemperature(): number {
  const raw = Number(process.env.MINIMAX_CORRECTION_TEMPERATURE);
  if (Number.isFinite(raw) && raw >= 0 && raw <= 2) {
    return raw;
  }
  return 0.3;
}

export function getCorrectionTimeoutMs(): number {
  const raw = Number(process.env.MINIMAX_CORRECTION_TIMEOUT_MS);
  if (Number.isFinite(raw) && raw >= 10000 && raw <= 300000) {
    return raw;
  }
  return 300000;
}

export function getCorrectionMaxRetries(): number {
  const raw = Number(process.env.MINIMAX_CORRECTION_MAX_RETRIES);
  if (Number.isInteger(raw) && raw >= 1 && raw <= 5) {
    return raw;
  }
  return 2;
}

export function getCorrectionRetryDelayMs(): number {
  const raw = Number(process.env.MINIMAX_CORRECTION_RETRY_DELAY_MS);
  if (Number.isFinite(raw) && raw >= 1000 && raw <= 60000) {
    return raw;
  }
  return 5000;
}

export function getCorrectionMaxTokens(): number {
  const raw = Number(process.env.MINIMAX_CORRECTION_MAX_TOKENS);
  if (Number.isInteger(raw) && raw >= 1024 && raw <= 30000) {
    return raw;
  }
  return 12000;
}
