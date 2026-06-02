import {
  DEFAULT_TEXT_MODEL,
  DEFAULT_VISION_MODEL,
  getMinimaxApiHost,
  getMinimaxApiKey,
} from './minimaxConfig';

interface MinimaxMessage {
  role: 'user' | 'assistant' | 'system';
  content: string | object[];
}

export async function chatComplete(
  messages: MinimaxMessage[],
  model?: string
): Promise<string> {
  const apiKey = getMinimaxApiKey();
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY is not configured');
  }

  const response = await fetch(
    `${getMinimaxApiHost()}/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: model || DEFAULT_TEXT_MODEL,
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
  const apiKey = getMinimaxApiKey();
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY is not configured');
  }

  const visionModel = model || DEFAULT_VISION_MODEL;

  interface VisionContentItem {
    type: 'image_url' | 'text';
    image_url?: { url: string };
    text?: string;
  }

  const contents: VisionContentItem[] = imageBase64s.map((base64) => ({
    type: 'image_url',
    image_url: {
      url: `data:image/jpeg;base64,${base64}`,
    },
  }));

  contents.push({
    type: 'text',
    text: prompt,
  });

  const response = await fetch(
    `${getMinimaxApiHost()}/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
  const apiKey = getMinimaxApiKey();
  if (!apiKey) {
    throw new Error('MINIMAX_API_KEY is not configured');
  }

  const requestBody: Record<string, unknown> = {
    model: DEFAULT_TEXT_MODEL,
    messages,
    temperature: 0.7,
  };

  if (responseFormat) {
    requestBody.response_format = responseFormat;
  }

  const response = await fetch(
    `${getMinimaxApiHost()}/v1/chat/completions`,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
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
