import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { scrypt, randomBytes, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
const derive = promisify(scrypt);
export async function hashPassword(password: string) {
  const salt = randomBytes(16).toString('hex');
  const key = (await derive(password, salt, 64)) as Buffer;
  return salt + ':' + key.toString('hex');
}
export async function verifyPassword(password: string, hash: string) {
  const [salt, stored] = hash.split(':');
  const key = (await derive(password, salt, 64)) as Buffer;
  const expected = Buffer.from(stored, 'hex');
  return expected.length === key.length && timingSafeEqual(key, expected);
}
export const tokenHash = (s: string) => createHash('sha256').update(s).digest('hex');
export function str(v: unknown, label: string, max = 200, required = true): string {
  if (typeof v !== 'string' || v.length > max || (required && !v.trim()))
    throw new BadRequestException(label + ' không hợp lệ.');
  return v.trim();
}
export function choice(v: unknown, values: string[], label: string): string {
  if (typeof v !== 'string' || !values.includes(v))
    throw new BadRequestException(label + ' không hợp lệ.');
  return v;
}
export function uuid(v: unknown): string {
  if (
    typeof v !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v)
  )
    throw new BadRequestException('ID không hợp lệ.');
  return v;
}
export function integer(v: unknown, min: number, max: number, label: string) {
  if (typeof v !== 'number' || !Number.isInteger(v) || v < min || v > max)
    throw new BadRequestException(label + ' không hợp lệ.');
  return v;
}
export function bool(v: unknown, label: string) {
  if (typeof v !== 'boolean') throw new BadRequestException(label + ' không hợp lệ.');
  return v;
}
export type Actor = {
  userId: string;
  assignmentId: string;
  fullName: string;
  email: string;
  unitId: string;
  unitName: string;
  positionName: string;
  permissions: Record<string, string[]>;
  roles: string[];
};
export function requirePermission(a: Actor, p: string, unit?: string) {
  const scopes = a.permissions[p] || [];
  if (
    !scopes.includes('ORGANIZATION') &&
    !(unit === a.unitId && scopes.includes('ORGANIZATIONAL_UNIT'))
  )
    throw new ForbiddenException('Bạn không có quyền thực hiện thao tác này.');
}
export function can(a: Actor, p: string, unit?: string) {
  const scopes = a.permissions[p] || [];
  return (
    scopes.includes('ORGANIZATION') || (unit === a.unitId && scopes.includes('ORGANIZATIONAL_UNIT'))
  );
}
