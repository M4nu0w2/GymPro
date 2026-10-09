import { useMemo, useState } from 'react';
import {
  IconCopy,
  IconDownload,
  IconEdit,
  IconList,
  IconMore,
  IconPlay,
  IconPlus,
  IconTrash,
  IconUpload,
} from '../../components/Icons';
import { Button, Card, EmptyState, IconButton, ScreenHeader, Sheet } from '../../components/ui';
import { useFeedback } from '../../components/Feedback';
import { useDoneSessions, usePlans } from '../../hooks/useData';
import { db } from '../../db';
import { CSV_TEMPLATE } from '../../lib/csv';
import { saveFile } from '../../lib/files';
import { fmtDate, fmtRest, uid } from '../../lib/utils';
import type { Plan } from '../../types';
import { ImportSheet } from './ImportSheet';
import { PlanEditor } from './PlanEditor';

export function PlansScreen({ onStart, activePlanId }: { onStart: (p: Plan) => void; activePlanId?: string }) {
  const plans = usePlans();
  const sessions = useDoneSessions();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [menuFor, setMenuFor] = useState<Plan | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const { confirm, toast } = useFeedback();

  const lastDone = useMemo(() => {
    const m = new Map<string, number>();
    for (const s of sessions ?? []) if (!m.has(s.planId)) m.set(s.planId, s.startedAt);
    return m;
  }, [sessions]);

  const downloadTemplate = () => saveFile('gympro-template.csv', '﻿' + CSV_TEMPLATE, 'text/csv;charset=utf-8');

  const duplicate = async (p: Plan) => {
    const now = Date.now();
    await db.plans.add({
      ...p,
      id: uid(),
      name: `${p.name} (copia)`,
      exercises: p.exercises.map((e) => ({ ...e, id: uid() })),
      createdAt: now,
      updatedAt: now,
    });
    toast('Scheda duplicata');
  };

  const remove = async (p: Plan) => {
    const ok = await confirm({
      title: 'Eliminare la scheda?',
      message: `"${p.name}" verrà eliminata. Lo storico degli allenamenti resta disponibile.`,
      confirmLabel: 'Elimina',
      danger: true,
    });
    if (!ok) return;
    await db.plans.delete(p.id);
    toast('Scheda eliminata');
  };

  return (
    <div className="pb-6">
      <ScreenHeader
        title="Schede"
        subtitle="GymPro"
        actions={
          <IconButton label="Nuova scheda" className="bg-accent !text-accent-ink active:!bg-accent-strong" onClick={() => setEditing('new')}>
            <IconPlus strokeWidth={2.6} />
          </IconButton>
        }
      />

      <div className="flex gap-2 px-5 pb-4">
        <Button size="sm" onClick={() => setImportOpen(true)}>
          <IconUpload size={16} /> Import
        </Button>
        <Button size="sm" onClick={downloadTemplate}>
          <IconDownload size={16} /> Scarica template
        </Button>
      </div>

      <div className="space-y-3 px-4">
        {plans?.length === 0 && (
          <EmptyState
            icon={<IconList size={30} />}
            title="Nessuna scheda"
            text="Crea la tua prima scheda oppure importala da un file CSV."
            action={
              <Button variant="primary" size="lg" onClick={() => setEditing('new')}>
                <IconPlus /> Crea scheda
              </Button>
            }
          />
        )}

        {plans?.map((p, i) => (
          <Card key={p.id} className="anim-pop overflow-hidden" >
            <div style={{ animationDelay: `${i * 40}ms` }}>
              <div className="flex items-start gap-2 p-4 pb-3">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(p)}>
                  <h2 className="truncate text-xl font-extrabold tracking-tight">{p.name}</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    {p.exercises.length} esercizi
                    {lastDone.has(p.id) ? ` · ultima volta ${fmtDate(lastDone.get(p.id)!, { day: 'numeric', month: 'short' })}` : ''}
                  </p>
                  {p.description && <p className="mt-1 line-clamp-2 text-sm text-muted">{p.description}</p>}
                </button>
                <IconButton label="Opzioni" onClick={() => setMenuFor(p)} className="-mt-1 -mr-1">
                  <IconMore />
                </IconButton>
              </div>

              <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-3">
                {p.exercises.slice(0, 8).map((e) => (
                  <span key={e.id} className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-xs font-medium text-muted">
                    {e.name}
                  </span>
                ))}
                {p.exercises.length > 8 && <span className="shrink-0 px-1 py-1 text-xs text-muted">+{p.exercises.length - 8}</span>}
              </div>

              <div className="px-3 pb-3">
                <Button
                  variant="primary"
                  size="lg"
                  className="w-full"
                  disabled={p.exercises.length === 0}
                  onClick={() => onStart(p)}
                >
                  <IconPlay size={18} /> {activePlanId === p.id ? 'Riprendi allenamento' : 'Inizia allenamento'}
                </Button>
              </div>
            </div>
          </Card>
        ))}
      </div>

      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.name}>
        {menuFor && (
          <div className="space-y-2 py-2">
            {[
              { icon: <IconEdit />, label: 'Modifica', fn: () => setEditing(menuFor) },
              { icon: <IconCopy />, label: 'Duplica', fn: () => duplicate(menuFor) },
              { icon: <IconTrash />, label: 'Elimina', fn: () => remove(menuFor), danger: true },
            ].map((a) => (
              <button
                key={a.label}
                type="button"
                onClick={() => {
                  setMenuFor(null);
                  void a.fn();
                }}
                className={`tap flex h-14 w-full items-center gap-3 rounded-2xl bg-surface px-4 text-left font-semibold active:bg-surface-2 ${a.danger ? 'text-danger' : ''}`}
              >
                {a.icon}
                {a.label}
              </button>
            ))}
            <div className="pt-2 text-center text-xs text-muted">
              {menuFor.exercises.map((e) => `${e.name} ${e.sets}×${e.reps} (${fmtRest(e.restSec)})`).join(' · ')}
            </div>
          </div>
        )}
      </Sheet>

      {editing && <PlanEditor plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} existing={plans ?? []} />
    </div>
  );
}
