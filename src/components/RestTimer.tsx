import { useRestTimer } from '../hooks/useRestTimer';
import { cn, fmtClock } from '../lib/utils';
import { IconMinimize, IconSkip } from './Icons';
import { Button } from './ui';

interface Props {
  endsAt: number;
  totalSec: number;
  nextLabel?: string;
  expanded: boolean;
  onExpand: (v: boolean) => void;
  onAdjust: (deltaSec: number) => void;
  onSkip: () => void;
  onDone: () => void;
}

export function ProgressRing({ progress, size, stroke, children }: { progress: number; size: number; stroke: number; children?: React.ReactNode }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--surface-2)" strokeWidth={stroke} />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--accent)"
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c * (1 - Math.min(1, Math.max(0, progress)))}
          style={{ filter: 'drop-shadow(0 0 10px var(--accent-soft))' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/** Timer di recupero: overlay grande oppure barra compatta */
export function RestTimer({ endsAt, totalSec, nextLabel, expanded, onExpand, onAdjust, onSkip, onDone }: Props) {
  const { remainingSec } = useRestTimer(endsAt, onDone);
  const progress = totalSec > 0 ? remainingSec / totalSec : 0;
  const urgent = remainingSec <= 5;

  if (!expanded) {
    return (
      <button
        type="button"
        onClick={() => onExpand(true)}
        className="anim-pop tap relative flex h-14 w-full items-center gap-3 overflow-hidden rounded-2xl bg-surface-2 px-4 text-left"
      >
        <div
          className="absolute inset-y-0 left-0 bg-accent-soft transition-[width] duration-200 ease-linear"
          style={{ width: `${progress * 100}%` }}
        />
        <span className="relative text-xs font-bold uppercase tracking-widest text-muted">Recupero</span>
        <span className={cn('num relative ml-auto text-2xl font-extrabold', urgent && 'text-accent')}>{fmtClock(remainingSec)}</span>
      </button>
    );
  }

  return (
    <div className="anim-fade fixed inset-0 z-40 flex flex-col bg-bg/97 pt-safe pb-safe px-safe backdrop-blur-md">
      <div className="flex items-center justify-between px-4 pt-2">
        <span className="text-xs font-bold uppercase tracking-[0.2em] text-muted">Recupero</span>
        <button
          type="button"
          onClick={() => onExpand(false)}
          className="tap flex h-11 items-center gap-1 rounded-full bg-surface-2 px-4 text-sm font-semibold"
        >
          <IconMinimize size={18} /> Riduci
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        <ProgressRing progress={progress} size={Math.min(300, window.innerWidth - 64)} stroke={14}>
          <span className={cn('num text-[76px] leading-none font-black transition-colors', urgent ? 'text-accent' : 'text-fg')}>
            {fmtClock(remainingSec)}
          </span>
          <span className="mt-2 text-sm font-medium text-muted">di {fmtClock(totalSec)}</span>
        </ProgressRing>
        {nextLabel && (
          <p className="max-w-full truncate text-center text-[15px] text-muted">
            Prossimo: <span className="font-semibold text-fg">{nextLabel}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-3 px-5 pb-4">
        <Button size="xl" onClick={() => onAdjust(-15)} className="num">
          −15s
        </Button>
        <Button size="xl" onClick={() => onAdjust(15)} className="num">
          +15s
        </Button>
        <Button size="xl" variant="primary" onClick={onSkip}>
          <IconSkip size={20} /> Salta
        </Button>
      </div>
    </div>
  );
}
