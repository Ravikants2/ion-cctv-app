import { describe, expect, it, vi } from 'vitest';
import type { AppData } from '../types';
import { buildChatContext, sendChatMessage } from './chat';

const appData: AppData = {
  users: [{
    id: 'user-1', name: 'Sensitive User', email: 'private@example.com',
    role: 'super_admin', passwordHash: 'secret-hash',
  }],
  requirements: [{
    id: 'requirement-1', zone: 'North', state: 'Delhi', city: 'Delhi',
    tcCode: 'TC-1', tcName: 'Test Center', clientName: 'Client',
    examName: 'Exam', createdBy: 'user-1', createdAt: '2026-01-01',
    updatedAt: '2026-01-02',
  }],
  vendors: [{
    id: 'vendor-1', zone: 'North', vendorName: 'Vendor',
    createdBy: 'user-1', createdAt: '2026-01-01', updatedAt: '2026-01-02',
  }],
  installations: [{
    id: 'installation-1', requirementId: 'requirement-1',
    installationType: 'Full Vendor', vendorId: 'vendor-1', cameraCount: 10,
    proxyProvided: true, internetProvided: true, storageProvided: false,
    localVendorCost: 1000, minimumCost: 900, quotationFileId: 'quotation-1',
    createdBy: 'user-1', createdAt: '2026-01-01', updatedBy: 'user-1',
    updatedAt: '2026-01-02',
  }],
  examDates: [{
    id: 'date-1', installationRecordId: 'installation-1',
    examDate: '2026-02-01', scheduledCandidates: 50,
  }],
  quotations: [{
    id: 'quotation-1', installationRecordId: 'installation-1',
    originalFileName: 'private.pdf', dataUrl: 'data:application/pdf;base64,secret',
    mimeType: 'application/pdf', uploadedBy: 'user-1', uploadedAt: '2026-01-01',
  }],
  auditLogs: [{
    id: 'audit-1', userId: 'user-1', action: 'LOGIN', entityType: 'User',
    entityId: 'user-1', timestamp: '2026-01-01',
  }],
};

describe('buildChatContext', () => {
  it('includes operational data and excludes accounts, audit logs, and quotation contents', () => {
    const serialized = JSON.stringify(buildChatContext(appData));

    expect(serialized).toContain('Test Center');
    expect(serialized).toContain('Vendor');
    expect(serialized).toContain('scheduledCandidates');
    expect(serialized).not.toContain('private@example.com');
    expect(serialized).not.toContain('secret-hash');
    expect(serialized).not.toContain('quotation-1');
    expect(serialized).not.toContain('data:application/pdf');
    expect(serialized).not.toContain('audit-1');
  });
});

describe('sendChatMessage', () => {
  it('reports missing endpoint configuration', async () => {
    await expect(sendChatMessage('hello', buildChatContext(appData), [])).rejects.toThrow(
      'chat service is not configured'
    );
  });

  it('sends the prompt, filtered context, and conversation to the configured service', async () => {
    vi.stubEnv('VITE_GEMINI_CHAT_ENDPOINT', 'https://chat.example/api/chat');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(
      JSON.stringify({ answer: 'There is one installation.' }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    ));

    await expect(sendChatMessage('Count installations', buildChatContext(appData), [
      { role: 'user', text: 'Hello' },
    ])).resolves.toBe('There is one installation.');

    const [, request] = fetchMock.mock.calls[0];
    const body = JSON.parse(String(request?.body)) as {
      message: string;
      history: Array<{ role: string; text: string }>;
      context: unknown;
    };
    expect(body.message).toBe('Count installations');
    expect(body.history).toEqual([{ role: 'user', text: 'Hello' }]);
    expect(JSON.stringify(body.context)).not.toContain('secret-hash');

    fetchMock.mockRestore();
    vi.unstubAllEnvs();
  });
});
