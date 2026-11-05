'use client';
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import {
  ReactFlow,
  Background,
  BackgroundVariant,
  Controls,
  MiniMap,
  Handle,
  Position,
  BaseEdge,
  useNodesState,
  type NodeProps,
  type EdgeProps,
  type ReactFlowInstance,
} from '@xyflow/react';
import {
  Play,
  CheckCircle,
  UserCircle,
  GitBranch,
  UsersThree,
  Clock,
  Plus,
  ArrowsOut,
  ArrowsClockwise,
  ArrowRight,
  Info,
  CursorClick,
} from '@phosphor-icons/react';
import {
  buildWorkflowGraph,
  workflowStepFocusIds,
  type FlowDefinition,
  type FlowDirectory,
  type FlowNode,
} from '../lib/workflow-graph';
import '@xyflow/react/dist/style.css';

const WorkflowNode = memo(function WorkflowNode({ data }: NodeProps<FlowNode>) {
  const kind = data.kind,
    terminal = ['start', 'end'].includes(kind),
    tiny = kind === 'merge';
  const Icon =
    kind === 'start'
      ? Play
      : kind === 'end'
        ? CheckCircle
        : kind === 'condition'
          ? GitBranch
          : kind === 'participant'
            ? UserCircle
            : kind === 'join'
              ? UsersThree
              : kind === 'skip'
                ? ArrowRight
                : UsersThree;
  return (
    <div
      className={`wf-node wf-node-${kind}${data.selected ? ' is-active' : ''}${data.state ? ' is-' + data.state : ''}`}
    >
      {kind !== 'start' && (
        <Handle type="target" position={Position.Top} id="in" isConnectable={false} />
      )}
      {['skip', 'merge'].includes(kind) && (
        <Handle
          type="target"
          position={kind === 'skip' ? Position.Left : Position.Right}
          id="side"
          isConnectable={false}
        />
      )}
      {!tiny && (
        <div className="wf-node-heading">
          <span className="wf-node-icon">
            <Icon size={19} weight={terminal ? 'fill' : 'regular'} />
          </span>
          <span className="wf-node-eyebrow">
            {kind === 'approval'
              ? `BƯỚC ${(data.stepIndex || 0) + 1}`
              : kind === 'condition'
                ? `TRƯỚC BƯỚC ${(data.stepIndex || 0) + 1}`
                : kind === 'join'
                  ? `KẾT QUẢ BƯỚC ${(data.stepIndex || 0) + 1}`
                  : kind === 'participant'
                    ? `NGƯỜI DUYỆT · BƯỚC ${(data.stepIndex || 0) + 1}`
                    : kind === 'skip'
                      ? 'NHÁNH BỎ QUA'
                      : kind === 'start'
                        ? 'ĐẦU VÀO'
                        : 'KẾT THÚC'}
          </span>
          {data.state && (
            <span className="wf-node-state">
              {data.state === 'matched'
                ? 'Đi qua'
                : data.state === 'skipped'
                  ? 'Bỏ qua'
                  : 'Cần sửa'}
            </span>
          )}
        </div>
      )}
      <strong className="wf-node-title" title={data.title}>{data.title}</strong>
      {data.subtitle && <span className="wf-node-subtitle" title={data.subtitle}>{data.subtitle}</span>}
      {!!data.lines?.length && (
        <div className="wf-node-lines">
          {data.lines.map((line, i) => (
            <span key={i} title={line}>{line}</span>
          ))}
        </div>
      )}
      {(data.policy || data.sla) && (
        <div className="wf-node-footer">
          {data.policy && <span>{data.policy}</span>}
          {data.sla && (
            <span>
              <Clock size={12} />
              {data.sla}
            </span>
          )}
        </div>
      )}
      {kind !== 'end' && (
        <Handle type="source" position={Position.Bottom} id="out" isConnectable={false} />
      )}
      {kind === 'condition' && (
        <Handle type="source" position={Position.Right} id="no" isConnectable={false} />
      )}
    </div>
  );
});
function BypassEdge({ id, sourceX, sourceY, targetX, targetY, markerEnd, style }: EdgeProps) {
  const elbow = 14,
    vertical = Math.max(sourceY, targetY - elbow);
  const direction = sourceX > targetX ? -1 : 1;
  const path = `M ${sourceX} ${sourceY} L ${sourceX} ${vertical} Q ${sourceX} ${targetY} ${sourceX + direction * elbow} ${targetY} L ${targetX} ${targetY}`;
  return <BaseEdge id={id} path={path} markerEnd={markerEnd} style={style} />;
}
const nodeTypes = { workflow: WorkflowNode },
  edgeTypes = { bypass: BypassEdge };
