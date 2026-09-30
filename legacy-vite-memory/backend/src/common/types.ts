export type Id = string;

export type RequestStatus =
  | 'DRAFT'
  | 'SUBMITTED'
  | 'IN_REVIEW'
  | 'NEEDS_REVISION'
  | 'APPROVED'
  | 'REJECTED';

export type TaskStatus = 'PENDING' | 'APPROVED' | 'REJECTED' | 'REVISION_REQUESTED';
export type DecisionType = 'APPROVE' | 'REJECT' | 'REQUEST_REVISION';
export type FormFieldType = 'TEXT' | 'TEXTAREA' | 'NUMBER' | 'DATE' | 'SELECT';

export interface Tenant {
  id: Id;
  code: string;
  name: string;
}

export interface Department {
  id: Id;
  tenantId: Id;
  code: string;
  name: string;
}

export interface User {
  id: Id;
  tenantId: Id;
  departmentId: Id;
  displayName: string;
  email: string;
  roleLabel: string;
  managerId?: Id;
  isActive: boolean;
}

export interface FormField {
  key: string;
  label: string;
  type: FormFieldType;
  required: boolean;
  placeholder?: string;
  options?: string[];
}

export interface FormTemplate {
  id: Id;
  tenantId: Id;
  code: 'PURCHASE_REQUEST' | 'LEAVE_REQUEST';
  name: string;
  description: string;
  fields: FormField[];
}

export interface WorkflowStep {
  code: 'MANAGER_APPROVAL' | 'FINANCE_APPROVAL';
  label: string;
  assigneeStrategy: 'DIRECT_MANAGER' | 'USER';
  assigneeId?: Id;
  slaHours: number;
}

export interface Workflow {
  id: Id;
  tenantId: Id;
  formTemplateId: Id;
  code: string;
  name: string;
  version: number;
  steps: WorkflowStep[];
}

export interface RequestRecord {
  id: Id;
  tenantId: Id;
  requestCode: string;
  formTemplateId: Id;
  workflowId: Id;
  workflowVersion: number;
  requesterId: Id;
  title: string;
  data: Record<string, unknown>;
  status: RequestStatus;
  submittedAt?: string;
  completedAt?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalTask {
  id: Id;
  tenantId: Id;
  requestId: Id;
  stepCode: WorkflowStep['code'];
  stepLabel: string;
  assigneeId: Id;
  status: TaskStatus;
  dueAt: string;
  completedAt?: string;
}

export interface ApprovalAction {
  id: Id;
  tenantId: Id;
  taskId: Id;
  requestId: Id;
  actorId: Id;
  action: DecisionType;
  comment?: string;
  actedAt: string;
}

export interface AuditLog {
  id: Id;
  tenantId: Id;
  entityType: 'REQUEST' | 'TASK';
  entityId: Id;
  eventType: string;
  actorId?: Id;
  reason?: string;
  createdAt: string;
}

export interface Notification {
  id: Id;
  tenantId: Id;
  recipientId: Id;
  requestId: Id;
  taskId?: Id;
  title: string;
  isRead: boolean;
  createdAt: string;
}

export interface RequestDetail extends RequestRecord {
  requester: User;
  formTemplate: FormTemplate;
  tasks: ApprovalTask[];
  actions: ApprovalAction[];
  auditLogs: AuditLog[];
}
