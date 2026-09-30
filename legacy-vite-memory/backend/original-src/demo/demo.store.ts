import { Injectable } from '@nestjs/common';
import {
  ApprovalAction,
  ApprovalTask,
  AuditLog,
  Department,
  FormTemplate,
  Notification,
  RequestRecord,
  Tenant,
  User,
  Workflow,
} from '../common/types';

const now = new Date('2026-09-16T08:00:00.000Z');
const iso = (hours = 0) => new Date(now.getTime() + hours * 3_600_000).toISOString();

@Injectable()
export class DemoStore {
  readonly tenant: Tenant = { id: 'tenant-acme', code: 'ACME', name: 'Công ty ACME Demo' };

  readonly departments: Department[] = [
    { id: 'dept-product', tenantId: this.tenant.id, code: 'PRODUCT', name: 'Sản phẩm' },
    { id: 'dept-finance', tenantId: this.tenant.id, code: 'FINANCE', name: 'Tài chính' },
    { id: 'dept-hr', tenantId: this.tenant.id, code: 'HR', name: 'Nhân sự' },
  ];

  readonly users: User[] = [
    { id: 'user-huy', tenantId: this.tenant.id, departmentId: 'dept-product', displayName: 'Trần Minh Huy', email: 'huy@acme.demo', roleLabel: 'Nhân viên sản phẩm', managerId: 'user-linh', isActive: true },
    { id: 'user-linh', tenantId: this.tenant.id, departmentId: 'dept-product', displayName: 'Nguyễn Thu Linh', email: 'linh@acme.demo', roleLabel: 'Trưởng bộ phận', managerId: 'user-admin', isActive: true },
    { id: 'user-hoang', tenantId: this.tenant.id, departmentId: 'dept-finance', displayName: 'Phạm Quốc Hoàng', email: 'hoang@acme.demo', roleLabel: 'Giám đốc tài chính', managerId: 'user-admin', isActive: true },
    { id: 'user-admin', tenantId: this.tenant.id, departmentId: 'dept-hr', displayName: 'Lê Mai Anh', email: 'admin@acme.demo', roleLabel: 'Quản trị viên', isActive: true },
  ];

  readonly forms: FormTemplate[] = [
    {
      id: 'form-purchase', tenantId: this.tenant.id, code: 'PURCHASE_REQUEST', name: 'Đề nghị mua hàng',
      description: 'Tạo đề nghị mua hàng và tự xác định bước tài chính theo tổng tiền.',
      fields: [
        { key: 'itemName', label: 'Hàng hóa hoặc dịch vụ', type: 'TEXT', required: true, placeholder: 'Ví dụ: Màn hình cho nhóm thiết kế' },
        { key: 'supplier', label: 'Nhà cung cấp', type: 'TEXT', required: true, placeholder: 'Tên nhà cung cấp' },
        { key: 'amount', label: 'Tổng tiền VND', type: 'NUMBER', required: true, placeholder: 'Ví dụ: 25000000' },
        { key: 'reason', label: 'Lý do mua', type: 'TEXTAREA', required: true, placeholder: 'Mô tả nhu cầu và lợi ích' },
      ],
    },
    {
      id: 'form-leave', tenantId: this.tenant.id, code: 'LEAVE_REQUEST', name: 'Xin nghỉ phép',
      description: 'Gửi đơn nghỉ phép đến quản lý trực tiếp.',
      fields: [
        { key: 'leaveType', label: 'Loại nghỉ', type: 'SELECT', required: true, options: ['Nghỉ phép năm', 'Nghỉ ốm', 'Nghỉ việc riêng'] },
        { key: 'startDate', label: 'Ngày bắt đầu', type: 'DATE', required: true },
        { key: 'endDate', label: 'Ngày kết thúc', type: 'DATE', required: true },
        { key: 'reason', label: 'Lý do', type: 'TEXTAREA', required: true, placeholder: 'Nhập lý do xin nghỉ' },
      ],
    },
  ];

  readonly workflows: Workflow[] = [
    {
      id: 'workflow-purchase', tenantId: this.tenant.id, formTemplateId: 'form-purchase', code: 'PURCHASE_V1', name: 'Mua hàng tiêu chuẩn', version: 1,
      steps: [
        { code: 'MANAGER_APPROVAL', label: 'Quản lý trực tiếp duyệt', assigneeStrategy: 'DIRECT_MANAGER', slaHours: 24 },
        { code: 'FINANCE_APPROVAL', label: 'Giám đốc tài chính duyệt', assigneeStrategy: 'USER', assigneeId: 'user-hoang', slaHours: 24 },
      ],
    },
    {
      id: 'workflow-leave', tenantId: this.tenant.id, formTemplateId: 'form-leave', code: 'LEAVE_V1', name: 'Nghỉ phép tiêu chuẩn', version: 1,
      steps: [{ code: 'MANAGER_APPROVAL', label: 'Quản lý trực tiếp duyệt', assigneeStrategy: 'DIRECT_MANAGER', slaHours: 24 }],
    },
  ];

