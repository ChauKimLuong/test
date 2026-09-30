import { FloppyDisk, PaperPlaneTilt } from '@phosphor-icons/react';
import { useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { FormTemplate, User } from '../types';

export function RequestFormPage({ user, onComplete }: { user: User; onComplete: () => void }) {
  const [forms, setForms] = useState<FormTemplate[]>([]);
  const [selectedId, setSelectedId] = useState('');
  const [values, setValues] = useState<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => { api.forms().then((result) => { setForms(result); setSelectedId(result[0]?.id ?? ''); }).catch((cause: Error) => setError(cause.message)); }, []);
  const selected = useMemo(() => forms.find((form) => form.id === selectedId), [forms, selectedId]);
  useEffect(() => { if (selected) setValues(Object.fromEntries(selected.fields.map((field) => [field.key, '']))); }, [selected]);

  const save = async (mode: 'DRAFT' | 'SUBMIT') => {
    if (!selected) return;
    setSubmitting(true); setError(''); setMessage('');
    try {
      const data: Record<string, unknown> = { ...values };
      if (selected.code === 'PURCHASE_REQUEST') data.amount = Number(values.amount);
      const result = await api.createRequest({ formTemplateId: selected.id, requesterId: user.id, data, mode });
      setMessage(mode === 'DRAFT' ? `Đã lưu ${result.requestCode} ở trạng thái nháp.` : `Đã gửi ${result.requestCode} vào quy trình phê duyệt.`);
      if (mode === 'SUBMIT') setValues(Object.fromEntries(selected.fields.map((field) => [field.key, ''])));
    } catch (cause) { setError((cause as Error).message); } finally { setSubmitting(false); }
  };

  return <>
    <section className="page-heading compact"><div><p className="eyebrow">Tạo hồ sơ</p><h1>Tạo đề nghị mới</h1><p>Chọn biểu mẫu và điền thông tin. Hệ thống sẽ tự xác định người duyệt theo cấu hình demo.</p></div></section>
    {error ? <p className="page-message error-message" role="alert">{error}</p> : null}
    {message ? <p className="page-message success-message" role="status">{message}</p> : null}
    <div className="request-layout"><section className="template-choices" aria-label="Chọn biểu mẫu">{forms.map((form) => <button type="button" key={form.id} onClick={() => setSelectedId(form.id)} className={`template-card ${selectedId === form.id ? 'selected' : ''}`} aria-pressed={selectedId === form.id}><strong>{form.name}</strong><span>{form.description}</span><small>{form.code === 'PURCHASE_REQUEST' ? 'Có nhánh tài chính khi từ 10 triệu VND' : 'Duyệt bởi quản lý trực tiếp'}</small></button>)}</section>
      <section className="panel form-panel">{selected ? <form onSubmit={(event) => { event.preventDefault(); void save('SUBMIT'); }}>
        <div className="panel-heading"><div><h2>{selected.name}</h2><p>{selected.description}</p></div></div>
        <div className="field-grid">{selected.fields.map((field) => <label key={field.key} className={field.type === 'TEXTAREA' ? 'full-width' : ''}><span>{field.label}{field.required ? <b aria-hidden="true"> *</b> : null}</span>
          {field.type === 'TEXTAREA' ? <textarea required={field.required} value={values[field.key] ?? ''} placeholder={field.placeholder} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} /> :
            field.type === 'SELECT' ? <select required={field.required} value={values[field.key] ?? ''} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })}><option value="">Chọn một giá trị</option>{field.options?.map((option) => <option key={option} value={option}>{option}</option>)}</select> :
              <input required={field.required} type={field.type === 'NUMBER' ? 'number' : field.type === 'DATE' ? 'date' : 'text'} min={field.type === 'NUMBER' ? '1' : undefined} value={values[field.key] ?? ''} placeholder={field.placeholder} onChange={(event) => setValues({ ...values, [field.key]: event.target.value })} />}
        </label>)}</div>
        <p className="form-hint">Các trường có dấu * là bắt buộc. Quyết định và lịch sử xử lý sẽ được ghi lại sau khi gửi.</p>
        <div className="form-actions"><button type="button" className="button secondary" onClick={() => void save('DRAFT')} disabled={submitting}><FloppyDisk size={18} aria-hidden="true" />Lưu nháp</button><button type="submit" className="button primary" disabled={submitting}><PaperPlaneTilt size={18} aria-hidden="true" />{submitting ? 'Đang gửi...' : 'Gửi phê duyệt'}</button>{message ? <button type="button" className="button secondary" onClick={onComplete}>Xem hồ sơ của tôi</button> : null}</div>
      </form> : <div className="skeleton table-skeleton" />}</section>
    </div>
  </>;
}
