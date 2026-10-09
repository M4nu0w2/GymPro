import { useEffect, useRef, useState } from 'react';
import { cn, parseNum } from '../lib/utils';
import { IconMinus, IconPlus } from './Icons';

interface Props {
  label: string;
  value: number | null;
  onChange: (v: number | null) => void;
  step: number;
  min?: number;
  max?: number;
  decimals?: boolean;
  unit?: string;
  size?: 'lg' | 'md';
  placeholder?: string;
}

/** Controllo numerico con pulsanti +/- grandi e inserimento manuale */
export function Stepper({ label, value, onChange, step, min = 0, max = 9999, decimals = false, unit, size = 'lg', placeholder = '–' }: Props) {
  const [text, setText] = useState(value == null ? '' : fmt(value));
  const focused = useRef(false);

  useEffect(() => {
    if (!focused.current) setText(value == null ? '' : fmt(value));
  }, [value]);

  function fmt(n: number) {
    return decimals ? String(Math.round(n * 100) / 100).replace('.', ',') : String(Math.round(n));
  }

  const bump = (dir: 1 | -1) => {
    const base = value ?? 0;
    let next = Math.round((base + dir * step) * 1000) / 1000;
    next = Math.min(max, Math.max(min, next));
    onChange(next);
  };

  const commit = (t: string) => {
    const n = parseNum(t);
    if (n == null) onChange(null);
    else onChange(Math.min(max, Math.max(min, decimals ? Math.round(n * 100) / 100 : Math.round(n))));
  };

  const big = size === 'lg';
  const btn = cn(
    'tap flex shrink-0 items-center justify-center rounded-full bg-surface-2 text-fg active:bg-accent active:text-accent-ink',
    big ? 'h-[58px] w-[58px] [@media(max-height:700px)]:h-[50px] [@media(max-height:700px)]:w-[50px]' : 'h-10 w-10',
  );
  return (
    <div className="flex min-w-0 flex-col items-stretch">
      {!big && (
        <span className="mb-1.5 text-center text-[13px] text-muted">
          {label}
          {unit && <span> · {unit}</span>}
        </span>
      )}
      <div className={cn('flex items-center gap-2', big ? 'h-[72px] [@media(max-height:700px)]:h-[60px]' : 'h-12 rounded-full bg-surface-2/60 p-1')}>
        <button type="button" aria-label={`Diminuisci ${label}`} onClick={() => bump(-1)} className={btn}>
          <IconMinus size={big ? 26 : 18} strokeWidth={2.6} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
          <input
            inputMode={decimals ? 'decimal' : 'numeric'}
            enterKeyHint="done"
            aria-label={label}
            value={text}
            placeholder={placeholder}
            onFocus={(e) => {
              focused.current = true;
              e.currentTarget.select();
            }}
            onChange={(e) => {
              const t = e.target.value.replace(/[^\d.,]/g, '');
              setText(t);
              commit(t);
            }}
            onBlur={() => {
              focused.current = false;
              setText(value == null ? '' : fmt(value));
            }}
            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
            className={cn(
              'rounded-num w-full min-w-0 bg-transparent text-center font-bold outline-none placeholder:text-faint',
              big ? '!text-[46px] leading-none [@media(max-height:700px)]:!text-[38px]' : '!text-[20px]',
            )}
          />
          {big && (
            <span className="mt-1 text-[12px] leading-none font-semibold tracking-wide text-muted uppercase">
              {label}
              {unit && <span className="normal-case"> · {unit}</span>}
            </span>
          )}
        </div>
        <button type="button" aria-label={`Aumenta ${label}`} onClick={() => bump(1)} className={btn}>
          <IconPlus size={big ? 26 : 18} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}
