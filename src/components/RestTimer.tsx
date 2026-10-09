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
  onDone: (fresh: boolean) => void;
}

export function ProgressRing({
  progress,
  size,
  stroke,
  children,
  track = 'var(--surface-2)',
}: {
  progress: number;
  size: number;
  stroke: number;
  children?: React.ReactNode;
  track?: string;
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={track} strokeWidth={stroke} />
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
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>
    </div>
  );
}

/** Timer di recupero: overlay grande oppure capsula in vetro in basso */
export function RestTimer({ endsAt, totalSec, nextLabel, expanded, onExpand, onAdjust, onSkip, onDone }: Props) {
  const { remainingSec } = useRestTimer(endsAt, onDone);
  const progress = totalSec > 0 ? remainingSec / totalSec : 0;
  const urgent = remainingSec <= 3.05;

  if (!expanded) {
    return (
      <div className="pointer-events-none fixed inset-x-0 bottom-0 z-40 flex justify-center px-3 pb-[max(var(--safe-bottom),10px)]">
        <div className="glass anim-pop pointer-events-auto flex h-[68px] w-full max-w-md items-center gap-2 rounded-full py-2 pr-2 pl-2.5">
          <button type="button" onClick={() => onExpand(true)} aria-label="Espandi timer di recupero" className="tap flex min-w-0 flex-1 items-center gap-3 text-left">
            <ProgressRing progress={progress} size={48} stroke={5}>
              <span className="text-[10px] font-bold text-muted">REC</span>
            </ProgressRing>
            <span className={cn('rounded-num text-[30px] font-bold transition-colors', urgent && 'text-accent')}>{fmtClock(remainingSec)}</span>
          </button>
          <button type="button" onClick={() => onAdjust(-15)} className="tap num h-11 rounded-full bg-surface-2 px-3 text-[15px] font-semibold">
            −15
          </button>
          <button type="button" onClick={() => onAdjust(15)} className="tap num h-11 rounded-full bg-surface-2 px-3 text-[15px] font-semibold">
            +15
          </button>
          <button type="button" onClick={onSkip} aria-label="Salta recupero" className="tap flex h-11 w-11 items-center justify-center rounded-full bg-accent text-accent-ink">
            <IconSkip size={18} />
          </button>
        </div>
      </div>
    );
  }

  const ring = Math.min(300, window.innerWidth - 72, window.innerHeight * 0.42);
  return (
    <div className="anim-fade pt-safe pb-safe px-safe fixed inset-0 z-40 flex flex-col bg-bg">
      <div className="flex items-center justify-between px-4 pt-2">
        <span className="text-[13px] font-semibold tracking-wide text-muted uppercase">Recupero</span>
        <button type="button" onClick={() => onExpand(false)} className="tap flex h-9 items-center gap-1 rounded-full bg-surface-2 px-3.5 text-[15px] font-semibold">
          <IconMinimize size={17} /> Riduci
        </button>
      </div>

      <div className="flex flex-1 flex-col items-center justify-center gap-6 px-6">
        <ProgressRing progress={progress} size={ring} stroke={14}>
          <span className={cn('rounded-num text-[80px] leading-none font-bold transition-colors [@media(max-height:700px)]:text-[64px]', urgent ? 'text-accent' : 'text-fg')}>
            {fmtClock(remainingSec)}
          </span>
          <span className="num mt-2 text-[15px] text-muted">di {fmtClock(totalSec)}</span>
        </ProgressRing>
        {nextLabel && (
          <p className="max-w-full truncate text-center text-[17px] text-muted">
            Prossimo: <span className="font-semibold text-fg">{nextLabel}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-3 gap-2.5 px-5 pb-4">
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
