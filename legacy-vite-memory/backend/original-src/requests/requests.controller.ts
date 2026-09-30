import { Body, Controller, Get, Param, Post, Query } from '@nestjs/common';
import { CreateRequestDto } from './dto/create-request.dto';
import { ResubmitRequestDto } from './dto/resubmit-request.dto';
import { RequestsService } from './requests.service';

@Controller('requests')
export class RequestsController {
  constructor(private readonly requests: RequestsService) {}

  @Get()
  list(@Query('requesterId') requesterId?: string) {
    return this.requests.list(requesterId);
  }

  @Get(':id')
  getById(@Param('id') id: string) {
    return this.requests.getById(id);
  }

  @Post()
  create(@Body() body: CreateRequestDto) {
    return this.requests.create(body);
  }

  @Post(':id/resubmit')
  resubmit(@Param('id') id: string, @Body() body: ResubmitRequestDto) {
    return this.requests.resubmit(id, body);
  }
}
