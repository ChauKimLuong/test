import { IsIn, IsObject, IsString } from 'class-validator';

export class CreateRequestDto {
  @IsString()
  formTemplateId!: string;

  @IsString()
  requesterId!: string;

  @IsObject()
  data!: Record<string, unknown>;

  @IsIn(['DRAFT', 'SUBMIT'])
  mode!: 'DRAFT' | 'SUBMIT';
}
