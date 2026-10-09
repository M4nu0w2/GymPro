import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it } from 'vitest';
import { db } from '../../db';
import type { Plan, Session, SetLog } from '../../types';
import { createBackup, importPlansFromJson, parseBackup, restoreBackup } from '../backup';
import { CSV_TEMPLATE, importPlansFromCsv, parseCsv, plansToCsv } from '../csv';
import { computeRecord, estimate1RM, findSessionPRs } from '../stats';
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
