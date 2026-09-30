import { IsIn, IsOptional, IsString } from 'class-validator';

export class DecideTaskDto {
  @IsString()
  actorId!: string;

  @IsIn(['APPROVE', 'REJECT', 'REQUEST_REVISION'])
  action!: 'APPROVE' | 'REJECT' | 'REQUEST_REVISION';

  @IsOptional()
  @IsString()
  comment?: string;
}
