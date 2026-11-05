import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { buildWorkflowGraph, conditionTitle, workflowStepFocusIds } from '../lib/workflow-graph.ts';
let checks = 0;
const check = (actual, expected, label) => {
  assert.deepEqual(actual, expected, label);
  checks++;
};
const directory = {
  assignments: [{ id: 'person-1', full_name: 'Linh' }],
  positions: [{ id: 'position-1', name: 'CDO' }],
  units: [],
  roles: [{ id: 'role-1', name: 'Hội đồng' }],
};
const step = (id, extras = {}) => ({
  id,
  name: id,
  mode: 'ALL',
  assignees: [{ type: 'DIRECT_MANAGER' }],
  ...extras,
});
function integrity(graph) {
  const ids = graph.nodes.map((n) => n.id),
    idSet = new Set(ids);
  check(idSet.size, ids.length, 'Node IDs must be unique.');
  check(new Set(graph.edges.map((e) => e.id)).size, graph.edges.length, 'Edge IDs must be unique.');
  check(
    graph.edges.every((e) => idSet.has(e.source) && idSet.has(e.target)),
    true,
    'Every edge must refer to an existing node.',
  );
  const visited = new Set(),
    active = new Set();
  function visit(id) {
    assert.ok(!active.has(id), 'No graph cycles are allowed.');
    if (visited.has(id)) return;
    active.add(id);
    for (const e of graph.edges.filter((e) => e.source === id)) visit(e.target);
    active.delete(id);
    visited.add(id);
  }
  visit('start');
  checks++;
  check(visited.size, graph.nodes.length, 'No orphan nodes.');
  check(visited.has('end'), true, 'Successful execution can reach completion.');
}
const simple = { schemaVersion: 1, steps: [step('a'), step('b')] };
const numbered = { schemaVersion: 1, steps: [step('a', { name: '01 · Quản lý xác nhận' })] };
const numberedBefore = JSON.stringify(numbered);
check(buildWorkflowGraph(numbered, directory).nodes.find((n) => n.id === 'step:a').data.title,
  'Quản lý xác nhận', 'Legacy name prefix does not duplicate the node step badge.');
check(JSON.stringify(numbered), numberedBefore, 'Displaying a name never rewrites the persisted workflow.');
integrity(buildWorkflowGraph(simple, directory));
check(
  buildWorkflowGraph(simple, directory).nodes.filter((n) => n.data.kind === 'condition').length,
  0,
);
const conditional = {
  schemaVersion: 1,
  steps: [
    step('a'),
    step('b', {
      when: { mode: 'ALL', conditions: [{ field: 'amount', operator: 'GTE', value: 20 }] },
    }),
    step('c'),
  ],
};
const snapshot = JSON.stringify(conditional),
  graph = buildWorkflowGraph(conditional, directory, [{ key: 'amount', label: 'Kinh phí' }]);
