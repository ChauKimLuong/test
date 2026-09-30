import { IsObject, IsString } from 'class-validator';

export class ResubmitRequestDto {
  @IsString()
  actorId!: string;

  @IsObject()
  data!: Record<string, unknown>;
}
