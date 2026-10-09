import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { IconChevronRight, IconTrash, IconTrophy } from '../../components/Icons';
import { SetEditSheet } from '../../components/SetEditSheet';
import { Button, Sheet } from '../../components/ui';
import { useFeedback } from '../../components/Feedback';
import { db } from '../../db';
import { type PersonalRecordHit, sessionVolume, setVolume } from '../../lib/stats';
import { deleteSetFromSession, updateSetInSession } from '../../lib/workout';
import { cn, fmtDateTime, fmtDuration, fmtKg, fmtVolume } from '../../lib/utils';
import type { SetLog } from '../../types';

export function SessionDetail({
  sessionId,
  prs,
  onClose,
  onOpenExercise,
}: {
  sessionId: string | null;
  prs?: PersonalRecordHit[];
  onClose: () => void;
  onOpenExercise: (key: string) => void;
}) {
  const session = useLiveQuery(async () => (sessionId ? (await db.sessions.get(sessionId)) ?? null : null), [sessionId]);
  const [editing, setEditing] = useState<SetLog | null>(null);
  const { confirm, toast } = useFeedback();
  const prSetIds = new Set(prs?.map((p) => p.set.id));

  const groups = (() => {
    if (!session) return [];
    const order = new Map<string, number>();
    session.exercises.forEach((e, i) => order.set(e.key, i));
    const map = new Map<string, SetLog[]>();
    for (const s of session.sets) map.set(s.exerciseKey, [...(map.get(s.exerciseKey) ?? []), s]);
    return [...map.entries()]
      .map(([key, sets]) => ({ key, name: sets[0].exerciseName, sets: sets.sort((a, b) => a.setNumber - b.setNumber) }))
      .sort((a, b) => (order.get(a.key) ?? 999) - (order.get(b.key) ?? 999));
  })();

  const removeSession = async () => {
    if (!session) return;
    const ok = await confirm({
      title: 'Eliminare la sessione?',
      message: 'Tutte le serie di questo allenamento verranno rimosse dallo storico.',
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    await db.sessions.delete(session.id);
    toast('Sessione eliminata');
    onClose();
  };

  return (
    <>
      <Sheet open={!!sessionId} onClose={onClose} full title={session?.planName ?? ''}>
        {session && (
          <div className="space-y-4 pt-1 pb-10">
            <p className="text-center text-[15px] text-muted capitalize">{fmtDateTime(session.startedAt)}</p>
            <div className="grid grid-cols-3 gap-2.5">
              <Mini label="Durata" value={fmtDuration((session.endedAt ?? session.startedAt) - session.startedAt)} />
              <Mini label="Serie" value={String(session.sets.length)} />
              <Mini label="Volume" value={fmtVolume(sessionVolume(session))} />
            </div>

            {prs && prs.length > 0 && (
              <div className="flex items-center gap-3 rounded-[22px] bg-gold-soft p-4">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gold text-white">
                  <IconTrophy size={20} />
                </span>
                <div className="min-w-0">
                  <p className="font-semibold text-gold">{prs.length === 1 ? 'Record personale' : `${prs.length} record personali`}</p>
                  <p className="truncate text-[13px] text-fg-2">{prs.map((p) => p.exerciseName).join(', ')}</p>
                </div>
              </div>
            )}

            {groups.map((g) => (
              <div key={g.key} className="overflow-hidden rounded-[22px] bg-surface">
                <button type="button" onClick={() => onOpenExercise(g.key)} className="tap-row flex w-full items-center gap-2 px-4 py-3 text-left">
                  <span className="min-w-0 flex-1 truncate text-[17px] font-semibold">{g.name}</span>
                  <span className="num text-[13px] text-muted">{fmtVolume(g.sets.reduce((a, s) => a + setVolume(s), 0))}</span>
                  <IconChevronRight size={18} className="text-faint" />
                </button>
                {g.sets.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setEditing(s)}
                    className="tap-row flex h-12 w-full items-center gap-3 px-4 text-left shadow-[inset_0_0.5px_0_var(--border)]"
                  >
                    <span className="num w-16 text-[15px] text-muted">Serie {s.setNumber}</span>
                    {prSetIds.has(s.id) && (
                      <span className="flex items-center gap-0.5 rounded-full bg-gold-soft px-1.5 py-0.5 text-[11px] font-bold text-gold">
                        <IconTrophy size={11} /> PR
                      </span>
                    )}
                    <span className={cn('num ml-auto text-[17px] font-semibold', prSetIds.has(s.id) && 'text-gold')}>
                      {fmtKg(s.weight)} <span className="text-[13px] font-normal text-muted">kg</span> × {s.reps}
                    </span>
                  </button>
                ))}
              </div>
            ))}

            {groups.length === 0 && <p className="py-8 text-center text-muted">Nessuna serie in questa sessione.</p>}

            <p className="text-center text-[13px] text-muted">Tocca una serie per correggerla o eliminarla.</p>
            <Button variant="danger" className="w-full" onClick={removeSession}>
              <IconTrash size={17} /> Elimina sessione
            </Button>
          </div>
        )}
      </Sheet>
      <SetEditSheet
        set={editing}
        onClose={() => setEditing(null)}
        onSave={async (p) => {
          if (session && editing) await updateSetInSession(session.id, editing.id, p);
          setEditing(null);
          toast('Serie aggiornata');
        }}
        onDelete={async () => {
          if (!session || !editing) return;
          const ok = await confirm({ title: 'Eliminare la serie?', confirmLabel: 'Elimina', danger: true });
          if (!ok) return;
          await deleteSetFromSession(session.id, editing.id);
          setEditing(null);
          toast('Serie eliminata');
        }}
      />
    </>
  );
}

function Mini({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-[18px] bg-surface p-3 text-center">
      <p className="text-[12px] text-muted">{label}</p>
      <p className="rounded-num mt-0.5 text-[19px] font-bold">{value}</p>
    </div>
  );
}
