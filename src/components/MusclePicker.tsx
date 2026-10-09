import { MUSCLE_LABEL } from '../lib/exercises';
import { cn } from '../lib/utils';
import { MUSCLES, type Muscle } from '../types';

/** Chip per scegliere il gruppo muscolare (tocca di nuovo per togliere) */
export function MusclePicker({
  value,
  onChange,
  className,
}: {
  value: Muscle | undefined;
  onChange: (m: Muscle | undefined) => void;
  className?: string;
}) {
  return (
    <div className={cn('flex flex-wrap gap-1.5', className)}>
      {MUSCLES.map((m) => (
        <button
          key={m}
          type="button"
          aria-pressed={value === m}
          onClick={() => onChange(value === m ? undefined : m)}
          className={cn(
            'tap h-8 rounded-full px-3 text-[14px] font-semibold',
            value === m ? 'bg-accent text-accent-ink' : 'bg-surface-2 text-fg-2',
          )}
        >
          {MUSCLE_LABEL[m]}
        </button>
      ))}
    </div>
  );
}
