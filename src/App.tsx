import { useCallback, useEffect, useRef, useState } from 'react';
import { useFeedback } from './components/Feedback';
import { IconChart, IconHome, IconList, IconSettings } from './components/Icons';
import { useActiveSession } from './hooks/useData';
import { unlockAudio } from './lib/audio';
import { SHARE_PARAM } from './lib/share';
import { cn } from './lib/utils';
import { startWorkout } from './lib/workout';
import { HomeScreen } from './screens/home/HomeScreen';
import { PlansScreen } from './screens/plans/PlansScreen';
import { SharedPlanSheet } from './screens/plans/SharedPlanSheet';
import { ProgressScreen } from './screens/progress/ProgressScreen';
import { SettingsScreen } from './screens/settings/SettingsScreen';
import { WorkoutScreen } from './screens/workout/WorkoutScreen';
import { WorkoutSummary } from './screens/workout/WorkoutSummary';
import type { Plan } from './types';

export type Tab = 'home' | 'plans' | 'progress' | 'settings';

const TABS: { id: Tab; label: string; icon: typeof IconList }[] = [
  { id: 'home', label: 'Home', icon: IconHome },
  { id: 'plans', label: 'Schede', icon: IconList },
  { id: 'progress', label: 'Progressi', icon: IconChart },
  { id: 'settings', label: 'Impostazioni', icon: IconSettings },
];

function readShareCode(): string | null {
  const m = window.location.hash.match(new RegExp(`${SHARE_PARAM}=([^&]+)`));
  return m ? m[1] : null;
}

export default function App() {
  const [tab, setTab] = useState<Tab>('home');
  const [visited, setVisited] = useState<Set<Tab>>(() => new Set(['home']));
  const active = useActiveSession();
  const [workoutOpen, setWorkoutOpen] = useState(false);
  const [summaryId, setSummaryId] = useState<string | null>(null);
  const [shareCode, setShareCode] = useState<string | null>(readShareCode);
  const resumed = useRef(false);
  const { confirm } = useFeedback();

  // Allenamento in corso alla riapertura dell'app: riprendilo
  useEffect(() => {
    if (active === undefined || resumed.current) return;
    resumed.current = true;
    if (active && !shareCode) setWorkoutOpen(true);
  }, [active, shareCode]);

  // Link di condivisione aperto mentre l'app è già aperta
  useEffect(() => {
    const onHash = () => {
      const c = readShareCode();
      if (c) setShareCode(c);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  const go = useCallback((t: Tab) => {
    setVisited((v) => (v.has(t) ? v : new Set(v).add(t)));
    setTab((cur) => {
      if (cur === t) {
        // tocco sulla tab già attiva: torna in cima, come su iOS
        document.querySelector<HTMLElement>(`[data-tab="${t}"] [data-scroll]`)?.scrollTo({ top: 0, behavior: 'smooth' });
      }
      return t;
    });
  }, []);

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

  const closeShare = () => {
    setShareCode(null);
    history.replaceState(null, '', window.location.pathname + window.location.search);
  };

  const showShell = !(active && workoutOpen);

  return (
    <div className="relative h-full">
      {/* Con l'allenamento aperto la shell viene nascosta: meno livelli (e blur) da comporre */}
      <div className={cn('h-full', !showShell && 'hidden')}>
        {TABS.map((t) =>
          visited.has(t.id) ? (
            <div key={t.id} data-tab={t.id} className={cn('h-full', tab === t.id ? 'anim-screen' : 'hidden')}>
              {t.id === 'home' && (
                <HomeScreen
                  active={active ?? null}
                  onStart={start}
                  onResume={() => setWorkoutOpen(true)}
                  onGo={go}
                />
              )}
              {t.id === 'plans' && <PlansScreen onStart={start} activePlanId={active?.planId} />}
              {t.id === 'progress' && <ProgressScreen />}
              {t.id === 'settings' && <SettingsScreen />}
            </div>
          ) : null,
        )}

        <nav
          aria-label="Sezioni"
          className="pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-4 pb-[max(var(--safe-bottom),12px)]"
        >
          <div className="glass pointer-events-auto flex h-[var(--tabbar-h)] w-full max-w-md items-stretch rounded-full p-1.5">
            {TABS.map((t) => {
              const Icon = t.icon;
              const selected = tab === t.id;
              return (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => go(t.id)}
                  aria-current={selected ? 'page' : undefined}
                  className={cn(
                    'relative flex flex-1 flex-col items-center justify-center gap-0.5 rounded-full transition-[color,background-color] duration-300',
                    selected ? 'bg-surface-2 text-accent' : 'text-fg-2 active:bg-surface-2',
                  )}
                >
                  <Icon size={23} strokeWidth={selected ? 2.4 : 2} />
                  <span className="text-[10px] font-semibold">{t.label}</span>
                  {t.id === 'home' && active && !workoutOpen && (
                    <span className="absolute top-2 right-[calc(50%-18px)] h-2 w-2 rounded-full bg-accent ring-2 ring-[var(--material)]" />
                  )}
                </button>
              );
            })}
          </div>
        </nav>
      </div>

      {active && workoutOpen && (
        <WorkoutScreen
          session={active}
          onMinimize={() => setWorkoutOpen(false)}
          onFinished={(id) => {
            setWorkoutOpen(false);
            if (id) setSummaryId(id);
          }}
        />
      )}
      <WorkoutSummary sessionId={summaryId} onClose={() => setSummaryId(null)} />
      <SharedPlanSheet code={shareCode} onClose={closeShare} />
    </div>
  );
}
