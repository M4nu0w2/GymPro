import { useState } from 'react';
import { IconDownload, IconFile, IconLink, IconUpload } from '../../components/Icons';
import { Button, Row, RowIcon, Segmented, Sheet, inputCls } from '../../components/ui';
import { useFeedback } from '../../components/Feedback';
import { db } from '../../db';
import { importPlansFromJson } from '../../lib/backup';
import { type ImportResult, importPlansFromCsv } from '../../lib/csv';
import { MUSCLE_LABEL, mergeMuscles } from '../../lib/exercises';
import { pickTextFile } from '../../lib/files';
import { decodePlan, extractShareCode } from '../../lib/share';
import { fmtRest, normalizeName } from '../../lib/utils';
import type { Plan } from '../../types';

type Mode = 'file' | 'link';

export function ImportSheet({
  open,
  onClose,
  existing,
  onTemplate,
}: {
  open: boolean;
  onClose: () => void;
  existing: Plan[];
  onTemplate: () => void;
}) {
  const [mode, setMode] = useState<Mode>('file');
  const [fileName, setFileName] = useState<string | null>(null);
  const [result, setResult] = useState<ImportResult | null>(null);
  const [link, setLink] = useState('');
  const { toast } = useFeedback();

  const reset = () => {
    setFileName(null);
    setResult(null);
    setLink('');
  };

  const pick = async () => {
    const f = await pickTextFile('.csv,.json,.txt,text/csv,application/json');
    if (!f) return;
    setFileName(f.name);
    const isJson = f.name.toLowerCase().endsWith('.json') || f.text.trimStart().startsWith('{') || f.text.trimStart().startsWith('[');
    if (isJson) {
      try {
        setResult({ plans: importPlansFromJson(f.text), errors: [], warnings: [], muscles: [] });
      } catch (e) {
        setResult({ plans: [], errors: [{ row: 0, message: (e as Error).message }], warnings: [], muscles: [] });
      }
    } else {
      setResult(importPlansFromCsv(f.text));
    }
  };

  const readLink = (text: string) => {
    setLink(text);
    if (!text.trim()) return setResult(null);
    const code = extractShareCode(text);
    if (!code) {
      setResult({ plans: [], errors: [{ row: 0, message: 'Non sembra un link di GymPro.' }], warnings: [], muscles: [] });
      return;
    }
    try {
      const d = decodePlan(code);
      setFileName('Link condiviso');
      setResult({ plans: [d.plan], errors: [], warnings: [], muscles: d.muscles });
    } catch (e) {
      setResult({ plans: [], errors: [{ row: 0, message: (e as Error).message }], warnings: [], muscles: [] });
    }
  };

  const paste = async () => {
    try {
      readLink(await navigator.clipboard.readText());
    } catch {
      toast('Incolla il link nel campo di testo', 'error');
    }
  };

  const confirmImport = async () => {
    if (!result || result.errors.length || !result.plans.length) return;
    await db.plans.bulkAdd(result.plans);
    await mergeMuscles(result.muscles);
    toast(`${result.plans.length} ${result.plans.length === 1 ? 'scheda importata' : 'schede importate'}`);
    reset();
    onClose();
  };

  const existingNames = new Set(existing.map((p) => p.name.toLowerCase()));
  const canImport = !!result && result.errors.length === 0 && result.plans.length > 0;
  const muscleOf = (name: string) => result?.muscles.find((m) => normalizeName(m.name) === normalizeName(name))?.muscle;

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
          <div className="grid grid-cols-2 gap-2.5">
            <Button size="lg" onClick={reset}>
              Indietro
            </Button>
            <Button size="lg" variant="primary" disabled={!canImport} onClick={confirmImport}>
              Importa
            </Button>
          </div>
        ) : undefined
      }
    >
      {!result ? (
        <div className="space-y-4 pb-2">
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'file', label: 'Da file' },
              { value: 'link', label: 'Da link' },
            ]}
          />
          {mode === 'file' ? (
            <>
              <p className="px-1 text-[15px] leading-snug text-fg-2">
                File <b>CSV</b> (separatore <code>;</code> o <code>,</code>) con le colonne:
              </p>
              <code className="block rounded-[18px] bg-surface p-4 text-[13px] break-all">scheda;esercizio;serie;rep;recupero_sec;note;muscolo</code>
              <p className="px-1 text-[13px] text-muted">
                La colonna <b>muscolo</b> è facoltativa (petto, dorso, spalle, bicipiti, tricipiti, gambe, glutei, addome, altro): i file senza funzionano come prima. Puoi anche importare un JSON esportato da GymPro.
              </p>
              <Button variant="primary" size="lg" className="w-full" onClick={pick}>
                <IconUpload size={18} /> Scegli file
              </Button>
              <div className="overflow-hidden rounded-[22px] bg-surface">
                <Row icon={<RowIcon className="bg-[#8e8e93] text-white"><IconDownload size={17} /></RowIcon>} title="Scarica template CSV" onClick={onTemplate} />
              </div>
            </>
          ) : (
            <>
              <p className="px-1 text-[15px] leading-snug text-fg-2">Incolla il link di una scheda condivisa da GymPro.</p>
              <textarea
                className={inputCls + ' !h-28 resize-none py-3 text-[15px]'}
                placeholder="https://…#scheda=…"
                value={link}
                onChange={(e) => readLink(e.target.value)}
                autoCapitalize="off"
                autoCorrect="off"
                spellCheck={false}
              />
              <Button variant="primary" size="lg" className="w-full" onClick={paste}>
                <IconLink size={18} /> Incolla dagli appunti
              </Button>
            </>
          )}
        </div>
      ) : (
        <div className="space-y-4 pb-2">
          <div className="flex items-center gap-3 rounded-[18px] bg-surface p-3">
            <IconFile className="text-muted" />
            <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{fileName ?? 'Link'}</span>
          </div>

          {result.errors.length > 0 && (
            <div className="rounded-[18px] bg-danger/10 p-4">
              <p className="font-semibold text-danger">
                {result.errors.length} {result.errors.length === 1 ? 'errore' : 'errori'} — correggi e riprova
              </p>
              <ul className="mt-2 space-y-1.5 text-[15px]">
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
            <div className="rounded-[18px] bg-gold-soft p-4 text-[15px]">
              <p className="font-semibold text-gold">Avvisi</p>
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
              <div key={p.id}>
                <div className="flex items-baseline justify-between gap-2 px-4 pb-1.5">
                  <h3 className="truncate text-[17px] font-semibold">{p.name}</h3>
                  <span className="shrink-0 text-[13px] text-muted">{p.exercises.length} esercizi</span>
                </div>
                {existingNames.has(p.name.toLowerCase()) && (
                  <p className="px-4 pb-1.5 text-[13px] text-gold">Esiste già una scheda con questo nome: verrà aggiunta come nuova.</p>
                )}
                <div className="overflow-hidden rounded-[22px] bg-surface">
                  {p.exercises.map((e) => {
                    const m = muscleOf(e.name);
                    return <Row key={e.id} title={e.name} subtitle={m ? MUSCLE_LABEL[m] : undefined} value={`${e.sets}×${e.reps} · ${fmtRest(e.restSec)}`} />;
                  })}
                </div>
              </div>
            ))}
        </div>
      )}
    </Sheet>
  );
}
