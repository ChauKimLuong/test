import assert from 'node:assert/strict';
import { formatMoneyValue, normalizeMoneyDraft, parseMoneyDraft, isMoneyField, moneyCaretPosition } from '../lib/money-input.ts';
let checks = 0;
function check(actual, expected) { assert.deepEqual(actual, expected); checks++; }
for (const value of [0, 3_000_000, 5_000_000, 19_999_999, 20_000_000, 35_000_000, -12345, 12345.67, 0.001]) {
  check(parseMoneyDraft(formatMoneyValue(value)), value);
}
check(formatMoneyValue(20_000_000), '20.000.000');
check(parseMoneyDraft('20.000.000'), 20000000);
check(parseMoneyDraft(' 20.000.000 VND '), 20000000);
check(parseMoneyDraft('12.345,67'), 12345.67);
check(normalizeMoneyDraft('00012345'), '12.345');
check(normalizeMoneyDraft('20000000,'), '20.000.000,');
check(parseMoneyDraft(''), '');
check(parseMoneyDraft('hai mươi triệu'), null);
check(parseMoneyDraft('20,00,00'), null);
check(parseMoneyDraft('999999999999999999999'), null);
check(isMoneyField({ type: 'NUMBER', key: 'amount', label: 'Tổng kinh phí đề nghị (VND)' }), true);
check(isMoneyField({ type: 'NUMBER', key: 'expense', label: 'Chi phí' }), true);
check(isMoneyField({ type: 'NUMBER', key: 'quantity', label: 'Số lượng' }), false);
check(isMoneyField({ type: 'TEXT', key: 'supplier', label: 'Nhà cung cấp dự kiến' }), false);
// Typing, changing a digit in the middle, clearing, paste, caret across a new separator.
let typed = '';
for (const digit of '20000000') typed = normalizeMoneyDraft(typed + digit);
check(typed, '20.000.000');
check(parseMoneyDraft(normalizeMoneyDraft('20.500.000')), 20500000);
check(moneyCaretPosition('20.000.000', '205'), 4);
check(moneyCaretPosition('200.000', '200000'), 7);
check(moneyCaretPosition('', ''), 0);
console.log(checks + ' money input checks passed: numeric payloads, thresholds, Vietnamese grouping, decimals, paste, clearing and caret.');
