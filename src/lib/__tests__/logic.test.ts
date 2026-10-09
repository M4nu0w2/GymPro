import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import type { Plan, Session, SetLog } from '../../types';
import { createBackup, importPlansFromJson, parseBackup, restoreBackup } from '../backup';
import { CSV_TEMPLATE, importPlansFromCsv, parseCsv, plansToCsv } from '../csv';
import {
  computeRecord,
  dayStreak,
  estimate1RM,
  findSessionPRs,
  liveRecord,
  prTimeline,
  startOfWeek,
  trainingDays,
  weekStreak,
  weeklyVolumeByMuscle,
} from '../stats';
import { suggestNextPlan } from '../plans';
import { SHARE_PARAM, decodePlan, encodePlan, extractShareCode } from '../share';
import { normalizeName, parseNum } from '../utils';
import {
  addSetToSession,
  computePrefill,
  deleteSetFromSession,
  finishWorkout,
  getActiveSession,
  previousSessionsFor,
  startWorkout,
} from '../workout';

const set = (p: Partial<SetLog>): SetLog => ({
  id: Math.random().toString(),
  exerciseName: 'Panca piana',
  exerciseKey: 'panca piana',
  setNumber: 1,
  weight: 60,
  reps: 8,
  timestamp: 1,
  ...p,
});

const session = (p: Partial<Session>): Session => ({
  id: Math.random().toString(),
  planId: 'p',
  planName: 'Push',
  startedAt: 1,
  status: 'done',
  exercises: [],
  sets: [],
  exerciseKeys: [],
  ...p,
});

describe('utils', () => {
  it('normalizza i nomi', () => {
    expect(normalizeName('  Panca   PIANA ')).toBe('panca piana');
    expect(normalizeName('Alzate Laterali Più')).toBe('alzate laterali piu');
  });
  it('parsa numeri con virgola', () => {
    expect(parseNum('62,5')).toBe(62.5);
    expect(parseNum('')).toBeNull();
    expect(parseNum('abc')).toBeNull();
  });
});

describe('CSV', () => {
  it('il template si importa senza errori', () => {
    const r = importPlansFromCsv(CSV_TEMPLATE);
    expect(r.errors).toEqual([]);
    expect(r.plans.map((p) => p.name)).toEqual(['Push A', 'Pull A']);
    expect(r.plans[0].exercises[0]).toMatchObject({ name: 'Panca piana', sets: 4, reps: '8-10', restSec: 120, notes: 'Fermo al petto' });
  });

  it('gestisce separatore virgola, BOM e virgolette', () => {
    const csv = '﻿scheda,esercizio,serie,rep,recupero_sec,note\r\nGambe,Squat,5,5,180,"profondo, lento"\r\n';
    const r = importPlansFromCsv(csv);
    expect(r.errors).toEqual([]);
    expect(r.plans[0].exercises[0].notes).toBe('profondo, lento');
  });

  it('segnala errori con numero di riga', () => {
    const csv = 'scheda;esercizio;serie;rep;recupero_sec;note\nA;Squat;x;8;90;\nA;;3;8;90;\nA;Panca;3;otto;90;\nA;Stacco;3;5;9999;';
    const r = importPlansFromCsv(csv);
    expect(r.errors.map((e) => e.row)).toEqual([2, 3, 4, 5]);
    expect(r.errors[0].message).toContain('serie');
  });

  it('intestazione mancante', () => {
    const r = importPlansFromCsv('nome;reps\nA;8');
    expect(r.errors[0].message).toContain('Intestazione');
  });

  it('roundtrip export/import', () => {
    const r = importPlansFromCsv(CSV_TEMPLATE);
    const again = importPlansFromCsv(plansToCsv(r.plans));
    expect(again.plans.map((p) => p.exercises.length)).toEqual(r.plans.map((p) => p.exercises.length));
  });

  it('parseCsv: campi con a capo', () => {
    expect(parseCsv('a;b\n"x\ny";z')).toEqual([
      ['a', 'b'],
      ['x\ny', 'z'],
    ]);
  });
});

describe('stats', () => {
  it('1RM Epley', () => {
    expect(estimate1RM(100, 1)).toBe(100);
    expect(estimate1RM(100, 10)).toBeCloseTo(133.33, 1);
  });
  it('record', () => {
    const r = computeRecord([set({ weight: 60, reps: 8 }), set({ weight: 65, reps: 5 }), set({ weight: 65, reps: 6 })]);
    expect(r.maxWeight).toBe(65);
    expect(r.maxWeightReps).toBe(6);
  });
  it('PR solo se esiste storico', () => {
    const old = session({ startedAt: 1, sets: [set({ weight: 60 })] });
    const now = session({ startedAt: 2, sets: [set({ weight: 62.5 })] });
    expect(findSessionPRs(now, [old, now])).toHaveLength(1);
    expect(findSessionPRs(now, [now])).toHaveLength(0);
  });
});

