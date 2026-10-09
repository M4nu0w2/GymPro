import { useMemo, useState } from 'react';
import { useFeedback } from '../../components/Feedback';
import { IconCopy, IconDownload } from '../../components/Icons';
import { Button, Row, Sheet } from '../../components/ui';
import { db } from '../../db';
import { MUSCLE_LABEL, mergeMuscles } from '../../lib/exercises';
import { type DecodedPlan, decodePlan } from '../../lib/share';
import { fmtRest, isIOS, isStandalone } from '../../lib/utils';

/** Anteprima di una scheda ricevuta con link: si importa solo dopo conferma */
export function SharedPlanSheet({ code, onClose, onImported }: { code: string | null; onClose: () => void; onImported?: () => void }) {
  const { toast } = useFeedback();
  const [busy, setBusy] = useState(false);
  const parsed = useMemo((): { ok: DecodedPlan } | { error: string } | null => {
    if (!code) return null;
    try {
      return { ok: decodePlan(code) };
    } catch (e) {
      return { error: (e as Error).message };
    }
  }, [code]);

  const importPlan = async () => {
    if (!parsed || !('ok' in parsed)) return;
    setBusy(true);
    try {
      await db.plans.add(parsed.ok.plan);
      await mergeMuscles(parsed.ok.muscles);
      toast(`Scheda "${parsed.ok.plan.name}" importata`);
      onImported?.();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  // Su iPhone i link si aprono in Safari, che ha dati separati dall'app installata
  const inSafari = isIOS() && !isStandalone();
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      toast('Link copiato: aprilo da GymPro → Schede → Importa');
    } catch {
      toast('Impossibile copiare il link', 'error');
    }
  };

  return (
    <Sheet
      open={!!code}
      onClose={onClose}
      title="Scheda condivisa"
      footer={
        parsed && 'ok' in parsed ? (
          <div className="grid grid-cols-2 gap-2.5">
            <Button size="lg" onClick={onClose}>
              Annulla
            </Button>
            <Button size="lg" variant="primary" disabled={busy} onClick={importPlan}>
              <IconDownload size={18} /> Importa
            </Button>
          </div>
        ) : undefined
      }
    >
      {parsed && 'error' in parsed && <p className="py-10 text-center text-[15px] text-danger">{parsed.error}</p>}
      {parsed && 'ok' in parsed && (
        <div className="space-y-4 pb-2">
          <div className="text-center">
            <p className="text-[13px] font-semibold tracking-wide text-accent uppercase">Vuoi importare questa scheda?</p>
            <h2 className="mt-1 text-[28px] leading-tight font-bold">{parsed.ok.plan.name}</h2>
            {parsed.ok.plan.description && <p className="mt-1 text-[15px] text-fg-2">{parsed.ok.plan.description}</p>}
          </div>
          {inSafari && (
            <div className="rounded-[18px] bg-gold-soft p-3.5 text-[13px] leading-snug">
              <p className="font-semibold text-gold">Hai aperto il link in Safari</p>
              <p className="mt-0.5 text-fg-2">
                Se usi GymPro dalla schermata Home, i dati sono separati da Safari. Copia il link e incollalo in GymPro → Schede → Importa → Da link.
              </p>
              <Button size="sm" variant="secondary" className="mt-2" onClick={copy}>
                <IconCopy size={15} /> Copia link
              </Button>
            </div>
          )}
          <div className="overflow-hidden rounded-[22px] bg-surface">
            {parsed.ok.plan.exercises.map((e, i) => {
              const m = parsed.ok.muscles[i]?.muscle;
              return (
                <Row
                  key={e.id}
                  title={e.name}
                  subtitle={[m ? MUSCLE_LABEL[m] : null, e.notes].filter(Boolean).join(' · ') || undefined}
                  value={`${e.sets}×${e.reps} · ${fmtRest(e.restSec)}`}
                />
              );
            })}
          </div>
          <p className="text-center text-[13px] text-muted">Verrà aggiunta come nuova scheda. Il tuo storico non cambia.</p>
        </div>
      )}
    </Sheet>
  );
}
