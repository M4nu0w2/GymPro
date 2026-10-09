import { useMemo, useState } from 'react';
import {
  IconCopy,
  IconDownload,
  IconEdit,
  IconList,
  IconMore,
  IconPlay,
  IconPlus,
  IconShare,
  IconTrash,
  IconUpload,
} from '../../components/Icons';
import { Button, Card, EmptyState, IconButton, Row, RowIcon, Screen, Sheet } from '../../components/ui';
import { useFeedback } from '../../components/Feedback';
import { useDoneSessions, usePlans } from '../../hooks/useData';
import { db } from '../../db';
import { CSV_TEMPLATE } from '../../lib/csv';
import { saveFile } from '../../lib/files';
import { fmtDate, fmtRest, uid } from '../../lib/utils';
import type { Plan } from '../../types';
import { ImportSheet } from './ImportSheet';
import { PlanEditor } from './PlanEditor';
import { ShareSheet } from './ShareSheet';

export function PlansScreen({ onStart, activePlanId }: { onStart: (p: Plan) => void; activePlanId?: string }) {
  const plans = usePlans();
  const sessions = useDoneSessions();
  const [editing, setEditing] = useState<Plan | 'new' | null>(null);
  const [menuFor, setMenuFor] = useState<Plan | null>(null);
  const [sharing, setSharing] = useState<Plan | null>(null);
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

  const actions = (p: Plan) => [
    { icon: <IconEdit size={17} />, label: 'Modifica', fn: () => setEditing(p), cls: 'bg-[#0a84ff] text-white' },
    { icon: <IconShare size={17} />, label: 'Condividi', fn: () => setSharing(p), cls: 'bg-accent text-accent-ink' },
    { icon: <IconCopy size={17} />, label: 'Duplica', fn: () => duplicate(p), cls: 'bg-[#8e8e93] text-white' },
    { icon: <IconTrash size={17} />, label: 'Elimina', fn: () => remove(p), cls: 'bg-danger text-white', danger: true },
  ];

  return (
    <Screen
      title="Schede"
      actions={
        <>
          <IconButton label="Importa schede" onClick={() => setImportOpen(true)}>
            <IconUpload size={18} strokeWidth={2.4} />
          </IconButton>
          <IconButton label="Nuova scheda" className="!bg-accent !text-accent-ink" onClick={() => setEditing('new')}>
            <IconPlus size={20} strokeWidth={2.6} />
          </IconButton>
        </>
      }
    >
      <div className="space-y-3 px-4 pt-2">
        {plans?.length === 0 && (
          <EmptyState
            icon={<IconList size={30} />}
            title="Nessuna scheda"
            text="Crea la tua prima scheda, importala da un file CSV o apri un link condiviso."
            action={
              <div className="flex flex-col gap-2.5">
                <Button variant="primary" size="lg" onClick={() => setEditing('new')}>
                  <IconPlus /> Crea scheda
                </Button>
                <Button size="lg" onClick={() => setImportOpen(true)}>
                  <IconUpload size={18} /> Importa
                </Button>
              </div>
            }
          />
        )}

        {plans?.map((p, i) => (
          <Card key={p.id} className="anim-pop overflow-hidden">
            <div style={{ animationDelay: `${Math.min(i, 6) * 40}ms` }}>
              <div className="flex items-start gap-2 p-4 pb-2">
                <button type="button" className="min-w-0 flex-1 text-left" onClick={() => setEditing(p)}>
                  <h2 className="truncate text-[22px] leading-7 font-bold">{p.name}</h2>
                  <p className="mt-0.5 text-[15px] text-muted">
                    {p.exercises.length} esercizi
                    {lastDone.has(p.id) ? ` · ${fmtDate(lastDone.get(p.id)!, { day: 'numeric', month: 'short' })}` : ''}
                  </p>
                  {p.description && <p className="mt-1 line-clamp-2 text-[15px] text-fg-2">{p.description}</p>}
                </button>
                <IconButton label="Opzioni" onClick={() => setMenuFor(p)}>
                  <IconMore size={20} />
                </IconButton>
              </div>

              <div className="no-scrollbar flex gap-1.5 overflow-x-auto px-4 pb-3">
                {p.exercises.slice(0, 8).map((e) => (
                  <span key={e.id} className="shrink-0 rounded-full bg-surface-2 px-2.5 py-1 text-[12px] font-medium text-fg-2">
                    {e.name}
                  </span>
                ))}
                {p.exercises.length > 8 && <span className="shrink-0 px-1 py-1 text-[12px] text-muted">+{p.exercises.length - 8}</span>}
              </div>

              <div className="px-3 pb-3">
                <Button variant={activePlanId === p.id ? 'primary' : 'tinted'} size="lg" className="w-full" disabled={p.exercises.length === 0} onClick={() => onStart(p)}>
                  <IconPlay size={17} /> {activePlanId === p.id ? 'Riprendi allenamento' : 'Inizia allenamento'}
                </Button>
              </div>
            </div>
          </Card>
        ))}

        {(plans?.length ?? 0) > 0 && (
          <div className="pt-2">
            <Button variant="ghost" className="w-full" onClick={downloadTemplate}>
              <IconDownload size={18} /> Scarica template CSV
            </Button>
          </div>
        )}
      </div>

      <Sheet open={!!menuFor} onClose={() => setMenuFor(null)} title={menuFor?.name}>
        {menuFor && (
          <div className="space-y-4 pb-2">
            <div className="overflow-hidden rounded-[22px] bg-surface">
              {actions(menuFor).map((a) => (
                <Row
                  key={a.label}
                  icon={<RowIcon className={a.cls}>{a.icon}</RowIcon>}
                  title={a.label}
                  destructive={a.danger}
                  chevron={false}
                  onClick={() => {
                    setMenuFor(null);
                    void a.fn();
                  }}
                />
              ))}
            </div>
            <div className="overflow-hidden rounded-[22px] bg-surface">
              {menuFor.exercises.map((e) => (
                <Row key={e.id} title={e.name} value={`${e.sets}×${e.reps} · ${fmtRest(e.restSec)}`} />
              ))}
            </div>
          </div>
        )}
      </Sheet>

      {editing && <PlanEditor plan={editing === 'new' ? null : editing} onClose={() => setEditing(null)} />}
      <ImportSheet open={importOpen} onClose={() => setImportOpen(false)} existing={plans ?? []} onTemplate={downloadTemplate} />
      <ShareSheet plan={sharing} onClose={() => setSharing(null)} />
    </Screen>
  );
}
