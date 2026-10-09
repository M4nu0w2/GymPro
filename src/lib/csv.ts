import type { Muscle, Plan, PlanExercise } from '../types';
import { parseMuscle } from './exercises';
import { REPS_PATTERN, cleanReps, uid } from './utils';

export const CSV_HEADERS = ['scheda', 'esercizio', 'serie', 'rep', 'recupero_sec', 'note', 'muscolo'] as const;

export const CSV_TEMPLATE = [
  CSV_HEADERS.join(';'),
  'Push A;Panca piana;4;8-10;120;Fermo al petto;petto',
  'Push A;Military press;3;8;90;;spalle',
  'Push A;Croci ai cavi;3;12-15;60;Lento in negativa;petto',
  'Pull A;Trazioni;4;6-8;150;;dorso',
  'Pull A;Rematore bilanciere;4;8;120;;dorso',
].join('\r\n');

/** Rileva il separatore guardando la riga di intestazione */
export function detectDelimiter(firstLine: string): ';' | ',' {
  const semi = (firstLine.match(/;/g) ?? []).length;
  const comma = (firstLine.match(/,/g) ?? []).length;
  return semi >= comma ? ';' : ',';
}

/** Parser CSV (RFC 4180): virgolette, separatori e a capo dentro i campi */
export function parseCsv(text: string): string[][] {
  let src = text.replace(/^﻿/, '');
  // Excel: eventuale prima riga "sep=;"
  const sepLine = src.match(/^sep=(.)\r?\n/i);
  let delim: string;
  if (sepLine) {
    delim = sepLine[1];
    src = src.slice(sepLine[0].length);
  } else {
    delim = detectDelimiter(src.split(/\r?\n/, 1)[0] ?? '');
  }

  const rows: string[][] = [];
  let row: string[] = [];
  let field = '';
  let inQuotes = false;
  for (let i = 0; i < src.length; i++) {
    const c = src[i];
    if (inQuotes) {
      if (c === '"') {
        if (src[i + 1] === '"') {
          field += '"';
          i++;
        } else inQuotes = false;
      } else field += c;
    } else if (c === '"' && field === '') {
      inQuotes = true;
    } else if (c === delim) {
      row.push(field);
      field = '';
    } else if (c === '\n' || c === '\r') {
      if (c === '\r' && src[i + 1] === '\n') i++;
      row.push(field);
      rows.push(row);
      row = [];
      field = '';
    } else field += c;
  }
  if (field !== '' || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows;
}

export interface ImportIssue {
  row: number; // numero di riga nel file (1 = intestazione)
  message: string;
}

export interface ImportResult {
  plans: Plan[];
  errors: ImportIssue[];
  warnings: ImportIssue[];
  /** Gruppi muscolari indicati nella colonna opzionale "muscolo" */
  muscles: { name: string; muscle?: Muscle }[];
}

const DEFAULT_REST = 90;

export function importPlansFromCsv(text: string): ImportResult {
  const errors: ImportIssue[] = [];
  const warnings: ImportIssue[] = [];
  const muscles: ImportResult['muscles'] = [];
  const rows = parseCsv(text);

  if (rows.length === 0 || rows.every((r) => r.every((c) => c.trim() === ''))) {
    return { plans: [], errors: [{ row: 1, message: 'Il file è vuoto.' }], warnings, muscles };
  }

  const header = rows[0].map((h) => h.trim().toLowerCase());
  const col = (name: string) => header.indexOf(name);
  const missing = ['scheda', 'esercizio'].filter((h) => col(h) === -1);
  if (missing.length) {
    return {
      plans: [],
      errors: [
        {
          row: 1,
          message: `Intestazione non valida: mancano le colonne ${missing.join(', ')}. Attese: ${CSV_HEADERS.join(';')}`,
        },
      ],
      warnings,
      muscles,
    };
  }

  const byName = new Map<string, Plan>();
  const now = Date.now();

  rows.slice(1).forEach((raw, i) => {
    const line = i + 2;
    if (raw.every((c) => c.trim() === '')) return; // riga vuota
    const get = (name: string) => {
      const idx = col(name);
      return idx === -1 ? '' : (raw[idx] ?? '').trim();
    };

    const planName = get('scheda');
    const exName = get('esercizio');
    const setsStr = get('serie');
    const repsStr = cleanReps(get('rep'));
    const restStr = get('recupero_sec');
    const notes = get('note');
    const muscleStr = get('muscolo');

    const rowErrors: string[] = [];
    if (!planName) rowErrors.push('nome scheda mancante');
    if (!exName) rowErrors.push('nome esercizio mancante');

    let sets = 3;
    if (setsStr === '') warnings.push({ row: line, message: 'serie non indicate, uso 3' });
    else if (!/^\d+$/.test(setsStr) || Number(setsStr) < 1 || Number(setsStr) > 20)
      rowErrors.push(`"serie" deve essere un numero intero tra 1 e 20 (trovato "${setsStr}")`);
    else sets = Number(setsStr);

    let reps = '10';
    if (repsStr === '') warnings.push({ row: line, message: 'rep non indicate, uso 10' });
    else if (!REPS_PATTERN.test(repsStr))
      rowErrors.push(`"rep" deve essere un numero o un range tipo 8-10 (trovato "${repsStr}")`);
    else reps = repsStr;

    let restSec = DEFAULT_REST;
    if (restStr === '') warnings.push({ row: line, message: `recupero non indicato, uso ${DEFAULT_REST}s` });
    else if (!/^\d+$/.test(restStr) || Number(restStr) > 900)
      rowErrors.push(`"recupero_sec" deve essere un numero di secondi tra 0 e 900 (trovato "${restStr}")`);
    else restSec = Number(restStr);

    if (rowErrors.length) {
      rowErrors.forEach((m) => errors.push({ row: line, message: m }));
      return;
    }

    const key = planName.toLowerCase();
    let plan = byName.get(key);
    if (!plan) {
      plan = { id: uid(), name: planName, exercises: [], createdAt: now, updatedAt: now };
      byName.set(key, plan);
    }
    const ex: PlanExercise = { id: uid(), name: exName, sets, reps, restSec };
    if (notes) ex.notes = notes;
    if (muscleStr) {
      const muscle = parseMuscle(muscleStr);
      if (muscle) muscles.push({ name: exName, muscle });
      else warnings.push({ row: line, message: `muscolo "${muscleStr}" non riconosciuto, ignorato` });
    }
    plan.exercises.push(ex);
  });

  if (byName.size === 0 && errors.length === 0) {
    errors.push({ row: 2, message: 'Nessun esercizio trovato nel file.' });
  }
  return { plans: [...byName.values()], errors, warnings, muscles };
}

function csvField(v: string, delim: string): string {
  return /["\r\n]/.test(v) || v.includes(delim) ? `"${v.replace(/"/g, '""')}"` : v;
}

/** Esporta le schede nello stesso formato del template */
export function plansToCsv(plans: Plan[], muscleOf: (name: string) => string | undefined = () => undefined): string {
  const lines: string[] = [CSV_HEADERS.join(';')];
  for (const p of plans) {
    for (const e of p.exercises) {
      lines.push(
        [p.name, e.name, String(e.sets), e.reps, String(e.restSec), e.notes ?? '', muscleOf(e.name) ?? ''].map((v) => csvField(v, ';')).join(';'),
      );
    }
  }
  return lines.join('\r\n');
}
