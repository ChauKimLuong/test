/** Money uses Vietnamese grouping (.) and decimal (,); API values remain numbers. */
export function isMoneyField(field?: { type: string; key: string; label: string }) {
  if (field?.type !== 'NUMBER') return false;
  const label = field.label.normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/gi, 'd');
  return /(?:amount|budget|cost|price)/i.test(field.key) ||
    /(?:kinh phi|chi phi|so tien|tong tien|don gia|ngan sach|vnd|vndong)/i.test(label);
}
export function formatMoneyValue(value: unknown): string {
  if (value === '' || value == null) return '';
  const number = Number(value);
  return Number.isFinite(number)
    ? new Intl.NumberFormat('vi-VN', { maximumFractionDigits: 20 }).format(number)
    : '';
}
export function normalizeMoneyDraft(raw: string): string | null {
  const text = raw.replace(/\s/g, '').replace(/(?:VND|VNĐ|₫|đ)/gi, '');
  if (!/^-?[\d.]*,?\d*$/.test(text)) return null;
  const [integer, fraction] = text.replace(/\./g, '').split(',');
  const negative = integer.startsWith('-');
  const digits = integer.replace('-', '').replace(/^0+(?=\d)/, '');
  const grouped = digits.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return (negative ? '-' : '') + grouped + (fraction === undefined ? '' : ',' + fraction);
}
export function parseMoneyDraft(text: string): number | '' | null {
  const normalized = normalizeMoneyDraft(text);
  if (normalized == null) return null;
  if (!/\d/.test(normalized)) return '';
  const value = Number(normalized.replace(/\./g, '').replace(',', '.'));
  return Number.isFinite(value) && Math.abs(value) <= Number.MAX_SAFE_INTEGER ? value : null;
}
export function moneyCaretPosition(formatted: string, beforeCaret: string) {
  const count = beforeCaret.replace(/[^\d,-]/g, '').length;
  if (!count) return 0;
  let seen = 0;
  for (let i = 0; i < formatted.length; i++) {
    if (/[\d,-]/.test(formatted[i]) && ++seen === count) return i + 1;
  }
  return formatted.length;
}
