import type { AiStatus, PlanSuggestions, ProposalDraft, ScheduleOcrResult, VotingSummary } from '@hueckoapp/shared';

import { api } from './client';

// La IA tarda más que una petición normal: se espera hasta 45 s (el servidor corta a los 30 s con 503, D13).
export const AI_TIMEOUT_MS = 45_000;

// Foto elegida con expo-image-picker (src/utils/scheduleImage.ts).
export type OcrImage = { uri: string; mimeType: string; fileName: string };

const enc = encodeURIComponent;

export const getAiStatus = async () => (await api.get<AiStatus>('/ai/status')).data;

export async function scanSchedule(image: OcrImage) {
  const form = new FormData();
  // En React Native, FormData sube un archivo a partir de { uri, name, type } sin leerlo a memoria.
  form.append('image', { uri: image.uri, name: image.fileName, type: image.mimeType } as unknown as Blob);
  const response = await api.post<ScheduleOcrResult>('/ai/schedule-ocr', form, {
    timeout: AI_TIMEOUT_MS,
    headers: { 'Content-Type': 'multipart/form-data' },
  });
  return response.data;
}

export const draftProposal = async (groupId: string, text: string) =>
  (await api.post<ProposalDraft>(`/groups/${enc(groupId)}/ai/proposal-draft`, { text }, { timeout: AI_TIMEOUT_MS })).data;

export const suggestPlans = async (groupId: string) =>
  (await api.post<PlanSuggestions>(`/groups/${enc(groupId)}/ai/suggestions`, undefined, { timeout: AI_TIMEOUT_MS })).data;

export const summarizeVoting = async (proposalId: string) =>
  (await api.post<VotingSummary>(`/proposals/${enc(proposalId)}/ai/summary`, undefined, { timeout: AI_TIMEOUT_MS })).data;
