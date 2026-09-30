import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { DemoStore } from '../demo/demo.store';
import { DecideTaskDto } from './dto/decide-task.dto';
import { RequestsService } from '../requests/requests.service';

@Controller('tasks')
export class TasksController {
  constructor(private readonly store: DemoStore, private readonly requests: RequestsService) {}

  @Get()
  list(@Query('assigneeId') assigneeId?: string) {
    return this.store.tasks
      .filter((task) => !assigneeId || task.assigneeId === assigneeId)
      .sort((a, b) => Number(a.status !== 'PENDING') - Number(b.status !== 'PENDING'))
      .map((task) => {
        const request = this.store.requests.find((candidate) => candidate.id === task.requestId);
        const requester = this.store.users.find((user) => user.id === request?.requesterId);
        const formTemplate = this.store.forms.find((form) => form.id === request?.formTemplateId);
        return { ...task, request: request && formTemplate && requester ? { ...request, formTemplate, requester } : undefined, requester };
      });
  }

  @Post(':id/decision')
  decide(@Param('id') id: string, @Body() body: DecideTaskDto) {
    return this.requests.decide(id, body.actorId, body.action, body.comment);
  }
}
