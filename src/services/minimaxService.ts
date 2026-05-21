const MINIMAX_API_KEY = process.env.MINIMAX_API_KEY;
const MINIMAX_BASE_URL = 'https://api.minimaxi.com';
const DEFAULT_MODEL = process.env.MINIMAX_MODEL || 'MiniMax-M2.7';

interface MinimaxMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | object[];
}

export async function chatComplete(
  messages: MinimaxMessage[],
  model?: string
): Promise<string> {
  if (!MINIMAX_API_KEY) {
    throw new Error('MINIMAX_API_KEY is not configured');
  }

  const response = await fetch(
    `${MINIMAX_BASE_URL}/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: model || DEFAULT_MODEL,
        messages,
        temperature: 0.7,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData?.error?.message || errorData?.base_resp?.status_msg || response.statusText;
    throw new Error(`Minimax API error: ${response.status} - ${errorMsg}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;

  if (!content) {
    throw new Error('No content in API response');
  }

  return content;
}

export async function visionRecognize(
  imageBase64s: string[],
  prompt: string,
  model?: string
): Promise<string> {
  const visionModel = model || 'MiniMax-VL02';

  const contents = imageBase64s.map((base64) => ({
    type: 'image_url' as const,
    image_url: {
      url: `data:image/jpeg;base64,${base64}`,
    },
  }));

  contents.push({
    type: 'text' as const,
    text: prompt,
  });

  const response = await fetch(
    `${MINIMAX_BASE_URL}/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify({
        model: visionModel,
        messages: [
          {
            role: 'user',
            content: contents,
          },
        ],
        temperature: 0.1,
        max_tokens: 4000,
      }),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData?.error?.message || errorData?.base_resp?.status_msg || response.statusText;
    throw new Error(`Minimax Vision API error: ${response.status} - ${errorMsg}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}

export async function textComplete(
  messages: MinimaxMessage[],
  responseFormat?: { type: 'json_object' }
): Promise<string> {
  if (!MINIMAX_API_KEY) {
    throw new Error('MINIMAX_API_KEY is not configured');
  }

  const requestBody: Record<string, unknown> = {
    model: DEFAULT_MODEL,
    messages,
    temperature: 0.7,
  };

  if (responseFormat) {
    requestBody.response_format = responseFormat;
  }

  const response = await fetch(
    `${MINIMAX_BASE_URL}/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
    }
  );

  if (!response.ok) {
    const errorData = await response.json().catch(() => ({}));
    const errorMsg = errorData?.error?.message || errorData?.base_resp?.status_msg || response.statusText;
    throw new Error(`Minimax API error: ${response.status} - ${errorMsg}`);
  }

  const data = await response.json();
  return data.choices?.[0]?.message?.content || '';
}
