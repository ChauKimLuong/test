'use client';
import { useUnsavedNavigation } from './unsaved-navigation';
import { useEffect, useState, useRef } from 'react';
import dynamic from 'next/dynamic';
import {
  ArrowLeft,
  ArrowDown,
  ArrowUp,
  Plus,
  Trash,
  FloppyDisk,
  Play,
  GitBranch,
  RocketLaunch,
  ListBullets,
  ArrowCounterClockwise,
  ArrowClockwise,
} from '@phosphor-icons/react';
import { api, can, fmtDate, Field } from '../lib/api';
import {
  useResource,
  useAction,
  useSession,
  PageHeader,
  Loading,
  ErrorBox,
  Badge,
  Empty,
} from './ui';
import { FormInputs } from './request-pages';
import { MoneyInput } from './money-input';
import { isMoneyField, formatMoneyValue } from '../lib/money-input';
import { workflowStepName } from '../lib/workflow-graph';
const WorkflowCanvas = dynamic(() => import('./workflow-canvas').then((m) => m.WorkflowCanvas), {
  ssr: false,
  loading: () => (
    <div className="wf-canvas-loading">
      <Loading />
    </div>
  ),
});
type Selector = {
  type: string;
  level?: number;
  positionId?: string;
  assignmentId?: string;
  roleId?: string;
  unitId?: string;
};
type Rule = { field: string; operator: string; value?: any };
type Step = {
  id: string;
  name: string;
  mode: string;
  assignees: Selector[];
  sla?: { minutes: number; remindBeforeMinutes: number; escalationAssignmentId?: string };
  when?: { mode: string; conditions: Rule[] };
};
type Definition = { schemaVersion: number; steps: Step[] };
const selectorLabels: Record<string, string> = {
  DIRECT_MANAGER: 'Quản lý trực tiếp',
  MANAGER_LEVEL: 'Cấp quản lý thứ N',
  POSITION: 'Chức danh',
  ASSIGNMENT: 'Nhân sự cụ thể',
  ROLE: 'Nhóm vai trò',
  UNIT_HEAD: 'Trưởng đơn vị',
};
const operatorLabels: Record<string, string> = {
  EQ: 'Bằng',
  NE: 'Khác',
  GT: 'Lớn hơn',
  GTE: 'Từ mức này',
  LT: 'Nhỏ hơn',
  LTE: 'Đến mức này',
  IN: 'Thuộc danh sách',
  IS_EMPTY: 'Chưa điền',
  IS_NOT_EMPTY: 'Đã điền',
};
function ops(f?: Field) {
  return [
    ...(f?.type === 'CHECKBOX'
      ? ['EQ']
      : ['NUMBER', 'DATE'].includes(f?.type || '')
        ? ['EQ', 'NE', 'GT', 'GTE', 'LT', 'LTE']
        : ['EQ', 'NE', 'IN']),
    'IS_EMPTY',
    'IS_NOT_EMPTY',
  ];
}
function initialValue(f?: Field) {
  return f?.type === 'NUMBER'
    ? 0
    : f?.type === 'CHECKBOX'
      ? true
      : f?.type === 'SELECT'
        ? f.options[0] || ''
        : '';
}
const freshStep = (): Step => ({
  id: 'step-' + crypto.randomUUID(),
  name: 'Bước phê duyệt mới',
  mode: 'ALL',
  assignees: [{ type: 'DIRECT_MANAGER' }],
});
export function Workflows() {
  const { actor, confirm } = useSession(),
    action = useAction(),
    list = useResource<any[]>('workflows'),
    directory = useResource<any>(can(actor, 'WORKFLOW_UPDATE') ? 'workflows/directory' : null);
  const [selected, setSelected] = useState<any>(null),
    [definition, setDefinition] = useState<Definition | null>(null),
    [dirty, setDirty] = useState(false),
    [search, setSearch] = useState(''),
    [note, setNote] = useState(''),
    [sender, setSender] = useState(''),
    [data, setData] = useState<Record<string, any>>({}),
    [simulation, setSimulation] = useState<any>(null),
    [version, setVersion] = useState<any>(null),
    [viewMode, setViewMode] = useState<'flow' | 'list'>('flow'),
    [selectedStepId, setSelectedStepId] = useState(''),
    [inspector, setInspector] = useState<'step' | 'simulation' | 'publish' | 'versions'>('step');
  const history = useRef<{ past: Definition[]; future: Definition[] }>({ past: [], future: [] }),
    savedDefinition = useRef('');
  const inspectorRef = useRef<HTMLElement>(null);
  useEffect(() => {
    if (viewMode === 'flow') inspectorRef.current?.scrollTo({ top: 0 });
  }, [inspector, selectedStepId, viewMode, selected?.id]);
  const linkHandled = useRef(false),
    dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  useUnsavedNavigation(() => dirtyRef.current);
  useEffect(() => {
    const warn = (e: BeforeUnloadEvent) => {
      if (dirtyRef.current) e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, []);
  useEffect(() => {
    if (list.data && !linkHandled.current) {
      linkHandled.current = true;
      const form = new URLSearchParams(window.location.search).get('form'),
        w = list.data.find((w) => w.form_template_id === form);
      if (w) void open(w.id);
    }
  }, [list.data]);
  async function open(id: string) {
    if (dirty && !(await confirm('Rời bản nháp chưa lưu?', 'Các thay đổi chưa lưu sẽ bị bỏ.')))
      return;
    await action.run(async () => {
      const w = await api('workflows/' + id);
      load(w);
      setSender('');
      setData({});
      setSimulation(null);
      setVersion(null);
    });
  }
  function load(w: any) {
    setSelected(w);
    history.current = { past: [], future: [] };
    savedDefinition.current = JSON.stringify(w.draft_definition || w.versions[0]?.definition);
    const next = w.draft_definition ||
      w.versions[0]?.definition || { schemaVersion: 1, steps: [freshStep()] };
    savedDefinition.current = JSON.stringify(next);
    setSelectedStepId((current) =>
      selected?.id === w.id && next.steps.some((s: Step) => s.id === current)
        ? current
        : next.steps[0].id,
    );
    setDefinition(next);
    setDirty(false);
    list.reload();
  }
  function change(next: Definition) {
    if (definition)
      history.current = {
        past: [...history.current.past, structuredClone(definition)].slice(-50),
        future: [],
      };
    setDefinition(next);
    setDirty(JSON.stringify(next) !== savedDefinition.current);
    setSimulation(null);
  }
  function travel(direction: 'undo' | 'redo') {
    if (!definition) return;
    const h = history.current,
      source = direction === 'undo' ? h.past : h.future;
    const next = source.pop();
    if (!next) return;
    (direction === 'undo' ? h.future : h.past).push(structuredClone(definition));
    setDefinition(next);
    setDirty(JSON.stringify(next) !== savedDefinition.current);
    setSimulation(null);
  }
  function addStep() {
    if (!definition || definition.steps.length >= 30) return;
    const current = definition.steps.findIndex((s) => s.id === selectedStepId),
      step = freshStep(),
      steps = [...definition.steps];
    steps.splice(current < 0 ? steps.length : current + 1, 0, step);
    change({ ...definition, steps });
    setSelectedStepId(step.id);
    setInspector('step');
  }
  function stepChange(index: number, next: Step) {
    if (!definition) return;
    change({ ...definition, steps: definition.steps.map((s, i) => (i === index ? next : s)) });
  }
  function reorder(index: number, delta: number) {
    if (!definition) return;
    const steps = [...definition.steps];
    [steps[index], steps[index + delta]] = [steps[index + delta], steps[index]];
    change({ ...definition, steps });
  }
  async function save() {
    let result: any;
    const ok = await action.run(async () => {
      result = await api('workflows/' + selected.id + '/draft', 'PUT', {
        definition,
        expectedRevision: selected.draft_revision,
      });
      load(result);
    }, 'Đã lưu nháp. Phiên bản đang dùng giữ nguyên.');
    return ok ? result : null;
  }
  if (list.loading) return <Loading />;
  if (list.error) return <ErrorBox message={list.error} />;
  if (!selected || !definition)
    return (
      <>
        <PageHeader
          eyebrow="QUẢN TRỊ QUY TRÌNH"
          title="Quy trình phê duyệt"
          description="Thiết lập bước xử lý, điều kiện và nhóm người duyệt cho từng biểu mẫu."
        />
        <ErrorBox message={action.error} />
        <label className="field-label workflow-search">
          Tìm quy trình
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Tên hoặc mã biểu mẫu"
          />
        </label>
        <div className="workflow-library">
          {list.data
            ?.filter((w) => (w.name + ' ' + w.code).toLowerCase().includes(search.toLowerCase()))
            .map((w) => (
              <section className="panel panel-pad workflow-library-card" key={w.id}>
                <div className="workflow-card-title">
                  <GitBranch size={24} />
                  <Badge status={w.status} />
                </div>
                <h2>{w.name}</h2>
                <p className="helper">
                  {w.code} · Mẫu v{w.template_version} · Quy trình v
                  {w.published_version || 'chưa ban hành'}
                </p>
                <ol className="workflow-mini-steps">
                  {w.published_definition?.steps.map((s: Step) => (
                    <li key={s.id}>
                      {workflowStepName(s.name)}
                      <small>
                        {s.mode === 'ALL' ? 'Tất cả đồng ý' : 'Một người đồng ý'}
                        {s.when ? ' · Có điều kiện' : ''}
                      </small>
                    </li>
                  ))}
                </ol>
                <p className="helper">
                  {JSON.stringify(w.draft_definition) !== JSON.stringify(w.published_definition)
                    ? 'Có bản nháp khác phiên bản đang dùng'
                    : 'Nháp đồng bộ phiên bản đang dùng'}
                </p>
                <button
                  className="button primary"
                  disabled={action.busy || !['ACTIVE', 'INACTIVE'].includes(w.form_status)}
                  onClick={() => open(w.id)}
                >
                  Mở quy trình
                </button>
                {!['ACTIVE', 'INACTIVE'].includes(w.form_status) && (
                  <p className="helper">Mẫu cần được thẩm định trước.</p>
                )}
              </section>
            ))}
        </div>
        {!list.data?.length && (
          <Empty
            title="Chưa có quy trình"
            description="Tạo và ban hành một mẫu trước khi cấu hình quy trình."
          />
        )}
      </>
    );
  const edit = can(actor, 'WORKFLOW_UPDATE'),
    fields: Field[] = selected.fields.filter((f: Field) => f.type !== 'SECTION'),
    dir = directory.data || { assignments: [], positions: [], units: [], roles: [] };
  const published = selected.versions.find((v: any) => v.id === selected.published_version_id);
  const activeIndex = Math.max(
    0,
    definition.steps.findIndex((s) => s.id === selectedStepId),
  );
  const stepCards = definition.steps.map((s, index) => (
    <section className="panel panel-pad workflow-step-card" key={s.id}>
      <div className="workflow-step-header">
        <span className="workflow-step-number">{index + 1}</span>
        <label className="field-label workflow-step-name">
          Tên bước
          <input
            disabled={!edit}
            value={workflowStepName(s.name)}
            maxLength={150}
            onChange={(e) => stepChange(index, { ...s, name: e.target.value })}
          />
        </label>
        {edit && (
          <div className="actions">
            <button
              className="button icon"
              aria-label={`Di chuyển bước ${index + 1} lên`}
              disabled={index === 0 || action.busy}
              onClick={() => reorder(index, -1)}
            >
              <ArrowUp size={18} />
            </button>
            <button
              className="button icon"
              aria-label={`Di chuyển bước ${index + 1} xuống`}
              disabled={index === definition.steps.length - 1 || action.busy}
              onClick={() => reorder(index, 1)}
            >
              <ArrowDown size={18} />
            </button>
            <button
              className="button icon danger-outline"
              aria-label={`Xóa bước ${index + 1}`}
              disabled={definition.steps.length === 1 || action.busy}
              onClick={() =>
                change({
                  ...definition,
                  steps: definition.steps.filter((_, i) => i !== index),
                })
              }
            >
              <Trash size={18} />
            </button>
          </div>
        )}
      </div>
      <fieldset disabled={!edit || action.busy} className="workflow-fieldset">
        <label className="field-label">
          Cách kết hợp quyết định
          <select
            value={s.mode}
            onChange={(e) => stepChange(index, { ...s, mode: e.target.value })}
          >
            <option value="ALL">ALL — Tất cả người được giao phải đồng ý</option>
            <option value="ANY">ANY — Một người đồng ý là đủ</option>
          </select>
        </label>
        <p className="helper">
          {s.mode === 'ALL'
            ? 'Một người từ chối sẽ dừng quy trình.'
            : 'Chỉ từ chối khi tất cả đều từ chối; nhiệm vụ dư được hủy khi đã có một đồng ý.'}{' '}
          Trả bổ sung sẽ dừng vòng xử lý hiện tại.
        </p>
        <h3>Người duyệt</h3>
        {s.assignees.map((x, i) => {
          const patch = (next: Selector) =>
            stepChange(index, {
              ...s,
              assignees: s.assignees.map((v, j) => (i === j ? next : v)),
            });
          return (
            <div className="workflow-selector" key={i}>
              <label className="field-label">
                Quy tắc {i + 1}
                <select
                  value={x.type}
                  onChange={(e) =>
                    patch({
                      type: e.target.value,
                      ...(e.target.value === 'MANAGER_LEVEL' ? { level: 1 } : {}),
                    })
                  }
                >
                  {Object.entries(selectorLabels).map(([k, v]) => (
                    <option key={k} value={k}>
                      {v}
                    </option>
                  ))}
                </select>
              </label>
              {x.type === 'MANAGER_LEVEL' && (
                <label className="field-label">
                  Cấp quản lý
                  <input
                    type="number"
                    min={1}
                    max={20}
                    value={x.level || 1}
                    onChange={(e) => patch({ ...x, level: Number(e.target.value) })}
                  />
                </label>
              )}
              {['POSITION', 'ASSIGNMENT', 'ROLE'].includes(x.type) && (
                <label className="field-label">
                  {x.type === 'POSITION'
                    ? 'Chức danh'
                    : x.type === 'ROLE'
                      ? 'Vai trò'
                      : 'Nhân sự / phân công'}
                  <select
                    value={x.positionId || x.assignmentId || x.roleId || ''}
                    onChange={(e) =>
                      patch({
                        ...x,
                        ...(x.type === 'POSITION'
                          ? { positionId: e.target.value }
                          : x.type === 'ROLE'
                            ? { roleId: e.target.value }
                            : { assignmentId: e.target.value }),
                      })
                    }
                  >
                    <option value="">Chọn…</option>
                    {(x.type === 'POSITION'
                      ? dir.positions
                      : x.type === 'ROLE'
                        ? dir.roles
                        : dir.assignments
                    ).map((a: any) => (
                      <option key={a.id} value={a.id}>
                        {a.full_name
                          ? `${a.full_name} · ${a.position_name} · ${a.unit_name}`
                          : a.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              {['POSITION', 'ROLE', 'UNIT_HEAD'].includes(x.type) && (
                <label className="field-label">
                  Đơn vị
                  <select
                    value={x.unitId || ''}
                    onChange={(e) => patch({ ...x, unitId: e.target.value || undefined })}
                  >
                    <option value="">
                      {x.type === 'UNIT_HEAD'
                        ? 'Đơn vị gần nhất có trưởng đơn vị'
                        : 'Không giới hạn đơn vị'}
                    </option>
                    {dir.units.map((u: any) => (
                      <option key={u.id} value={u.id}>
                        {u.name}
                      </option>
                    ))}
                  </select>
                </label>
              )}
              <button
                className="button icon danger-outline"
                aria-label={`Xóa quy tắc người duyệt ${i + 1}`}
                disabled={s.assignees.length === 1}
                onClick={() =>
                  stepChange(index, {
                    ...s,
                    assignees: s.assignees.filter((_, j) => j !== i),
                  })
                }
              >
                <Trash size={18} />
              </button>
            </div>
          );
        })}
        <button
          className="button"
          disabled={s.assignees.length >= 12}
          onClick={() =>
            stepChange(index, {
              ...s,
              assignees: [...s.assignees, { type: 'DIRECT_MANAGER' }],
            })
          }
        >
          <Plus size={17} />
          Thêm người / nhóm duyệt
        </button>
        <div className="operations-sla-editor">
          <label className="checkbox-label">
            <input
              type="checkbox"
              checked={!!s.sla}
              onChange={(e) =>
                stepChange(index, {
                  ...s,
                  sla: e.target.checked ? { minutes: 1440, remindBeforeMinutes: 60 } : undefined,
                })
              }
            />
            Theo dõi thời hạn xử lý (SLA)
          </label>
          {s.sla && (
            <div className="operations-grid">
              <label className="field-label">
                Hạn xử lý (phút)
                <input
                  type="number"
                  min={1}
                  max={43200}
                  value={s.sla.minutes}
                  onChange={(e) =>
                    stepChange(index, {
                      ...s,
                      sla: { ...s.sla!, minutes: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label className="field-label">
                Nhắc trước hạn (phút)
                <input
                  type="number"
                  min={0}
                  max={s.sla.minutes}
                  value={s.sla.remindBeforeMinutes}
                  onChange={(e) =>
                    stepChange(index, {
                      ...s,
                      sla: { ...s.sla!, remindBeforeMinutes: Number(e.target.value) },
                    })
                  }
                />
              </label>
              <label className="field-label">
                Chuyển cấp khi quá hạn
                <select
                  value={s.sla.escalationAssignmentId || ''}
                  onChange={(e) =>
                    stepChange(index, {
                      ...s,
                      sla: {
                        ...s.sla!,
                        escalationAssignmentId: e.target.value || undefined,
                      },
                    })
                  }
                >
                  <option value="">Chỉ nhắc và ghi nhận quá hạn</option>
                  {directory.data?.assignments.map((person: any) => (
                    <option key={person.id} value={person.id}>
                      {person.full_name} · {person.position_name}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          )}
          <p className="helper">
            Hạn tính từ khi bước bắt đầu, theo thời gian liên tục. Chuyển cấp vẫn cần người nhận có
            quyền và độc lập với người gửi.
          </p>
        </div>
        <div className="workflow-condition-heading">
          <h3>Điều kiện chạy bước</h3>
          {index === 0 ? (
            <span className="helper">Bước đầu luôn chạy</span>
          ) : (
            <label className="checkbox-label">
              <input
                type="checkbox"
                checked={!!s.when}
                onChange={(e) =>
                  stepChange(index, {
                    ...s,
                    when: e.target.checked
                      ? {
                          mode: 'ALL',
                          conditions: [
                            {
                              field: fields[0]?.key || '',
                              operator: 'EQ',
                              value: initialValue(fields[0]),
                            },
                          ],
                        }
                      : undefined,
                  })
                }
              />
              Chỉ chạy khi dữ liệu phù hợp
            </label>
          )}
        </div>
        {s.when && (
          <>
            <label className="field-label">
              Kết hợp điều kiện
              <select
                value={s.when.mode}
                onChange={(e) =>
                  stepChange(index, { ...s, when: { ...s.when!, mode: e.target.value } })
                }
              >
                <option value="ALL">AND — Tất cả điều kiện đúng</option>
                <option value="ANY">OR — Một điều kiện đúng</option>
              </select>
            </label>
            {s.when.conditions.map((r, i) => {
              const field = fields.find((f) => f.key === r.field),
                patch = (next: Rule) =>
                  stepChange(index, {
                    ...s,
                    when: {
                      ...s.when!,
                      conditions: s.when!.conditions.map((v, j) => (i === j ? next : v)),
                    },
                  });
              return (
                <div className="workflow-condition-row" key={i}>
                  <label className="field-label">
                    Trường
                    <select
                      value={r.field}
                      onChange={(e) =>
                        patch({
                          field: e.target.value,
                          operator: 'EQ',
                          value: initialValue(fields.find((f) => f.key === e.target.value)),
                        })
                      }
                    >
                      {fields.map((f) => (
                        <option value={f.key} key={f.key}>
                          {f.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field-label">
                    So sánh
                    <select
                      value={r.operator}
                      onChange={(e) =>
                        patch({
                          ...r,
                          operator: e.target.value,
                          value:
                            e.target.value === 'IN' ? [initialValue(field)] : initialValue(field),
                        })
                      }
                    >
                      {ops(field).map((k) => (
                        <option value={k} key={k}>
                          {operatorLabels[k]}
                        </option>
                      ))}
                    </select>
                  </label>
                  {!['IS_EMPTY', 'IS_NOT_EMPTY'].includes(r.operator) && (
                    <label className="field-label">
                      {r.operator === 'IN' ? 'Giá trị (mỗi dòng một mục)' : 'Giá trị'}
                      {r.operator === 'IN' ? (
                        <textarea
                          rows={2}
                          value={Array.isArray(r.value) ? r.value.join('\n') : ''}
                          onChange={(e) => patch({ ...r, value: e.target.value.split('\n') })}
                        />
                      ) : field?.type === 'CHECKBOX' ? (
                        <select
                          value={String(r.value)}
                          onChange={(e) => patch({ ...r, value: e.target.value === 'true' })}
                        >
                          <option value="true">Đã xác nhận</option>
                          <option value="false">Chưa xác nhận</option>
                        </select>
                      ) : field?.type === 'SELECT' ? (
                        <select
                          value={r.value ?? ''}
                          onChange={(e) => patch({ ...r, value: e.target.value })}
                        >
                          {field.options.map((o) => (
                            <option key={o}>{o}</option>
                          ))}
                        </select>
                      ) : isMoneyField(field) ? (
                        <MoneyInput
                          value={r.value ?? ''}
                          placeholder="Ví dụ: 20.000.000"
                          onValueChange={(value) => patch({ ...r, value })}
                        />
                      ) : (
                        <input
                          type={
                            field?.type === 'NUMBER'
                              ? 'number'
                              : field?.type === 'DATE'
                                ? 'date'
                                : 'text'
                          }
                          step="any"
                          value={r.value ?? ''}
                          onChange={(e) =>
                            patch({
                              ...r,
                              value:
                                field?.type === 'NUMBER' && e.target.value !== ''
                                  ? Number(e.target.value)
                                  : e.target.value,
                            })
                          }
                        />
                      )}
                    </label>
                  )}
                  <button
                    className="button icon danger-outline"
                    aria-label={`Xóa điều kiện ${i + 1}`}
                    disabled={s.when!.conditions.length === 1}
                    onClick={() =>
                      stepChange(index, {
                        ...s,
                        when: {
                          ...s.when!,
                          conditions: s.when!.conditions.filter((_, j) => j !== i),
                        },
                      })
                    }
                  >
                    <Trash size={18} />
                  </button>
                </div>
              );
            })}
            <button
              className="button"
              disabled={s.when.conditions.length >= 20}
              onClick={() =>
                stepChange(index, {
                  ...s,
                  when: {
                    ...s.when!,
                    conditions: [
                      ...s.when!.conditions,
                      {
                        field: fields[0]?.key || '',
                        operator: 'EQ',
                        value: initialValue(fields[0]),
                      },
                    ],
                  },
                })
              }
            >
              <Plus size={17} />
              Thêm điều kiện
            </button>
            <p className="helper">Không thỏa điều kiện: lưu bước bỏ qua, tiếp tục bước sau.</p>
          </>
        )}
      </fieldset>
    </section>
  ));
  return (
    <div className="workflow-studio">
      <button
        className="back-link"
        onClick={async () => {
          if (
            !dirty ||
            (await confirm('Rời bản nháp chưa lưu?', 'Các thay đổi chưa lưu sẽ bị bỏ.'))
          ) {
            setSelected(null);
            setDefinition(null);
            setDirty(false);
          }
        }}
      >
        <ArrowLeft size={18} />
        Danh sách quy trình
      </button>
      <PageHeader
        eyebrow={`${selected.code} · MẪU V${selected.template_version}`}
        title={selected.name}
        description={`Đang dùng quy trình v${published?.version || 'chưa ban hành'} · Nháp revision ${selected.draft_revision}${dirty ? ' · Có thay đổi chưa lưu' : ''}`}
        actions={
          <>
            <Badge status={selected.status} />
            {edit && (
              <button
                className="button"
                disabled={action.busy}
                onClick={() =>
                  action.run(
                    async () =>
                      load(
                        await api('workflows/' + selected.id + '/status', 'PATCH', {
                          status: selected.status === 'ACTIVE' ? 'INACTIVE' : 'ACTIVE',
                        }),
                      ),
                    'Đã cập nhật trạng thái.',
                  )
                }
              >
                {selected.status === 'ACTIVE' ? 'Dừng nhận đơn mới' : 'Mở nhận đơn mới'}
              </button>
            )}
          </>
        }
      />
      <ErrorBox message={action.error} />
      <ErrorBox message={directory.error} />
      <div className="wf-view-bar">
        <div className="wf-view-switch" role="group" aria-label="Chế độ cấu hình">
          <button aria-pressed={viewMode === 'flow'} onClick={() => setViewMode('flow')}>
            <GitBranch size={18} />
            Sơ đồ flow
          </button>
          <button aria-pressed={viewMode === 'list'} onClick={() => setViewMode('list')}>
            <ListBullets size={18} />
            Danh sách bước
          </button>
        </div>
        <div className="actions">
          {edit && (
            <>
              <button
                className="button icon"
                aria-label="Hoàn tác cấu hình"
                disabled={action.busy || !history.current.past.length}
                onClick={() => travel('undo')}
              >
                <ArrowCounterClockwise size={18} />
              </button>
              <button
                className="button icon"
                aria-label="Làm lại cấu hình"
                disabled={action.busy || !history.current.future.length}
                onClick={() => travel('redo')}
              >
                <ArrowClockwise size={18} />
              </button>
              <button className="button" disabled={action.busy || !dirty} onClick={save}>
                <FloppyDisk size={17} />
                Lưu nháp
              </button>
            </>
          )}
          {can(actor, 'WORKFLOW_PUBLISH') && (
            <button
              className="button primary"
              onClick={() => {
                setInspector('publish');
                setViewMode('flow');
              }}
            >
              {' '}
              <RocketLaunch size={17} />
              Ban hành
            </button>
          )}
        </div>
      </div>
      {viewMode === 'flow' && (
        <nav className="wf-step-navigation" aria-label="Chọn bước trên sơ đồ">
          {definition.steps.map((step, index) => (
            <button
              key={step.id}
              aria-pressed={index === activeIndex}
              onClick={() => { setSelectedStepId(step.id); setInspector('step'); }}
            >
              <span className="wf-step-navigation-number">{index + 1}</span>
              <span><b>{workflowStepName(step.name)}</b><small>{step.when ? 'Có điều kiện riêng' : 'Luôn chạy'}</small></span>
            </button>
          ))}
        </nav>
      )}
      <div
        className={
          'workflow-editor-layout ' + (viewMode === 'flow' ? 'workflow-visual-layout' : '')
        }
      >
        <main className="workflow-step-list">
          <div className="workflow-section-heading" hidden={viewMode === 'flow'}>
            <h2>Các bước xử lý</h2>
            <span className="helper">Theo thứ tự · Tối đa 30 bước</span>
          </div>
          {viewMode === 'flow' ? (
            <WorkflowCanvas
              definition={definition}
              directory={dir}
              fields={fields}
              simulation={simulation}
              selectedStepId={definition.steps[activeIndex].id}
              storageKey={'flowpilot:canvas:v2:' + actor.assignmentId + ':' + selected.id}
              onSelect={(id) => {
                setSelectedStepId(id);
                setInspector('step');
              }}
              onAdd={addStep}
              onSimulation={() => setInspector('simulation')}
              canEdit={edit}
              busy={action.busy}
            />
          ) : (
            stepCards
          )}

          {edit && viewMode === 'list' && (
            <button
              className="button full-button"
              disabled={action.busy || definition.steps.length >= 30}
              onClick={() => change({ ...definition, steps: [...definition.steps, freshStep()] })}
            >
              <Plus size={18} />
              Thêm bước phê duyệt
            </button>
          )}
        </main>
        <aside
          ref={inspectorRef}
          className="workflow-config-aside"
          aria-label="Cấu hình và mô phỏng quy trình"
          tabIndex={viewMode === 'flow' ? 0 : undefined}
        >
          {viewMode === 'flow' && (
            <>
              <div className="wf-inspector-tabs" role="group" aria-label="Panel cấu hình">
                {(
                  [
                    ['step', 'Bước'],
                    ['simulation', 'Mô phỏng'],
                    ['publish', 'Ban hành'],
                    ['versions', 'Lịch sử'],
                  ] as const
                ).map(([id, label]) => (
                  <button key={id} aria-pressed={inspector === id} onClick={() => setInspector(id)}>
                    {label}
                  </button>
                ))}
              </div>
              {inspector === 'step' && (
                <div className="wf-inspector-step">
                  <div className="wf-inspector-context">
                    <span>ĐANG CẤU HÌNH BƯỚC {activeIndex + 1}</span>
                    <h2>{workflowStepName(definition.steps[activeIndex].name)}</h2>
                    <p>{definition.steps[activeIndex].when
                      ? `Điều kiện trên sơ đồ thuộc riêng bước ${activeIndex + 1}.`
                      : 'Bước này luôn chạy, không có node điều kiện riêng.'}</p>
                  </div>
                  <label className="field-label wf-step-picker">
                    Bước cần cấu hình
                    <select
                      value={definition.steps[activeIndex].id}
                      onChange={(e) => setSelectedStepId(e.target.value)}
                    >
                      {definition.steps.map((step, index) => (
                        <option key={step.id} value={step.id}>
                          {index + 1}. {workflowStepName(step.name)}
                        </option>
                      ))}
                    </select>
                  </label>
                  {stepCards[activeIndex]}
                  <p className="helper wf-order-note">
                    Nút lên/xuống đổi thứ tự thực thi. Kéo node trên canvas chỉ đổi vị trí trình
                    bày.
                  </p>
                </div>
              )}
            </>
          )}
          <section
            className="panel panel-pad"
            hidden={viewMode === 'flow' && inspector !== 'publish'}
          >
            <h2>Lưu và ban hành</h2>
            <p className="helper">
              Đơn đã gửi giữ phiên bản đã chốt. Lưu nháp chỉ thay bản đang soạn.
            </p>
            {edit && (
              <>
                <button className="button full-button" disabled={action.busy} onClick={save}>
                  <FloppyDisk size={18} />
                  Lưu bản nháp
                </button>
                <button
                  className="button full-button"
                  disabled={action.busy}
                  onClick={() =>
                    action.run(
                      () => api('workflows/' + selected.id + '/validate', 'POST', { definition }),
                      'Cấu hình hợp lệ về cấu trúc và tham chiếu.',
                    )
                  }
                >
                  Kiểm tra cấu hình
                </button>
              </>
            )}
            {can(actor, 'WORKFLOW_PUBLISH') && (
              <>
                <label className="field-label">
                  Ghi chú ban hành
                  <textarea
                    rows={3}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    maxLength={500}
                    placeholder="Mô tả thay đổi quy trình"
                  />
                </label>
                <button
                  className="button primary full-button"
                  disabled={action.busy || !note.trim()}
                  onClick={async () => {
                    if (
                      !(await confirm(
                        'Ban hành phiên bản quy trình?',
                        'Đơn gửi mới sẽ dùng phiên bản này. Đơn đang chạy và gửi lại vẫn giữ phiên bản cũ.',
                      ))
                    )
                      return;
                    const current = dirty ? await save() : selected;
                    if (!current) return;
                    await action.run(async () => {
                      load(
                        await api('workflows/' + selected.id + '/publish', 'POST', {
                          expectedRevision: current.draft_revision,
                          changeNote: note,
                        }),
                      );
                      setNote('');
                    }, 'Đã ban hành phiên bản quy trình mới.');
                  }}
                >
                  <RocketLaunch size={18} />
                  Ban hành phiên bản mới
                </button>
              </>
            )}
          </section>
          {edit && (
            <section
              className="panel panel-pad"
              hidden={viewMode === 'flow' && inspector !== 'simulation'}
            >
              <h2>Mô phỏng tuyến xử lý</h2>
              <p className="helper">Dữ liệu thử; không tạo hoặc gửi yêu cầu thật.</p>
              <label className="field-label">
                Người gửi
                <select
                  value={sender}
                  onChange={(e) => {
                    setSender(e.target.value);
                    setSimulation(null);
                  }}
                >
                  <option value="">Chọn người gửi</option>
                  {dir.assignments.map((a: any) => (
                    <option key={a.id} value={a.id}>
                      {a.full_name} · {a.unit_name}
                    </option>
                  ))}
                </select>
              </label>
              <FormInputs
                fields={fields}
                values={data}
                onChange={(key, value) => {
                  setData({ ...data, [key]: value });
                  setSimulation(null);
                }}
              />
              <button
                className="button full-button"
                disabled={action.busy || !sender}
                onClick={() =>
                  action.run(async () =>
                    setSimulation(
                      await api('workflows/' + selected.id + '/simulate', 'POST', {
                        definition,
                        requesterAssignmentId: sender,
                        formData: data,
                      }),
                    ),
                  )
                }
              >
                <Play size={18} />
                Mô phỏng
              </button>
              {simulation && (
                <div className="simulation-results" role="status">
                  <b>
                    {simulation.valid
                      ? 'Tuyến dự kiến hợp lệ'
                      : 'Tuyến có bước chưa xác định được người duyệt'}
                  </b>
                  <ol>
                    {simulation.steps.map((s: any) => (
                      <li key={s.id}>
                        <strong>{workflowStepName(s.name)}</strong>
                        <p>
                          {!s.condition.matched
                            ? 'Bỏ qua — điều kiện không đúng'
                            : s.error ||
                              s.assignees
                                .map(
                                  (a: any) =>
                                    a.name +
                                    (a.delegatedFrom ? ' (thay ' + a.delegatedFrom + ')' : '') +
                                    (a.delegationWarning ? ' · ' + a.delegationWarning : ''),
                                )
                                .join(', ')}
                        </p>
                        {s.condition.conditions.map((c: any, i: number) => (
                          <small key={i}>
                            {fields.find((f) => f.key === c.field)?.label || c.field}{' '}
                            {operatorLabels[c.operator]}{' '}
                            {typeof c.value === 'number' ? formatMoneyValue(c.value) : JSON.stringify(c.value)}:{' '}
                            {c.matched ? 'Đúng' : 'Sai'} (giá trị: {typeof c.actual === 'number' ? formatMoneyValue(c.actual) : JSON.stringify(c.actual)})
                          </small>
                        ))}
                      </li>
                    ))}
                  </ol>
                </div>
              )}
            </section>
          )}
          <section
            className="panel panel-pad"
            hidden={viewMode === 'flow' && inspector !== 'versions'}
          >
            <h2>Lịch sử phiên bản</h2>
            {selected.versions.map((v: any) => (
              <button
                className={'workflow-version-item ' + (version?.id === v.id ? 'selected' : '')}
                key={v.id}
                onClick={() => setVersion(v)}
              >
                <b>
                  v{v.version} · Mẫu v{v.template_version}
                  {v.id === selected.published_version_id ? ' · Đang dùng' : ''}
                </b>
                <span>{v.change_note}</span>
                <small>
                  {v.publisher_name || 'Chuyển đổi dữ liệu cũ'} · {fmtDate(v.published_at, true)}
                </small>
              </button>
            ))}
            {version && (
              <div className="workflow-version-preview">
                <h3>Quy trình v{version.version}</h3>
                <ol>
                  {version.definition.steps.map((s: Step) => (
                    <li key={s.id}>
                      {workflowStepName(s.name)} · {s.mode}
                      {s.when ? ' · Có điều kiện' : ''}
                    </li>
                  ))}
                </ol>
                <details>
                  <summary>So sánh với bản đang soạn</summary>
                  <ul>
                    {Array.from(
                      new Set<string>([
                        ...version.definition.steps.map((s: Step) => s.id),
                        ...definition.steps.map((s) => s.id),
                      ]),
                    ).map((id) => {
                      const old = version.definition.steps.find((s: Step) => s.id === id),
                        next = definition.steps.find((s) => s.id === id);
                      return (
                        <li key={id}>
                          {next?.name || old?.name}:{' '}
                          {!old
                            ? 'Đã thêm'
                            : !next
                              ? 'Đã bỏ'
                              : JSON.stringify(old) !== JSON.stringify(next)
                                ? 'Đã sửa'
                                : 'Giữ nguyên'}
                          {old &&
                          next &&
                          version.definition.steps.indexOf(old) !== definition.steps.indexOf(next)
                            ? ' · Đổi thứ tự'
                            : ''}
                        </li>
                      );
                    })}
                  </ul>
                </details>
                {edit && (
                  <button
                    className="button"
                    disabled={action.busy}
                    onClick={async () => {
                      if (
                        !(await confirm(
                          'Đưa phiên bản này vào nháp?',
                          'Bản đang soạn sẽ được thay thế. Phiên bản đang dùng giữ nguyên cho đến khi ban hành.',
                        ))
                      )
                        return;
                      await action.run(async () => {
                        load(
                          await api('workflows/' + selected.id + '/restore', 'POST', {
                            sourceVersionId: version.id,
                            expectedRevision: selected.draft_revision,
                          }),
                        );
                        setVersion(null);
                      }, 'Đã phục hồi cấu hình vào nháp.');
                    }}
                  >
                    Đưa vào bản nháp
                  </button>
                )}
              </div>
            )}
          </section>
        </aside>
      </div>
    </div>
  );
}
