export interface OpenRouterMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface OpenRouterConfig {
  apiKey?: string;
  model?: string;
  temperature?: number;
  maxTokens?: number;
  responseFormat?: { type: 'json_object' };
}

export async function callOpenRouter(
  messages: OpenRouterMessage[],
  config: OpenRouterConfig = {}
): Promise<string> {
  const apiKey =
    config.apiKey ||
    process.env.OPENROUTER_API_KEY ||
    process.env.NEXT_PUBLIC_OPENROUTER_API_KEY;

  const model =
    config.model ||
    process.env.OPENROUTER_MODEL ||
    'google/gemini-3.8-flash';

  if (!apiKey) {
    throw new Error('NO_API_KEY');
  }

  const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': 'http://localhost:3000',
      'X-Title': 'LegalAI Litigation Platform',
    },
    body: JSON.stringify({
      model,
      messages,
      temperature: config.temperature ?? 0.2,
      max_tokens: config.maxTokens ?? 3000,
      response_format: config.responseFormat,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text();
    throw new Error(`OpenRouter Error (${response.status}): ${errorText}`);
  }

  const data = await response.json();
  const content = data.choices?.[0]?.message?.content;
  if (!content) {
    throw new Error('Empty response received from OpenRouter Gemini 3.8 Flash model');
  }

  return content;
}
