import type { DashboardData, DecisionType, FormTemplate, RequestDetail, RequestSummary, ApprovalTask, User } from '../types';

const API_BASE = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const response = await fetch(`${API_BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...(options?.headers ?? {}) },
    ...options,
  });
  const body = await response.json().catch(() => null) as { message?: string | string[] } | T | null;
  if (!response.ok) {
    const message = body && typeof body === 'object' && 'message' in body
      ? Array.isArray(body.message) ? body.message.join(', ') : body.message
      : 'Không thể kết nối đến máy chủ.';
    throw new Error(message);
  }
  return body as T;
}

export const api = {
  users: () => request<User[]>('/demo/users'),
  forms: () => request<FormTemplate[]>('/forms'),
  dashboard: (viewerId: string) => request<DashboardData>(`/dashboard?viewerId=${viewerId}`),
  requests: (requesterId: string) => request<RequestSummary[]>(`/requests?requesterId=${requesterId}`),
  requestDetail: (id: string) => request<RequestDetail>(`/requests/${id}`),
  createRequest: (payload: { formTemplateId: string; requesterId: string; data: Record<string, unknown>; mode: 'DRAFT' | 'SUBMIT' }) =>
    request<RequestDetail>('/requests', { method: 'POST', body: JSON.stringify(payload) }),
  resubmit: (id: string, payload: { actorId: string; data: Record<string, unknown> }) =>
    request<RequestDetail>(`/requests/${id}/resubmit`, { method: 'POST', body: JSON.stringify(payload) }),
  tasks: (assigneeId: string) => request<ApprovalTask[]>(`/tasks?assigneeId=${assigneeId}`),
  decideTask: (id: string, payload: { actorId: string; action: DecisionType; comment?: string }) =>
    request<RequestDetail>(`/tasks/${id}/decision`, { method: 'POST', body: JSON.stringify(payload) }),
};
