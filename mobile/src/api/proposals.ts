import type { ExpressOption, ExpressVoteInput, IncidenceInput, Proposal, ProposalInput, ReplanInput, TimeWindowInput } from '@hueckoapp/shared';

import { api } from './client';

export type { IncidenceInput, ProposalInput, ReplanInput, TimeWindowInput };

const groupProposalsPath = (groupId: string) => `/groups/${encodeURIComponent(groupId)}/proposals`;
const proposalPath = (id: string) => `/proposals/${encodeURIComponent(id)}`;

export const listGroupProposals = async (groupId: string) => (await api.get<Proposal[]>(groupProposalsPath(groupId))).data;

export const createProposal = async (groupId: string, input: ProposalInput) =>
  (await api.post<Proposal>(groupProposalsPath(groupId), input)).data;

export const getProposal = async (id: string) => (await api.get<Proposal>(proposalPath(id))).data;

export const voteWindow = async (id: string, windowId: string) =>
  (await api.put<Proposal>(`${proposalPath(id)}/vote`, { windowId })).data;

// Sin windowId quita todos mis votos; con windowId, solo el de esa franja (voto múltiple).
export const removeVote = async (id: string, windowId?: string) =>
  (await api.delete<Proposal>(`${proposalPath(id)}/vote`, windowId ? { params: { windowId } } : undefined)).data;

export const addWindow = async (id: string, input: TimeWindowInput) =>
  (await api.post<Proposal>(`${proposalPath(id)}/windows`, input)).data;

// Sin windowId el servidor elige la más votada (C2).
export const confirmProposal = async (id: string, windowId?: string) =>
  (await api.post<Proposal>(`${proposalPath(id)}/confirm`, windowId ? { windowId } : {})).data;

export const cancelProposal = async (id: string) => (await api.post<Proposal>(`${proposalPath(id)}/cancel`)).data;

export const reportIncidence = async (id: string, input: IncidenceInput) =>
  (await api.post<Proposal>(`${proposalPath(id)}/incidences`, input)).data;

// Votar (o cambiar el voto) en la votación exprés abierta del plan; si votaron todos, la respuesta ya trae el resultado.
export const voteExpress = async (id: string, option: ExpressOption) =>
  (await api.put<Proposal>(`${proposalPath(id)}/express-vote`, { option } satisfies ExpressVoteInput)).data;

// Replantear una propuesta en votación o en recoordinación: franjas (2 a 5) y plazo nuevos; el servidor borra los votos.
export const replanProposal = async (id: string, input: ReplanInput) =>
  (await api.post<Proposal>(`${proposalPath(id)}/replan`, input)).data;
