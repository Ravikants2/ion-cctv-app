import type { AppData } from '../types';

export interface ChatContext {
  requirements: Array<Pick<
    AppData['requirements'][number],
    'id' | 'zone' | 'state' | 'city' | 'tcCode' | 'tcName' | 'clientName' | 'examName' | 'updatedAt'
  >>;
  vendors: Array<Pick<AppData['vendors'][number], 'id' | 'zone' | 'vendorName' | 'updatedAt'>>;
  installations: Array<Pick<
    AppData['installations'][number],
    | 'id' | 'requirementId' | 'installationType' | 'vendorId' | 'cameraCount'
    | 'proxyProvided' | 'internetProvided' | 'storageProvided' | 'storageType'
    | 'storageQuantity' | 'storageSize' | 'storageUnit' | 'localVendorCost'
    | 'minimumCost' | 'updatedAt'
  >>;
  examDates: Array<Pick<
    AppData['examDates'][number],
    'id' | 'installationRecordId' | 'examDate' | 'scheduledCandidates'
  >>;
}

export interface ChatTurn {
  role: 'user' | 'model';
  text: string;
}

export function buildChatContext(data: AppData): ChatContext {
  return {
    requirements: data.requirements.map(({
      id, zone, state, city, tcCode, tcName, clientName, examName, updatedAt,
    }) => ({ id, zone, state, city, tcCode, tcName, clientName, examName, updatedAt })),
    vendors: data.vendors.map(({ id, zone, vendorName, updatedAt }) => ({
      id, zone, vendorName, updatedAt,
    })),
    installations: data.installations.map(({
      id, requirementId, installationType, vendorId, cameraCount, proxyProvided,
      internetProvided, storageProvided, storageType, storageQuantity, storageSize,
      storageUnit, localVendorCost, minimumCost, updatedAt,
    }) => ({
      id, requirementId, installationType, vendorId, cameraCount, proxyProvided,
      internetProvided, storageProvided, storageType, storageQuantity, storageSize,
      storageUnit, localVendorCost, minimumCost, updatedAt,
    })),
    examDates: data.examDates.map(({
      id, installationRecordId, examDate, scheduledCandidates,
    }) => ({ id, installationRecordId, examDate, scheduledCandidates })),
  };
}

export async function sendChatMessage(
  message: string,
  context: ChatContext,
  history: ChatTurn[]
): Promise<string> {
  const endpoint = import.meta.env.VITE_GEMINI_CHAT_ENDPOINT;
  if (!endpoint) {
    throw new Error('The chat service is not configured yet. Ask an administrator to deploy the chat worker.');
  }

  const response = await fetch(endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ message, context, history: history.slice(-10) }),
  });

  let result: { answer?: unknown; error?: unknown };
  try {
    result = await response.json() as { answer?: unknown; error?: unknown };
  } catch {
    throw new Error(`Chat service returned an invalid response (${response.status}).`);
  }

  if (!response.ok) {
    const error = typeof result.error === 'string' ? result.error : `Chat request failed (${response.status}).`;
    throw new Error(error);
  }
  if (typeof result.answer !== 'string' || !result.answer.trim()) {
    throw new Error('Chat service returned no answer.');
  }

  return result.answer;
}