describe('prefill', () => {
  const last = session({
    sets: [set({ setNumber: 1, weight: 60, reps: 8, timestamp: 1 }), set({ setNumber: 2, weight: 62.5, reps: 6, timestamp: 2 })],
  });
  it('usa la stessa serie dell’ultima sessione', () => {
    expect(computePrefill(2, last, 'panca piana', [], '8-10')).toMatchObject({ weight: 62.5, reps: 6, source: 'last-session' });
  });
  it('altrimenti l’ultima serie registrata', () => {
    const current = [set({ setNumber: 3, weight: 65, reps: 4, timestamp: 99 })];
    expect(computePrefill(4, last, 'panca piana', current, '8-10')).toMatchObject({ weight: 65, reps: 4, source: 'last-set' });
  });
  it('mai fatto: peso vuoto, rep target', () => {
    expect(computePrefill(1, undefined, 'squat', [], '8-10')).toEqual({ weight: null, reps: 8, source: 'target' });
  });
});

describe('workout (IndexedDB)', () => {
  const plan: Plan = {
    id: 'plan1',
    name: 'Push',
    createdAt: 1,
    updatedAt: 1,
    exercises: [{ id: 'e1', name: 'Panca Piana', sets: 3, reps: '8', restSec: 90 }],
  };

  beforeEach(async () => {
    await db.plans.clear();
    await db.sessions.clear();
  });

  it('avvia, registra, rinumera, conclude', async () => {
    const s = await startWorkout(plan);
    expect((await getActiveSession())?.id).toBe(s.id);
    // non crea doppioni
    expect((await startWorkout(plan)).id).toBe(s.id);

    for (const n of [1, 2, 3]) await addSetToSession(s.id, { exerciseName: 'Panca Piana', setNumber: n, weight: 60 + n, reps: 8 });
    let cur = (await db.sessions.get(s.id))!;
    expect(cur.exerciseKeys).toEqual(['panca piana']);

    await deleteSetFromSession(s.id, cur.sets[0].id);
    cur = (await db.sessions.get(s.id))!;
    expect(cur.sets.map((x) => [x.setNumber, x.weight])).toEqual([
      [1, 62],
      [2, 63],
    ]);

    await finishWorkout(s.id);
    expect(await getActiveSession()).toBeUndefined();
    // lo storico è condiviso per nome normalizzato
    const prev = await previousSessionsFor(normalizeName('  panca piana'));
    expect(prev).toHaveLength(1);
  });

  it('backup e ripristino', async () => {
    await db.plans.put(plan);
    const s = await startWorkout(plan);
    await addSetToSession(s.id, { exerciseName: 'Panca Piana', setNumber: 1, weight: 50, reps: 10 });
    await finishWorkout(s.id);
    const json = JSON.stringify(await createBackup());
    await db.plans.clear();
    await db.sessions.clear();
    await restoreBackup(parseBackup(json));
    expect(await db.plans.count()).toBe(1);
    expect((await db.sessions.toArray())[0].sets[0].weight).toBe(50);
    expect(() => parseBackup('{"foo":1}')).toThrow('non è un backup');
    expect(importPlansFromJson(json)[0].id).not.toBe('plan1');
  });
});

describe('progressione automatica', () => {
  const opts = { enabled: true, step: 2.5, plannedSets: 3 };
  const last = (reps: number[]) =>
    session({
      exercises: [{ name: 'Panca piana', key: 'panca piana', sets: 3, reps: '8-10', restSec: 90 }],
      sets: reps.map((r, i) => set({ setNumber: i + 1, weight: 60, reps: r, timestamp: i })),
    });

  it('propone +2,5 kg se tutte le serie hanno raggiunto le rep target', () => {
    const p = computePrefill(1, last([10, 10, 10]), 'panca piana', [], '8-10', opts);
    expect(p).toMatchObject({ weight: 62.5, reps: 8, progression: { from: 60, to: 62.5 } });
  });
  it('mantiene il peso se le rep non sono state raggiunte', () => {
    const p = computePrefill(1, last([10, 9, 8]), 'panca piana', [], '8-10', opts);
    expect(p).toMatchObject({ weight: 60, reps: 10 });
    expect(p.progression).toBeUndefined();
  });
  it('mantiene il peso se mancano serie', () => {
    expect(computePrefill(1, last([10, 10]), 'panca piana', [], '8-10', opts).progression).toBeUndefined();
  });
  it('passo configurabile e disattivabile', () => {
    expect(computePrefill(1, last([10, 10, 10]), 'panca piana', [], '8-10', { ...opts, step: 5 }).weight).toBe(65);
    expect(computePrefill(1, last([10, 10, 10]), 'panca piana', [], '8-10', { ...opts, enabled: false }).weight).toBe(60);
  });
  it('nella sessione corrente non somma di nuovo l’incremento', () => {
    const today = [set({ setNumber: 3, weight: 62.5, reps: 8, timestamp: 99 })];
    expect(computePrefill(4, last([10, 10, 10]), 'panca piana', today, '8-10', opts).weight).toBe(62.5);
  });
});

