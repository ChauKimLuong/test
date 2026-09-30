export type RequestStatus = 'DRAFT' | 'SUBMITTED' | 'IN_REVIEW' | 'NEEDS_REVISION' | 'APPROVED' | 'REJECTED';
export type TaskStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED';
export type DecisionType = 'APPROVE' | 'REJECT' | 'REQUEST_REVISION';

export interface User {
  id: string;
  displayName: string;
  email: string;
  roleLabel: string;
  departmentId: string;
  managerId?: string;
}

export interface FormField {
  key: string;
  label: string;
  type: 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'DATE' | 'SELECT';
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface FormTemplate {
  id: string;
  code: 'PURCHASE_REQUEST' | 'LEAVE_REQUEST';
  name: string;
  description: string;
  fields: FormField[];
}

export interface RequestSummary {
  id: string;
  requestCode: string;
  title: string;
  status: RequestStatus;
  data: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
  requester: User;
  formTemplate: FormTemplate;
  pendingTask?: { stepLabel: string; assigneeId: string; dueAt: string };
}

export interface ApprovalTask {
  id: string;
  requestId: string;
  stepCode: string;
  stepLabel: string;
  assigneeId: string;
  status: TaskStatus;
  dueAt: string;
  completedAt?: string;
  request: RequestSummary;
  requester: User;
}

export interface ApprovalAction {
  id: string;
  taskId: string;
  requestId: string;
  actorId: string;
  action: DecisionType;
  comment?: string;
  actedAt: string;
}

export interface AuditLog {
  id: string;
  eventType: string;
  actorId?: string;
  reason?: string;
  createdAt: string;
}

export interface RequestDetail extends RequestSummary {
  tasks: ApprovalTask[];
  actions: ApprovalAction[];
  auditLogs: AuditLog[];
}

export interface DashboardData {
  metrics: {
    total: number;
    inReview: number;
    approved: number;
    needsRevision: number;
    rejected: number;
    myPendingTasks: number;
  };
  recentRequests: RequestSummary[];
}
