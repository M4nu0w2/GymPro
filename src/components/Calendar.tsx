import { useMemo, useState } from 'react';
import { addDays, dayKey, startOfDay, startOfWeek } from '../lib/stats';
import { cn } from '../lib/utils';
import { IconChevronLeft, IconChevronRight } from './Icons';
import { IconButton } from './ui';

const WEEKDAYS = ['L', 'M', 'M', 'G', 'V', 'S', 'D'];

/** Settimana corrente (lun-dom) con i giorni allenati */
export function WeekStrip({ days, now = Date.now() }: { days: Set<string>; now?: number }) {
  const start = startOfWeek(now);
  const today = dayKey(now);
  return (
    <div className="grid grid-cols-7 gap-1">
      {WEEKDAYS.map((w, i) => {
        const ts = addDays(start, i);
        const k = dayKey(ts);
        const done = days.has(k);
        const isToday = k === today;
        const future = ts > startOfDay(now);
        return (
          <div key={i} className="flex flex-col items-center gap-1.5">
            <span className={cn('text-[11px] font-semibold', isToday ? 'text-accent' : 'text-muted')}>{w}</span>
            <span
              aria-label={`${new Date(ts).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric' })}${done ? ', allenato' : ''}`}
              className={cn(
                'num flex h-8 w-8 items-center justify-center rounded-full text-[14px] font-semibold transition-colors',
                done ? 'bg-accent text-accent-ink' : isToday ? 'ring-[1.5px] ring-accent text-fg' : future ? 'text-faint' : 'bg-surface-2 text-muted',
              )}
            >
              {new Date(ts).getDate()}
            </span>
          </div>
        );
      })}
    </div>
  );
}

/** Calendario mensile con i giorni di allenamento evidenziati */
export function MonthCalendar({ days, onSelectDay }: { days: Set<string>; onSelectDay?: (key: string) => void }) {
  const [month, setMonth] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
  });
  const cells = useMemo(() => {
    const first = new Date(month);
    const gridStart = startOfWeek(first.getTime());
    const out: { ts: number; inMonth: boolean }[] = [];
    for (let i = 0; i < 42; i++) {
      const ts = addDays(gridStart, i);
      out.push({ ts, inMonth: new Date(ts).getMonth() === first.getMonth() });
    }
    // togli l'ultima riga se è tutta del mese successivo
    return out.slice(35).every((c) => !c.inMonth) ? out.slice(0, 35) : out;
  }, [month]);

  const today = dayKey(Date.now());
  const count = cells.filter((c) => c.inMonth && days.has(dayKey(c.ts))).length;
  const shift = (n: number) => {
    const d = new Date(month);
    setMonth(new Date(d.getFullYear(), d.getMonth() + n, 1).getTime());
  };

  return (
    <div>
      <div className="mb-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="text-[17px] font-semibold capitalize">{new Date(month).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' })}</p>
          <p className="num text-[13px] text-muted">
            {count} {count === 1 ? 'allenamento' : 'allenamenti'}
          </p>
        </div>
        <IconButton label="Mese precedente" onClick={() => shift(-1)}>
          <IconChevronLeft size={18} strokeWidth={2.6} />
        </IconButton>
        <IconButton label="Mese successivo" onClick={() => shift(1)} disabled={month >= new Date(new Date().getFullYear(), new Date().getMonth(), 1).getTime()}>
          <IconChevronRight size={18} strokeWidth={2.6} />
        </IconButton>
      </div>
      <div className="grid grid-cols-7 gap-y-1.5 text-center">
        {WEEKDAYS.map((w, i) => (
          <span key={i} className="text-[11px] font-semibold text-muted">
            {w}
          </span>
        ))}
        {cells.map((c) => {
          const k = dayKey(c.ts);
          const done = days.has(k);
          return (
            <button
              key={c.ts}
              type="button"
              disabled={!done || !onSelectDay}
              onClick={() => onSelectDay?.(k)}
              className="flex justify-center disabled:cursor-default"
            >
              <span
                className={cn(
                  'num flex h-9 w-9 items-center justify-center rounded-full text-[15px]',
                  !c.inMonth && 'opacity-30',
                  done ? 'bg-accent font-semibold text-accent-ink' : k === today ? 'font-semibold text-accent' : 'text-fg-2',
                )}
              >
                {new Date(c.ts).getDate()}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
