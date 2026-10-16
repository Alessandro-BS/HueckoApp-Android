import type { IncidenceInput, Proposal, ProposalInput, ResolveIncidencesInput, TimeWindowInput } from '@hueckoapp/shared';

import { api } from './client';

export type { IncidenceInput, ProposalInput, ResolveIncidencesInput, TimeWindowInput };

const groupProposalsPath = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/proposals`;
const proposalPath = (id: string) => `/proposals/${encodeURIComponent(id)}`;

export const listGroupProposals = async (groupId: string) => (await api.get<Proposal[]>(groupProposalsPath(groupId))).data;

export const createProposal = async (groupId: string, input: ProposalInput) =>
  (await api.post<Proposal>(groupProposalsPath(groupId), input)).data;

export const getProposal = async (id: string) => (await api.get<Proposal>(proposalPath(id))).data;

export const voteWindow = async (id: string, windowId: string) =>
  (await api.put<Proposal>(`${proposalPath(id)}/vote`, { windowId })).data;

export const removeVote = async (id: string) => (await api.delete<Proposal>(`${proposalPath(id)}/vote`)).data;

export const addWindow = async (id: string, input: TimeWindowInput) =>
  (await api.post<Proposal>(`${proposalPath(id)}/windows`, input)).data;

// Sin windowId el servidor elige la más votada (C2).
export const confirmProposal = async (id: string, windowId?: string) =>
  (await api.post<Proposal>(`${proposalPath(id)}/confirm`, windowId ? { windowId } : {})).data;

export const cancelProposal = async (id: string) => (await api.post<Proposal>(`${proposalPath(id)}/cancel`)).data;

export const reportIncidence = async (id: string, input: IncidenceInput) =>
  (await api.post<Proposal>(`${proposalPath(id)}/incidences`, input)).data;

export const resolveIncidences = async (id: string, input: ResolveIncidencesInput) =>
  (await api.post<Proposal>(`${proposalPath(id)}/incidences/resolve`, input)).data;
