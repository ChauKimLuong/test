import assert from 'node:assert/strict';
import rules from '../dist/workflow-rules.js';
export function runRuleTests() {
  let count = 0;
  const fields = [
    { key: 'amount', type: 'NUMBER', label: 'Số tiền' },
    { key: 'text', type: 'TEXT', label: 'Nội dung' },
    { key: 'date', type: 'DATE', label: 'Ngày' },
    { key: 'flag', type: 'CHECKBOX', label: 'Xác nhận' },
    { key: 'category', type: 'SELECT', options: ['A', 'B'], label: 'Loại' },
  ];
  const manager = {
    id: 'manager',
    name: 'Manager',
    mode: 'ALL',
    assignees: [{ type: 'DIRECT_MANAGER' }],
  };
  const define = (conditions, mode = 'ALL') =>
    rules.validateDefinition(
      {
        schemaVersion: 1,
        steps: [manager, { ...manager, id: 'conditional', when: { mode, conditions } }],
      },
      fields,
    ).steps[1];
  const expect = (step, data, result) => {
    assert.equal(rules.evaluate(step, data).matched, result);
    count++;
  };
  for (const [operator, values] of Object.entries({
    GT: [false, false, true],
    GTE: [false, true, true],
    LT: [true, false, false],
    LTE: [true, true, false],
    EQ: [false, true, false],
    NE: [true, false, true],
  })) {
    const step = define([{ field: 'amount', operator, value: 100 }]);
    for (const [i, amount] of [99, 100, 101].entries()) expect(step, { amount }, values[i]);
    expect(step, {}, false);
  }
  for (const value of [undefined, null, ''])
    expect(define([{ field: 'text', operator: 'NE', value: 'A' }]), { text: value }, false);
  expect(define([{ field: 'amount', operator: 'IS_EMPTY' }]), { amount: 0 }, false);
  expect(define([{ field: 'flag', operator: 'IS_EMPTY' }]), { flag: false }, false);
  expect(define([{ field: 'flag', operator: 'EQ', value: false }]), { flag: false }, true);
  expect(define([{ field: 'text', operator: 'IN', value: ['A', 'B'] }]), { text: 'B' }, true);
  expect(define([{ field: 'text', operator: 'IN', value: ['A', 'B'] }]), { text: 'C' }, false);
  const conditions = [
    { field: 'amount', operator: 'GT', value: 100 },
    { field: 'flag', operator: 'EQ', value: true },
  ];
  for (const mode of ['ALL', 'ANY'])
    for (const amount of [50, 150])
      for (const flag of [false, true])
        expect(
          define(conditions, mode),
          { amount, flag },
          mode === 'ALL' ? amount > 100 && flag : amount > 100 || flag,
        );
  expect(
    define([{ field: 'date', operator: 'GTE', value: '2026-10-01' }]),
    { date: '2026-10-02' },
    true,
  );
  for (const condition of [
    { field: 'missing', operator: 'EQ', value: 0 },
    { field: 'amount', operator: 'IN', value: [0] },
    { field: 'amount', operator: 'GT', value: '100' },
    { field: 'flag', operator: 'GT', value: true },
    { field: 'date', operator: 'EQ', value: '2026-02-30' },
    { field: 'category', operator: 'EQ', value: 'C' },
    null,
  ]) {
    assert.throws(() => define([condition]));
    count++;
  }
  for (const steps of [
    [],
    [null],
    [manager, manager],
    [
      {
        ...manager,
        when: { mode: 'ALL', conditions: [{ field: 'amount', operator: 'GT', value: 0 }] },
      },
    ],
  ]) {
    assert.throws(() => rules.validateDefinition({ schemaVersion: 1, steps }, fields));
    count++;
  }
  console.log(
    count +
      ' workflow rule checks passed: strict conditions, boundaries, AND/OR, dates, empty, zero, false and malformed definitions.',
  );
}