integrity(graph);
check(graph.nodes.some((node) => node.id === 'gate:a'), false, 'First unconditional step has no gate.');
check(graph.nodes.find((node) => node.id === 'gate:b').data.stepId, 'b', 'Gate belongs to step 2.');
check(graph.nodes.find((node) => node.id === 'gate:b').data.stepIndex, 1, 'Gate has the same step number as its inspector.');
check(graph.nodes.find((node) => node.id === 'gate:b').data.title, 'Điều kiện bước 2');
check(workflowStepFocusIds(graph.nodes, 'a'), ['step:a'], 'Step 1 camera excludes step 2 gate.');
check(workflowStepFocusIds(graph.nodes, 'b'), ['gate:b', 'step:b'], 'Step 2 frames its gate and approval together.');
for (const selected of ['a', 'b', 'c']) {
  const view = buildWorkflowGraph(conditional, directory, [], null, selected);
  check(view.nodes.filter((n) => n.data.selected).every((n) => n.data.stepId === selected), true,
    'Selected gate and inspector share exactly one step owner.');
}
const reordered = buildWorkflowGraph({ ...conditional, steps: [conditional.steps[0], conditional.steps[2], conditional.steps[1]] }, directory);
check(reordered.nodes.find((n) => n.id === 'gate:b').data.title, 'Điều kiện bước 3', 'Number follows reorder while the condition stays with its step ID.');
check(JSON.stringify(conditional), snapshot, 'Projection must not alter the saved workflow.');
check(
  graph.edges
    .filter((e) => e.source === 'gate:b')
    .map((e) => e.target)
    .sort(),
  ['skip:b', 'step:b'],
  'Both run and bypass branches exist.',
);
check(
  graph.edges.some((e) => e.source === 'skip:b' && e.target === 'merge:b'),
  true,
);
check(
  graph.edges.some((e) => e.source === 'merge:b' && e.target === 'step:c'),
  true,
  'Bypass resumes at the next step.',
);
for (const policy of ['ALL', 'ANY']) {
  const parallel = buildWorkflowGraph(
    {
      schemaVersion: 1,
      steps: [
        step('parallel', {
          mode: policy,
          assignees: [
            { type: 'ASSIGNMENT', assignmentId: 'person-1' },
            { type: 'POSITION', positionId: 'position-1' },
          ],
        }),
      ],
    },
    directory,
  );
  integrity(parallel);
  check(parallel.nodes.filter((n) => n.data.kind === 'participant').length, 2);
  check(parallel.nodes.find((n) => n.id === 'join:parallel').data.policy, policy);
  check(
    parallel.edges.filter((e) => e.target === 'join:parallel').length,
    2,
    'All branches reunite before continuing.',
  );
}
const wide = buildWorkflowGraph(
  {
    schemaVersion: 1,
    steps: [
      step('first'),
      step('wide', {
        assignees: Array.from({ length: 12 }, () => ({ type: 'DIRECT_MANAGER' })),
        when: { mode: 'ALL', conditions: [{ field: 'amount', operator: 'GT', value: 10 }] },
      }),
    ],
  },
  directory,
);
integrity(wide);
check(
  wide.nodes.find((n) => n.id === 'skip:wide').position.x >
    Math.max(
      ...wide.nodes.filter((n) => n.data.kind === 'participant').map((n) => n.position.x + n.width),
    ),
  true,
  'A bypass lane stays outside all parallel columns.',
);
const simulated = buildWorkflowGraph(
  conditional,
  directory,
  [],
  {
    steps: [
      { id: 'a', condition: { matched: true }, assignees: [{ name: 'Linh' }] },
      { id: 'b', condition: { matched: false }, assignees: [] },
      { id: 'c', condition: { matched: true }, assignees: [{ name: 'CEO' }] },
    ],
  },
  'c',
);
check(simulated.nodes.find((n) => n.id === 'step:b').data.state, 'skipped');
check(simulated.nodes.find((n) => n.id === 'skip:b').data.state, 'matched');
check(simulated.nodes.find((n) => n.id === 'step:c').data.selected, true);
const resolved = buildWorkflowGraph(
  { schemaVersion: 1, steps: [step('group', { assignees: [{ type: 'ROLE', roleId: 'role-1' }] })] },
  directory,
  [],
  {
    steps: [
      {
        id: 'group',
        condition: { matched: true },
        assignees: [{ name: 'A' }, { name: 'B', delegatedFrom: 'C' }],
      },
    ],
  },
);
integrity(resolved);
check(
  resolved.nodes.filter((n) => n.data.kind === 'participant').length,
  2,
  'A single ROLE rule may resolve to multiple people.',
);
check(resolved.nodes.find((n) => n.id === 'person:group:1').data.title, 'B (thay C)');
check(
  conditionTitle({ field: 'urgent', operator: 'EQ', value: false }, [
    { key: 'urgent', label: 'Khẩn' },
  ]),
  'Khẩn = Không',
);
// Replay the real demonstration projection, including skipped conditions and parallel review.
try {
  const demo = JSON.parse(
    readFileSync(new URL('../../docs/defense-demo/prepared.json', import.meta.url), 'utf8'),
  );
  for (const simulation of demo.simulations) {
    const d = {
      steps: simulation.steps.map((s) => ({
        id: s.id,
        condition: { matched: s.matched },
        assignees: s.assignees.map((name) => ({ name })),
      })),
    };
    const view = buildWorkflowGraph(demo.definition, directory, [], d);
    integrity(view);
    check(
      view.nodes
        .filter((n) => n.data.kind === 'approval' && n.data.state === 'matched')
        .map((n) => n.data.stepId),
      simulation.steps.filter((s) => s.matched).map((s) => s.id),
    );
  }
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
console.log(
  checks +
    ' workflow graph checks passed: branches, joins, ALL/ANY, simulation, role resolution, IDs, reachability and immutable definition.',
);
