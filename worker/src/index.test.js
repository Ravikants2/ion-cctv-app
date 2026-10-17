// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index.js';

const env = {
  ALLOWED_ORIGINS: 'https://ravikants2.github.io',
  GEMINI_API_KEY: 'test-secret',
  GEMINI_MODEL: 'gemini-3.1-flash-lite',
  GEMINI_FALLBACK_MODEL: 'gemini-3.8-flash',
};

function createRequest() {
  return new Request('https://chat.example/api/chat', {
    method: 'POST',
    headers: {
      Origin: 'https://ravikants2.github.io',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: 'List all costs and totals.',
      history: [],
      context: {
        requirements: [],
        vendors: [],
        installations: [],
        examDates: [],
      },
    }),
  });
}

function geminiResponse(text, finishReason = 'STOP') {
  return new Response(JSON.stringify({
    candidates: [{
      content: { parts: [{ text }] },
      finishReason,
    }],
  }), { status: 200 });
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('Gemini response completion', () => {
  it('allows longer answers and returns a complete answer', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(geminiResponse('Complete table and totals.'));

    const response = await worker.fetch(createRequest(), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ answer: 'Complete table and totals.' });
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(requestBody.generationConfig.maxOutputTokens).toBe(4_096);
    expect(requestBody.systemInstruction.parts[0].text).toContain('verify that the answer includes all requested rows and totals');
    expect(fetchMock.mock.calls[0][0]).toContain('/models/gemini-3.1-flash-lite:generateContent');
  });

  it.each([404, 429])('retries HTTP %s responses with the fallback model', async status => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(new Response(JSON.stringify({
        error: { status: 'RESOURCE_EXHAUSTED', message: 'quota exceeded' },
      }), { status }))
      .mockResolvedValueOnce(geminiResponse('Fallback model answer.'));

    const response = await worker.fetch(createRequest(), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ answer: 'Fallback model answer.' });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(fetchMock.mock.calls[0][0]).toContain('/models/gemini-3.1-flash-lite:generateContent');
    expect(fetchMock.mock.calls[1][0]).toContain('/models/gemini-3.8-flash:generateContent');
  });

  it('continues an answer when Gemini reports the output token limit', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(geminiResponse('Partial answer ending at', 'MAX_TOKENS'))
      .mockResolvedValueOnce(geminiResponse('the subtotal. Complete final sentence.'));

    const response = await worker.fetch(createRequest(), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({
      answer: 'Partial answer ending at\nthe subtotal. Complete final sentence.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    const continuationBody = JSON.parse(String(fetchMock.mock.calls[1][1]?.body));
    expect(continuationBody.contents.at(-2)).toEqual({
      role: 'model',
      parts: [{ text: 'Partial answer ending at' }],
    });
    expect(continuationBody.contents.at(-1).parts[0].text).toContain('Continue the answer exactly where it stopped');
  });

  it('does not return a partial answer if Gemini also truncates the continuation', async () => {
    vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(geminiResponse('Partial answer', 'MAX_TOKENS'))
      .mockResolvedValueOnce(geminiResponse('Still incomplete', 'MAX_TOKENS'));

    const response = await worker.fetch(createRequest(), env);

    expect(response.status).toBe(502);
    await expect(response.json()).resolves.toEqual({
      error: 'This answer exceeds the chat response limit. Please narrow your question and try again.',
    });
  });
});
