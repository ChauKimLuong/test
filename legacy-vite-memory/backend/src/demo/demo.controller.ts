import { Controller, Get } from '@nestjs/common';
import { DemoStore } from './demo.store';

@Controller('demo')
export class DemoController {
  constructor(private readonly store: DemoStore) {}

  @Get('users')
  users() {
    return this.store.users;
  }

  @Get('organization')
  organization() {
    return { tenant: this.store.tenant, departments: this.store.departments, users: this.store.users };
  }
}
