import { useState } from 'react';
import { IconFile, IconUpload } from '../../components/Icons';
import { Button, Sheet } from '../../components/ui';
import { useFeedback } from '../../components/Feedback';
import { db } from '../../db';
import { importPlansFromJson } from '../../lib/backup';
import { type ImportResult, importPlansFromCsv } from '../../lib/csv';
import { pickTextFile } from '../../lib/files';
import { fmtRest } from '../../lib/utils';
import type { Plan } from '../../types';

export function ImportSheet({ open, onClose, existing }: { open: boolean; onClose: () => void; existing: Plan[] }) {
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const { toast } = useFeedback();

  const reset = () => {
    setFileName(null);
    setResult(null);
  };

  const pick = async () => {
    const f = await pickTextFile('.csv,.json,.txt,text/csv,application/json');
    if (!f) return;
    setFileName(f.name);
    const isJson = f.name.toLowerCase().endsWith('.json') || f.text.trimStart().startsWith('{') || f.text.trimStart().startsWith('[');
    if (isJson) {
      try {
        setResult({ plans: importPlansFromJson(f.text), errors: [], warnings: [] });
      } catch (e) {
        setResult({ plans: [], errors: [{ row: 0, message: (e as Error).message }], warnings: [] });
      }
    } else {
      setResult(importPlansFromCsv(f.text));
    }
  };

  const confirmImport = async () => {
    if (!result || result.errors.length || !result.plans.length) return;
    await db.plans.bulkAdd(result.plans);
    toast(`${result.plans.length} ${result.plans.length === 1 ? 'scheda importata' : 'schede importate'}`);
    reset();
    onClose();
  };

  const existingNames = new Set(existing.map((p) => p.name.toLowerCase()));
  const canImport = !!result && result.errors.length === 0 && result.plans.length > 0;

  return (
    <Sheet
      open={open}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Importa schede"
      footer={
        result ? (
          <div className="grid grid-cols-2 gap-3">
            <Button onClick={pick}>Altro file</Button>
            <Button variant="primary" disabled={!canImport} onClick={confirmImport}>
              Importa
            </Button>
          </div>
        ) : undefined
      }
    >
      {!result ? (
        <div className="space-y-4 py-2">
          <p className="text-[15px] leading-relaxed text-muted">
            Seleziona un file <b className="text-fg">CSV</b> (separatore <code>;</code> o <code>,</code>) con le colonne:
          </p>
          <code className="block rounded-2xl bg-surface-2 p-4 text-[13px] break-all text-fg">
            scheda;esercizio;serie;rep;recupero_sec;note
          </code>
          <p className="text-sm text-muted">Puoi anche importare schede da un file JSON (esportato da GymPro). Vedrai un'anteprima prima di confermare.</p>
          <Button variant="primary" size="lg" className="w-full" onClick={pick}>
            <IconUpload /> Scegli file
          </Button>
        </div>
      ) : (
        <div className="space-y-4 py-2">
          <div className="flex items-center gap-3 rounded-2xl bg-surface-2 p-3">
            <IconFile className="text-muted" />
            <span className="min-w-0 flex-1 truncate text-sm font-semibold">{fileName}</span>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-2xl border border-danger/40 bg-danger/10 p-4">
              <p className="font-bold text-danger">
                {result.errors.length} {result.errors.length === 1 ? 'errore' : 'errori'} — correggi il file e riprova
              </p>
              <ul className="mt-2 space-y-1.5 text-sm">
                {result.errors.slice(0, 30).map((e, i) => (
                  <li key={i}>
                    {e.row > 0 && <b className="num">Riga {e.row}: </b>}
                    {e.message}
                  </li>
                ))}
                {result.errors.length > 30 && <li>…e altri {result.errors.length - 30}</li>}
              </ul>
            </div>
          )}

          {result.warnings.length > 0 && result.errors.length === 0 && (
            <div className="rounded-2xl border border-gold/40 bg-gold/10 p-4 text-sm">
              <p className="font-bold text-gold">Avvisi</p>
              <ul className="mt-1 space-y-1">
                {result.warnings.slice(0, 10).map((w, i) => (
                  <li key={i}>
                    <b className="num">Riga {w.row}:</b> {w.message}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {result.errors.length === 0 &&
            result.plans.map((p) => (
              <div key={p.id} className="rounded-3xl border border-line bg-surface p-4">
                <div className="flex items-baseline justify-between gap-2">
                  <h3 className="truncate text-lg font-bold">{p.name}</h3>
                  <span className="shrink-0 text-xs text-muted">{p.exercises.length} esercizi</span>
                </div>
                {existingNames.has(p.name.toLowerCase()) && (
                  <p className="mt-1 text-xs font-medium text-gold">Esiste già una scheda con questo nome: verrà aggiunta come nuova.</p>
                )}
                <ul className="mt-3 divide-y divide-line">
                  {p.exercises.map((e) => (
                    <li key={e.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate font-medium">{e.name}</span>
                      <span className="num shrink-0 text-muted">
                        {e.sets}×{e.reps} · {fmtRest(e.restSec)}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
        </div>
      )}
    </Sheet>
  );
}
