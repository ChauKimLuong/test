import { BadRequestException } from '@nestjs/common';
export function validateData(data: unknown, fields: any[], complete: boolean) {
  if (!data || typeof data !== 'object' || Array.isArray(data))
    throw new BadRequestException('Nội dung biểu mẫu không hợp lệ.');
  const values = data as Record<string, unknown>,
    errors: Record<string, string> = {};
  const allowed = new Set(fields.filter((f) => f.type !== 'SECTION').map((f) => f.key));
  for (const key of Object.keys(values))
    if (!allowed.has(key)) errors[key] = 'Trường không thuộc biểu mẫu.';
  for (const f of fields) {
    if (f.type === 'SECTION') continue;
    const v = values[f.key],
      empty = v === undefined || v === null || (typeof v === 'string' && !v.trim());
    if (complete && f.is_required && (empty || (f.type === 'CHECKBOX' && v !== true))) {
      errors[f.key] = 'Vui lòng hoàn thành ' + f.label.toLowerCase() + '.';
      continue;
    }
    if (empty) continue;
    if (f.type === 'NUMBER' && (typeof v !== 'number' || !Number.isFinite(v) || Math.abs(v) > 1e15))
      errors[f.key] = 'Vui lòng nhập số hợp lệ.';
    if (f.type === 'CHECKBOX' && typeof v !== 'boolean')
      errors[f.key] = 'Giá trị lựa chọn không hợp lệ.';
    if (
      ['TEXT', 'TEXTAREA', 'DATE', 'SELECT'].includes(f.type) &&
      (typeof v !== 'string' || v.length > (f.type === 'TEXTAREA' ? 5000 : 500))
    )
      errors[f.key] = 'Nội dung vượt giới hạn hoặc không hợp lệ.';
    if (f.type === 'SELECT' && !f.options.includes(v))
      errors[f.key] = 'Vui lòng chọn giá trị trong danh sách.';
    if (
      f.type === 'DATE' &&
      (typeof v !== 'string' ||
        !/^\d{4}-\d{2}-\d{2}$/.test(v) ||
        Number.isNaN(Date.parse(v)) ||
        new Date(v).toISOString().slice(0, 10) !== v)
    )
      errors[f.key] = 'Ngày không hợp lệ.';
  }
  if (values.startDate && values.endDate && String(values.startDate) > String(values.endDate))
    errors.endDate = 'Ngày kết thúc phải từ ngày bắt đầu trở đi.';
  if (Object.keys(errors).length)
    throw new BadRequestException({
      message: 'Vui lòng kiểm tra các trường được đánh dấu.',
      errors,
    });
  return values;
}
