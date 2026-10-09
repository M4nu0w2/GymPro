import { Suspense, lazy, useState } from 'react';
import { useFeedback } from '../../components/Feedback';
import { IconPlus, IconScale, IconTrash } from '../../components/Icons';
import { Button, Card, EmptyState, Group, Row, Segmented, Sheet } from '../../components/ui';
import { db } from '../../db';
import { useBodyEntries } from '../../hooks/useData';
import { dayKey } from '../../lib/stats';
import { cn, fmtDate, fmtKg, parseNum, uid } from '../../lib/utils';
import { BODY_FIELDS, type BodyEntry, type BodyField } from '../../types';

const BodyChart = lazy(() => import('./BodyChart'));

export const BODY_LABEL: Record<BodyField, { label: string; unit: string }> = {
  weight: { label: 'Peso', unit: 'kg' },
  waist: { label: 'Vita', unit: 'cm' },
  chest: { label: 'Petto', unit: 'cm' },
  arm: { label: 'Braccio', unit: 'cm' },
  thigh: { label: 'Coscia', unit: 'cm' },
  hips: { label: 'Fianchi', unit: 'cm' },
};

export function BodyPanel() {
  const entries = useBodyEntries();
  const [metric, setMetric] = useState<BodyField>('weight');
  const [editing, setEditing] = useState<BodyEntry | 'new' | null>(null);

  const latest = (f: BodyField) => entries?.find((e) => e[f] != null);
  const previous = (f: BodyField) => entries?.filter((e) => e[f] != null)[1];
  const available = BODY_FIELDS.filter((f) => entries?.some((e) => e[f] != null));
  const points = (entries ?? [])
    .filter((e) => e[metric] != null)
    .slice()
    .reverse()
    .map((e) => ({ date: fmtDate(e.date, { day: 'numeric', month: 'short' }), value: e[metric]! }));

  return (
    <div className="space-y-6">
      <div className="px-4">
        <Button variant="primary" size="lg" className="w-full" onClick={() => setEditing('new')}>
          <IconPlus size={20} /> Nuova misurazione
        </Button>
      </div>

      {entries?.length === 0 && (
        <EmptyState icon={<IconScale size={30} />} title="Peso e misure" text="Registra peso corporeo e misure (vita, petto, braccio…) per seguirne l'andamento nel tempo." />
      )}

      {available.length > 0 && (
        <>
          <div className="grid grid-cols-2 gap-2.5 px-4">
            {available.map((f) => {
              const l = latest(f)!;
              const p = previous(f);
              const diff = p ? l[f]! - p[f]! : null;
              return (
                <button key={f} type="button" onClick={() => setMetric(f)} className={cn('tap rounded-[22px] bg-surface p-4 text-left', metric === f && 'ring-2 ring-accent')}>
                  <p className="text-[13px] text-muted">{BODY_LABEL[f].label}</p>
                  <p className="rounded-num mt-0.5 text-[26px] leading-none font-bold">
                    {fmtKg(l[f]!)}
                    <span className="text-[15px] font-semibold text-muted"> {BODY_LABEL[f].unit}</span>
                  </p>
                  <p className="num mt-1 text-[12px] text-muted">
                    {diff != null && Math.abs(diff) >= 0.05 ? `${diff > 0 ? '+' : '−'}${fmtKg(Math.abs(diff))} · ` : ''}
                    {fmtDate(l.date, { day: 'numeric', month: 'short' })}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="space-y-3 px-4">
            {available.length > 1 && (
              <Segmented value={metric} onChange={setMetric} options={available.map((f) => ({ value: f, label: BODY_LABEL[f].label }))} />
            )}
            <Card className="p-3 pt-4">
              {points.length >= 2 ? (
                <Suspense fallback={<div className="h-52" />}>
                  <BodyChart data={points} unit={BODY_LABEL[metric].unit} label={BODY_LABEL[metric].label} />
                </Suspense>
              ) : (
                <p className="py-10 text-center text-[15px] text-muted">Il grafico apparirà dopo almeno 2 misurazioni.</p>
              )}
            </Card>
          </div>

          <Group header="Storico misurazioni">
            {entries!.map((e) => (
              <Row
                key={e.id}
                onClick={() => setEditing(e)}
                title={<span className="capitalize">{fmtDate(e.date, { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' })}</span>}
                subtitle={BODY_FIELDS.filter((f) => e[f] != null)
                  .map((f) => `${BODY_LABEL[f].label} ${fmtKg(e[f]!)}`)
                  .join(' · ')}
              />
            ))}
          </Group>
        </>
      )}

      <BodySheet entry={editing} onClose={() => setEditing(null)} />
    </div>
  );
}

function toDateInput(ts: number): string {
  return dayKey(ts);
}

function fromDateInput(v: string): number {
  const [y, m, d] = v.split('-').map(Number);
  const now = new Date();
  return new Date(y, (m ?? 1) - 1, d ?? 1, now.getHours(), now.getMinutes()).getTime();
}

function BodySheet({ entry, onClose }: { entry: BodyEntry | 'new' | null; onClose: () => void }) {
  return (
    <Sheet open={!!entry} onClose={onClose} title={entry === 'new' ? 'Nuova misurazione' : 'Misurazione'}>
      {entry && <BodyForm key={entry === 'new' ? 'new' : entry.id} entry={entry === 'new' ? null : entry} onDone={onClose} />}
    </Sheet>
  );
}

function BodyForm({ entry, onDone }: { entry: BodyEntry | null; onDone: () => void }) {
  const { toast, confirm } = useFeedback();
  const [date, setDate] = useState(toDateInput(entry?.date ?? Date.now()));
  const [values, setValues] = useState<Record<BodyField, string>>(() => {
    const v = {} as Record<BodyField, string>;
    for (const f of BODY_FIELDS) v[f] = entry?.[f] != null ? String(entry[f]).replace('.', ',') : '';
    return v;
  });

  const save = async () => {
    const out: BodyEntry = { id: entry?.id ?? uid(), date: date ? fromDateInput(date) : Date.now() };
    let any = false;
    for (const f of BODY_FIELDS) {
      const n = parseNum(values[f]);
      if (n != null && n > 0 && n < 1000) {
        out[f] = Math.round(n * 10) / 10;
        any = true;
      }
    }
    if (!any) {
      toast('Inserisci almeno un valore', 'error');
      return;
    }
    await db.body.put(out);
    toast('Misurazione salvata');
    onDone();
  };

  const remove = async () => {
    if (!entry) return;
    if (!(await confirm({ title: 'Eliminare la misurazione?', confirmLabel: 'Elimina', danger: true }))) return;
    await db.body.delete(entry.id);
    onDone();
  };

  return (
    <div className="space-y-4 pb-2">
      <div className="overflow-hidden rounded-[22px] bg-surface">
        <label className="flex min-h-[50px] items-center gap-3 px-4 shadow-[inset_0_-0.5px_0_var(--border)]">
          <span className="flex-1 text-[17px]">Data</span>
          <input type="date" value={date} max={toDateInput(Date.now())} onChange={(e) => setDate(e.target.value)} className="bg-transparent text-right text-[17px] text-accent outline-none" />
        </label>
        {BODY_FIELDS.map((f) => (
          <label key={f} className="flex min-h-[50px] items-center gap-3 px-4 shadow-[inset_0_-0.5px_0_var(--border)] last:shadow-none">
            <span className="flex-1 text-[17px]">{BODY_LABEL[f].label}</span>
            <input
              inputMode="decimal"
              aria-label={BODY_LABEL[f].label}
              placeholder="–"
              value={values[f]}
              onChange={(e) => setValues((v) => ({ ...v, [f]: e.target.value.replace(/[^\d.,]/g, '') }))}
              className="rounded-num w-24 bg-transparent text-right text-[17px] font-semibold outline-none placeholder:text-faint"
            />
            <span className="w-7 text-[15px] text-muted">{BODY_LABEL[f].unit}</span>
          </label>
        ))}
      </div>
      <Button variant="primary" size="lg" className="w-full" onClick={save}>
        Salva
      </Button>
      {entry && (
        <Button variant="danger" className="w-full" onClick={remove}>
          <IconTrash size={17} /> Elimina
        </Button>
      )}
    </div>
  );
}