describe('condivisione schede', () => {
  it('roundtrip senza storico, con muscolo', () => {
    const plan: Plan = {
      id: 'x', name: 'Push', description: 'desc', createdAt: 1, updatedAt: 1,
      exercises: [{ id: 'a', name: 'Panca', sets: 4, reps: '8-10', restSec: 120, notes: 'fermo' }],
    };
    const code = encodePlan(plan, (n) => (n === 'Panca' ? 'petto' : undefined));
    const url = `https://x.test/#${SHARE_PARAM}=${code}`;
    const d = decodePlan(extractShareCode(url)!);
    expect(d.plan.id).not.toBe('x');
    expect(d.plan.exercises[0]).toMatchObject({ name: 'Panca', sets: 4, reps: '8-10', restSec: 120, notes: 'fermo' });
    expect(d.muscles[0].muscle).toBe('petto');
    expect(() => decodePlan('abc')).toThrow('Link non valido');
  });
});

describe('CSV muscolo', () => {
  it('legge la colonna opzionale', () => {
    const r = importPlansFromCsv(CSV_TEMPLATE);
    expect(r.muscles.find((m) => m.name === 'Trazioni')?.muscle).toBe('dorso');
  });
  it('compatibile con i file senza colonna muscolo', () => {
    const r = importPlansFromCsv('scheda;esercizio;serie;rep;recupero_sec;note\nA;Squat;5;5;180;');
    expect(r.errors).toEqual([]);
    expect(r.muscles).toEqual([]);
  });
});

describe('streak, record, suggerimento', () => {
  const day = (iso: string) => new Date(iso + 'T18:00:00').getTime();
  it('streak giorni e settimane', () => {
    const ss = ['2026-03-02', '2026-03-03', '2026-03-04'].map((d) => session({ startedAt: day(d) }));
    expect(dayStreak(trainingDays(ss), day('2026-03-04'))).toBe(3);
    expect(dayStreak(trainingDays(ss), day('2026-03-05'))).toBe(3);
    expect(dayStreak(trainingDays(ss), day('2026-03-06'))).toBe(0);
    const weeks = ['2026-02-16', '2026-02-25', '2026-03-03'].map((d) => session({ startedAt: day(d) }));
    expect(weekStreak(weeks, day('2026-03-05'))).toBe(3);
    expect(weekStreak(weeks, day('2026-03-10'))).toBe(3);
    expect(weekStreak(weeks, day('2026-03-17'))).toBe(0);
  });
  it('prTimeline e record live', () => {
    const a = session({ id: 'a', startedAt: 1, sets: [set({ weight: 60, reps: 8 })] });
    const b = session({ id: 'b', startedAt: 2, sets: [set({ weight: 65, reps: 5 })] });
    const c = session({ id: 'c', startedAt: 3, sets: [set({ weight: 60, reps: 5 })] });
    const t = prTimeline([c, b, a]);
    expect([...t.keys()]).toEqual(['b']);
    const hist = computeRecord([...a.sets, ...b.sets]);
    expect(liveRecord(set({ weight: 67.5, reps: 3 }), hist, [])?.kind).toBe('peso');
    expect(liveRecord(set({ weight: 67.5, reps: 3 }), hist, [set({ weight: 70, reps: 3 })])).toBeNull();
    expect(liveRecord(set({ weight: 67.5, reps: 3 }), null, [])).toBeNull();
  });
  it('volume per muscolo con "non assegnato"', () => {
    const s = session({ startedAt: day('2026-03-03'), sets: [set({ weight: 50, reps: 10 }), set({ exerciseKey: 'curl', weight: 10, reps: 10 })] });
    const v = weeklyVolumeByMuscle([s], startOfWeek(day('2026-03-03')), (k) => (k === 'panca piana' ? 'petto' : undefined));
    expect(v).toEqual([
      { muscle: 'petto', volume: 500, sets: 1 },
      { muscle: null, volume: 100, sets: 1 },
    ]);
  });
  it('suggerisce la scheda successiva nella rotazione', () => {
    const mk = (id: string, c: number): Plan => ({ id, name: id, createdAt: c, updatedAt: c, exercises: [{ id: 'e', name: 'x', sets: 1, reps: '5', restSec: 0 }] });
    const plans = [mk('A', 1), mk('B', 2), mk('C', 3)];
    expect(suggestNextPlan(plans, [])?.id).toBe('A');
    expect(suggestNextPlan(plans, [session({ planId: 'B', startedAt: 5 })])?.id).toBe('C');
    expect(suggestNextPlan(plans, [session({ planId: 'C', startedAt: 5 })])?.id).toBe('A');
    expect(suggestNextPlan(plans, [session({ planId: 'gone', startedAt: 5 }), session({ planId: 'A', startedAt: 4 })])?.id).toBe('B');
  });
});

describe('backup v1 compatibile', () => {
  it('accetta il formato precedente', () => {
    const v1 = JSON.stringify({ app: 'gympro', version: 1, exportedAt: 'x', plans: [], sessions: [] });
    const b = parseBackup(v1);
    expect(b.exercises).toEqual([]);
    expect(b.body).toEqual([]);
  });
});
