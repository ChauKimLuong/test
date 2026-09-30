import {
  Injectable,
  CanActivate,
  ExecutionContext,
  UnauthorizedException,
  ForbiddenException,
  HttpException,
} from '@nestjs/common';
import { Request, Response } from 'express';
import { randomBytes } from 'node:crypto';
import { Database } from './db';
import { Actor, str, tokenHash, verifyPassword, hashPassword, uuid } from './security';
export type AuthRequest = Request & { actor: Actor; sessionToken: string };
const assignmentSql = `SELECT a.id,a.organizational_unit_id AS "unitId",u.name AS "unitName",p.name AS "positionName",a.is_primary AS "isPrimary" FROM employee_assignments a JOIN organizational_units u ON u.id=a.organizational_unit_id JOIN positions p ON p.id=a.position_id WHERE a.user_id=$1 AND a.started_at<=now() AND (a.ended_at IS NULL OR a.ended_at>now()) AND u.status='ACTIVE' AND p.status='ACTIVE'`;
@Injectable()
export class AuthService {
  private attempts = new Map<string, { count: number; until: number }>();
  constructor(private db: Database) {}
  async assignments(userId: string) {
    return this.db.query(assignmentSql, [userId]);
  }
  async register(body: any) {
    const name = str(body.fullName, 'Họ tên', 150);
    const email = str(body.email, 'Email', 200).toLowerCase();
    const password = str(body.password, 'Mật khẩu', 200);
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email) || password.length < 10)
      throw new ForbiddenException('Email không hợp lệ hoặc mật khẩu cần ít nhất 10 ký tự.');
    await this.db.prisma.users.create({data:{full_name:name,email,password_hash:await hashPassword(password),status:'INACTIVE'}});
    return {ok:true,message:'Đã đăng ký. CEO sẽ phân công, cấp quyền và kích hoạt tài khoản.'};
  }
  async actor(userId: string, assignmentId: string): Promise<Actor> {
    const [user] = await this.db.query(
      "SELECT id,full_name,email FROM users WHERE id=$1 AND status='ACTIVE'",
      [userId],
    );
    const assignment = (await this.assignments(userId)).find((x) => x.id === assignmentId);
    if (!user || !assignment)
      throw new UnauthorizedException('Phiên đăng nhập hoặc phân công đã hết hiệu lực.');
    const rows = await this.db.query(
      `SELECT r.code AS role,p.code AS permission,ra.scope_type AS scope FROM role_assignments ra JOIN system_roles r ON r.id=ra.system_role_id AND r.is_active JOIN role_permissions rp ON rp.system_role_id=r.id JOIN permissions p ON p.id=rp.permission_id WHERE ra.employee_assignment_id=$1 AND ra.revoked_at IS NULL AND ra.valid_from<=now() AND (ra.valid_until IS NULL OR ra.valid_until>now())`,
      [assignmentId],
    );
    const permissions: Record<string, string[]> = {};
    for (const row of rows)
      permissions[row.permission] = [
        ...new Set([...(permissions[row.permission] || []), row.scope]),
      ];
    return {
      userId,
      assignmentId,
      fullName: user.full_name,
      email: user.email,
      unitId: assignment.unitId,
      unitName: assignment.unitName,
      positionName: assignment.positionName,
      permissions,
      roles: [...new Set(rows.map((r) => r.role))],
    };
  }
  async login(body: any, res: Response, ip: string) {
    const email = str(body.email, 'Email', 200).toLowerCase(),
      password = str(body.password, 'Mật khẩu', 200);
    const key = ip + ':' + email,
      now = Date.now();
    for (const [k, v] of this.attempts) if (v.until < now) this.attempts.delete(k);
    const limit = this.attempts.get(key);
    if (limit && limit.count >= 8)
      throw new HttpException('Đăng nhập quá nhiều lần. Vui lòng thử lại sau 15 phút.', 429);
    this.attempts.set(key, { count: (limit?.count || 0) + 1, until: limit?.until || now + 900000 });
    const user = await this.db.prisma.users.findUnique({where:{email}});
    if (!user || !(await verifyPassword(password, user.password_hash)))
      throw new UnauthorizedException('Email hoặc mật khẩu không đúng.');
    if (user.status !== 'ACTIVE')
      throw new ForbiddenException(user.status === 'INACTIVE' ? 'Tài khoản đang chờ CEO kích hoạt sau khi phân công và cấp vai trò.' : 'Tài khoản đã bị khóa.');
    const assignments = await this.assignments(user.id);
    const assignment = assignments.find((a) => a.isPrimary) || assignments[0];
    if (!assignment) throw new ForbiddenException('Tài khoản chưa có phân công đang hoạt động.');
    const token = randomBytes(32).toString('hex');
    await this.db.query('DELETE FROM sessions WHERE expires_at<now()');
    await this.db.query(
      "INSERT INTO sessions(token_hash,user_id,assignment_id,expires_at) VALUES($1,$2,$3,now()+interval '12 hours')",
      [tokenHash(token), user.id, assignment.id],
    );
    await this.db.query('UPDATE users SET last_login_at=now() WHERE id=$1', [user.id]);
    this.attempts.delete(key);
    res.cookie('fp_session', token, {
      httpOnly: true,
      sameSite: 'strict',
      secure: process.env.COOKIE_SECURE === 'true',
      path: '/',
      maxAge: 43200000,
    });
    return { actor: await this.actor(user.id, assignment.id), assignments };
  }
  async session(req: AuthRequest) {
    const match = req.headers.cookie
      ?.split(';')
      .map((s) => s.trim())
      .find((s) => s.startsWith('fp_session='));
    const token = match?.slice('fp_session='.length);
    if (!token || !/^[a-f0-9]{64}$/.test(token))
      throw new UnauthorizedException('Vui lòng đăng nhập.');
    const [session] = await this.db.query(
      'SELECT * FROM sessions WHERE token_hash=$1 AND expires_at>now()',
      [tokenHash(token)],
    );
    if (!session) throw new UnauthorizedException('Phiên đã hết hạn. Vui lòng đăng nhập lại.');
    req.sessionToken = token;
    req.actor = await this.actor(session.user_id, session.assignment_id);
    return req.actor;
  }
  async logout(req: AuthRequest, res: Response) {
    await this.db.query('DELETE FROM sessions WHERE token_hash=$1', [tokenHash(req.sessionToken)]);
    res.clearCookie('fp_session', { path: '/' });
    return { ok: true };
  }
  async switchAssignment(req: AuthRequest, id: unknown) {
    const a = await this.actor(req.actor.userId, uuid(id));
    await this.db.query('UPDATE sessions SET assignment_id=$1 WHERE token_hash=$2', [
      a.assignmentId,
      tokenHash(req.sessionToken),
    ]);
    return { actor: a, assignments: await this.assignments(a.userId) };
  }
  async password(req: AuthRequest, body: any) {
    const old = str(body.currentPassword, 'Mật khẩu hiện tại', 200),
      next = str(body.newPassword, 'Mật khẩu mới', 200);
    if (next.length < 10) throw new ForbiddenException('Mật khẩu mới cần ít nhất 10 ký tự.');
    const [u] = await this.db.query('SELECT password_hash FROM users WHERE id=$1', [
      req.actor.userId,
    ]);
    if (!(await verifyPassword(old, u.password_hash)))
      throw new ForbiddenException('Mật khẩu hiện tại không đúng.');
    await this.db.transaction(async (c) => {
      await c.query('UPDATE users SET password_hash=$1 WHERE id=$2', [
        await hashPassword(next),
        req.actor.userId,
      ]);
      await c.query('DELETE FROM sessions WHERE user_id=$1 AND token_hash<>$2', [
        req.actor.userId,
        tokenHash(req.sessionToken),
      ]);
    });
    return { ok: true };
  }
}
@Injectable()
export class SessionGuard implements CanActivate {
  constructor(private auth: AuthService) {}
  async canActivate(context: ExecutionContext) {
    const req = context.switchToHttp().getRequest<AuthRequest>();
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      const allowed = process.env.APP_ORIGIN || 'http://localhost:3000';
      if (req.headers.origin !== allowed)
        throw new ForbiddenException('Nguồn yêu cầu không được chấp nhận.');
      if (!req.is('application/json')) throw new ForbiddenException('Yêu cầu phải dùng JSON.');
    }
    if (['/api/health','/api/auth/login','/api/auth/register'].includes(req.path)) return true;
    await this.auth.session(req);
    return true;
  }
}
