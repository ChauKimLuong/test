import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { DemoStore } from '../demo/demo.store';
import { ApprovalTask, FormTemplate, RequestDetail, RequestRecord, Workflow, WorkflowStep } from '../common/types';
import { CreateRequestDto } from './dto/create-request.dto';
import { ResubmitRequestDto } from './dto/resubmit-request.dto';

const LARGE_PURCHASE_THRESHOLD = 10_000_000;

@Injectable()
export class RequestsService {
  constructor(private readonly store: DemoStore) {}

  list(requesterId?: string) {
    return this.store.requests
      .filter((request) => !requesterId || request.requesterId === requesterId)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .map((request) => this.toSummary(request));
  }

  getById(id: string): RequestDetail {
    const request = this.findRequest(id);
    const formTemplate = this.findForm(request.formTemplateId);
    const requester = this.findUser(request.requesterId);
    return {
      ...request,
      formTemplate,
      requester,
      tasks: this.store.tasks.filter((task) => task.requestId === request.id),
      actions: this.store.actions.filter((action) => action.requestId === request.id),
      auditLogs: this.store.auditLogs
        .filter((log) => log.entityId === request.id || this.store.tasks.some((task) => task.requestId === request.id && task.id === log.entityId))
        .sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
    };
  }

  create(dto: CreateRequestDto) {
    const form = this.findForm(dto.formTemplateId);
    const requester = this.findUser(dto.requesterId);
    const workflow = this.findWorkflowByForm(form.id);
    const timestamp = new Date().toISOString();
    const request: RequestRecord = {
      id: this.store.id('request'),
      tenantId: this.store.tenant.id,
      requestCode: this.store.requestCode(form.code),
      formTemplateId: form.id,
      workflowId: workflow.id,
      workflowVersion: workflow.version,
      requesterId: requester.id,
      title: this.buildTitle(form, dto.data),
      data: dto.data,
      status: 'DRAFT',
      createdAt: timestamp,
      updatedAt: timestamp,
    };
    this.store.requests.push(request);
    this.audit('REQUEST', request.id, 'REQUEST_CREATED', requester.id);
    if (dto.mode === 'SUBMIT') {
      return this.submit(request.id, requester.id, dto.data);
    }
    return this.getById(request.id);
  }

  resubmit(id: string, dto: ResubmitRequestDto) {
    const request = this.findRequest(id);
    if (request.requesterId !== dto.actorId) {
      throw new BadRequestException('Chỉ người tạo mới có thể gửi lại hồ sơ.');
    }
    if (request.status !== 'NEEDS_REVISION') {
      throw new BadRequestException('Chỉ hồ sơ cần bổ sung mới có thể gửi lại.');
    }
    request.data = dto.data;
    request.title = this.buildTitle(this.findForm(request.formTemplateId), dto.data);
    return this.submit(request.id, dto.actorId, dto.data);
  }

  submit(id: string, actorId: string, replacementData?: Record<string, unknown>) {
    const request = this.findRequest(id);
    if (request.requesterId !== actorId) {
      throw new BadRequestException('Chỉ người tạo mới có thể gửi hồ sơ.');
    }
    if (!['DRAFT', 'NEEDS_REVISION'].includes(request.status)) {
      throw new BadRequestException('Hồ sơ không ở trạng thái có thể gửi.');
    }
    if (replacementData) request.data = replacementData;
    const form = this.findForm(request.formTemplateId);
    this.validateForm(form, request.data);

    const timestamp = new Date().toISOString();
    request.status = 'IN_REVIEW';
    request.submittedAt = request.submittedAt ?? timestamp;
    request.updatedAt = timestamp;
    this.audit('REQUEST', request.id, request.submittedAt === timestamp ? 'REQUEST_SUBMITTED' : 'REQUEST_RESUBMITTED', actorId);
    this.createTask(request, this.findWorkflow(request.workflowId).steps[0]);
    return this.getById(request.id);
  }

  decide(taskId: string, actorId: string, action: 'APPROVE' | 'REJECT' | 'REQUEST_REVISION', comment?: string) {
    const task = this.store.tasks.find((candidate) => candidate.id === taskId);
    if (!task) throw new NotFoundException('Không tìm thấy nhiệm vụ phê duyệt.');
    if (task.assigneeId !== actorId) throw new BadRequestException('Nhiệm vụ không được giao cho người dùng hiện tại.');
    if (task.status !== 'PENDING') throw new BadRequestException('Nhiệm vụ đã được xử lý trước đó.');
    if ((action === 'REJECT' || action === 'REQUEST_REVISION') && !comment?.trim()) {
      throw new BadRequestException('Từ chối hoặc yêu cầu bổ sung phải có lý do.');
    }

    const request = this.findRequest(task.requestId);
    if (request.requesterId === actorId) throw new BadRequestException('Không thể phê duyệt hồ sơ do chính mình tạo.');
    const actedAt = new Date().toISOString();
    task.status = action === 'APPROVE' ? 'APPROVED' : action === 'REJECT' ? 'REJECTED' : 'REVISION_REQUESTED';
    task.completedAt = actedAt;
    this.store.actions.push({
      id: this.store.id('action'), tenantId: this.store.tenant.id, taskId, requestId: request.id, actorId, action, comment: comment?.trim(), actedAt,
    });
    this.audit('TASK', task.id, `TASK_${task.status}`, actorId, comment?.trim());

    if (action === 'REJECT') {
      request.status = 'REJECTED';
      request.completedAt = actedAt;
    } else if (action === 'REQUEST_REVISION') {
      request.status = 'NEEDS_REVISION';
    } else {
      this.advanceAfterApproval(request, task, actedAt);
    }
    request.updatedAt = actedAt;
    this.audit('REQUEST', request.id, `REQUEST_${request.status}`, actorId, comment?.trim());
    return this.getById(request.id);
  }

