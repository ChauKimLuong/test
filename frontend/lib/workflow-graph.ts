import type { Node, Edge, MarkerType } from '@xyflow/react';

export type FlowSelector = {
  type: string;
  level?: number;
  positionId?: string;
  assignmentId?: string;
  roleId?: string;
  unitId?: string;
};
export type FlowRule = { field: string; operator: string; value?: unknown };
export type FlowStep = {
  id: string;
  name: string;
  mode: string;
  assignees: FlowSelector[];
  when?: { mode: string; conditions: FlowRule[] };
  sla?: { minutes: number; remindBeforeMinutes: number; escalationAssignmentId?: string };
};
export type FlowDefinition = { schemaVersion: number; steps: FlowStep[] };
export type FlowNodeData = Record<string, unknown> & {
  kind: 'start' | 'end' | 'approval' | 'condition' | 'participant' | 'join' | 'merge' | 'skip';
  title: string;
  subtitle?: string;
  lines?: string[];
  stepId?: string;
  stepIndex?: number;
  policy?: string;
  sla?: string;
  selected?: boolean;
  state?: 'matched' | 'skipped' | 'error';
};
export type FlowNode = Node<FlowNodeData, 'workflow'>;
export type FlowDirectory = { assignments: any[]; positions: any[]; units: any[]; roles: any[] };
export const flowOperatorLabels: Record<string, string> = {
  EQ: '=',
  NE: '≠',
  GT: '>',
  GTE: '≥',
  LT: '<',
  LTE: '≤',
  IN: 'thuộc',
  IS_EMPTY: 'chưa điền',
  IS_NOT_EMPTY: 'đã điền',
};
/** The UI already shows a step number; omit legacy numbering from its display name. */
export function workflowStepName(name: string) {
  return name.replace(/^\s*\d{1,2}(?:\s*·\s*|[.)]\s+)/, '') || name;
}
export function selectorTitle(s: FlowSelector, d: FlowDirectory) {
  const name = (items: any[], id?: string, key = 'name') =>
    items.find((x) => x.id === id)?.[key] || 'Chưa chọn';
  const title =
    s.type === 'DIRECT_MANAGER'
      ? 'Quản lý trực tiếp'
      : s.type === 'MANAGER_LEVEL'
        ? `Quản lý cấp ${s.level || 1}`
        : s.type === 'POSITION'
          ? name(d.positions, s.positionId)
          : s.type === 'ASSIGNMENT'
            ? name(d.assignments, s.assignmentId, 'full_name')
            : s.type === 'ROLE'
              ? name(d.roles, s.roleId)
              : 'Trưởng đơn vị';
  return title + (s.unitId ? ' · ' + name(d.units, s.unitId) : '');
}
export function conditionTitle(rule: FlowRule, fields: any[]) {
  const label = fields.find((f) => f.key === rule.field)?.label || rule.field;
  const value =
    typeof rule.value === 'number'
      ? new Intl.NumberFormat('vi-VN').format(rule.value)
      : typeof rule.value === 'boolean'
        ? rule.value
          ? 'Có'
          : 'Không'
        : Array.isArray(rule.value)
          ? rule.value.join(', ')
          : String(rule.value ?? '');
  return `${label} ${flowOperatorLabels[rule.operator] || rule.operator}${['IS_EMPTY', 'IS_NOT_EMPTY'].includes(rule.operator) ? '' : ' ' + value}`;
}
/** A projection of schemaVersion 1. It never interprets canvas coordinates as business edges. */
export function buildWorkflowGraph(
  definition: FlowDefinition,
  directory: FlowDirectory,
  fields: any[] = [],
  simulation: any = null,
  selectedStepId?: string,
) {
  const nodes: FlowNode[] = [],
    edges: Edge[] = [];
  const center = 480;
  let y = 0,
    last = 'start';
  const add = (
    id: string,
    x: number,
    top: number,
    width: number,
    height: number,
    data: FlowNodeData,
  ) => {
    nodes.push({
      id,
      type: 'workflow',
      position: { x, y: top },
      width,
      height,
      style: { width },
      data,
      ariaLabel: data.title + (data.subtitle ? ' · ' + data.subtitle : ''),
      focusable: !!data.stepId && ['approval', 'condition'].includes(data.kind),
      draggable: true,
    });
  };
  const edge = (source: string, target: string, options: Partial<Edge> = {}) => {
    edges.push({
      id: `${source}->${target}`,
      source,
      target,
      type: 'smoothstep',
      sourceHandle: 'out',
      targetHandle: 'in',
      style: { stroke: '#91a3b9', strokeWidth: 1.7 },
      markerEnd: { type: 'arrowclosed' as MarkerType, color: '#91a3b9', width: 16, height: 16 },
      ...options,
    });
  };
  add('start', center - 145, y, 290, 86, {
    kind: 'start',
    title: 'Bắt đầu',
    subtitle: 'Người gửi hoàn thiện và gửi biểu mẫu',
  });
  y = 168;
  definition.steps.forEach((s, index) => {
    const result = simulation?.steps.find((x: any) => x.id === s.id);
    const state: FlowNodeData['state'] = result
      ? result.error
        ? 'error'
        : result.condition.matched
          ? 'matched'
          : 'skipped'
      : undefined;
    const selected = s.id === selectedStepId;
    const base = { stepId: s.id, stepIndex: index, selected, state };
    const participants =
      result?.condition.matched && !result.error
        ? result.assignees.map(
            (a: any) => a.name + (a.delegatedFrom ? ' (thay ' + a.delegatedFrom + ')' : ''),
          )
        : s.assignees.map((a) => selectorTitle(a, directory));
    let gate: string | undefined, skip: string | undefined;
    if (s.when) {
      gate = 'gate:' + s.id;
      skip = 'skip:' + s.id;
      add(gate, center - 155, y, 310, 190, {
        ...base,
        kind: 'condition',
        title: `Điều kiện bước ${index + 1}`,
        subtitle: workflowStepName(s.name) + (s.when.mode === 'ALL' ? ' · AND' : ' · OR'),
        lines: s.when.conditions
          .slice(0, 2)
          .map((r) => conditionTitle(r, fields))
          .concat(
            s.when.conditions.length > 2
              ? [`+ ${s.when.conditions.length - 2} điều kiện khác`]
              : [],
          ),
      });
      edge(last, gate);
      add(
        skip,
        Math.max(center + 440, center + (participants.length - 1) * 150 + 225),
        y + 210,
        200,
        78,
        {
          ...base,
          kind: 'skip',
          title: `Bỏ qua bước ${index + 1}`,
          subtitle: 'Tiếp tục bước kế tiếp',
          selected: false,
          state: result && !result.condition.matched ? 'matched' : undefined,
        },
      );
      edge(gate, skip, {
        sourceHandle: 'no',
        targetHandle: 'side',
        label: result ? (result.condition.matched ? 'Sai · không đi' : 'Sai') : 'Sai',
        className: 'wf-edge-skip',
        style: {
          stroke: state === 'skipped' ? '#2563eb' : '#9ca9bc',
          strokeWidth: 1.7,
          strokeDasharray: '6 5',
        },
      });
      y += 280;
    }
    const main = 'step:' + s.id;
    const parallel = participants.length > 1;
    add(main, center - 155, y, 310, 200, {
      ...base,
      kind: 'approval',
      title: workflowStepName(s.name),
      subtitle: result?.error || (s.when ? `Chạy khi điều kiện bước ${index + 1} đúng` : 'Luôn chạy · Không có điều kiện'),
      lines: parallel ? undefined : participants,
      policy: parallel
        ? `${s.mode} · Duyệt song song`
        : s.mode === 'ALL'
          ? 'ALL · Tất cả đồng ý'
          : 'ANY · Một đồng ý',
      sla: s.sla
        ? `${s.sla.minutes >= 60 ? (s.sla.minutes / 60).toLocaleString('vi-VN') + ' giờ' : s.sla.minutes + ' phút'} · nhắc trước ${s.sla.remindBeforeMinutes} phút`
        : undefined,
    });
    edge(
      gate || last,
      main,
      gate
        ? {
            label: 'Đúng',
            style: {
              stroke: state === 'skipped' ? '#b5bfcd' : '#328571',
              strokeWidth: 1.8,
              opacity: state === 'skipped' ? 0.4 : 1,
            },
          }
        : {},
    );
    y += 280;
    let output = main;
    if (parallel) {
      participants.forEach((title: string, i: number) => {
        const id = `person:${s.id}:${i}`;
        add(id, center + (i - (participants.length - 1) / 2) * 300 - 125, y, 250, 100, {
          ...base,
          kind: 'participant',
          title,
          subtitle: result ? 'Người dự kiến được giao' : 'Quy tắc người duyệt',
          selected,
        });
        edge(main, id, {
          style: { stroke: state === 'skipped' ? '#bbc4d1' : '#6b66c9', strokeWidth: 1.7 },
        });
      });
      const join = 'join:' + s.id;
      add(join, center - 140, y + 200, 280, 86, {
        ...base,
        kind: 'join',
        title: s.mode === 'ALL' ? 'Chờ tất cả đồng ý' : 'Một người đồng ý là đủ',
        subtitle:
          s.mode === 'ALL' ? 'Đủ kết quả mới sang bước tiếp' : 'Hủy nhiệm vụ dư khi có đồng ý',
        policy: s.mode,
      });
      participants.forEach((_: string, i: number) =>
        edge(`person:${s.id}:${i}`, join, { style: { stroke: '#6b66c9', strokeWidth: 1.7 } }),
      );
      output = join;
      y += 370;
    }
    if (gate && skip) {
      const merge = 'merge:' + s.id;
      add(merge, center - 50, y, 100, 48, {
        ...base,
        kind: 'merge',
        title: 'Tiếp tục',
        selected: false,
      });
      edge(output, merge);
      edge(skip, merge, {
        sourceHandle: 'out',
        targetHandle: 'side',
        type: 'bypass',
        className: 'wf-edge-skip',
        style: {
          stroke: state === 'skipped' ? '#2563eb' : '#9ca9bc',
          strokeWidth: 1.7,
          strokeDasharray: '6 5',
        },
      });
      output = merge;
      y += 120;
    }
    last = output;
  });
  add('end', center - 145, y, 290, 86, {
    kind: 'end',
    title: 'Hoàn tất phê duyệt',
    subtitle: 'Sau khi các bước phù hợp đạt yêu cầu',
  });
  edge(last, 'end');
  return { nodes, edges };
}

/** Only frame the selected step and its own gate; never borrow an adjacent gate. */
export function workflowStepFocusIds(nodes: FlowNode[], stepId: string) {
  return nodes.filter((node) => node.data.stepId === stepId &&
    ['condition', 'approval'].includes(node.data.kind)).map((node) => node.id);
}
