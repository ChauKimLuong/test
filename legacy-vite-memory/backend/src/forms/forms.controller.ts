import { Controller, Get } from '@nestjs/common';
import { DemoStore } from '../demo/demo.store';

@Controller('forms')
export class FormsController {
  constructor(private readonly store: DemoStore) {}

  @Get()
  list() {
    return this.store.forms;
  }
}
