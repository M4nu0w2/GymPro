import { useLiveQuery } from 'dexie-react-hooks';
import { IconTrophy } from '../../components/Icons';
import { Button, Sheet } from '../../components/ui';
import { db } from '../../db';
import { findSessionPRs, sessionVolume } from '../../lib/stats';
import { fmtDuration, fmtKg, fmtVolume } from '../../lib/utils';

export function WorkoutSummary({ sessionId, onClose }: { sessionId: string | null; onClose: () => void }) {
  const data = useLiveQuery(async () => {
    if (!sessionId) return null;
    const session = await db.sessions.get(sessionId);
    if (!session) return null;
    const others = await db.sessions.where('exerciseKeys').anyOf(session.exerciseKeys).toArray();
    return { session, prs: findSessionPRs(session, others.filter((s) => s.status === 'done')) };
  }, [sessionId]);

  const s = data?.session;
  const exercisesDone = s ? new Set(s.sets.map((x) => x.exerciseKey)).size : 0;

  return (
    <Sheet open={!!sessionId} onClose={onClose} title="Allenamento completato">
      {s && data && (
        <div className="space-y-5 py-2">
          <div className="anim-pop text-center">
            <p className="text-5xl">🏁</p>
            <h2 className="mt-2 text-2xl font-extrabold">Ottimo lavoro!</h2>
            <p className="text-muted">{s.planName}</p>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Durata" value={fmtDuration((s.endedAt ?? Date.now()) - s.startedAt)} />
            <Stat label="Volume" value={fmtVolume(sessionVolume(s))} />
            <Stat label="Serie" value={String(s.sets.length)} />
            <Stat label="Esercizi" value={String(exercisesDone)} />
          </div>

          {data.prs.length > 0 && (
            <div className="rounded-3xl border border-gold/40 bg-gold/10 p-4">
              <p className="flex items-center gap-2 font-extrabold text-gold">
                <IconTrophy size={20} /> {data.prs.length === 1 ? 'Nuovo record personale!' : `${data.prs.length} nuovi record personali!`}
              </p>
              <ul className="mt-3 space-y-2">
                {data.prs.map((pr) => (
                  <li key={pr.exerciseName + pr.kind} className="flex items-baseline justify-between gap-3 text-sm">
                    <span className="min-w-0 truncate font-semibold">{pr.exerciseName}</span>
                    <span className="num shrink-0">
                      {pr.kind === 'peso' ? (
                        <>
                          <b>{fmtKg(pr.value)} kg</b> × {pr.set.reps}
                          <span className="text-muted"> (prima {fmtKg(pr.previous)})</span>
                        </>
                      ) : (
                        <>
                          1RM stim. <b>{fmtKg(Math.round(pr.value * 10) / 10)} kg</b>
                        </>
                      )}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <Button variant="primary" size="lg" className="w-full" onClick={onClose}>
            Chiudi
          </Button>
        </div>
      )}
    </Sheet>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-3xl bg-surface p-4">
      <p className="text-xs font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="num mt-1 text-[26px] leading-none font-black">{value}</p>
    </div>
  );
}