  private advanceAfterApproval(request: RequestRecord, task: ApprovalTask, timestamp: string) {
    const form = this.findForm(request.formTemplateId);
    const workflow = this.findWorkflow(request.workflowId);
    const needsFinance = form.code === 'PURCHASE_REQUEST'
      && task.stepCode === 'MANAGER_APPROVAL'
      && Number(request.data.amount) >= LARGE_PURCHASE_THRESHOLD;

    if (needsFinance) {
      const financeStep = workflow.steps.find((step) => step.code === 'FINANCE_APPROVAL');
      if (!financeStep) throw new BadRequestException('Quy trình mua hàng thiếu bước phê duyệt tài chính.');
      this.createTask(request, financeStep);
      request.status = 'IN_REVIEW';
      return;
    }
    request.status = 'APPROVED';
    request.completedAt = timestamp;
  }

  private createTask(request: RequestRecord, step: WorkflowStep) {
    const assigneeId = step.assigneeStrategy === 'DIRECT_MANAGER'
      ? this.findUser(request.requesterId).managerId
      : step.assigneeId;
    if (!assigneeId) throw new BadRequestException('Không xác định được người phê duyệt cho bước này.');
    const dueAt = new Date(Date.now() + step.slaHours * 3_600_000).toISOString();
    const task: ApprovalTask = {
      id: this.store.id('task'), tenantId: this.store.tenant.id, requestId: request.id, stepCode: step.code,
      stepLabel: step.label, assigneeId, status: 'PENDING', dueAt,
    };
    this.store.tasks.push(task);
    this.store.notifications.push({
      id: this.store.id('notice'), tenantId: this.store.tenant.id, recipientId: assigneeId, requestId: request.id, taskId: task.id,
      title: `Bạn có hồ sơ ${request.requestCode} cần xử lý.`, isRead: false, createdAt: new Date().toISOString(),
    });
    this.audit('TASK', task.id, 'TASK_CREATED', undefined);
  }

  private validateForm(form: FormTemplate, data: Record<string, unknown>) {
    const missing = form.fields
      .filter((field) => field.required && (data[field.key] === undefined || data[field.key] === null || String(data[field.key]).trim() === ''))
      .map((field) => field.label);
    if (missing.length) throw new BadRequestException(`Vui lòng nhập: ${missing.join(', ')}.`);
    if (form.code === 'PURCHASE_REQUEST' && (!Number.isFinite(Number(data.amount)) || Number(data.amount) <= 0)) {
      throw new BadRequestException('Tổng tiền phải là số lớn hơn 0.');
    }
    if (form.code === 'LEAVE_REQUEST' && String(data.startDate) > String(data.endDate)) {
      throw new BadRequestException('Ngày kết thúc phải sau hoặc bằng ngày bắt đầu.');
    }
  }

  private buildTitle(form: FormTemplate, data: Record<string, unknown>) {
    return form.code === 'PURCHASE_REQUEST'
      ? `Mua ${String(data.itemName ?? 'hàng hóa')}`
      : `Nghỉ ${String(data.leaveType ?? 'phép')}`;
  }

  private toSummary(request: RequestRecord) {
    return {
      ...request,
      requester: this.findUser(request.requesterId),
      formTemplate: this.findForm(request.formTemplateId),
      pendingTask: this.store.tasks.find((task) => task.requestId === request.id && task.status === 'PENDING'),
    };
  }

  private audit(entityType: 'REQUEST' | 'TASK', entityId: string, eventType: string, actorId?: string, reason?: string) {
    this.store.auditLogs.push({
      id: this.store.id('audit'), tenantId: this.store.tenant.id, entityType, entityId, eventType, actorId, reason, createdAt: new Date().toISOString(),
    });
  }

  private findRequest(id: string) {
    const request = this.store.requests.find((candidate) => candidate.id === id);
    if (!request) throw new NotFoundException('Không tìm thấy hồ sơ.');
    return request;
  }

  private findForm(id: string) {
    const form = this.store.forms.find((candidate) => candidate.id === id);
    if (!form) throw new NotFoundException('Không tìm thấy biểu mẫu.');
    return form;
  }

  private findWorkflow(id: string) {
    const workflow = this.store.workflows.find((candidate) => candidate.id === id);
    if (!workflow) throw new NotFoundException('Không tìm thấy quy trình.');
    return workflow;
  }

  private findWorkflowByForm(formTemplateId: string) {
    const workflow = this.store.workflows.find((candidate) => candidate.formTemplateId === formTemplateId);
    if (!workflow) throw new NotFoundException('Chưa có quy trình cho biểu mẫu này.');
    return workflow;
  }

  private findUser(id: string) {
    const user = this.store.users.find((candidate) => candidate.id === id);
    if (!user) throw new NotFoundException('Không tìm thấy người dùng.');
    return user;
  }
}
