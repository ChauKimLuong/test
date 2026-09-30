import { Controller, Get, Query } from '@nestjs/common';
import { DemoStore } from '../demo/demo.store';

@Controller('dashboard')
export class DashboardController {
  constructor(private readonly store: DemoStore) {}

  @Get()
  summary(@Query('viewerId') viewerId?: string) {
    const countByStatus = (status: string) => this.store.requests.filter((request) => request.status === status).length;
    const pendingTasks = this.store.tasks.filter((task) => task.status === 'PENDING' && (!viewerId || task.assigneeId === viewerId));
    const recentRequests = [...this.store.requests]
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
      .slice(0, 5)
      .map((request) => ({
        ...request,
        requester: this.store.users.find((user) => user.id === request.requesterId),
        formTemplate: this.store.forms.find((form) => form.id === request.formTemplateId),
      }));

    return {
      metrics: {
        total: this.store.requests.length,
        inReview: countByStatus('IN_REVIEW') + countByStatus('SUBMITTED'),
        approved: countByStatus('APPROVED'),
        needsRevision: countByStatus('NEEDS_REVISION'),
        rejected: countByStatus('REJECTED'),
        myPendingTasks: pendingTasks.length,
      },
      recentRequests,
    };
  }
}
