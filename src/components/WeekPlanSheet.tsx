import { usePlans } from '../hooks/useData';
import { WEEKDAY_NAMES, assignDay, weekSchedule, weekdayOf } from '../lib/schedule';
import { cn } from '../lib/utils';
import { Sheet } from './ui';

/** Planning settimanale: per ogni giorno una scheda oppure riposo */
export function WeekPlanSheet({ open, onClose }: { open: boolean; onClose: () => void }) {
  const plans = usePlans();
  const usable = (plans ?? []).filter((p) => p.exercises.length > 0);
  const schedule = weekSchedule(plans ?? []);
  const goal = schedule.filter(Boolean).length;
  const today = weekdayOf(Date.now());

  return (
    <Sheet open={open} onClose={onClose} title="Planning settimanale">
      <p className="px-1 pb-3 text-[15px] leading-snug text-muted">
        {goal
          ? `${goal} ${goal === 1 ? 'allenamento' : 'allenamenti'} a settimana. La streak avanza quando li completi tutti, anche in giorni diversi da quelli previsti.`
          : 'Scegli la scheda per ogni giorno di allenamento. La streak avanzerà quando completi tutti gli allenamenti della settimana.'}
      </p>
      {usable.length === 0 ? (
        <p className="rounded-[22px] bg-surface p-4 text-center text-[15px] text-muted">Crea prima una scheda con almeno un esercizio.</p>
      ) : (
        <div className="overflow-hidden rounded-[22px] bg-surface">
          {WEEKDAY_NAMES.map((name, d) => (
            <div key={d} className="py-3 [&:not(:last-child)]:shadow-[inset_0_-0.5px_0_var(--border)]">
              <p className={cn('px-4 pb-2 text-[15px] font-semibold', d === today && 'text-accent')}>
                {name}
                {d === today && <span className="font-normal text-muted"> · oggi</span>}
              </p>
              <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4">
                <Chip selected={!schedule[d]} onClick={() => void assignDay(d, null)}>
                  Riposo
                </Chip>
                {usable.map((p) => (
                  <Chip key={p.id} selected={schedule[d]?.id === p.id} onClick={() => void assignDay(d, p.id)}>
                    {p.name}
                  </Chip>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </Sheet>
  );
}

function Chip({ selected, onClick, children }: { selected: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onClick}
      className={cn(
        'tap max-w-[180px] shrink-0 truncate rounded-full px-3.5 py-1.5 text-[14px] font-semibold transition-colors',
        selected ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-fg-2',
      )}
    >
      {children}
    </button>
  );
}
