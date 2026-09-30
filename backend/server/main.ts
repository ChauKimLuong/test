import 'reflect-metadata';
import { NestFactory } from '@nestjs/core';
import {
  Module,
  Controller,
  Get,
  Post,
  Put,
  Patch,
  Param,
  Query,
  Body,
  Req,
  Res,
  UseGuards,
  Catch,
  ExceptionFilter,
  ArgumentsHost,
  HttpException,
} from '@nestjs/common';
import { json, Response } from 'express';
import { Database } from './db';
import { AuthService, SessionGuard, AuthRequest } from './auth';
import { RequestsService } from './requests';
import { FormsService } from './forms';
import { AdminService } from './admin';
@Catch()
class ApiErrors implements ExceptionFilter {
  catch(error: any, host: ArgumentsHost) {
    const response = host.switchToHttp().getResponse<Response>();
    if (error instanceof HttpException) {
      const body = error.getResponse();
      response.status(error.getStatus()).json(typeof body === 'string' ? { message: body } : body);
      return;
    }
    const known: Record<string, string> = {
      '23505': 'Mã, email hoặc phân công này đã tồn tại.',
      P2002: 'Mã, email hoặc phân công này đã tồn tại.',
      '23503': 'Dữ liệu liên quan không tồn tại hoặc đang được sử dụng.',
      '23514': 'Dữ liệu chưa thỏa mãn quy tắc nghiệp vụ.',
      '22P02': 'Dữ liệu không đúng định dạng.',
    };
    if (known[error.code]) {
      response.status(409).json({ message: known[error.code] });
      return;
    }
    if (error.type === 'entity.parse.failed') {
      response.status(400).json({ message: 'Nội dung JSON không hợp lệ.' });
      return;
    }
    if (error.type === 'entity.too.large') {
      response.status(413).json({ message: 'Nội dung vượt quá giới hạn 256 KB.' });
      return;
    }
    console.error(error);
    response.status(500).json({ message: 'Không thể xử lý yêu cầu. Vui lòng thử lại.' });
  }
}
@Controller('api')
@UseGuards(SessionGuard)
class ApiController {
  constructor(
    private db: Database,
    private auth: AuthService,
    private requests: RequestsService,
    private forms: FormsService,
    private admin: AdminService,
  ) {}
  @Get('health') async health() {
    await this.db.query('SELECT 1');
    return { status: 'ok', database: 'connected' };
  }
  @Post('auth/login') login(
    @Body() b: any,
    @Res({ passthrough: true }) res: Response,
    @Req() r: AuthRequest,
  ) {
    return this.auth.login(b, res, r.ip || 'unknown');
  }
  @Post('auth/register') register(@Body() b: any) {
    return this.auth.register(b);
  }
  @Get('auth/me') async me(@Req() r: AuthRequest) {
    return { actor: r.actor, assignments: await this.auth.assignments(r.actor.userId) };
  }
  @Post('auth/logout') logout(@Req() r: AuthRequest, @Res({ passthrough: true }) res: Response) {
    return this.auth.logout(r, res);
  }
  @Post('auth/assignment') switch(@Req() r: AuthRequest, @Body() b: any) {
    return this.auth.switchAssignment(r, b.assignmentId);
  }
  @Post('auth/password') password(@Req() r: AuthRequest, @Body() b: any) {
    return this.auth.password(r, b);
  }
  @Get('dashboard') dashboard(@Req() r: AuthRequest) {
    return this.requests.dashboard(r.actor);
  }
  @Get('requests') list(@Req() r: AuthRequest, @Query() q: any) {
    return this.requests.list(r.actor, q);
  }
  @Post('requests') create(@Req() r: AuthRequest, @Body() b: any) {
    return this.requests.create(r.actor, b);
  }
  @Get('requests/:id') detail(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.requests.detail(r.actor, id);
  }
  @Put('requests/:id') update(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: any) {
    return this.requests.update(r.actor, id, b);
  }
  @Post('requests/:id/submit') submit(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.requests.submit(r.actor, id);
  }
  @Post('requests/:id/decision') decide(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: any,
  ) {
    return this.requests.decide(r.actor, id, b);
  }
  @Post('requests/:id/cancel') cancel(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.requests.cancel(r.actor, id);
  }
  @Get('forms') formList(@Req() r: AuthRequest) {
    return this.forms.list(r.actor);
  }
  @Post('forms') formCreate(@Req() r: AuthRequest, @Body() b: any) {
    return this.forms.create(r.actor, b);
  }
  @Get('forms/reviewers') formReviewers(@Req() r: AuthRequest) {
    return this.forms.reviewers(r.actor);
  }
  @Get('forms/:id/revisions') formRevisions(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.forms.revisions(r.actor,id);
  }
  @Put('forms/:id') formUpdate(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: any) {
    return this.forms.update(r.actor, id, b);
  }
  @Post('forms/:id/submit') formSubmit(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: any) {
    return this.forms.submit(r.actor,id,b);
  }
  @Post('forms/:id/review') formReview(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: any) {
    return this.forms.review(r.actor,id,b);
  }
  @Patch('forms/:id/status') formStatus(
    @Req() r: AuthRequest,
    @Param('id') id: string,
    @Body() b: any,
  ) {
    return this.forms.status(r.actor, id, b);
  }
  @Get('workflows') workflows(@Req() r: AuthRequest) {
    return this.forms.workflows(r.actor);
  }
  @Put('workflows/:id') workflow(@Req() r: AuthRequest, @Param('id') id: string, @Body() b: any) {
    return this.forms.workflow(r.actor, id, b);
  }
  @Get('organization') directory(@Req() r: AuthRequest) {
    return this.admin.directory(r.actor);
  }
  @Post('organization/units') unitCreate(@Req() r: AuthRequest, @Body() b: any) {
    return this.admin.unit(r.actor, b);
  }
  @Put('organization/units/:id') unitUpdate(
    @Req() r: AuthRequest,
    @Body() b: any,
    @Param('id') id: string,
  ) {
    return this.admin.unit(r.actor, b, id);
  }
  @Post('organization/positions') positionCreate(@Req() r: AuthRequest, @Body() b: any) {
    return this.admin.position(r.actor, b);
  }
  @Put('organization/positions/:id') positionUpdate(
    @Req() r: AuthRequest,
    @Body() b: any,
    @Param('id') id: string,
  ) {
    return this.admin.position(r.actor, b, id);
  }
  @Get('people') people(@Req() r: AuthRequest) {
    return this.admin.people(r.actor);
  }
  @Post('people') person(@Req() r: AuthRequest, @Body() b: any) {
    return this.admin.user(r.actor, b);
  }
  @Patch('people/:id/status') personStatus(
    @Req() r: AuthRequest,
    @Body() b: any,
    @Param('id') id: string,
  ) {
    return this.admin.userStatus(r.actor, id, b);
  }
  @Post('assignments') assignment(@Req() r: AuthRequest, @Body() b: any) {
    return this.admin.assignment(r.actor, b);
  }
  @Post('assignments/:id/end') end(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.admin.endAssignment(r.actor, id);
  }
  @Get('roles') roles(@Req() r: AuthRequest) {
    return this.admin.roles(r.actor);
  }
  @Post('role-assignments') grant(@Req() r: AuthRequest, @Body() b: any) {
    return this.admin.grant(r.actor, b);
  }
  @Post('role-assignments/:id/revoke') revoke(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.admin.revoke(r.actor, id);
  }
  @Get('audit') audit(@Req() r: AuthRequest, @Query() q: any) {
    return this.admin.audit(r.actor, q);
  }
  @Get('notifications') notifications(@Req() r: AuthRequest) {
    return this.admin.notifications(r.actor);
  }
  @Post('notifications/:id/read') read(@Req() r: AuthRequest, @Param('id') id: string) {
    return this.admin.read(r.actor, id);
  }
}
@Module({
  controllers: [ApiController],
  providers: [Database, AuthService, SessionGuard, RequestsService, FormsService, AdminService],
})
class AppModule {}
async function bootstrap() {
  const app = await NestFactory.create(AppModule, { bodyParser: false });
  app.use(json({ limit: '256kb' }));
  app.use((req: any, res: any, next: any) => {
    if (
      !['GET', 'HEAD', 'OPTIONS'].includes(req.method) &&
      (!req.body || typeof req.body !== 'object' || Array.isArray(req.body))
    ) {
      res.status(400).json({ message: 'Nội dung yêu cầu phải là một đối tượng JSON.' });
      return;
    }
    next();
  });
  app.use((_req: any, res: any, next: any) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.useGlobalFilters(new ApiErrors());
  app.enableShutdownHooks();
  await app.listen(Number(process.env.PORT || 3001), '0.0.0.0');
}
bootstrap().catch((e) => {
  console.error(e);
  process.exit(1);
});