  requests: RequestRecord[] = [
    {
      id: 'request-001', tenantId: this.tenant.id, requestCode: 'PR-2026-001', formTemplateId: 'form-purchase', workflowId: 'workflow-purchase', workflowVersion: 1,
      requesterId: 'user-huy', title: 'Mua màn hình cho nhóm thiết kế', data: { itemName: '02 màn hình 27 inch', supplier: 'Thiết bị số Việt', amount: 25000000, reason: 'Bổ sung màn hình cho hai nhân sự thiết kế mới.' },
      status: 'IN_REVIEW', submittedAt: iso(-30), createdAt: iso(-32), updatedAt: iso(-30),
    },
    {
      id: 'request-002', tenantId: this.tenant.id, requestCode: 'LV-2026-001', formTemplateId: 'form-leave', workflowId: 'workflow-leave', workflowVersion: 1,
      requesterId: 'user-huy', title: 'Nghỉ phép năm từ 22 đến 23 tháng 9', data: { leaveType: 'Nghỉ phép năm', startDate: '2026-09-22', endDate: '2026-09-23', reason: 'Việc gia đình đã lên kế hoạch.' },
      status: 'APPROVED', submittedAt: iso(-180), completedAt: iso(-160), createdAt: iso(-184), updatedAt: iso(-160),
    },
    {
      id: 'request-003', tenantId: this.tenant.id, requestCode: 'PR-2026-002', formTemplateId: 'form-purchase', workflowId: 'workflow-purchase', workflowVersion: 1,
      requesterId: 'user-huy', title: 'Mua tài khoản phần mềm thiết kế', data: { itemName: 'Gói phần mềm thiết kế', supplier: 'Creative Cloud', amount: 8400000, reason: 'Gia hạn giấy phép sử dụng cho nhóm.' },
      status: 'NEEDS_REVISION', submittedAt: iso(-72), createdAt: iso(-76), updatedAt: iso(-68),
    },
  ];

  tasks: ApprovalTask[] = [
    { id: 'task-001', tenantId: this.tenant.id, requestId: 'request-001', stepCode: 'MANAGER_APPROVAL', stepLabel: 'Quản lý trực tiếp duyệt', assigneeId: 'user-linh', status: 'PENDING', dueAt: iso(18) },
    { id: 'task-002', tenantId: this.tenant.id, requestId: 'request-002', stepCode: 'MANAGER_APPROVAL', stepLabel: 'Quản lý trực tiếp duyệt', assigneeId: 'user-linh', status: 'APPROVED', dueAt: iso(-166), completedAt: iso(-160) },
    { id: 'task-003', tenantId: this.tenant.id, requestId: 'request-003', stepCode: 'MANAGER_APPROVAL', stepLabel: 'Quản lý trực tiếp duyệt', assigneeId: 'user-linh', status: 'REVISION_REQUESTED', dueAt: iso(-70), completedAt: iso(-68) },
  ];

  actions: ApprovalAction[] = [
    { id: 'action-001', tenantId: this.tenant.id, taskId: 'task-002', requestId: 'request-002', actorId: 'user-linh', action: 'APPROVE', comment: 'Đồng ý, em chủ động bàn giao công việc trước khi nghỉ.', actedAt: iso(-160) },
    { id: 'action-002', tenantId: this.tenant.id, taskId: 'task-003', requestId: 'request-003', actorId: 'user-linh', action: 'REQUEST_REVISION', comment: 'Vui lòng bổ sung báo giá hoặc lý do chọn nhà cung cấp.', actedAt: iso(-68) },
  ];

  auditLogs: AuditLog[] = [
    { id: 'audit-001', tenantId: this.tenant.id, entityType: 'REQUEST', entityId: 'request-001', eventType: 'REQUEST_SUBMITTED', actorId: 'user-huy', createdAt: iso(-30) },
    { id: 'audit-002', tenantId: this.tenant.id, entityType: 'REQUEST', entityId: 'request-002', eventType: 'REQUEST_SUBMITTED', actorId: 'user-huy', createdAt: iso(-180) },
    { id: 'audit-003', tenantId: this.tenant.id, entityType: 'TASK', entityId: 'task-002', eventType: 'TASK_APPROVED', actorId: 'user-linh', createdAt: iso(-160) },
    { id: 'audit-004', tenantId: this.tenant.id, entityType: 'TASK', entityId: 'task-003', eventType: 'TASK_REVISION_REQUESTED', actorId: 'user-linh', reason: 'Vui lòng bổ sung báo giá hoặc lý do chọn nhà cung cấp.', createdAt: iso(-68) },
  ];

  notifications: Notification[] = [
    { id: 'notice-001', tenantId: this.tenant.id, recipientId: 'user-linh', requestId: 'request-001', taskId: 'task-001', title: 'Bạn có một đề nghị mua hàng cần xử lý.', isRead: false, createdAt: iso(-30) },
  ];

  private sequence = 10;

  id(prefix: string): string {
    this.sequence += 1;
    return `${prefix}-${this.sequence}`;
  }

  requestCode(formCode: FormTemplate['code']): string {
    const prefix = formCode === 'PURCHASE_REQUEST' ? 'PR' : 'LV';
    return `${prefix}-2026-${String(this.sequence + 1).padStart(3, '0')}`;
  }
}
