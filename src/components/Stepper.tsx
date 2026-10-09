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
  return (
    <div className="flex min-w-0 flex-col items-stretch">
      {!big && (
        <span className="mb-1.5 text-center text-xs font-semibold uppercase tracking-[0.14em] text-muted">
          {label}
          {unit && <span className="normal-case tracking-normal"> · {unit}</span>}
        </span>
      )}
      <div className={cn('flex items-center rounded-[22px] bg-surface-2 p-1.5', big ? 'h-[84px] [@media(max-height:700px)]:h-[72px]' : 'h-14')}>
        <button
          type="button"
          aria-label={`Diminuisci ${label}`}
          onClick={() => bump(-1)}
          className={cn('tap flex shrink-0 items-center justify-center rounded-2xl bg-surface-3 active:bg-accent active:text-accent-ink', big ? 'h-full w-14' : 'h-full w-11')}
        >
          <IconMinus size={big ? 24 : 20} strokeWidth={2.6} />
        </button>
        <div className="flex min-w-0 flex-1 flex-col items-center justify-center">
          {/* Nella versione grande l'etichetta sta dentro il box: risparmia spazio verticale */}
          {big && (
            <span className="text-[10px] leading-none font-bold uppercase tracking-[0.16em] text-muted">
              {label}
              {unit && <span className="normal-case tracking-normal"> · {unit}</span>}
            </span>
          )}
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
              'num w-full min-w-0 bg-transparent text-center font-extrabold outline-none placeholder:text-muted/50',
              big ? '!text-[36px] leading-tight' : '!text-[22px]',
            )}
          />
        </div>
        <button
          type="button"
          aria-label={`Aumenta ${label}`}
          onClick={() => bump(1)}
          className={cn('tap flex shrink-0 items-center justify-center rounded-2xl bg-surface-3 active:bg-accent active:text-accent-ink', big ? 'h-full w-14' : 'h-full w-11')}
        >
          <IconPlus size={big ? 24 : 20} strokeWidth={2.6} />
        </button>
      </div>
    </div>
  );
}
