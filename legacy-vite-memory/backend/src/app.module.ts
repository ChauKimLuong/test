import { Module } from '@nestjs/common';
import { DashboardController } from './dashboard/dashboard.controller';
import { DemoController } from './demo/demo.controller';
import { DemoStore } from './demo/demo.store';
import { FormsController } from './forms/forms.controller';
import { RequestsController } from './requests/requests.controller';
import { RequestsService } from './requests/requests.service';
import { TasksController } from './tasks/tasks.controller';

@Module({
  controllers: [DemoController, FormsController, DashboardController, RequestsController, TasksController],
  providers: [DemoStore, RequestsService],
})
export class AppModule {}
