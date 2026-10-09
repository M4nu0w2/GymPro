import { useLiveQuery } from 'dexie-react-hooks';
import { IconCheck, IconTrophy } from '../../components/Icons';
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
        <div className="space-y-5 pb-2">
          <div className="anim-scale flex flex-col items-center text-center">
            <span className="flex h-20 w-20 items-center justify-center rounded-full bg-accent text-accent-ink shadow-[0_12px_32px_-10px_var(--accent)]">
              <IconCheck size={40} strokeWidth={3} />
            </span>
            <h2 className="mt-3 text-[28px] font-bold">Ottimo lavoro!</h2>
            <p className="text-[17px] text-muted">{s.planName}</p>
          </div>

          <div className="grid grid-cols-2 gap-2.5">
            <Stat label="Durata" value={fmtDuration((s.endedAt ?? Date.now()) - s.startedAt)} />
            <Stat label="Volume" value={fmtVolume(sessionVolume(s))} />
            <Stat label="Serie" value={String(s.sets.length)} />
            <Stat label="Esercizi" value={String(exercisesDone)} />
          </div>

          {data.prs.length > 0 && (
            <div className="rounded-[22px] bg-gold-soft p-4">
              <p className="flex items-center gap-2 text-[17px] font-bold text-gold">
                <IconTrophy size={20} /> {data.prs.length === 1 ? 'Nuovo record personale!' : `${data.prs.length} nuovi record personali!`}
              </p>
              <ul className="mt-3 space-y-2">
                {data.prs.map((pr) => (
                  <li key={pr.exerciseName + pr.kind} className="flex items-baseline justify-between gap-3 text-[15px]">
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
    <div className="rounded-[22px] bg-surface p-4">
      <p className="text-[13px] text-muted">{label}</p>
      <p className="rounded-num mt-1 text-[26px] leading-none font-bold">{value}</p>
    </div>
  );
}
