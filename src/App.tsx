import { useEffect, useRef, useState } from 'react';
import { IconChart, IconList, IconPlay, IconSettings } from './components/Icons';
import { useFeedback } from './components/Feedback';
import { useActiveSession } from './hooks/useData';
import { useNow } from './hooks/useNow';
import { unlockAudio } from './lib/audio';
import { startWorkout } from './lib/workout';
import { cn, fmtClock } from './lib/utils';
import { HistoryScreen } from './screens/history/HistoryScreen';
import { PlansScreen } from './screens/plans/PlansScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { WorkoutScreen } from './screens/workout/WorkoutScreen';
import { WorkoutSummary } from './screens/workout/WorkoutSummary';
import type { Plan } from './types';

type Tab = 'plans' | 'train' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof IconList }[] = [
  { id: 'plans', label: 'Schede', icon: IconList },
  { id: 'train', label: 'Allenamento', icon: IconChart },
  { id: 'settings', label: 'Impostazioni', icon: IconSettings },
];

export default function App() {
  const [tab, setTab] = useState<Tab>('plans');
  const active = useActiveSession();
  const [workoutOpen, setWorkoutOpen] = useState(false);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const resumed = useRef(false);
  const scrollRef = useRef<HTMLElement>(null);
  const { confirm } = useFeedback();

  // Allenamento in corso alla riapertura dell'app: riprendilo
  useEffect(() => {
    if (active === undefined || resumed.current) return;
    resumed.current = true;
    if (active) setWorkoutOpen(true);
  }, [active]);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: 0 });
  }, [tab]);

  const start = async (plan: Plan) => {
    unlockAudio(); // gesto utente: sblocca l'audio per il timer
    if (active && active.planId !== plan.id) {
      const ok = await confirm({
        title: 'Allenamento in corso',
        message: `Hai già un allenamento aperto (${active.planName}). Vuoi riprenderlo?`,
        confirmLabel: 'Riprendi',
      });
      if (ok) setWorkoutOpen(true);
      return;
    }
    await startWorkout(plan);
    setWorkoutOpen(true);
  };

  return (
    <div className="flex h-full flex-col">
      <main ref={scrollRef} className="scroll-area px-safe min-h-0 flex-1">
        <div key={tab} className="anim-fade">
          {tab === 'plans' && <PlansScreen onStart={start} activePlanId={active?.planId} />}
          {tab === 'train' && <HistoryScreen active={active ?? null} onResume={() => setWorkoutOpen(true)} />}
          {tab === 'settings' && <SettingsScreen />}
        </div>
      </main>

      {active && !workoutOpen && <ActiveBar startedAt={active.startedAt} name={active.planName} onOpen={() => setWorkoutOpen(true)} />}

      <nav className="pb-safe px-safe border-t border-line bg-bg/85 backdrop-blur-xl">
        <div className="mx-auto flex max-w-lg">
          {TABS.map((t) => {
            const Icon = t.icon;
            const selected = tab === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => setTab(t.id)}
                aria-current={selected ? 'page' : undefined}
                className={cn('tap relative flex h-[58px] flex-1 flex-col items-center justify-center gap-0.5', selected ? 'text-fg' : 'text-muted')}
              >
                <span className={cn('flex h-8 w-14 items-center justify-center rounded-full transition-colors', selected && 'bg-accent-soft text-accent')}>
                  <Icon size={22} strokeWidth={selected ? 2.4 : 2} />
                </span>
                <span className="text-[11px] font-semibold">{t.label}</span>
                {t.id === 'train' && active && <span className="absolute top-2 right-[calc(50%-24px)] h-2 w-2 rounded-full bg-accent" />}
              </button>
            );
          })}
        </div>
      </nav>

      {active && workoutOpen && (
        <WorkoutScreen
          session={active}
          onMinimize={() => setWorkoutOpen(false)}
          onFinished={(id) => {
            setWorkoutOpen(false);
            if (id) {
              setSummaryId(id);
              setTab('train');
            }
          }}
        />
      )}
      <WorkoutSummary sessionId={summaryId} onClose={() => setSummaryId(null)} />
    </div>
  );
}

function ActiveBar({ name, startedAt, onOpen }: { name: string; startedAt: number; onOpen: () => void }) {
  const now = useNow(1000);
  return (
    <div className="px-safe">
      <button
        type="button"
        onClick={onOpen}
        className="anim-pop tap mx-3 mb-2 flex h-14 w-[calc(100%-24px)] items-center gap-3 rounded-2xl bg-accent px-4 text-accent-ink shadow-lg"
      >
        <IconPlay size={18} />
        <span className="min-w-0 flex-1 truncate text-left font-bold">{name}</span>
        <span className="num font-extrabold">{fmtClock((now - startedAt) / 1000)}</span>
      </button>
    </div>
  );
}
