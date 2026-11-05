'use client';
import { useEffect, useLayoutEffect, useRef, useState, type InputHTMLAttributes } from 'react';
import { formatMoneyValue, normalizeMoneyDraft, parseMoneyDraft, moneyCaretPosition } from '../lib/money-input';

type Props = Omit<InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange' | 'type'> & {
  value: unknown;
  onValueChange: (value: number | '') => void;
};
export function MoneyInput({ value, onValueChange, className = '', ...props }: Props) {
  const [text, setText] = useState(() => formatMoneyValue(value));
  const input = useRef<HTMLInputElement>(null), caret = useRef<number | null>(null);
  useEffect(() => {
    setText((current) => parseMoneyDraft(current) === value ? current : formatMoneyValue(value));
  }, [value]);
  useLayoutEffect(() => {
    if (caret.current != null && document.activeElement === input.current) {
      input.current?.setSelectionRange(caret.current, caret.current);
      caret.current = null;
    }
  });
  return (
    <input
      {...props}
      ref={input}
      className={'money-input ' + className}
      type="text"
      inputMode="decimal"
      autoComplete="off"
      spellCheck={false}
      value={text}
      onChange={(event) => {
        const raw = event.target.value, next = normalizeMoneyDraft(raw);
        const number = next == null ? null : parseMoneyDraft(next);
        if (next == null || number == null) return;
        caret.current = moneyCaretPosition(next, raw.slice(0, event.target.selectionStart ?? raw.length));
        setText(next);
        onValueChange(number);
      }}
      onBlur={(event) => {
        setText(formatMoneyValue(parseMoneyDraft(text)));
        props.onBlur?.(event);
      }}
    />
  );
}
