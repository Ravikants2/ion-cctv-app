// @vitest-environment node
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from './index.js';

const env = {
  ALLOWED_ORIGINS: 'https://ravikants2.github.io',
  GEMINI_API_KEY: 'test-secret',
  GEMINI_MODEL: 'gemini-3.1-flash-lite',
  GEMINI_FALLBACK_MODEL: 'gemini-3.8-flash',
};

function createRequest(overrides = {}) {
  const body = {
    message: 'List all installations.',
    history: [],
    context: {
      summary: '{}',
      records: [],
      requirements: [],
      vendors: [],
      installations: [],
      examDates: [],
    },
    ...overrides,
  };
  return new Request('https://chat.example/api/chat', {
    method: 'POST',
    headers: {
      Origin: 'https://ravikants2.github.io',
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
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
  it('uses the summary and flags omitted rows instead of rejecting oversized details', async () => {
    const installations = Array.from({ length: 1_000 }, (_, index) => ({
      id: `installation-${index}`,
      requirementId: `requirement-${index}`,
      installationType: 'Full Vendor',
      vendorId: 'vendor-1',
      storageType: 'Storage '.repeat(40),
      storageUnit: 'GB',
      updatedAt: '2026-01-01',
      cameraCount: 10,
      storageQuantity: 10,
      storageSize: 10,
      localVendorCost: 1000,
      minimumCost: 900,
      proxyProvided: true,
      internetProvided: true,
      storageProvided: false,
    }));
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_url, options) => {
      const sentBody = JSON.parse(String(options?.body));
      expect(sentBody.contents.at(-1).parts[0].text).toContain('"detailsOmitted":true');
      expect(sentBody.contents.at(-1).parts[0].text).not.toContain('The loaded data is too large');
      return geminiResponse('The data is large; narrow by zone.');
    });

    const response = await worker.fetch(createRequest({
      context: { summary: '{"installations":1000}', records: [], requirements: [], vendors: [], installations, examDates: [] },
    }), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ answer: 'The data is large; narrow by zone.' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('allows longer answers and returns a complete answer', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(geminiResponse('Complete table and totals.'));

    const response = await worker.fetch(createRequest(), env);

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toEqual({ answer: 'Complete table and totals.' });
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    expect(requestBody.generationConfig.maxOutputTokens).toBe(4_096);
    expect(requestBody.systemInstruction.parts[0].text).toContain('Keep answers concise by default');
    expect(fetchMock.mock.calls[0][0]).toContain('/models/gemini-3.1-flash-lite:generateContent');
  });

  it('passes joined records to Gemini and directs it to calculate combinations and offer choices', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch')
      .mockResolvedValueOnce(geminiResponse('Vendor A handled 50 candidates for Exam X.'));
    const context = {
      summary: '{}',
      records: [{
        installationId: 'installation-1',
        requirementId: 'requirement-1',
        vendorId: 'vendor-1',
        zone: 'North',
        state: 'Delhi',
        city: 'Delhi',
        tcCode: 'TC-1',
        tcName: 'Test Center',
        clientName: 'Client',
        examName: 'Exam X',
        vendorName: 'Vendor A',
        vendorZone: 'North',
        installationType: 'Full Vendor',
        cameraCount: 10,
        proxyProvided: true,
        internetProvided: true,
        storageProvided: false,
        localVendorCost: 1000,
        updatedAt: '2026-01-01',
        examDates: [{ examDate: '2026-02-01', scheduledCandidates: 50 }],
        ignoredSensitiveField: 'must not be forwarded',
      }],
      requirements: [],
      vendors: [],
      installations: [],
      examDates: [],
    };

    const response = await worker.fetch(createRequest({ context }), env);

    expect(response.status).toBe(200);
    const requestBody = JSON.parse(String(fetchMock.mock.calls[0][1]?.body));
    const prompt = requestBody.contents.at(-1).parts[0].text;
    expect(prompt).toContain('"vendorName":"Vendor A"');
    expect(prompt).toContain('"examName":"Exam X"');
    expect(prompt).toContain('"scheduledCandidates":50');
    expect(prompt).not.toContain('must not be forwarded');
    expect(requestBody.systemInstruction.parts[0].text).toContain('Calculate counts, sums, averages');
    expect(requestBody.systemInstruction.parts[0].text).toContain('numbered choices');
    expect(requestBody.systemInstruction.parts[0].text).toContain('Never multiply an installation-level cost');
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
