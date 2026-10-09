import { useLiveQuery } from 'dexie-react-hooks';
import { useState } from 'react';
import { IconChevronRight, IconTrash } from '../../components/Icons';
import { SetEditSheet } from '../../components/SetEditSheet';
import { Button, Sheet } from '../../components/ui';
import { useFeedback } from '../../components/Feedback';
import { db } from '../../db';
import { sessionVolume, setVolume } from '../../lib/stats';
import { deleteSetFromSession, updateSetInSession } from '../../lib/workout';
import { fmtDateTime, fmtDuration, fmtKg, fmtVolume } from '../../lib/utils';
import type { SetLog } from '../../types';

export function SessionDetail({
  sessionId,
  onClose,
  onOpenExercise,
}: {
  sessionId: string | null;
  onClose: () => void;
  onOpenExercise: (key: string) => void;
}) {
  const session = useLiveQuery(async () => (sessionId ? (await db.sessions.get(sessionId)) ?? null : null), [sessionId]);
  const [editing, setEditing] = useState<SetLog | null>(null);
  const { confirm, toast } = useFeedback();

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
          <div className="space-y-4 py-2 pb-10">
            <p className="text-center text-sm text-muted capitalize">{fmtDateTime(session.startedAt)}</p>
            <div className="grid grid-cols-3 gap-2">
              <Mini label="Durata" value={fmtDuration((session.endedAt ?? session.startedAt) - session.startedAt)} />
              <Mini label="Serie" value={String(session.sets.length)} />
              <Mini label="Volume" value={fmtVolume(sessionVolume(session))} />
            </div>

            {groups.map((g) => (
              <div key={g.key} className="rounded-3xl border border-line bg-surface p-2">
                <button
                  type="button"
                  onClick={() => onOpenExercise(g.key)}
                  className="tap flex w-full items-center gap-2 rounded-2xl px-3 py-2 text-left active:bg-surface-2"
                >
                  <span className="min-w-0 flex-1 truncate font-bold">{g.name}</span>
                  <span className="num text-xs text-muted">{fmtVolume(g.sets.reduce((a, s) => a + setVolume(s), 0))}</span>
                  <IconChevronRight size={18} className="text-muted" />
                </button>
                {g.sets.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setEditing(s)}
                    className="tap flex h-12 w-full items-center gap-3 rounded-2xl px-3 text-left active:bg-surface-2"
                  >
                    <span className="num w-14 text-sm text-muted">Serie {s.setNumber}</span>
                    <span className="num ml-auto font-extrabold">
                      {fmtKg(s.weight)} <span className="text-xs font-semibold text-muted">kg</span> × {s.reps}
                    </span>
                  </button>
                ))}
              </div>
            ))}

            {groups.length === 0 && <p className="py-8 text-center text-muted">Nessuna serie in questa sessione.</p>}

            <p className="text-center text-xs text-muted">Tocca una serie per correggerla o eliminarla.</p>
            <Button variant="danger" className="w-full" onClick={removeSession}>
              <IconTrash size={18} /> Elimina sessione
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
    <div className="rounded-2xl bg-surface p-3 text-center">
      <p className="text-[11px] font-semibold uppercase tracking-wider text-muted">{label}</p>
      <p className="num mt-0.5 text-lg font-black">{value}</p>
    </div>
  );
}