type Layout = Record<string, { x: number; y: number }>;
export function WorkflowCanvas({
  definition,
  directory,
  fields,
  simulation,
  selectedStepId,
  onSelect,
  onAdd,
  onSimulation,
  canEdit,
  busy,
  storageKey,
}: {
  definition: FlowDefinition;
  directory: FlowDirectory;
  fields: any[];
  simulation: any;
  selectedStepId: string;
  onSelect: (id: string) => void;
  onAdd: () => void;
  onSimulation: () => void;
  canEdit: boolean;
  busy: boolean;
  storageKey: string;
}) {
  const graph = useMemo(
    () => buildWorkflowGraph(definition, directory, fields, simulation, selectedStepId),
    [definition, directory, fields, simulation, selectedStepId],
  );
  const focusNodeIds = workflowStepFocusIds(graph.nodes, selectedStepId).join('|');
  const [nodes, setNodes, onNodesChange] = useNodesState<FlowNode>(graph.nodes);
  const [flow, setFlow] = useState<ReactFlowInstance<FlowNode> | null>(null),
    [fullscreenError, setFullscreenError] = useState('');
  const layout = useRef<Layout>({}),
    root = useRef<HTMLDivElement>(null);
  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(storageKey) || '{}'),
        clean: Layout = {};
      if (saved && typeof saved === 'object')
        for (const [id, p] of Object.entries(saved)) {
          const position = p as any;
          if (
            Number.isFinite(position?.x) &&
            Number.isFinite(position?.y) &&
            Math.abs(position.x) < 100000 &&
            Math.abs(position.y) < 100000
          )
            clean[id] = { x: position.x, y: position.y };
        }
      layout.current = clean;
    } catch {
      layout.current = {};
    }
    setNodes(graph.nodes.map((n) => ({ ...n, position: layout.current[n.id] || n.position })));
    // Definition updates have their own effect below; only restore a layout when its owner changes.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [storageKey, setNodes]);
  useEffect(() => {
    setNodes((current) =>
      graph.nodes.map((n) => ({
        ...n,
        position:
          layout.current[n.id] || current.find((old) => old.id === n.id)?.position || n.position,
      })),
    );
  }, [graph, setNodes]);
  useEffect(() => {
    if (!flow || !selectedStepId) return;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        void flow.fitView({
          nodes: focusNodeIds.split('|').map((id) => ({ id })),
          padding: 0.12,
          minZoom: 0.55,
          maxZoom: 1,
          duration: 0,
        });
      });
    };
    fit();
    const observer = new ResizeObserver(fit);
    const viewport = root.current?.querySelector('.wf-flow');
    if (viewport) observer.observe(viewport);
    return () => { observer.disconnect(); cancelAnimationFrame(frame); };
  }, [flow, selectedStepId, focusNodeIds]);
  function remember() {
    try {
      localStorage.setItem(storageKey, JSON.stringify(layout.current));
    } catch {}
  }
  function reset() {
    layout.current = {};
    remember();
    setNodes(graph.nodes);
    requestAnimationFrame(() => {
      void flow?.fitView({ padding: 0.15, maxZoom: 0.85, duration: 0 });
    });
  }
  async function fullscreen() {
    setFullscreenError('');
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await root.current?.closest('.workflow-editor-layout')?.requestFullscreen();
    } catch {
      setFullscreenError(
        'Trình duyệt không mở được toàn màn hình. Em có thể thu gọn sidebar hoặc dùng chế độ toàn màn hình của trình duyệt.',
      );
    }
  }
  return (
    <section className="wf-canvas-shell" ref={root} aria-label="Sơ đồ cấu hình quy trình">
      <header className="wf-canvas-toolbar">
        <div className="wf-canvas-title">
          <GitBranch size={21} />
          <div>
            <h2>Sơ đồ quy trình</h2>
            <span>
              {definition.steps.length} bước · {definition.steps.filter((s) => s.when).length} nhóm
              điều kiện
            </span>
          </div>
        </div>
        <div className="actions">
          <button className="button" title="Hiển thị sơ đồ ở kích thước 100%"
            onClick={() => void flow?.zoomTo(1, { duration: 0 })}>100%</button>
          {canEdit && (
            <button
              className="button"
              onClick={onAdd}
              disabled={busy || definition.steps.length >= 30}
            >
              <Plus size={16} />
              Thêm bước
            </button>
          )}
          {canEdit && (
            <button className="button" onClick={onSimulation} disabled={busy}>
              <Play size={16} />
              Mô phỏng
            </button>
          )}
          <button
            className="button icon"
            title="Tự sắp xếp sơ đồ"
            aria-label="Tự sắp xếp sơ đồ"
            onClick={reset}
          >
            <ArrowsClockwise size={18} />
          </button>
          <button
            className="button icon"
            title="Toàn màn hình"
            aria-label="Bật hoặc thoát toàn màn hình"
            onClick={() => void fullscreen()}
          >
            <ArrowsOut size={18} />
          </button>
        </div>
      </header>
      {fullscreenError && (
        <p className="wf-canvas-alert" role="alert">
          {fullscreenError}
        </p>
      )}
      <div
        className="wf-flow"
        onKeyDownCapture={(event) => {
          if (['Enter', ' '].includes(event.key) && event.target instanceof HTMLElement) {
            const wrapper = event.target.closest('.react-flow__node');
            const node = graph.nodes.find((n) => n.id === wrapper?.getAttribute('data-id'));
            if (node?.data.stepId) {
              event.preventDefault();
              onSelect(node.data.stepId);
            }
          }
        }}
      >
        <ReactFlow<FlowNode>
          nodes={nodes}
          edges={graph.edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onInit={setFlow}
          onNodeClick={(_, node) => {
            if (node.data.stepId) onSelect(node.data.stepId);
          }}
          onNodeDragStop={(_, node) => {
            layout.current[node.id] = { ...node.position };
            remember();
          }}
          nodesConnectable={false}
          edgesReconnectable={false}
          deleteKeyCode={null}
          edgesFocusable={false}
          nodesFocusable
          fitView
          fitViewOptions={{
            nodes: graph.nodes.filter((n) => n.id === 'start' || n.id === 'step:' + selectedStepId),
            padding: 0.2,
            minZoom: 0.55,
            maxZoom: 0.85,
          }}
          minZoom={0.12}
          maxZoom={1.6}
          snapToGrid
          snapGrid={[16, 16]}
          defaultEdgeOptions={{
            labelStyle: { fontSize: 12, fontWeight: 600 },
            labelBgStyle: { fill: '#fff' },
            labelBgBorderRadius: 6,
            labelBgPadding: [8, 5],
          }}
          ariaLabelConfig={{
            'node.a11yDescription.default':
              'Nhấn Enter để mở cấu hình bước. Dùng phím mũi tên để di chuyển vị trí node.',
            'controls.zoomIn.ariaLabel': 'Phóng to sơ đồ',
            'controls.zoomOut.ariaLabel': 'Thu nhỏ sơ đồ',
            'controls.fitView.ariaLabel': 'Vừa màn hình',
          }}
        >
          <Background variant={BackgroundVariant.Dots} gap={22} size={1.1} color="#cbd5e1" />
          <Controls showInteractive={false} />
          <MiniMap
            nodeColor={(n) =>
              n.data.kind === 'condition'
                ? '#d9a842'
                : n.data.kind === 'participant'
                  ? '#9b94da'
                  : '#73a3df'
            }
            maskColor="rgba(241,245,249,.7)"
            pannable
            zoomable
            ariaLabel="Bản đồ thu nhỏ của quy trình"
          />
        </ReactFlow>
      </div>
      <footer className="wf-canvas-footer">
        <span>
          <CursorClick size={16} />
          Chọn node để cấu hình · Kéo để bố trí · Cuộn để zoom
        </span>
        <span>
          <i className="wf-line-sample" />
          Chạy bước <i className="wf-line-sample dashed" />
          Bỏ qua
        </span>
      </footer>
      <p className="wf-canvas-caption">
        <Info size={15} />
        Đường nối thể hiện tuyến đồng ý. Từ chối hoặc trả bổ sung kết thúc vòng hiện tại. Vị trí
        node được lưu trên trình duyệt; thứ tự xử lý chỉnh trong panel.{' '}
        {!simulation && 'Mô phỏng để xem người được giao thực tế.'}
      </p>
    </section>
  );
}
